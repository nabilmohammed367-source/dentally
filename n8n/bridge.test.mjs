import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { createRequire } from 'node:module'
import { createHmac } from 'node:crypto'
const require = createRequire(import.meta.url)
const paths = ['ava','milo','luna','finn','iris','leo','approvals','guided-demo','setup','state']
function load() {
  const jar = new Map(); let calls = 0
  class Reply extends Response { cookies = { set(name, value, options) { jar.set(name, { value, ...options }) } }; static json(data, options) { return new Reply(JSON.stringify(data), options) } }
  const compiled = ts.transpileModule(fs.readFileSync('app/api/demo/route.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}; const imports = id => id === 'next/server' ? { NextResponse: Reply } : id === 'next/headers' ? { cookies: async () => ({ get: name => jar.get(name) }) } : id === '@/lib/n8n/engine' ? { routes: paths } : id === '@/lib/demo/types' ? { storeSchema: require('zod').z.object({ version: require('zod').z.literal(1) }) } : require(id)
  new Function('exports','require',compiled)(exports,imports)
  return { ...exports, jar, get calls() { return calls }, increment() { calls++ } }
}
function request(body, origin='https://dental.example.test') { return new Request('https://dental.example.test/api/demo',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{origin}:{})},body:JSON.stringify(body)}) }
test('bridge blocks CSRF, unconfigured access, invalid credentials, bad cookies and malformed commands',async()=>{
  delete process.env.N8N_WEBHOOK_BASE_URL;delete process.env.N8N_WEBHOOK_SECRET;delete process.env.N8N_DEMO_ACCESS_KEY
  const api=load()
  assert.equal((await api.POST(request({operation:'state'},'https://attacker.example'))).status,403)
  assert.equal((await api.POST(request({operation:'state'},''))).status,403)
  assert.equal((await api.POST(request({operation:'state'}))).status,503)
  process.env.N8N_WEBHOOK_BASE_URL='https://n8n.example.test/webhook';process.env.N8N_WEBHOOK_SECRET='synthetic-header-secret-123456789';process.env.N8N_DEMO_ACCESS_KEY='synthetic-presenter-key-123'
  assert.equal((await api.POST(request({operation:'state'}))).status,401)
  assert.equal((await api.POST(request({operation:'unlock',key:'wrong'}))).status,401)
  assert.equal((await api.POST(request({operation:'unlock',key:process.env.N8N_DEMO_ACCESS_KEY}))).status,200)
  const cookie=api.jar.get('dentalos-presenter');assert.equal(cookie.httpOnly,true);assert.equal(cookie.secure,true);assert.equal(cookie.sameSite,'none');assert.equal(cookie.partitioned,true)
  assert.equal((await api.POST(request({operation:'action',workflow:'ava',action:'preview',demo_session_id:'forged'}))).status,400)
  api.jar.set('dentalos-presenter',{value:cookie.value+'x'});assert.equal((await api.POST(request({operation:'state'}))).status,401)
})
test('bridge uses fixed HTTPS webhook paths, server identity and rejects fake completion',async()=>{
  const api=load();await api.POST(request({operation:'unlock',key:process.env.N8N_DEMO_ACCESS_KEY}))
  const original=globalThis.fetch;let sent
  try {
    globalThis.fetch=async(url,options)=>{sent={url:String(url),...options,body:JSON.parse(options.body)};return Response.json({message:'Workflow was started'})}
    const r=await api.POST(request({operation:'action',workflow:'leo',action:'briefing',payload:{}}));assert.equal(r.status,502);assert.equal((await r.json()).code,'INVALID_RESPONSE');assert.equal(sent.url,'https://n8n.example.test/webhook/dentalos-demo/leo');assert.equal(sent.headers['X-DentalOS-Key'],process.env.N8N_WEBHOOK_SECRET);assert.equal(sent.body.demo_session_id,api.jar.get('dentalos-presenter').value.split('.')[0]);assert.equal(sent.redirect,'error')
    globalThis.fetch=async()=>new Response('Unauthorized',{status:401});assert.match((await (await api.POST(request({operation:'state'}))).json()).message,/credential/)
    process.env.N8N_WEBHOOK_BASE_URL='http://n8n.example.test/webhook';assert.equal((await api.POST(request({operation:'state'}))).status,503)
    process.env.N8N_WEBHOOK_BASE_URL='https://n8n.example.test/webhook'
    globalThis.fetch=async()=>{throw new Error('timeout')};assert.equal((await (await api.POST(request({operation:'state'}))).json()).code,'OUTCOME_UNKNOWN')
  } finally {globalThis.fetch=original}
})
