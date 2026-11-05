"""Prepare a reversible n8n appointment-status guard for the local test system."""
import argparse
import copy
import json
import sqlite3
import uuid
from pathlib import Path

WORKFLOW_ID = '4P30lYrBxLyrxmxy'
APPOINTMENTS = 'UXVshoa3Uo83qy0K'
GUARD = """const req = $('Validate Request').first().json;
const rows = $input.all().map(i => i.json).filter(r => r.appointment_id === req.payload.id && r.practice_id === req.practice_id);
if (rows.length !== 1) throw new Error('Appointment not found in this practice.');
const row = rows[0], target = req.payload.status;
if (!((row.status === 'Confirmed' && target === 'Arrived') || (row.status === 'Arrived' && target === 'Completed'))) {
  throw new Error('This appointment status transition is not allowed.');
}
// DentalOS stores appointment wall times as Europe/Amsterdam local values.
const start = String(row.start_time || '');
if (!/^\\d{4}-\\d{2}-\\d{2}[ T]([01]\\d|2[0-3]):[0-5]\\d/.test(start)) throw new Error('Appointment time is invalid.');
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Amsterdam', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'}).formatToParts(new Date()).map(p => [p.type,p.value]));
const today = parts.year+'-'+parts.month+'-'+parts.day, clock = parts.hour+':'+parts.minute;
const visitDay = start.slice(0,10), visitClock = start.slice(11,16);
if (visitDay > today || (target === 'Completed' && visitDay === today && visitClock > clock)) {
  throw new Error('The visit has not happened yet.');
}
return [{ json: req }];"""


def prepare(workflow):
    nodes = {n['name']: n for n in workflow['nodes']}
    read = copy.deepcopy(nodes['Get Patient (Current)'])
    read.update({'id': str(uuid.uuid4()), 'name': 'Get Appointment Before Status', 'position': [704, -304]})
    read['parameters']['dataTableId']['value'] = APPOINTMENTS
    read['parameters']['filters']['conditions'][0]['keyName'] = 'appointment_id'
    guard = {
        'id': str(uuid.uuid4()), 'name': 'Validate Status Transition',
        'type': 'n8n-nodes-base.code', 'typeVersion': 2, 'position': [900, -304],
        'parameters': {'mode': 'runOnceForAllItems', 'jsCode': GUARD},
    }
    workflow['nodes'].extend((read, guard))
    route = workflow['connections']['Route Action']['main'][2]
    assert len(route) == 1 and route[0]['node'] == 'Update Appointment Status'
    workflow['connections']['Route Action']['main'][2] = [{'node': read['name'], 'type': 'main', 'index': 0}]
    workflow['connections'][read['name']] = {'main': [[{'node': guard['name'], 'type': 'main', 'index': 0}]]}
    workflow['connections'][guard['name']] = {'main': [[{'node': 'Update Appointment Status', 'type': 'main', 'index': 0}]]}
    update = nodes['Update Appointment Status']['parameters']
    for condition in update['filters']['conditions']:
        if condition['keyName'] == 'appointment_id':
            condition['keyValue'] = "={{ $('Validate Request').first().json.payload.id }}"
    update['columns']['value']['status'] = "={{ $('Validate Request').first().json.payload.status }}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--database', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit('Choose a new private bundle directory.')
    db = sqlite3.connect(args.database.resolve().as_uri()+'?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    row = db.execute('select * from workflow_entity where id=?', (WORKFLOW_ID,)).fetchone()
    workflow = {key: row[key] for key in ('id','name','versionId','activeVersionId','active')}
    for key in ('nodes','connections','settings'):
        workflow[key] = json.loads(row[key] or '{}')
    published = db.execute('select nodes,connections from workflow_history where versionId=?', (row['activeVersionId'],)).fetchone()
    if any(json.loads(published[key]) != workflow[key] for key in ('nodes','connections')):
        raise RuntimeError('Unpublished draft requires review.')
    original = copy.deepcopy(workflow)
    original['publishedBackup'] = {key: json.loads(published[key]) for key in ('nodes','connections')}
    prepare(workflow)
    old_nodes = {n['name']: n for n in original['nodes']}
    manifest = {'id': WORKFLOW_ID, 'name': workflow['name'], 'changedNodes': [n['name'] for n in workflow['nodes'] if old_nodes.get(n['name']) != n]}
    workflow['active'] = False
    workflow.pop('activeVersionId')
    workflow['versionId'] = str(uuid.uuid4())
    workflow['pinData'] = {}
    args.output.mkdir(mode=0o700, parents=True)
    for name, data in (('before.json',[original]),('candidate.json',[workflow]),('manifest.json',[manifest])):
        path = args.output/name
        path.write_text(json.dumps(data,indent=2,ensure_ascii=False))
        path.chmod(0o600)
    print(json.dumps({'changedNodes': manifest['changedNodes'], 'liveChanges': 0}))


if __name__ == '__main__':
    main()
