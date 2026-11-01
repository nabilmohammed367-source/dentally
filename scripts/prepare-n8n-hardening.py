"""Prepare reversible workflow changes. Reads n8n SQLite in read-only mode.

No import, publication, execution, credential access, or patient-table reads occur.
Private workflow backups are written under .codex-backup (excluded from Git).
"""
import argparse
import copy
import json
import sqlite3
import uuid
from pathlib import Path

SNAPSHOT = 'Af4fnEAm3H6sYt6x'
APPROVALS = '7nVBKKBawyClvP08'
APPROVAL_BRIDGE = 'LGt2Ww7S69AZJ2dD'
AVA_BRIDGE = 'e4ciAd2Eu5oO7ItT'
AVA = 'lD9wKCrivHYSvF0R'
STATE = '4P30lYrBxLyrxmxy'
CORE = {'2pX6Hu21KkF0mHYW', APPROVALS, 'HMmeve259bB8ph6P', 'MHVGJvtra1ndr2uV', 'MgB2V58QPtgjzHiR', 'lD9wKCrivHYSvF0R', 'xF0xrnGu2oVHjtQK'}
GUARD = """const input = $input.first().json;
if (typeof input.practice_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{2,99}$/.test(input.practice_id)) {
  throw new Error('An explicit practice scope is required. No action was taken.');
}
return [{ json: input }];"""

BOOKING_GUARD = """
function schedulingError(duration) {
  const date = scenario.preferred_date, time = scenario.preferred_time;
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date || '') || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(time || '')) return 'A valid appointment date and time are required.';
  const parsed = new Date(date + 'T12:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date) return 'That calendar date is invalid.';
  if ([0,6].includes(parsed.getUTCDay())) return 'The practice is closed at weekends.';
  const start = Number(time.slice(0,2))*60 + Number(time.slice(3,5));
  if (!Number.isFinite(duration) || duration <= 0 || start < 540 || start + duration > 1020) return 'Choose a visit inside the 09:00–17:00 opening hours.';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(p => [p.type,p.value]));
  const today = parts.year + '-' + parts.month + '-' + parts.day;
  if (date < today || (date === today && start <= Number(parts.hour)*60+Number(parts.minute))) return 'Choose an appointment time in the future.';
  return null;
}
"""


def code_node(name, code, position):
    return {'id': str(uuid.uuid4()), 'name': name, 'type': 'n8n-nodes-base.code', 'typeVersion': 2,
            'position': position, 'parameters': {'jsCode': code}}


def insert_before(workflow, target, node):
    for ports in workflow['connections'].values():
        for outputs in ports.values():
            for connections in outputs:
                for edge in connections:
                    if edge['node'] == target:
                        edge['node'] = node['name']
    workflow['connections'][node['name']] = {'main': [[{'node': target, 'type': 'main', 'index': 0}]]}
    workflow['nodes'].append(node)


def harden(workflow):
    wid = workflow['id']
    nodes = {n['name']: n for n in workflow['nodes']}
    bridge = 'Validate Request' in nodes
    if wid not in CORE and wid != SNAPSHOT and not bridge:
        return False
    # Preserve unrelated draft changes; only adjust the nodes identified below.
    if wid in CORE or wid == SNAPSHOT:
        triggers = [n for n in workflow['nodes'] if n['type'].endswith('.executeWorkflowTrigger')]
        if len(triggers) != 1:
            raise ValueError('Expected one subworkflow trigger: ' + workflow['name'])
        trigger = triggers[0]['name']
        edges = workflow['connections'][trigger]['main']
        guard = code_node('Validate Practice Scope', GUARD, [40, -160])
        workflow['nodes'].append(guard)
        workflow['connections'][guard['name']] = {'main': edges}
        workflow['connections'][trigger] = {'main': [[{'node': guard['name'], 'type': 'main', 'index': 0}]]}
    scope_node = 'Validate Request' if bridge else 'Validate Practice Scope'
    scope = "={{ $('" + scope_node + "').first().json.practice_id }}"
    for node in workflow['nodes']:
        if not node['type'].endswith('.dataTable'):
            continue
        params = node['parameters']
        operation = params.get('operation', 'insert')
        if operation in ('get', 'update', 'deleteRows', 'upsert', 'rowExists', 'rowNotExists'):
            conditions = params.setdefault('filters', {}).setdefault('conditions', [])
            # Use the authoritative request scope, never a scope read from a supplied record ID.
            conditions[:] = [c for c in conditions if c.get('keyName') != 'practice_id']
            if wid == SNAPSHOT:
                conditions[:] = [c for c in conditions if c.get('keyName') != 'demo_session_id']
            conditions.append({'keyName': 'practice_id', 'condition': 'eq', 'keyValue': scope})
            params['matchType'] = 'allConditions'
            if operation == 'get':
                params['returnAll'] = True
                params.pop('limit', None)
    if wid == APPROVAL_BRIDGE:
        p = nodes['Prep Approval Input']['parameters']
        p['jsCode'] = p['jsCode'].replace('approval_id: r.payload.id,', 'practice_id: r.practice_id, approval_id: r.payload.id,')
    if wid == AVA_BRIDGE:
        p = nodes['Build Envelope (Confirm)']['parameters']
        p['jsCode'] = p['jsCode'].replace('if (!row || new Date(row.expires_at) < new Date())',
            'if (!row || row.practice_id !== req.practice_id || !Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= Date.now())')
        p['jsCode'] = p['jsCode'].replace('cached.request_id = req.request_id;', """if (cached.store && Array.isArray(cached.store.practices)) {
  cached.store = { version: 1, activeId: req.practice_id, practices: cached.store.practices.filter(p => p.id === req.practice_id) };
}
cached.request_id = req.request_id;""")
    if wid == AVA:
        # Check a requested patient against this practice before creating a booking.
        patient = copy.deepcopy(nodes['Get Agents (Practice)'])
        patient.update({'id': str(uuid.uuid4()), 'name': 'Get Patient (Booking Guard)', 'position': [790, -160], 'alwaysOutputData': True, 'executeOnce': True})
        patient['parameters'] = {
            'operation': 'get', 'dataTableId': {'__rl': True, 'mode': 'list', 'value': '663JyMo8f2InvEp0'},
            'returnAll': True, 'matchType': 'allConditions', 'filters': {'conditions': [
                {'keyName': 'practice_id', 'condition': 'eq', 'keyValue': scope},
                {'keyName': 'patient_id', 'condition': 'eq', 'keyValue': "={{ $('Scenario Input').first().json.patient_id }}"},
            ]},
        }
        insert_before(workflow, 'Check Slot Free', patient)
        insert_before(workflow, 'Appointment To Cancel Found?', code_node('Check Cancellation State', "const row = $input.first().json; return [{json: row.appointment_id && ['Confirmed','Arrived'].includes(row.status) ? row : {}}];", [790, 460]))
        code = nodes['Check Slot Free']['parameters']['jsCode']
        code = code.replace('$input.all()', "$('Get Appointments (Booking Check)').all()")
        marker = "const scenario = $('Scenario Input').first().json;"
        code = code.replace(marker, marker + BOOKING_GUARD + """
const patients = $('Get Patient (Booking Guard)').all().map(i=>i.json).filter(p=>p.patient_id===scenario.patient_id && p.practice_id===scenario.practice_id);
const refusal = schedulingError(30) || (patients.length !== 1 ? 'That patient is not registered at this practice.' : null);
if (refusal) return [{json:{available:false,reason:refusal}}];
""")
        code = code.replace('(r.provider === providers[p] || r.chair === chairs[c])', '(r.provider === providers[p] || r.chair === chairs[c] || r.patient_id === scenario.patient_id)')
        nodes['Check Slot Free']['parameters']['jsCode'] = code
        code = nodes['Check New Slot Free']['parameters']['jsCode']
        code = code.replace(marker, marker + BOOKING_GUARD)
        original_marker = "const original = $('Get Appointment To Reschedule').first().json;"
        code = code.replace(original_marker, original_marker + """
const duration = (Date.parse(original.end_time) - Date.parse(original.start_time)) / 60000;
const refusal = schedulingError(duration) || (!['Confirmed','Arrived'].includes(original.status) ? 'This visit can no longer be moved.' : null);
if (refusal) return [{json:{available:false,reason:refusal}}];
""")
        code = code.replace('30 * 60000', 'duration * 60000')
        code = code.replace('(r.provider === original.provider || r.chair === original.chair)', '(r.provider === original.provider || r.chair === original.chair || r.patient_id === original.patient_id)')
        nodes['Check New Slot Free']['parameters']['jsCode'] = code
        for response_node, check_node in [('Booking Conflict Response', 'Check Slot Free'), ('Reschedule Conflict - Original Kept', 'Check New Slot Free')]:
            for a in nodes[response_node]['parameters']['assignments']['assignments']:
                if a['name'] == 'response':
                    a['value'] = "={{ $('" + check_node + "').first().json.reason || 'That slot is unavailable. Please choose another time.' }}"
        # Do not create a booking for a default demo patient when identity is missing.
        for a in nodes['Scenario Input']['parameters']['assignments']['assignments']:
            if a['name'] in ('patient_id', 'practice_id', 'preferred_date', 'preferred_time', 'action'):
                a['value'] = '={{ $json.' + a['name'] + " || '' }}"
    if wid == STATE:
        nodes['Message (Recipe)']['parameters']['jsCode'] = "throw new Error('Recipe pausing is not supported. Pause the corresponding agent instead.');"
    # Each bridge must carry its authenticated server request's scope to the snapshot.
    for node in list(workflow['nodes']):
        p = node.get('parameters', {})
        ref = p.get('workflowId', {})
        target = ref.get('value') if isinstance(ref, dict) else ref
        if node['type'].endswith('.executeWorkflow') and target == SNAPSHOT:
            if not bridge:
                raise ValueError('Snapshot caller without request validator: ' + workflow['name'])
            name = 'Scope ' + node['name']
            prep = code_node(name, "return [{ json: { practice_id: $('Validate Request').first().json.practice_id } }];", [node['position'][0] - 100, node['position'][1] - 100])
            insert_before(workflow, node['name'], prep)
    if wid == SNAPSHOT:
        p = nodes['Build Snapshot 1']['parameters']
        p['jsCode'] = p['jsCode'].replace("filter(function(r){ return r.practice_id; })", "filter(function(r){ return r.practice_id === $('Validate Practice Scope').first().json.practice_id; })")
        p['jsCode'] = p['jsCode'].replace("email: pt.name.toLowerCase().replace(/ /g, '.') + '@example.test',", "email: typeof pt.email === 'string' ? pt.email : '',")
        p['jsCode'] = p['jsCode'].replace("role: 'patient', text: c.last_message || ''", "role: 'system', text: c.last_message ? 'Legacy conversation summary: ' + c.last_message : ''")
        p['jsCode'] = p['jsCode'].replace("activeId: practices.length ? practices[0].practice_id : 'prac_oakwood'", "activeId: $('Validate Practice Scope').first().json.practice_id")
    return True


def inspect(workflow):
    names = {n['name'] for n in workflow['nodes']}
    if len(names) != len(workflow['nodes']):
        raise ValueError('Duplicate node name')
    for source, ports in workflow['connections'].items():
        assert source in names, source
        for outputs in ports.values():
            for edges in outputs:
                for edge in edges:
                    assert edge['node'] in names, edge['node']
    for node in workflow['nodes']:
        if node['type'].endswith('.dataTable') and node['parameters'].get('operation') in ('get', 'update', 'deleteRows', 'upsert'):
            p = node['parameters']
            assert p.get('matchType') == 'allConditions', node['name']
            assert any(c.get('keyName') == 'practice_id' for c in p['filters']['conditions']), node['name']


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--database', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit('Choose a new output folder; backups are never overwritten.')
    db = sqlite3.connect(args.database.resolve().as_uri() + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    before, after, manifest = [], [], []
    for row in db.execute('select * from workflow_entity where active = 1'):
        w = {key: row[key] for key in ('id', 'name', 'versionId', 'activeVersionId', 'active')}
        for key in ('nodes', 'connections', 'settings'):
            w[key] = json.loads(row[key] or '{}')
        original = copy.deepcopy(w)
        if not harden(w):
            continue
        inspect(w)
        published = db.execute('select nodes,connections from workflow_history where versionId=?', (row['activeVersionId'],)).fetchone()
        original['publishedBackup'] = {'nodes': json.loads(published['nodes']), 'connections': json.loads(published['connections'])}
        before.append(original)
        previous = {n['name']: n for n in original['nodes']}
        changed = [n['name'] for n in w['nodes'] if previous.get(n['name']) != n]
        manifest.append({'id': w['id'], 'name': w['name'], 'beforeDraft': row['versionId'], 'beforePublished': row['activeVersionId'], 'changedNodes': changed})
        # Import is deliberately inactive. Publication is a separate, controlled step.
        w['active'] = False
        w.pop('activeVersionId', None)
        w['versionId'] = str(uuid.uuid4())
        w['pinData'] = {}
        after.append(w)
    args.output.mkdir(parents=True, mode=0o700)
    for filename, data in [('before.json', before), ('candidate.json', after), ('manifest.json', manifest)]:
        path = args.output / filename
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
        path.chmod(0o600)
    print(json.dumps({'preparedWorkflows': len(after), 'changedNodes': sum(len(x['changedNodes']) for x in manifest), 'output': str(args.output), 'liveChanges': 0}))


if __name__ == '__main__':
    main()
