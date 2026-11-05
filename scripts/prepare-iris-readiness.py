"""Prepare a reversible fix for Iris's stale and future follow-up selection."""
import argparse
import copy
import json
import sqlite3
import uuid
from pathlib import Path

CORE = '2pX6Hu21KkF0mHYW'
BRIDGE = 'XmHlRHlJSRZ7OAnS'
RECENT_GUARD = """const row = $input.first().json;
const end = Date.parse(row.end_time || '');
const recent = row.status === 'Completed' && Number.isFinite(end) && end <= Date.now() && end >= Date.now() - 72 * 3600000;
return [{ json: { ...row, eligible_followup: recent } }];"""
SELECT_RECENT = """const now = Date.now();
const appts = $('Get Appointments (Prepare)').all().map(i => i.json).filter(r => {
  const end = Date.parse(r.end_time || '');
  return r.appointment_id && r.status === 'Completed' && Number.isFinite(end) && end <= now && end >= now - 72 * 3600000;
});
const events = $input.all().map(i => i.json).filter(r => r.event_id && r.type === 'followup_sent');
const preparedIds = new Set(events.map(e => e.related_id));
const eligible = appts.filter(a => !preparedIds.has(a.appointment_id)).sort((a,b) => Date.parse(b.end_time) - Date.parse(a.end_time))[0];
return [{ json: { found: !!eligible, appointment_id: eligible ? eligible.appointment_id : null } }];"""


def patch(workflow):
    nodes = {n['name']: n for n in workflow['nodes']}
    if workflow['id'] == BRIDGE:
        nodes['Find Eligible Appointment']['parameters']['jsCode'] = SELECT_RECENT
        code = nodes['Build Envelope (Prepare None)']['parameters']['jsCode']
        assert 'Every completed visit already has a follow-up.' in code
        nodes['Build Envelope (Prepare None)']['parameters']['jsCode'] = code.replace(
            'Every completed visit already has a follow-up.',
            'Only completed visits from the past 72 hours can receive a follow-up.'
        )
        return

    assert workflow['id'] == CORE
    guard = {
        'id': str(uuid.uuid4()), 'name': 'Guard Recent Completed Visit',
        'type': 'n8n-nodes-base.code', 'typeVersion': 2,
        'position': [1120, -480],
        'parameters': {'mode': 'runOnceForAllItems', 'jsCode': RECENT_GUARD},
    }
    edges = workflow['connections']['Get Appointment (Followup)']['main'][0]
    assert len(edges) == 1 and edges[0]['node'] == 'Appointment Completed?'
    workflow['connections']['Get Appointment (Followup)']['main'][0] = [{'node': guard['name'], 'type': 'main', 'index': 0}]
    workflow['connections'][guard['name']] = {'main': [[{'node': 'Appointment Completed?', 'type': 'main', 'index': 0}]]}
    workflow['nodes'].append(guard)
    conditions = nodes['Appointment Completed?']['parameters']['conditions']['conditions']
    assert len(conditions) == 1 and conditions[0]['rightValue'] == 'Completed'
    conditions[:] = [{'leftValue': '={{ $json.eligible_followup }}', 'operator': {'type': 'boolean', 'operation': 'true'}}]
    for entry in nodes['Not Completed Response']['parameters']['assignments']['assignments']:
        if entry['name'] == 'response':
            entry['value'] = 'No follow-up is due. The visit must have ended within the past 72 hours.'
    for entry in nodes['Already Sent Response']['parameters']['assignments']['assignments']:
        if entry['name'] == 'response':
            entry['value'] = 'A follow-up for this appointment has already been prepared.'
    for entry in nodes['Followup Sent Response']['parameters']['assignments']['assignments']:
        if entry['name'] == 'response':
            assert 'Follow-up sent to ' in entry['value']
            entry['value'] = entry['value'].replace('Follow-up sent to ', 'Follow-up prepared for ', 1)
    message = nodes['Log Followup Sent Event']['parameters']['columns']['value']['description']
    assert 'Iris sent follow-up' in message
    nodes['Log Followup Sent Event']['parameters']['columns']['value']['description'] = message.replace('Iris sent follow-up', 'Iris prepared follow-up', 1)
    assert nodes['Insert New Conversation (Followup)']['parameters']['columns']['value']['channel'] == 'WhatsApp'
    nodes['Insert New Conversation (Followup)']['parameters']['columns']['value']['channel'] = 'Web'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--database', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit('Choose a new private bundle directory.')
    db = sqlite3.connect(args.database.resolve().as_uri() + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    before, after, manifest = [], [], []
    for workflow_id in (CORE, BRIDGE):
        row = db.execute('select * from workflow_entity where id=?', (workflow_id,)).fetchone()
        workflow = {key: row[key] for key in ('id', 'name', 'versionId', 'activeVersionId', 'active')}
        for key in ('nodes', 'connections', 'settings'):
            workflow[key] = json.loads(row[key] or '{}')
        published = db.execute('select nodes,connections from workflow_history where versionId=?', (row['activeVersionId'],)).fetchone()
        if any(json.loads(published[key]) != workflow[key] for key in ('nodes', 'connections')):
            raise RuntimeError('Unpublished changes require review: ' + workflow['name'])
        original = copy.deepcopy(workflow)
        original['publishedBackup'] = {key: json.loads(published[key]) for key in ('nodes', 'connections')}
        before.append(original)
        patch(workflow)
        original_nodes = {node['name']: node for node in original['nodes']}
        manifest.append({'id': workflow_id, 'name': workflow['name'], 'changedNodes': [node['name'] for node in workflow['nodes'] if original_nodes.get(node['name']) != node]})
        workflow.pop('activeVersionId')
        workflow['active'] = False
        workflow['versionId'] = str(uuid.uuid4())
        workflow['pinData'] = {}
        after.append(workflow)
    args.output.mkdir(mode=0o700, parents=True)
    for name, data in (('before.json', before), ('candidate.json', after), ('manifest.json', manifest)):
        path = args.output / name
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
        path.chmod(0o600)
    print(json.dumps({'workflows': len(after), 'changedNodes': [m['changedNodes'] for m in manifest], 'liveChanges': 0}))


if __name__ == '__main__':
    main()
