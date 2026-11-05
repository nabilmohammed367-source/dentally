"""Prepare one workflow change: patient registration guard and consent defaults."""
import argparse
import copy
import json
import sqlite3
import uuid
import runpy
from pathlib import Path
helpers = runpy.run_path(str(Path(__file__).with_name('prepare-inbox-persistence.py')))
table, eq, expr = (helpers[name] for name in ['table', 'eq', 'expr'])

def main():
    p=argparse.ArgumentParser();p.add_argument('--database',type=Path,required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
    if args.output.exists():raise SystemExit('Choose a new backup folder.')
    db=sqlite3.connect(args.database.resolve().as_uri()+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
    row=db.execute('select * from workflow_entity where id=?',('lD9wKCrivHYSvF0R',)).fetchone()
    w={k:row[k] for k in ['id','name','versionId','activeVersionId','active']}
    for k in ['nodes','connections','settings']:w[k]=json.loads(row[k] or '{}')
    old=copy.deepcopy(w);pub=db.execute('select nodes,connections from workflow_history where versionId=?',(w['activeVersionId'],)).fetchone()
    assert all(json.loads(pub[k])==w[k] for k in ['nodes','connections'])
    old['publishedBackup']={k:json.loads(pub[k]) for k in ['nodes','connections']}
    get=table('Get Registration Candidates','get','663JyMo8f2InvEp0',[eq('practice_id',expr("$('Validate Practice Scope').first().json.practice_id"))])
    for ports in w['connections'].values():
        for outputs in ports.values():
            for edges in outputs:
                for edge in edges:
                    if edge['node']=='Build New Patient':edge['node']=get['name']
    w['nodes'].append(get);w['connections'][get['name']]={'main':[[{'node':'Build New Patient','type':'main','index':0}]]}
    n=next(n for n in w['nodes'] if n['name']=='Build New Patient')
    s=n['parameters']['jsCode'];marker="const scenario = $('Scenario Input').first().json;"
    s=s.replace(marker,marker+"""
const name=String(scenario.new_patient_name||'').trim(), phone=String(scenario.new_patient_phone||'').trim();
if(name.length<2 || name.length>160 || phone.length<5 || phone.length>40) return [{json:{error:true,response:'A full name and phone number are required.'}}];
const norm=s=>s.toLowerCase().replace(/[^0-9a-z]/g,'');
if($('Get Registration Candidates').all().some(i=>i.json.practice_id===scenario.practice_id && norm(String(i.json.name||''))===norm(name) && norm(String(i.json.phone||''))===norm(phone))) return [{json:{error:true,response:'This patient is already registered with that phone number.'}}];
""")
    s=s.replace('consent_appointment: true','consent_appointment: false').replace('name: scenario.new_patient_name, phone: scenario.new_patient_phone || \'\'','name: name, phone: phone')
    n['parameters']['jsCode']=s
    w['active']=False;w.pop('activeVersionId');w['versionId']=str(uuid.uuid4());w['pinData']={}
    args.output.mkdir(mode=0o700)
    for name,data in [('before.json',[old]),('candidate.json',[w])]:
        path=args.output/name;path.write_text(json.dumps(data,indent=2));path.chmod(0o600)
    print('Prepared registration validation, duplicate check and opt-in defaults; no live changes.')

if __name__=='__main__':main()
