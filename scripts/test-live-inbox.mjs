// Local synthetic records only; requires the patient created by test-live-booking.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
if (process.env.DENTALOS_RUN_LOCAL_TEST !== 'yes' || !process.env.DENTALOS_TEST_ENV_FILE) throw new Error('Explicit local-test opt-in and env-file path required.')
process.loadEnvFile(process.env.DENTALOS_TEST_ENV_FILE)
assert.ok(['localhost','127.0.0.1'].includes(new URL(process.env.DENTALOS_WEBHOOK_BASE_URL).hostname))
const { callN8n, ALLOWED_PRACTICES } = await import('../lib/n8n-server.ts')
const { runDentalAction, getDentalStore } = await import('../lib/dentalos-service.ts')
const booking = JSON.parse(readFileSync('.codex-backup/live-booking-result.json'))
assert.equal(booking.status, 'passed')
const practiceId = booking.practiceId, patientId = booking.patientId
const access = { status:'ready', practiceId, role:'owner' }
const snapshot = async () => {
  const r = await getDentalStore(access, ALLOWED_PRACTICES, callN8n)
  assert.equal(r.status, 200, r.body.error)
  return r.body.store.practices[0]
}
assert.ok((await snapshot()).patients.find(p=>p.id===patientId)?.name.startsWith('DentalOS QA Synthetic '))
const run = (workflow, action, payload) => runDentalAction({workflow,action,payload,practice_id:practiceId},access,ALLOWED_PRACTICES,callN8n)
const checks=[]
function check(ok,label){assert.ok(ok,label);checks.push(label);console.log('PASS '+label)}
const baseline={}
for(const id of ALLOWED_PRACTICES.filter(id=>id!==practiceId)) baseline[id]=JSON.stringify((await callN8n('ava','availability',{date:'2026-11-02'},id)).body.store)
const text='Hoe laat zijn jullie open? Synthetic QA '+Date.now()
const reply=await run('milo','faq',{patientId,text})
check(reply.status===200 && reply.body.success===true,'Milo answers the synthetic message')
let c=(await snapshot()).conversations.find(c=>c.patientId===patientId && c.messages.some(m=>m.text===text))
assert.ok(c,'conversation persisted')
check(c.messages.some(m=>m.role==='patient'&&m.text===text),'patient message persists after a fresh snapshot')
check(c.messages.some(m=>m.role==='agent'&&m.text===reply.body.message),'Milo reply persists after a fresh snapshot')
const id=c.id
const second=await run('milo','human',{patientId,conversationId:id,text:'Ik wil graag een medewerker spreken. Synthetic QA.'})
check(second.body.success===true,'selected conversation accepts a follow-up')
c=(await snapshot()).conversations.find(c=>c.id===id)
check(c.status==='Needs attention'&&c.messages.length>=4,'human request flags the conversation and preserves earlier messages')
const takeover=await run('state','conversation',{id,status:'Staff handling',text:'A staff member has taken over this conversation.'})
check(takeover.body.success===true,'staff takeover succeeds')
const note='Synthetic QA staff note. Not sent to a patient.'
check((await run('state','conversation',{id,status:'Staff handling',text:note})).body.success===true,'staff note saved')
c=(await snapshot()).conversations.find(c=>c.id===id)
check(c.messages.some(m=>m.role==='staff'&&m.text===note),'staff note persists with correct author')
check(c.messages.some(m=>m.role==='system'&&m.text==='A staff member has taken over this conversation.'),'takeover is a system event')
check((await run('state','conversation',{id,status:'Resolved',text:'Resolved by staff.'})).body.success===true,'test conversation resolved')
c=(await snapshot()).conversations.find(c=>c.id===id)
check(c.status==='Resolved'&&c.messages.some(m=>m.role==='system'&&m.text==='Conversation resolved by staff.'),'resolution and message history persist')
check((await run('milo','faq',{patientId,conversationId:'foreign-conversation',text:'Hello'})).status===409,'foreign conversation rejected before workflow write')
for(const [id,before] of Object.entries(baseline)) check(JSON.stringify((await callN8n('ava','availability',{date:'2026-11-02'},id)).body.store)===before,'other practice unchanged: '+id)
writeFileSync('.codex-backup/live-inbox-result.json',JSON.stringify({status:'passed',practiceId,patientId,conversationId:id,checks},null,2),{mode:0o600})
console.log(JSON.stringify({status:'passed',checks:checks.length,deliveredMessages:0}))
