"""Apply an inspected bundle using the installed n8n CLI, with rollback.

Requires explicit execution approval. Never edits n8n's SQLite tables directly.
"""
import argparse
import hashlib
import json
import os
import re
import signal
import shlex
import socket
import sqlite3
import subprocess
import time
from pathlib import Path
from urllib.request import urlopen


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--bundle', type=Path, required=True)
    p.add_argument('--database', type=Path, required=True)
    p.add_argument('--cli', type=Path, required=True)
    p.add_argument('--node', type=Path, required=True)
    p.add_argument('--cwd', type=Path, required=True)
    p.add_argument('--pid', type=int, required=True)
    args = p.parse_args()
    folder = args.bundle.resolve()
    candidates = json.loads((folder / 'candidate.json').read_text())
    before = json.loads((folder / 'before.json').read_text())
    db_uri = args.database.resolve().as_uri() + '?mode=ro'

    def db():
        return sqlite3.connect(db_uri, uri=True)

    def fingerprints():
        with db() as c:
            tables = [r[0] for r in c.execute("select name from sqlite_master where type='table' and name like 'data_table_user_%'")]
            result = {}
            for table in tables:
                quoted = '"' + table.replace('"', '""') + '"'
                rows = c.execute('select * from ' + quoted + ' order by id').fetchall()
                result[table] = {'count': len(rows), 'sha256': hashlib.sha256(json.dumps(rows, default=str).encode()).hexdigest()}
            return result

    with db() as c:
        for old in before:
            current = c.execute('select versionId,activeVersionId from workflow_entity where id=?', (old['id'],)).fetchone()
            if current != (old['versionId'], old['activeVersionId']):
                raise RuntimeError('Workflow changed since inspection: ' + old['name'])
        if c.execute("select count(*) from execution_entity where status in ('running','new')").fetchone()[0]:
            raise RuntimeError('n8n has an active execution; retry after it finishes.')
    command = subprocess.check_output(['/bin/ps', '-p', str(args.pid), '-o', 'command='], text=True).strip()
    argv = shlex.split(command)
    if not (len(argv) >= 2 and Path(argv[0]).name == 'node' and (argv[1].endswith('/node_modules/.bin/n8n') or argv[1] == str(args.cli))):
        raise RuntimeError('The supplied process is not the expected n8n service.')
    baseline = fingerprints()
    (folder / 'table-fingerprints-before.json').write_text(json.dumps(baseline, indent=2))
    env = os.environ.copy()
    # Preserve only relevant non-secret runtime options from the existing service.
    process_env = subprocess.check_output(['/bin/ps', 'eww', '-p', str(args.pid), '-o', 'command='], text=True)
    for name in ('N8N_SECURE_COOKIE', 'N8N_HOST', 'N8N_PORT', 'N8N_PROTOCOL', 'N8N_RUNNERS_ENABLED', 'NODE_ENV'):
        match = re.search(r'(?:^|\s)' + name + r'=([^\s]+)', process_env)
        if match:
            env[name] = match.group(1)
    del process_env
    env['N8N_LISTEN_ADDRESS'] = '127.0.0.1'
    env['N8N_CONCURRENCY_PRODUCTION_LIMIT'] = '1'

    def cli(*flags):
        result = subprocess.run([str(args.node), str(args.cli), *flags], env=env, cwd=args.cwd, text=True, capture_output=True, timeout=90)
        with (folder / 'cli.log').open('a') as log:
            log.write(result.stdout + result.stderr)
        if result.returncode or 'GOT ERROR' in result.stdout + result.stderr or 'An error occurred while importing' in result.stdout + result.stderr:
            raise RuntimeError('n8n CLI failed; see the private cli.log file.')

    def start():
        log = (folder / 'server.log').open('ab')
        proc = subprocess.Popen([str(args.node), str(args.cli)], env=env, cwd=args.cwd, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        log.close()
        for _ in range(60):
            if proc.poll() is not None:
                raise RuntimeError('n8n exited during startup; see the private server.log file.')
            try:
                with urlopen('http://127.0.0.1:5678/healthz', timeout=1) as response:
                    if response.status == 200:
                        return proc.pid
            except Exception:
                time.sleep(0.5)
        raise RuntimeError('n8n startup did not become healthy in 30 seconds.')

    print('Stopping idle local n8n for the workflow update.', flush=True)
    os.kill(args.pid, signal.SIGTERM)
    for _ in range(100):
        try:
            with socket.create_connection(('127.0.0.1', 5678), timeout=0.2):
                time.sleep(0.2)
        except OSError:
            break
    else:
        raise RuntimeError('n8n did not stop; no workflows were imported.')
    try:
        cli('import:workflow', '--input=' + str(folder / 'candidate.json'))
        print('Imported candidate definitions; publishing inspected versions.', flush=True)
        for i, w in enumerate(candidates):
            cli('publish:workflow', '--id=' + w['id'])
            print(f'Published {i+1}/{len(candidates)}: {w["name"]}', flush=True)
        with db() as c:
            for w in candidates:
                row = c.execute('select w.active,h.nodes,h.connections from workflow_entity w join workflow_history h on h.versionId=w.activeVersionId where w.id=?', (w['id'],)).fetchone()
                if not row or not row[0] or json.loads(row[1]) != w['nodes'] or json.loads(row[2]) != w['connections']:
                    raise RuntimeError('Published definition differs from inspected candidate: ' + w['name'])
        if fingerprints() != baseline:
            raise RuntimeError('A practice data table changed during publication.')
    except Exception:
        print('Update failed. Restoring prior definitions and published versions.', flush=True)
        rollback = []
        for w in before:
            previous = {k:v for k,v in w.items() if k not in ('publishedBackup', 'activeVersionId')}
            previous['active'] = False
            rollback.append(previous)
        (folder / 'rollback.json').write_text(json.dumps(rollback))
        cli('import:workflow', '--input=' + str(folder / 'rollback.json'))
        for w in before:
            cli('publish:workflow', '--id=' + w['id'], '--versionId=' + w['activeVersionId'])
        pid = start()
        print('Restored original published workflows; n8n PID ' + str(pid), flush=True)
        raise
    pid = start()
    report = {'publishedWorkflows': len(candidates), 'practiceTablesUnchanged': True, 'n8nPid': pid, 'bindAddress': '127.0.0.1', 'productionConcurrency': 1}
    (folder / 'applied.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
