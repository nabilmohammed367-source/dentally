import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const workflows = JSON.parse(readFileSync(process.argv[2], 'utf8'))
let checks = 0
const check = (ok, label) => { assert.ok(ok, label); checks++ }
const node = (id, name) => workflows.find(w => w.id === id).nodes.find(n => n.name === name)
const run = (n, sources = {}, rows = []) => vm.runInNewContext(`(function(){${n.parameters.jsCode}\n})()`, {
  $: name => ({ all: () => (sources[name] ?? []).map(json => ({ json })), first: () => ({ json: sources[name]?.[0] ?? {} }) }),
  $input: { all: () => rows.map(json => ({ json })), first: () => ({ json: rows[0] ?? {} }) }, Date,
}, { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } })
for (const w of workflows) {
  check(w.active === false, 'import inactive')
  for (const n of w.nodes) {
    if (n.type.endsWith('.code')) { new vm.Script(`(async function(){${n.parameters.jsCode}\n})`); checks++ }
    if (n.type.endsWith('.dataTable') && n.parameters.dataTableId.value === 'MXgfklj39fg7Ljd2') {
      check(n.parameters.matchType === 'allConditions' && n.parameters.filters.conditions.some(c => c.keyName === 'conversation_id'), 'message access always requires conversation ID')
    }
  }
}
const sid = 'Af4fnEAm3H6sYt6x', mid = 'SazNyEZ6uAWtNVk2', state = '4P30lYrBxLyrxmxy'
const owned = { conversation_id: 'c_a', practice_id: 'practice_a', patient_id: 'patient_a', channel: 'Web', status: 'Agent handling' }
const foreign = { ...owned, conversation_id: 'c_b', practice_id: 'practice_b', patient_id: 'patient_b' }
const base = { 'Validate Practice Scope': [{ practice_id: 'practice_a' }], 'Get All Conversations': [owned, foreign] }
check(JSON.stringify(run(node(sid, 'Prepare Owned Conversation IDs'), base).map(i => i.json.conversation_id)) === '["c_a"]', 'foreign conversation IDs never queried')
check(run(node(sid, 'Prepare Owned Conversation IDs'), { 'Validate Practice Scope': [{practice_id:'practice_a'}] })[0].json.conversation_id === '__no_owned_conversations__', 'empty practices never cause an unfiltered message read')
const request = { practice_id: 'practice_a', request_id: 'synthetic-request', payload: {patientId: 'patient_a', text: 'Hoe laat zijn jullie open?'} }
const sources = { 'Validate Request': [request], 'Call Real Milo': [{response:'Van negen tot vijf.'}] }
assert.throws(() => run(node(mid, 'Validate Inbox Patient'), sources, [{patient_id:'patient_a',practice_id:'practice_b'}])); checks++
const selected = { ...sources, 'Validate Request': [{...request,payload:{...request.payload,conversationId:'c_b'}}] }
assert.throws(() => run(node(mid, 'Validate Selected Conversation'), selected, [owned])); checks++
const convo = run(node(mid, 'Build Persistent Conversation'), sources, [foreign])[0].json
check(convo.practice_id === 'practice_a' && convo.channel === 'Web' && convo.conversation_id !== foreign.conversation_id, 'new test conversation stays in its practice and uses Web channel')
const messages = run(node(mid, 'Build Persistent Milo Messages'), {...sources,'Build Persistent Conversation':[convo]}).map(i=>i.json)
check(messages.length === 2 && messages[0].sender === 'patient' && messages[1].sender === 'agent', 'both sides saved with correct authors')
check(messages.every(m=>m.conversation_id===convo.conversation_id && m.simulated===true), 'saved tests never claim real delivery')
check(new Set(messages.map(m=>m.message_id)).size === 2 && messages[0].created_at < messages[1].created_at, 'stable distinct IDs and chronological order')
check(run(node(mid,'Build Persistent Conversation'),{...sources,'Call Real Milo':[{ok:false}]}).length === 0, 'paused agent saves no messages')
const snap = run(node(sid,'Build Snapshot 1'), {...base,'Get All Practices':[{practice_id:'practice_a',name:'Test',timezone:'Europe/Amsterdam'}], 'Get Owned Conversation Messages':[{...messages[1],conversation_id:'c_a'},{...messages[0],conversation_id:'c_a'},{message_id:'foreign',conversation_id:'c_b',text:'SECRET'}]})[0].json.store
check(snap.practices[0].conversations[0].messages[0].role === 'patient' && snap.practices[0].conversations[0].messages[1].role === 'agent', 'snapshot restores both authors in time order')
check(!JSON.stringify(snap).includes('SECRET'), 'foreign message excluded from snapshot')
assert.throws(()=>run(node(state,'Require Owned Conversation'),{'Validate Request':[{practice_id:'practice_a',payload:{id:'c_b'}}]},[foreign])); checks++
check(run(node(state,'Build Persistent Staff Message'),{'Validate Request':[{...request,payload:{id:'c_a',status:'Staff handling',text:'Saved note'}}]})[0].json.sender === 'staff', 'staff note attributed correctly')
check(run(node(state,'Build Persistent Staff Message'),{'Validate Request':[{...request,payload:{id:'c_a',status:'Resolved',text:'old text'}}]})[0].json.sender === 'system', 'resolution recorded as system event')
console.log(JSON.stringify({status:'passed',checks,liveExecutions:0}))
