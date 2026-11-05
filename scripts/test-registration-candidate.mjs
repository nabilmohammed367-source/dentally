import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const [workflow] = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const code = workflow.nodes.find(n => n.name === 'Build New Patient').parameters.jsCode
const scenario = {practice_id:'practice_a',new_patient_name:'Synthetic Person',new_patient_phone:'TEST-NO-CONTACT'}
const run = (input, patients=[]) => vm.runInNewContext(`(function(){${code}\n})()`, { Date, $:name=>({first:()=>({json:input}),all:()=>patients.map(json=>({json}))}) }, {timeout:1000})[0].json
const patient = run(scenario)
assert.equal(patient.error,false)
assert.equal(patient.consent_appointment,false)
assert.equal(patient.consent_marketing,false)
assert.equal(run({...scenario,new_patient_phone:''}).error,true)
assert.equal(run({...scenario,new_patient_name:''}).error,true)
assert.equal(run(scenario,[{practice_id:'practice_a',name:'Synthetic Person',phone:'TEST-NO-CONTACT'}]).error,true)
assert.equal(run(scenario,[{practice_id:'practice_b',name:'Synthetic Person',phone:'TEST-NO-CONTACT'}]).error,false)
assert.equal(workflow.nodes.find(n=>n.name==='Get Registration Candidates').executeOnce,true)
for(const n of workflow.nodes) if(n.type.endsWith('.code')) new vm.Script(`(async function(){${n.parameters.jsCode}\n})`)
console.log(JSON.stringify({status:'passed',checks:8,liveExecutions:0}))
