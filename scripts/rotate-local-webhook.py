"""Rotate the local DentalOS webhook key through n8n's documented CLI.

Only run on the supervised local demo stack. Private files stay in --bundle.
"""
import argparse
import json
import os
import secrets
import signal
import socket
import sqlite3
import subprocess
import time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def wait_port(port, expected_open, seconds=45):
    for _ in range(seconds * 4):
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=0.2):
                is_open = True
        except OSError:
            is_open = False
        if is_open == expected_open:
            return
        time.sleep(0.25)
    raise RuntimeError(f'Port {port} did not reach expected state {expected_open}')


def read_env(path):
    return dict(line.split('=', 1) for line in path.read_text().splitlines()
                if line and not line.lstrip().startswith('#') and '=' in line)


def replace_env(path, key):
    old = path.read_text()
    lines = old.splitlines(keepends=True)
    matches = [i for i, line in enumerate(lines) if line.startswith('DENTALOS_WEBHOOK_SECRET=')]
    if len(matches) != 1:
        raise RuntimeError(f'Expected one webhook secret in {path}')
    ending = '\n' if lines[matches[0]].endswith('\n') else ''
    lines[matches[0]] = 'DENTALOS_WEBHOOK_SECRET=' + key + ending
    temp = path.with_name(path.name + '.rotation-tmp')
    temp.write_text(''.join(lines))
    temp.chmod(0o600)
    temp.replace(path)


def http_status(base, key):
    body = json.dumps({'action': 'availability', 'payload': {'date': '2026-11-06'},
                       'practice_id': 'prac_riverside', 'demo_session_id': 'rotation-check',
                       'request_id': 'rotation-check-' + secrets.token_hex(8)}).encode()
    request = Request(base.rstrip('/') + '/ava', body,
                      {'Content-Type': 'application/json', 'X-DentalOS-Key': key}, method='POST')
    try:
        with urlopen(request, timeout=20) as response:
            response.read()
            return response.status
    except HTTPError as error:
        error.read()
        return error.code


def wait_for_credential(base, new_key, old_key, seconds=45):
    last = None
    for _ in range(seconds * 2):
        try:
            last = (http_status(base, new_key), http_status(base, old_key))
            if last[0] == 200 and last[1] in (401, 403):
                return
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError(f'Credential did not become active; last HTTP statuses: {last}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bundle', type=Path, required=True)
    parser.add_argument('--n8n-pid', type=int, required=True)
    parser.add_argument('--dashboard-pid', type=int, required=True)
    args = parser.parse_args()
    bundle = args.bundle.resolve()
    bundle.mkdir(parents=True, exist_ok=True)
    bundle.chmod(0o700)
    app = Path('/Users/mohammednabil/Downloads/dentally-live')
    voice = Path('/Users/mohammednabil/Downloads/my-dental-agent')
    n8n_dir = Path('/Users/mohammednabil/.n8n')
    cli = Path('/Users/mohammednabil/.npm/_npx/a8a7eec953f1f314/node_modules/n8n/bin/n8n')
    node = Path('/Users/mohammednabil/.local/bin/node')
    credential_file = bundle / 'credential-decrypted.json'
    credential = json.loads(credential_file.read_text())
    if not isinstance(credential, list) or len(credential) != 1:
        raise RuntimeError('Credential export must contain exactly one credential')
    record = credential[0]
    if record.get('id') != '2nRwSpcLHDgEAt5x' or record.get('type') != 'httpHeaderAuth' or record['data'].get('name') != 'X-DentalOS-Key':
        raise RuntimeError('Unexpected credential identity or header name')
    old_key = record['data']['value']
    dashboard_env = app / '.env.local'
    voice_env = voice / '.env.local'
    dashboard_values = read_env(dashboard_env)
    if dashboard_values.get('DENTALOS_WEBHOOK_SECRET') != old_key:
        raise RuntimeError('Dashboard key does not match the exported n8n credential')
    base = dashboard_values['DENTALOS_WEBHOOK_BASE_URL']
    if not base.startswith(('http://127.0.0.1:5678/', 'http://localhost:5678/')):
        raise RuntimeError('This rotation is only for loopback n8n')
    with sqlite3.connect(f'file:{n8n_dir / "database.sqlite"}?mode=ro', uri=True) as db:
        if db.execute("select count(*) from execution_entity where status in ('running','new')").fetchone()[0]:
            raise RuntimeError('n8n has active work')
        if db.execute('select count(*) from credentials_entity').fetchone()[0] != 1:
            raise RuntimeError('Expected exactly one local n8n credential')
    if http_status(base, old_key) != 200 or http_status(base, 'invalid-rotation-test') not in (401, 403):
        raise RuntimeError('Preflight authorization checks failed')
    for source, name in [(dashboard_env, 'dashboard.env.before'), (voice_env, 'voice.env.before'), (n8n_dir / 'config', 'n8n.config.before')]:
        target = bundle / name
        target.write_bytes(source.read_bytes())
        target.chmod(0o600)
    # SQLite backup API captures a consistent copy even if the server has WAL enabled.
    with sqlite3.connect(n8n_dir / 'database.sqlite') as source, sqlite3.connect(bundle / 'n8n.database.before.sqlite') as target:
        source.backup(target)
    (bundle / 'n8n.database.before.sqlite').chmod(0o600)
    new_key = secrets.token_hex(32)
    record['data']['value'] = new_key
    rotated_file = bundle / 'credential-rotated.json'
    rotated_file.write_text(json.dumps(credential))
    rotated_file.chmod(0o600)
    runtime_env = os.environ.copy()
    runtime_env['N8N_LISTEN_ADDRESS'] = '127.0.0.1'
    runtime_env['N8N_CONCURRENCY_PRODUCTION_LIMIT'] = '1'
    n8n_started = False
    dashboard_stopped = False
    try:
        print('Stopping idle local n8n.', flush=True)
        os.kill(args.n8n_pid, signal.SIGTERM)
        wait_port(5678, False)
        result = subprocess.run([str(node), str(cli), 'import:credentials', '--input=' + str(rotated_file)],
                                cwd=app, env=runtime_env, capture_output=True, text=True, timeout=90)
        (bundle / 'import.log').write_text(result.stdout + result.stderr)
        if result.returncode or 'GOT ERROR' in result.stdout + result.stderr:
            raise RuntimeError('n8n credential import failed; see private import.log')
        n8n_log = (bundle / 'n8n.log').open('ab')
        proc = subprocess.Popen([str(node), str(cli)], cwd=app, env=runtime_env,
                                stdin=subprocess.DEVNULL, stdout=n8n_log, stderr=subprocess.STDOUT, start_new_session=True)
        n8n_log.close()
        n8n_started = True
        wait_port(5678, True)
        if proc.poll() is not None:
            raise RuntimeError('n8n stopped after restart')
        wait_for_credential(base, new_key, old_key)
        replace_env(dashboard_env, new_key)
        replace_env(voice_env, new_key)
        print('Restarting local dashboard with the new key.', flush=True)
        os.kill(args.dashboard_pid, signal.SIGTERM)
        dashboard_stopped = True
        wait_port(3001, False)
        log = (bundle / 'dashboard.log').open('ab')
        dashboard = subprocess.Popen(['npm', 'run', 'dev', '--', '--port', '3001'], cwd=app,
                                     stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        log.close()
        wait_port(3001, True, 90)
        with urlopen('http://127.0.0.1:3001/login', timeout=20) as response:
            if response.status != 200:
                raise RuntimeError('Dashboard login page failed after restart')
        if dashboard.poll() is not None:
            raise RuntimeError('Dashboard process stopped after restart')
        if read_env(dashboard_env)['DENTALOS_WEBHOOK_SECRET'] != new_key or read_env(voice_env)['DENTALOS_WEBHOOK_SECRET'] != new_key:
            raise RuntimeError('An app setting did not persist the new key')
        # The old cleartext is no longer needed. Keep only encrypted n8n and env rollback copies.
        credential_file.unlink()
        rotated_file.unlink()
        (bundle / 'dashboard.env.before').unlink()
        (bundle / 'voice.env.before').unlink()
        (bundle / 'result.json').write_text(json.dumps({'rotated': True, 'newAccepted': True,
            'oldRejected': True, 'dashboardReady': True, 'voiceKeyAligned': True,
            'n8nPid': proc.pid, 'dashboardPid': dashboard.pid}, indent=2))
        print('Rotated. New key accepted, old key rejected, dashboard ready, voice setting aligned.', flush=True)
    except Exception:
        print('Rotation failed; restoring prior local settings and credential.', flush=True)
        try:
            if n8n_started and proc.poll() is None:
                os.kill(proc.pid, signal.SIGTERM)
                wait_port(5678, False)
            rollback = subprocess.run([str(node), str(cli), 'import:credentials', '--input=' + str(credential_file)],
                                      cwd=app, env=runtime_env, capture_output=True, text=True, timeout=90)
            (bundle / 'rollback.log').write_text(rollback.stdout + rollback.stderr)
            if rollback.returncode:
                raise RuntimeError('Credential rollback CLI failed; inspect private rollback.log')
            dashboard_env.write_bytes((bundle / 'dashboard.env.before').read_bytes())
            voice_env.write_bytes((bundle / 'voice.env.before').read_bytes())
            dashboard_env.chmod(0o600)
            voice_env.chmod(0o600)
            if dashboard_stopped:
                subprocess.Popen(['npm', 'run', 'dev', '--', '--port', '3001'], cwd=app,
                                 stdin=subprocess.DEVNULL, stdout=(bundle / 'dashboard-rollback.log').open('ab'),
                                 stderr=subprocess.STDOUT, start_new_session=True)
            subprocess.Popen([str(node), str(cli)], cwd=app, env=runtime_env,
                             stdin=subprocess.DEVNULL, stdout=(bundle / 'n8n-rollback.log').open('ab'),
                             stderr=subprocess.STDOUT, start_new_session=True)
        finally:
            raise


if __name__ == '__main__':
    main()
