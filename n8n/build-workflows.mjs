import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { randomUUID } from 'node:crypto'

const root = process.cwd()
const output = path.join(root, 'public/n8n')
fs.mkdirSync(output, { recursive: true })
const modules = {}
for (const name of ['demo/types', 'demo/seed', 'demo/operations', 'n8n/engine']) {
  let source = fs.readFileSync(path.join(root, 'lib', name + '.ts'), 'utf8')
  if (name === 'demo/types') {
    source = source.slice(source.indexOf('export const DEMO_DATE'))
    source = source.replace('crypto.randomUUID()', "'demo-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14)")
  }
  modules[name] = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
}
const bundle = `const sources = {${Object.entries(modules).map(([id, code]) => JSON.stringify(id) + ': function(exports, require) {' + code + '\n}').join(',')}};\nconst cache = {};\nfunction load(id) { if(cache[id]) return cache[id]; const exports = {}; cache[id] = exports; const resolve = (ref) => { const parts = id.split('/'); parts.pop(); for(const part of ref.split('/')) { if(part === '..') parts.pop(); else if(part !== '.') parts.push(part); } return load(parts.join('/')); }; sources[id](exports, resolve); return exports; }\n`
const files = ['ava','milo','luna','finn','iris','leo','approvals','guided-demo','setup','state']
const tableId = 'JrqZ_demo_table_select_in_n8n'
// Preserve the uploaded practice table binding where available, without carrying credentials or pinned payloads.
for (const file of files) {
  let original = null
  const originalPath = path.join(root, 'n8n/originals', file + '.json')
  if (fs.existsSync(originalPath)) original = JSON.parse(fs.readFileSync(originalPath, 'utf8'))
  const practicesNode = original?.nodes.find(n => n.type === 'n8n-nodes-base.dataTable' && /practices|practice settings/i.test(n.name))
  const allOriginals = fs.readdirSync(path.join(root, 'n8n/originals')).map(f => JSON.parse(fs.readFileSync(path.join(root, 'n8n/originals', f), 'utf8')))
  const fallback = allOriginals.flatMap(w => w.nodes).find(n => n.type === 'n8n-nodes-base.dataTable' && /practices|practice settings/i.test(n.name))
  const binding = practicesNode?.parameters.dataTableId ?? fallback?.parameters.dataTableId ?? { __rl: true, value: tableId, mode: 'id' }
  const nodes = []
  function node(name, type, parameters, x, y = 0, extra = {}) { const n = { id: randomUUID(), name, type: 'n8n-nodes-base.' + type, typeVersion: type === 'code' ? 2 : type === 'webhook' ? 2 : type === 'if' ? 2.2 : type === 'respondToWebhook' ? 1.4 : 1, position: [x, y], parameters, ...extra }; nodes.push(n); return n }
  node('Dashboard Webhook', 'webhook', { httpMethod: 'POST', path: 'dentalos-demo/' + file, authentication: 'headerAuth', responseMode: 'responseNode', options: {} }, 0, 0, { webhookId: randomUUID() })
  node('Validate Request', 'code', { jsCode: `const b = $input.first().json.body;\nif (!b || !/^[a-zA-Z0-9-]{16,80}$/.test(b.demo_session_id || '') || !/^[a-zA-Z0-9-]{8,100}$/.test(b.request_id || '') || !['oakwood','riverside','brighton'].includes(b.practice_id) || typeof b.action !== 'string' || !b.payload || typeof b.payload !== 'object' || Array.isArray(b.payload)) throw new Error('Invalid demo request');\nreturn [{json: { ...b, workflow: ${JSON.stringify(file)} }}];` }, 240)
  const filters = { conditions: [{ keyName: 'demo_session_id', condition: 'eq', keyValue: "={{ $('Validate Request').first().json.demo_session_id }}" }, { keyName: 'practice_id', condition: 'eq', keyValue: '__dentalos_session_v1__' }] }
  node('Load Demo Session', 'dataTable', { resource: 'row', operation: 'get', dataTableId: binding, matchType: 'allConditions', filters, returnAll: true }, 480, 0, { alwaysOutputData: true })
  node('Execute Agent Command', 'code', { jsCode: bundle + `\nconst rows = $input.all().map(i => i.json).filter(r => r.demo_session_id);\nif(rows.length > 1) throw new Error('Duplicate session rows. Repair this synthetic session before continuing.');\nconst snapshot = rows[0]?.dashboard_snapshot ? JSON.parse(rows[0].dashboard_snapshot) : null;\nconst req = $('Validate Request').first().json;\nconst outcome = load('n8n/engine').execute(snapshot, req);\nreturn [{json: { ...outcome, demo_session_id: req.demo_session_id, practice_id: '__dentalos_session_v1__', dashboard_snapshot: outcome.snapshot ? JSON.stringify(outcome.snapshot) : '' }}];` }, 720)
  node('Persist Changes?', 'if', { conditions: { options: { caseSensitive: true, typeValidation: 'strict', version: 2 }, conditions: [{ id: randomUUID(), leftValue: '={{ $json.write }}', rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }, 960)
  node('Save Demo Session', 'dataTable', { resource: 'row', operation: 'upsert', dataTableId: binding, matchType: 'allConditions', filters, columns: { mappingMode: 'defineBelow', value: { demo_session_id: "={{ $('Validate Request').first().json.demo_session_id }}", practice_id: '__dentalos_session_v1__', dashboard_snapshot: "={{ $('Execute Agent Command').first().json.dashboard_snapshot }}" }, matchingColumns: [], schema: ['demo_session_id','practice_id','dashboard_snapshot'].map(id => ({ id, displayName: id, required: false, defaultMatch: false, display: true, type: 'string', readOnly: false, removed: false })) }, options: {} }, 1200, -100)
  node('Respond After Persistence', 'respondToWebhook', { respondWith: 'json', responseBody: "={{ $('Execute Agent Command').first().json.envelope }}", options: { responseCode: 200 } }, 1480)
  const connections = {}; const link = (from, to, branch = 0) => { connections[from] ??= { main: [] }; connections[from].main[branch] ??= []; connections[from].main[branch].push({ node: to, type: 'main', index: 0 }) }
  link('Dashboard Webhook','Validate Request'); link('Validate Request','Load Demo Session'); link('Load Demo Session','Execute Agent Command'); link('Execute Agent Command','Persist Changes?'); link('Persist Changes?','Save Demo Session'); link('Save Demo Session','Respond After Persistence'); link('Persist Changes?','Respond After Persistence',1)
  const workflow = { name: (original?.name ?? (file === 'setup' ? 'DentalOS — Demo Setup' : 'DentalOS — State & Controls')) + ' [Dashboard v1]', nodes, connections, settings: { executionOrder: 'v1', saveDataSuccessExecution: 'none', saveDataErrorExecution: 'none', executionTimeout: 45 }, active: false, pinData: {}, tags: [] }
  fs.writeFileSync(path.join(output, file + '.json'), JSON.stringify(workflow, null, 2))
}
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify({ version: 1, files: files.map(id => ({ id, url: `/n8n/${id}.json`, webhook: `dentalos-demo/${id}` })), columns: { demo_session_id: 'string', practice_id: 'string', dashboard_snapshot: 'string' }, storage: 'One JSON snapshot per isolated presenter session in the existing Practices table. Existing flattened rows are not migrated or modified. Single-presenter sequential demo only.', date: '2026-09-07' }, null, 2))
console.log(`Generated ${files.length} authenticated workflow exports.`)
