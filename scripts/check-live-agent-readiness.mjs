// Opt-in local synthetic-practice check. Reports missing fixtures separately
// from successful actions. Never treats an empty recipient list as delivery.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
if(process.env.DENTALOS_RUN_LOCAL_TEST!=='yes'||!process.env.DENTALOS_TEST_ENV_FILE) throw new Error('Local-test authorization required.')
process.loadEnvFile(process.env.DENTALOS_TEST_ENV_FILE)
assert.ok(['127.0.0.1','localhost'].includes(new URL(process.env.DENTALOS_WEBHOOK_BASE_URL).hostname))
const {callN8n,ALLOWED_PRACTICES}=await import('../lib/n8n-server.ts')
const {getDentalStore,runDentalAction}=await import('../lib/dentalos-service.ts')
const fixture=JSON.parse(readFileSync('.codex-backup/live-booking-result.json'))
const practiceId=fixture.practiceId,access={status:'ready',practiceId,role:'owner'}
const get=async()=>{const r=await getDentalStore(access,ALLOWED_PRACTICES,callN8n);assert.equal(r.status,200,r.body.error);return r.body.store.practices[0]}
const run=(workflow,action,payload)=>runDentalAction({workflow,action,payload,practice_id:practiceId},access,ALLOWED_PRACTICES,callN8n)
const results=[]
const record=(name,status,extra={})=>{results.push({name,status,...extra});console.log(JSON.stringify(results.at(-1)))}
const other={}
for(const id of ALLOWED_PRACTICES.filter(id=>id!==practiceId))other[id]=JSON.stringify((await callN8n('ava','availability',{date:'2026-11-02'},id)).body.store)
for(const [agent,workflow] of [['reception','ava'],['support','milo']]){
  const initial=await get(),enabled=initial.agents.find(a=>a.id===agent).enabled
  try{
    assert.equal((await run('state','agent',{id:agent,enabled:false})).body.success,true)
    const response=workflow==='ava'
      ?await run('ava','book',{appointment:{patientId:fixture.patientId,date:'2026-11-09',time:'13:00',treatment:'Check-up'}})
      :await run('milo','faq',{patientId:fixture.patientId,text:'Synthetic paused-agent check: opening hours?'})
    assert.equal(response.body.success,false)
    const after=await get()
    assert.equal(JSON.stringify(after.appointments),JSON.stringify(initial.appointments))
    assert.equal(JSON.stringify(after.conversations),JSON.stringify(initial.conversations))
    record(workflow+' paused','passed: no appointment or conversation changes')
  }finally{assert.equal((await run('state','agent',{id:agent,enabled})).body.success,true)}
}
const leo=await run('leo','briefing',{})
assert.equal(leo.body.success,true)
assert.equal(typeof leo.body.message,'string')
assert.ok(!/Invalid DateTime|undefined/.test(leo.body.message))
record('Leo briefing','returned valid text',{mentionsMonday:/monday|maandag|2026-11-02|2 november/i.test(leo.body.message)})
for(const kind of ['reminder','recall']){
  const before=await get(),first=await run('luna','preview',{kind})
  assert.equal(first.status,200)
  const after=await get(),oldIds=new Set(before.approvals.map(a=>a.id)),added=after.approvals.filter(a=>!oldIds.has(a.id))
  assert.ok(added.every(a=>a.kind===kind && a.status==='Pending' && !/Invalid DateTime|\d{4}-\d{2}-\d{2}T/.test(a.description)))
  const second=await run('luna','preview',{kind});assert.equal(second.status,200)
  assert.deepEqual((await get()).approvals.map(a=>a.id).sort(),after.approvals.map(a=>a.id).sort())
  record('Luna '+kind,added.length?'prepared pending messages; repeat did not duplicate':'no new eligible messages; repeat did not duplicate',{prepared:added.length,deliveryTested:false})
}
const beforeFinn=await get(),oldIds=new Set(beforeFinn.approvals.map(a=>a.id))
const finn=await run('finn','invite',{appointmentId:fixture.appointmentIds.at(-1)})
assert.equal(finn.status,200)
const afterFinn=await get(),offers=afterFinn.approvals.filter(a=>!oldIds.has(a.id))
assert.ok(offers.every(a=>a.kind==='waitlist'&&a.status==='Pending'))
await run('finn','invite',{appointmentId:fixture.appointmentIds.at(-1)})
assert.deepEqual((await get()).approvals.map(a=>a.id).sort(),afterFinn.approvals.map(a=>a.id).sort())
record('Finn',offers.length?'prepared waitlist approval; repeat did not duplicate':'no new offer; positive matching path not exercised',{prepared:offers.length,deliveryTested:false})
// Reject only approvals created by this test; leave previous approvals intact.
for(const offer of offers){assert.equal((await run('approvals','decide',{id:offer.id,approve:false})).body.success,true);assert.equal((await get()).approvals.find(a=>a.id===offer.id).status,'Rejected')}
if(offers.length) record('Approval rejection','passed for test-created offer')
const iris=await run('iris','prepare',{})
assert.equal(iris.status,200)
record('Iris',iris.body.success?'workflow returned a result; external delivery not connected':'no eligible completed visit; positive follow-up path not exercised',{deliveryTested:false})
for(const [id,before]of Object.entries(other)){assert.equal(JSON.stringify((await callN8n('ava','availability',{date:'2026-11-02'},id)).body.store),before);record('isolation '+id,'unchanged')}
writeFileSync('.codex-backup/live-agent-readiness.json',JSON.stringify({at:new Date().toISOString(),results,deliveredMessages:0},null,2),{mode:0o600})
