"""Prepare local n8n inbox persistence. Does not publish or execute workflows."""
import argparse
import copy
import json
import sqlite3
import uuid
from pathlib import Path

SNAPSHOT = 'Af4fnEAm3H6sYt6x'
MILO = 'SazNyEZ6uAWtNVk2'
CORE = 'xF0xrnGu2oVHjtQK'
STATE = '4P30lYrBxLyrxmxy'
CONVERSATIONS = 'jCpHAXN6OmuuVskW'
MESSAGES = 'MXgfklj39fg7Ljd2'

def code(name, body):
    return {'id': str(uuid.uuid4()), 'name': name, 'type': 'n8n-nodes-base.code', 'typeVersion': 2, 'position': [800, 800], 'parameters': {'jsCode': body}}

def table(name, operation, table_id, conditions, values=None, once=True):
    p = {'operation': operation, 'dataTableId': {'__rl': True, 'mode': 'list', 'value': table_id}, 'matchType': 'allConditions', 'filters': {'conditions': conditions}}
    if operation == 'get': p['returnAll'] = True
    if values is not None: p['columns'] = {'mappingMode': 'defineBelow', 'matchingColumns': [], 'value': values}; p['options'] = {}
    return {'id': str(uuid.uuid4()), 'name': name, 'type': 'n8n-nodes-base.dataTable', 'typeVersion': 1, 'position': [1000, 800], 'alwaysOutputData': True, 'executeOnce': once, 'parameters': p}

def eq(key, value): return {'keyName': key, 'condition': 'eq', 'keyValue': value}
def expr(value): return '={{ ' + value + ' }}'
def connect(w, source, target): w['connections'][source] = {'main': [[{'node': target, 'type': 'main', 'index': 0}]]}
def chain(w, source, nodes, target):
    for n in nodes: connect(w, source, n['name']); w['nodes'].append(n); source = n['name']
    connect(w, source, target)

def patch(w):
    nodes = {n['name']: n for n in w['nodes']}
    req = "$('Validate Request').first().json"
    scope = eq('practice_id', expr(req + '.practice_id'))
    if w['id'] == SNAPSHOT:
        # Messages have no practice_id column. Query only conversation IDs from
        # the already practice-filtered conversation read; never scan all messages.
        prepare = code('Prepare Owned Conversation IDs', """const scope = $('Validate Practice Scope').first().json.practice_id;
const ids = [...new Set($('Get All Conversations').all().map(i=>i.json).filter(c=>c.practice_id===scope && c.conversation_id).map(c=>c.conversation_id))];
return (ids.length ? ids : ['__no_owned_conversations__']).map(id=>({json:{conversation_id:id}}));""")
        get = table('Get Owned Conversation Messages', 'get', MESSAGES, [eq('conversation_id', expr('$json.conversation_id'))], once=False)
        collapse = code('Collapse Messages', 'return [{json:{}}];')
        chain(w, 'Get All Activity Events', [prepare, get, collapse], 'Build Snapshot 1')
        p = nodes['Build Snapshot 1']['parameters']
        p['jsCode'] = "const savedMessages = $('Get Owned Conversation Messages').all().map(i=>i.json).filter(m=>m.message_id);\n" + p['jsCode']
        old = "messages: [{ id: c.conversation_id + '-m0', role: 'system', text: c.last_message ? 'Legacy conversation summary: ' + c.last_message : '' }]"
        new = "messages: (function(){ const rows = savedMessages.filter(m=>m.conversation_id===c.conversation_id).sort((a,b)=>String(a.created_at||a.createdAt).localeCompare(String(b.created_at||b.createdAt)) || String(a.message_id).localeCompare(String(b.message_id))); return rows.length ? rows.map(m=>({id:m.message_id,role:['patient','agent','staff','system'].includes(m.sender)?m.sender:'system',text:String(m.text||'')})) : [{ id:c.conversation_id+'-m0',role:'system',text:c.last_message?'Legacy conversation summary: '+c.last_message:'' }]; })()"
        assert old in p['jsCode']; p['jsCode'] = p['jsCode'].replace(old, new)
    if w['id'] == CORE:
        assignments = nodes['Scenario Input']['parameters']['assignments']['assignments']
        assignments.append({'id': str(uuid.uuid4()), 'name': 'conversation_id', 'value': expr("$json.conversation_id || ''"), 'type': 'string'})
        for name in ['Resolve Conversation ID (Human)', 'Resolve Conversation ID (Clinical)']:
            p = nodes[name]['parameters']
            p['jsCode'] = p['jsCode'].replace('r.patient_id === scenario.patient_id;', 'r.patient_id === scenario.patient_id && (!scenario.conversation_id || r.conversation_id === scenario.conversation_id);')
        nodes['Milo Paused']['parameters']['assignments']['assignments'].append({'id': str(uuid.uuid4()), 'name': 'ok', 'value': False, 'type': 'boolean'})
    if w['id'] == MILO:
        get = table('Get Patient For Inbox', 'get', '663JyMo8f2InvEp0', [scope, eq('patient_id', expr(req+'.payload.patientId'))])
        guard = code('Validate Inbox Patient', """const r = $('Validate Request').first().json;
if (!$input.all().some(i=>i.json.patient_id===r.payload.patientId && i.json.practice_id===r.practice_id)) throw new Error('Patient does not belong to this practice.');
return [{json:r}];""")
        chain(w, 'Validate Request', [get, guard], 'Determine Milo Scenario')
        p = nodes['Determine Milo Scenario']['parameters']
        p['jsCode'] = p['jsCode'].replace('patient_id: x.patientId,', "patient_id: x.patientId, conversation_id: x.conversationId || '',")
        # Validate an optional selected conversation before calling the core.
        getc = table('Get Patient Conversations', 'get', CONVERSATIONS, [scope, eq('patient_id', expr(req+'.payload.patientId'))])
        valid = code('Validate Selected Conversation', """const r=$('Validate Request').first().json;
if(r.payload.conversationId && !$input.all().some(i=>i.json.conversation_id===r.payload.conversationId && i.json.practice_id===r.practice_id && i.json.patient_id===r.payload.patientId)) throw new Error('Conversation does not belong to this patient and practice.');
return [{json:$('Determine Milo Scenario').first().json}];""")
        # Only the non-neutral branch calls the core.
        w['connections']['Is Neutral?']['main'][1][0]['node'] = getc['name']
        w['nodes'] += [getc, valid]; connect(w,getc['name'],valid['name']); connect(w,valid['name'],'Call Real Milo')
        after = table('Get Conversations After Milo', 'get', CONVERSATIONS, [scope, eq('patient_id', expr(req+'.payload.patientId'))])
        build = code('Build Persistent Conversation', """const r=$('Validate Request').first().json, result=$('Call Real Milo').first().json;
if(result.ok===false) return [];
if(typeof result.response!=='string' || !result.response.trim()) throw new Error('Milo did not return a message.');
const rows=$input.all().map(i=>i.json).filter(c=>c.practice_id===r.practice_id && c.patient_id===r.payload.patientId);
const existing=r.payload.conversationId?rows.find(c=>c.conversation_id===r.payload.conversationId):rows.sort((a,b)=>String(b.updated_at||b.updatedAt).localeCompare(String(a.updated_at||a.updatedAt)))[0];
return [{json:{demo_session_id:'demo1',conversation_id:existing?.conversation_id||'conv_'+r.practice_id+'_'+r.request_id,practice_id:r.practice_id,patient_id:r.payload.patientId,channel:existing?.channel||'Web',status:existing?.status||'Agent handling',assigned_to:existing?.assigned_to||'Milo',last_message:r.payload.text,updated_at:new Date().toISOString()}}];""")
        conv_values = {k:expr('$json.'+k) for k in ['demo_session_id','conversation_id','practice_id','patient_id','channel','status','assigned_to','last_message','updated_at']}
        upsert = table('Save Inbox Conversation','upsert',CONVERSATIONS,[scope,eq('conversation_id',expr('$json.conversation_id'))],conv_values)
        messages = code('Build Persistent Milo Messages', """const r=$('Validate Request').first().json, c=$('Build Persistent Conversation').first().json;
const reply=$('Call Real Milo').first().json.response, time=Date.now();
return [{sender:'patient',text:r.payload.text,suffix:'1',offset:0},{sender:'agent',text:reply,suffix:'2',offset:1}].map(m=>({json:{demo_session_id:'demo1',message_id:'msg_'+r.practice_id+'_'+r.request_id+'_'+m.suffix,conversation_id:c.conversation_id,sender:m.sender,text:m.text,simulated:true,created_at:new Date(time+m.offset).toISOString()}}));""")
        vals = {k:expr('$json.'+k) for k in ['demo_session_id','message_id','conversation_id','sender','text','simulated','created_at']}
        save = table('Save Milo Messages','upsert',MESSAGES,[eq('conversation_id',expr('$json.conversation_id')),eq('message_id',expr('$json.message_id'))],vals,once=False)
        # A paused Milo goes straight to the snapshot without saving any messages.
        gate = {'id':str(uuid.uuid4()),'name':'Milo Completed?','type':'n8n-nodes-base.if','typeVersion':2.2,'position':[600,800],'parameters':{'conditions':{'options':{'caseSensitive':True,'leftValue':'','typeValidation':'strict','version':2},'conditions':[{'id':str(uuid.uuid4()),'leftValue':expr('$json.ok !== false'),'rightValue':True,'operator':{'type':'boolean','operation':'true','singleValue':True}}],'combinator':'and'},'options':{}}}
        w['nodes'].append(gate);connect(w,'Call Real Milo',gate['name'])
        w['connections'][gate['name']]={'main':[[{'node':after['name'],'type':'main','index':0}],[{'node':'Scope Build Snapshot (Milo)','type':'main','index':0}]]}
        w['nodes'].append(after);chain(w,after['name'],[build,upsert,messages,save,code('Collapse Saved Milo Messages','return [{json:{}}];')],'Scope Build Snapshot (Milo)')
        p=nodes['Build Envelope (Milo)']['parameters'];p['jsCode']=p['jsCode'].replace('success: true,','success: miloResult.ok !== false,')
    if w['id'] == STATE:
        get = table('Get Owned Conversation Before Update','get',CONVERSATIONS,[scope,eq('conversation_id',expr(req+'.payload.id'))])
        guard=code('Require Owned Conversation',"""const r=$('Validate Request').first().json;
const rows=$input.all().map(i=>i.json).filter(c=>c.practice_id===r.practice_id && c.conversation_id===r.payload.id);
if(rows.length!==1) throw new Error('Conversation is unavailable at this practice.');
return [{json:r}];""")
        w['connections']['Route Action']['main'][3][0]['node']=get['name'];w['nodes'] += [get,guard];connect(w,get['name'],guard['name']);connect(w,guard['name'],'Update Conversation')
        build=code('Build Persistent Staff Message',"""const r=$('Validate Request').first().json;
const system=r.payload.status==='Resolved'||r.payload.text==='A staff member has taken over this conversation.';
return [{json:{demo_session_id:'demo1',message_id:'msg_'+r.practice_id+'_'+r.request_id+'_staff',conversation_id:r.payload.id,sender:system?'system':'staff',text:r.payload.status==='Resolved'?'Conversation resolved by staff.':r.payload.text,simulated:true,created_at:new Date().toISOString()}}];""")
        vals={k:expr('$json.'+k) for k in ['demo_session_id','message_id','conversation_id','sender','text','simulated','created_at']}
        save=table('Save Staff Message','upsert',MESSAGES,[eq('conversation_id',expr('$json.conversation_id')),eq('message_id',expr('$json.message_id'))],vals)
        chain(w,'Update Conversation',[build,save],'Message (Conversation)')
        nodes['Message (Conversation)']['parameters']['jsCode']="return [{json:{message:'Saved in the conversation history. No patient message was sent.'}}];"

def main():
    p=argparse.ArgumentParser();p.add_argument('--database',type=Path,required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
    if args.output.exists(): raise SystemExit('Choose a new backup folder.')
    db=sqlite3.connect(args.database.resolve().as_uri()+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
    before=[];after=[];manifest=[]
    for wid in [SNAPSHOT,CORE,MILO,STATE]:
        row=db.execute('select * from workflow_entity where id=?',(wid,)).fetchone()
        w={k:row[k] for k in ['id','name','versionId','activeVersionId','active']}
        for k in ['nodes','connections','settings']:w[k]=json.loads(row[k] or '{}')
        old=copy.deepcopy(w)
        pub=db.execute('select nodes,connections from workflow_history where versionId=?',(w['activeVersionId'],)).fetchone()
        if any(json.loads(pub[k])!=w[k] for k in ['nodes','connections']): raise RuntimeError('Unpublished changes need review: '+w['name'])
        old['publishedBackup']={k:json.loads(pub[k]) for k in ['nodes','connections']};before.append(old)
        patch(w)
        names={n['name'] for n in w['nodes']};assert len(names)==len(w['nodes'])
        for source,ports in w['connections'].items():
            assert source in names
            for outputs in ports.values():
                for edges in outputs:
                    for edge in edges:assert edge['node'] in names
        oldnodes={n['name']:n for n in old['nodes']}
        manifest.append({'id':wid,'name':w['name'],'changedNodes':[n['name'] for n in w['nodes'] if oldnodes.get(n['name'])!=n]})
        w['active']=False;w.pop('activeVersionId');w['versionId']=str(uuid.uuid4());w['pinData']={};after.append(w)
    args.output.mkdir(mode=0o700)
    for name,data in [('before.json',before),('candidate.json',after),('manifest.json',manifest)]:
        path=args.output/name;path.write_text(json.dumps(data,indent=2));path.chmod(0o600)
    print(json.dumps({'preparedWorkflows':len(after),'changedNodes':sum(len(m['changedNodes']) for m in manifest),'liveChanges':0}))

if __name__=='__main__':main()
