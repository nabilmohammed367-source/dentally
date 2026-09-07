import { createStore } from '../demo/seed'
import { DEMO_DATE, providers, treatments, uid, type Store, type Practice, type Appointment } from '../demo/types'
import { log, minutes, validateAppointment, saveAppointment, changeStatus, recipients, proposeRecipe, decideApproval, recipes } from '../demo/operations'

export const routes = ['ava', 'milo', 'luna', 'finn', 'iris', 'leo', 'approvals', 'guided-demo', 'setup', 'state'] as const
export type Workflow = typeof routes[number]
export type Command = { workflow: Workflow; action: string; practice_id: string; request_id: string; demo_session_id: string; payload: Record<string, unknown> }
type Proposal = { practice: string; appointment?: Appointment; cancelId?: string; before: string; expires: number }
type Offer = { id: string; practice: string; appointment: Appointment; patient: string; approval: string; status: 'Pending' | 'Accepted' | 'Declined'; expires: number }
export type Snapshot = { store: Store; receipts: Record<string, { fingerprint: string; result: Record<string, unknown> }>; proposals: Record<string, Proposal>; offers: Offer[]; deliveries: string[]; steps: Record<string, number> }
export type Envelope = { version: 1; demo: true; success: boolean; request_id: string; message: string; result: Record<string, unknown>; store: Store | null; error?: string }
export function freshSnapshot(): Snapshot { const store = createStore(); store.practices.forEach(p => p.agents.forEach(a => a.handled = 0)); return { store, receipts: {}, proposals: {}, offers: [], deliveries: [], steps: {} } }
function required(value: unknown, label: string) { if (typeof value !== 'string' || !value.trim() || value.length > 1500) throw new Error(`Invalid ${label}.`); return value.trim() }
function bool(value: unknown) { if (typeof value !== 'boolean') throw new Error('Expected true or false.'); return value }
function agent(p: Practice, id: string) { const a = p.agents.find(a => a.id === id); if (!a?.enabled) throw new Error('The assigned agent is paused.'); return a }
function patient(p: Practice, id: unknown) { const v = p.patients.find(v => v.id === id); if (!v) throw new Error('Patient not found in this practice.'); return v }
function appointment(p: Practice, id: unknown) { const a = p.appointments.find(v => v.id === id); if (!a) throw new Error('Appointment not found in this practice.'); return a }
function strictSlot(p: Practice, a: Appointment) { validateAppointment(p, a); if (p.appointments.some(v => v.id !== a.id && v.patientId === a.patientId && v.date === a.date && v.status !== 'Cancelled' && minutes(a.time) < minutes(v.time) + v.duration && minutes(a.time) + a.duration > minutes(v.time))) throw new Error('This patient already has an overlapping appointment.'); }
function conversation(p: Practice, id: unknown) { const c = p.conversations.find(c => c.id === id); if (!c) throw new Error('Conversation not found in this practice.'); return c }
function addConversation(p: Practice, patientId: string, text: string, name: string, status: 'Agent handling' | 'Needs attention' = 'Agent handling') { const c = { id: uid(), patientId, channel: 'WhatsApp' as const, status, assigned: status === 'Needs attention' ? 'Unassigned' : name, messages: [{ id: uid(), role: 'agent' as const, text }, { id: uid(), role: 'system' as const, text: 'Simulated message saved in n8n. Nothing delivered externally.' }] }; p.conversations.unshift(c); return c }
function briefing(p: Practice) { const metrics = { confirmed: p.appointments.filter(a => a.status === 'Confirmed').length, completed: p.appointments.filter(a => a.status === 'Completed').length, cancelled: p.appointments.filter(a => a.status === 'Cancelled').length, waitlistFilled: p.appointments.filter(a => a.source === 'Finn' && a.status !== 'Cancelled').length, attention: p.conversations.filter(c => c.status === 'Needs attention').length, pending: p.approvals.filter(a => a.status === 'Pending').length, enabled: p.agents.filter(a => a.enabled).length }; const message = `${metrics.confirmed} confirmed appointments, ${metrics.attention} conversations needing attention, and ${metrics.pending} pending approvals. Finn filled ${metrics.waitlistFilled} slots. Sample day: ${DEMO_DATE}.`; log(p, 'Operations briefing', message, 'Leo'); return { message, metrics } }
function prepare(s: Snapshot, p: Practice, kind: string) {
  const recipe = recipes.find(r => r.id === kind); if (!recipe) throw new Error('Unknown automation.'); agent(p, recipe.agentId)
  const pending = p.approvals.find(a => a.kind === kind && a.status === 'Pending'); if (pending) return { message: 'A proposal is already awaiting review.', approval_id: pending.id }
  proposeRecipe(p, recipe.id)
  const approval = p.approvals[0]
  approval.patientIds = approval.patientIds.filter(id => !s.deliveries.includes(`${p.id}:${kind}:${id}:${eligibilityVersion(p, kind, id)}`))
  if (kind !== 'summary' && !approval.patientIds.length) throw new Error('No new eligible recipients. This stage was already simulated.')
  return { message: 'Prepared for staff approval. No message sent.', approval_id: approval.id, recipients: approval.patientIds }
}
function eligibilityVersion(p: Practice, kind: string, id: string) { return kind === 'recall' ? DEMO_DATE : JSON.stringify(p.appointments.filter(a => a.patientId === id).map(a => [a.id, a.date, a.time, a.status])) }

function ava(s: Snapshot, p: Practice, action: string, x: Record<string, unknown>): Record<string, unknown> {
  agent(p, 'reception')
  if (action === 'availability') {
    const pat = patient(p, x.patientId); const free: string[] = []
    for (let t = minutes(p.opens); t + 30 <= minutes(p.closes); t += 30) { const time = `${Math.floor(t / 60)}`.padStart(2, '0') + ':' + `${t % 60}`.padStart(2, '0'); try { strictSlot(p, { id: 'availability', patientId: pat.id, date: required(x.date, 'date'), time, duration: 30, provider: providers[0], chair: 'Chair 1', treatment: treatments[0], status: 'Confirmed', source: 'Ava' }); free.push(time) } catch {} if (free.length === 3) break }
    return { message: free.length ? `Available: ${free.join(', ')}` : 'No matching slots available.', slots: free }
  }
  if (action === 'preview' || action === 'cancel-preview') {
    let a: Appointment | undefined; let cancelId: string | undefined; let before = ''
    if (action === 'cancel-preview') { const old = appointment(p, x.appointmentId); if (['Completed', 'Cancelled'].includes(old.status)) throw new Error('Appointment is closed.'); cancelId = old.id; before = JSON.stringify(old) }
    else { const input = x.appointment as Appointment; if (!input || typeof input !== 'object') throw new Error('Appointment required.'); const old = p.appointments.find(a => a.id === input.id); if (old && ['Completed', 'Cancelled'].includes(old.status)) throw new Error('Appointment is closed.'); a = { id: old?.id ?? uid(), patientId: required(input.patientId, 'patient'), date: required(input.date, 'date'), time: required(input.time, 'time'), duration: input.duration, provider: required(input.provider, 'provider'), chair: required(input.chair, 'chair'), treatment: required(input.treatment, 'treatment'), status: old?.status ?? 'Confirmed', source: 'Ava' }; strictSlot(p, a); before = old ? JSON.stringify(old) : '' }
    const token = uid(); s.proposals[token] = { practice: p.id, appointment: a, cancelId, before, expires: Date.now() + 300000 }
    return { message: 'Review the exact proposal, then confirm. Demo identity selected, not authenticated.', token, appointment: a ?? appointment(p, cancelId), cancel: !!cancelId }
  }
  if (action === 'confirm') {
    const token = required(x.token, 'confirmation'); const proposal = s.proposals[token]
    if (!proposal || proposal.practice !== p.id || proposal.expires < Date.now()) throw new Error('Confirmation expired. Preview again.')
    const old = p.appointments.find(a => a.id === (proposal.cancelId ?? proposal.appointment?.id)); if ((old ? JSON.stringify(old) : '') !== proposal.before) throw new Error('Appointment changed. Preview again.')
    if (proposal.cancelId) changeStatus(p, proposal.cancelId, 'Cancelled')
    else { strictSlot(p, proposal.appointment!); saveAppointment(p, proposal.appointment!) }
    const a = proposal.appointment ?? old!; delete s.proposals[token]; agent(p, 'reception').handled++
    addConversation(p, a.patientId, `Demo appointment ${proposal.cancelId ? 'cancelled' : 'confirmed'}: ${a.date} at ${a.time}.`, 'Ava')
    return { message: proposal.cancelId ? 'Appointment cancelled in n8n.' : 'Appointment saved in n8n.', appointment_id: a.id }
  }
  throw new Error('Unsupported Ava action.')
}
function support(s: Snapshot, p: Practice, action: string, x: Record<string, unknown>): Record<string, unknown> {
  const pat = patient(p, x.patientId)
  const c = x.conversationId ? conversation(p, x.conversationId) : addConversation(p, pat.id, 'Demo conversation started.', 'Milo')
  if (c.patientId !== pat.id) throw new Error('Conversation patient mismatch.')
  const text = typeof x.text === 'string' ? x.text.slice(0, 1500) : action
  c.messages.push({ id: uid(), role: 'patient', text })
  if (action === 'optout' || /\b(stop|unsubscribe|opt.?out)\b/i.test(text)) { pat.consent = false; c.messages.push({ id: uid(), role: 'system', text: 'Outreach permission withdrawn.' }); return { message: 'Communication preference saved.', conversation_id: c.id } }
  if (c.status === 'Resolved') throw new Error('Conversation is resolved.')
  if (c.status === 'Staff handling') return { message: 'Patient message saved for staff. No automated reply.', conversation_id: c.id }
  agent(p, 'support')
  if (action === 'booking') { const result = ava(s, p, 'preview', x); c.messages.push({ id: uid(), role: 'agent', text: 'Ava has prepared a booking proposal. Review and confirm to save it.' }); return { ...result, conversation_id: c.id } }
  const urgent = action === 'urgent' || /breath|swelling|bleeding|emergency|severe/i.test(text)
  const clinical = urgent || action === 'human' || /pain|treatment|diagnos|medicin|prescri|human/i.test(text)
  const reply = clinical ? (urgent ? 'Breathing difficulty may be an emergency. Seek local emergency help now; do not wait for this demo. ' : '') + 'Your concern is flagged for staff. No clinician has reviewed it yet; this is not a diagnosis.' : action === 'faq' ? agent(p, 'support').faq : 'This is scripted support. Choose a scenario or ask staff for help.'
  c.messages.push({ id: uid(), role: 'agent', text: reply })
  if (clinical) { c.status = 'Needs attention'; c.assigned = 'Unassigned'; if (!p.approvals.some(a => a.conversationId === c.id && a.status === 'Pending')) p.approvals.unshift({ id: uid(), kind: 'urgent', title: 'Patient concern — staff review', description: reply, patientIds: [pat.id], agentId: 'support', conversationId: c.id, status: 'Pending' }) }
  agent(p, 'support').handled++; log(p, 'Patient support simulated', pat.name, 'Milo'); return { message: reply, conversation_id: c.id }
}
function finn(s: Snapshot, p: Practice, action: string, x: Record<string, unknown>): Record<string, unknown> {
  agent(p, 'waitlist'); if (!p.recipes.waitlist) throw new Error('Waitlist recipe is paused.')
  if (action === 'invite') {
    const a = appointment(p, x.appointmentId); if (a.status !== 'Cancelled') throw new Error('Choose a cancelled appointment.')
    const existing = s.offers.find(o => o.practice === p.id && o.appointment.id === a.id && o.status === 'Pending' && o.expires > Date.now()); if (existing) return { message: 'An invitation already exists.', offer_id: existing.id, approval_id: existing.approval }
    const pat = p.patients.find(v => v.waitlist && v.consent && !s.offers.some(o => o.practice === p.id && o.appointment.id === a.id && o.patient === v.id && o.status === 'Declined') && (() => { try { strictSlot(p, { ...a, id: 'check', patientId: v.id, status: 'Confirmed' }); return true } catch { return false } })())
    if (!pat) throw new Error('No eligible waitlist candidate fits this slot.')
    const id = uid(); const approval = uid(); s.offers.push({ id, practice: p.id, appointment: { ...a }, patient: pat.id, approval, status: 'Pending', expires: Date.now() + 30 * 60000 })
    p.approvals.unshift({ id: approval, kind: 'waitlist', title: 'Waitlist invitation', description: `Preview: A slot on ${a.date} at ${a.time} may be available. Reply to request it; no automatic booking.`, patientIds: [pat.id], agentId: 'waitlist', status: 'Pending' }); log(p, 'Waitlist invitation prepared', pat.name, 'Finn'); return { message: 'Approve the invitation before simulating acceptance.', offer_id: id, approval_id: approval, patient: pat.name }
  }
  const offer = s.offers.find(o => o.id === x.offerId && o.practice === p.id); if (!offer || offer.status !== 'Pending' || offer.expires < Date.now()) throw new Error('Offer unavailable or expired.')
  if (action === 'decline') { offer.status = 'Declined'; return { message: 'Offer declined. Invite the next candidate.', appointment_id: offer.appointment.id } }
  if (action === 'accept') { if (p.approvals.find(a => a.id === offer.approval)?.status !== 'Approved') throw new Error('Staff approval is required first.'); const pat = patient(p, offer.patient); if (!pat.consent || !pat.waitlist) throw new Error('Patient is no longer eligible.'); agent(p, 'reception'); const a = { ...offer.appointment, id: uid(), patientId: pat.id, status: 'Confirmed' as const, source: 'Finn' }; strictSlot(p, a); saveAppointment(p, a); offer.status = 'Accepted'; pat.waitlist = false; agent(p, 'waitlist').handled++; addConversation(p, pat.id, `Simulated acceptance recorded. Appointment confirmed at ${a.time}.`, 'Finn'); return { message: 'Cancelled slot filled after simulated patient acceptance.', appointment_id: a.id } }
  throw new Error('Unsupported Finn action.')
}
function controls(p: Practice, action: string, x: Record<string, unknown>) {
  if (action === 'agent') { const a = p.agents.find(a => a.id === x.id); if (!a) throw new Error('Agent not found.'); if (x.enabled !== undefined) a.enabled = bool(x.enabled); if (x.faq !== undefined) a.faq = required(x.faq, 'FAQ') }
  else if (action === 'patient') { const pat = patient(p, x.id); for (const key of ['consent', 'waitlist', 'recall'] as const) if (x[key] !== undefined) pat[key] = bool(x[key]); if (x.notes !== undefined) { if (typeof x.notes !== 'string' || x.notes.length > 1000) throw new Error('Invalid notes.'); pat.notes = x.notes } }
  else if (action === 'recipe') { const key = required(x.id, 'recipe'); if (!recipes.some(r => r.id === key)) throw new Error('Unknown recipe.'); p.recipes[key] = bool(x.enabled) }
  else if (action === 'status') { if (x.status !== 'Arrived' && x.status !== 'Completed') throw new Error('Use Ava for cancellation.'); changeStatus(p, required(x.id, 'appointment'), x.status) }
  else if (action === 'conversation') { const c = conversation(p, x.id); if (x.status !== undefined) { if (!['Staff handling', 'Agent handling', 'Resolved'].includes(String(x.status))) throw new Error('Invalid conversation status.'); c.status = x.status as typeof c.status; c.assigned = c.status === 'Staff handling' ? 'Emma Wilson' : 'Milo' } if (x.text !== undefined) { if (c.status !== 'Staff handling') throw new Error('Take over before replying as staff.'); c.messages.push({ id: uid(), role: 'staff', text: required(x.text, 'reply') }) } }
  else if (action === 'settings') { if (x.approvalRequired !== undefined) p.approvalRequired = bool(x.approvalRequired); if (x.name !== undefined) p.name = required(x.name, 'name').slice(0, 60); if (x.timezone !== undefined) { const tz = required(x.timezone, 'timezone'); new Intl.DateTimeFormat('en', { timeZone: tz }); p.timezone = tz } if (x.staffRole !== undefined) p.staffRole = required(x.staffRole, 'role'); const opens = x.opens === undefined ? p.opens : required(x.opens, 'opens'); const closes = x.closes === undefined ? p.closes : required(x.closes, 'closes'); if (![opens, closes].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || minutes(opens) >= minutes(closes)) throw new Error('Invalid opening hours.'); if (p.appointments.some(a => a.status === 'Confirmed' && (minutes(a.time) < minutes(opens) || minutes(a.time) + a.duration > minutes(closes)))) throw new Error('Hours exclude existing bookings.'); p.opens = opens; p.closes = closes }
  else throw new Error('Unsupported staff action.')
  log(p, 'Staff setting updated', action); return { message: 'Saved in n8n.' }
}
function dispatch(s: Snapshot, p: Practice, workflow: Workflow, action: string, x: Record<string, unknown>): Record<string, unknown> {
  if (workflow === 'ava') return ava(s, p, action, x)
  if (workflow === 'milo') return support(s, p, action, x)
  if (workflow === 'luna') { agent(p, 'reminders'); if (!['reminder', 'recall'].includes(String(x.kind))) throw new Error('Choose reminder or recall.'); if (action === 'preview') return { message: 'Eligible recipients — no messages sent.', recipients: recipients(p, x.kind as 'recall') }; if (action === 'prepare') return prepare(s, p, String(x.kind)) }
  if (workflow === 'finn') return finn(s, p, action, x)
  if (workflow === 'iris') { agent(p, 'followup'); if (action === 'prepare') return prepare(s, p, 'followup'); if (action === 'reply') { const pat = patient(p, x.patientId); if (!p.appointments.some(a => a.patientId === pat.id && a.status === 'Completed')) throw new Error('No completed visit for this patient.'); if (x.reply === 'fine') { addConversation(p, pat.id, 'Thank you. Your simulated follow-up is complete.', 'Iris'); return { message: 'Follow-up recorded.' } } return support(s, p, x.reply === 'booking' ? 'booking' : 'human', { ...x, text: 'Please ask the team to contact me.' }) } }
  if (workflow === 'leo' && action === 'briefing') { agent(p, 'operations').handled++; return briefing(p) }
  if (workflow === 'approvals' && action === 'decide') { const a = p.approvals.find(a => a.id === x.id); if (!a) throw new Error('Approval not found.'); if (x.approve === true && a.kind === 'waitlist') { const o = s.offers.find(o => o.approval === a.id && o.practice === p.id); if (!o || o.expires < Date.now() || o.status !== 'Pending') throw new Error('Waitlist offer unavailable.'); strictSlot(p, { ...o.appointment, id: 'check', patientId: o.patient, status: 'Confirmed' }) } decideApproval(p, a.id, bool(x.approve)); if (x.approve === true && !['summary', 'urgent'].includes(a.kind)) a.patientIds.filter(id => recipients(p, a.kind).includes(id)).forEach(id => s.deliveries.push(`${p.id}:${a.kind}:${id}:${eligibilityVersion(p, a.kind, id)}`)); return { message: x.approve ? 'Approval applied to simulated records.' : 'Proposal rejected.' } }
  if (workflow === 'state') return controls(p, action, x)
  if (workflow === 'guided-demo' && action === 'step') {
    const step = Number(x.step); const last = s.steps[p.id] ?? 0; if (!Number.isInteger(step) || step !== last + 1 || step > 8) throw new Error(`Next step is ${last + 1}.`)
    let result: Record<string, unknown>
    if (step === 1) result = { message: 'Practice ready. Continue to prepare a booking.' }
    else if (step === 2) result = support(s, p, 'booking', { patientId: p.patients[3].id, appointment: { id: 'guided-new', patientId: p.patients[3].id, date: DEMO_DATE, time: '16:00', duration: 30, provider: providers[0], chair: 'Chair 1', treatment: treatments[0] } })
    else if (step === 3) result = prepare(s, p, 'reminder')
    else if (step === 4) { const a = p.appointments.find(a => a.status === 'Confirmed'); if (!a) throw new Error('No appointment to cancel.'); result = ava(s, p, 'cancel-preview', { appointmentId: a.id }) }
    else if (step === 5) { const a = p.appointments.find(a => a.status === 'Cancelled'); if (!a) throw new Error('Confirm cancellation from step 4 first.'); result = finn(s, p, 'invite', { appointmentId: a.id }) }
    else if (step === 6) result = prepare(s, p, 'followup')
    else if (step === 7) result = support(s, p, 'human', { patientId: p.patients[0].id, text: 'I need to speak to the team about a concern.' })
    else result = dispatch(s, p, 'leo', 'briefing', {})
    s.steps[p.id] = step; return { ...result, step, next: step < 8 ? step + 1 : null }
  }
  throw new Error('Unsupported workflow action.')
}
export function execute(snapshot: Snapshot | null, req: Command): { snapshot: Snapshot | null; envelope: Envelope; write: boolean } {
  const base = { version: 1 as const, demo: true as const, request_id: req.request_id }
  try {
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(req.demo_session_id) || !/^[a-zA-Z0-9-]{8,100}$/.test(req.request_id)) throw new Error('Invalid request identity.')
    if (!routes.includes(req.workflow)) throw new Error('Unknown workflow.')
    const fingerprint = JSON.stringify([req.workflow, req.action, req.practice_id, req.payload]); const receipt = snapshot?.receipts[req.request_id]
    if (receipt) { if (receipt.fingerprint !== fingerprint) throw new Error('Request ID reused with different data.'); return { snapshot, write: false, envelope: { ...base, success: true, message: String(receipt.result.message), result: { ...receipt.result, replayed: true }, store: snapshot!.store } } }
    let s: Snapshot | null = snapshot ? JSON.parse(JSON.stringify(snapshot)) : null
    if (req.workflow === 'setup') { if (req.action === 'reset') { if (req.payload.confirm !== 'RESET THIS SESSION') throw new Error('Reset confirmation required.'); s = freshSnapshot() } else if (req.action === 'seed') s ??= freshSnapshot(); else throw new Error('Unknown setup action.') }
    if (!s) return { snapshot, write: false, envelope: { ...base, success: false, error: 'UNSEEDED', message: 'Initialize fictional data for this presenter session.', result: {}, store: null } }
    const p = s.store.practices.find(p => p.id === req.practice_id); if (!p) throw new Error('Practice is not part of this demo session.')
    let result: Record<string, unknown>
    if (req.workflow === 'setup') result = { message: req.action === 'reset' ? 'Only this presenter session was reset.' : 'Fictional session initialized.' }
    else if (req.workflow === 'state' && req.action === 'read') return { snapshot, write: false, envelope: { ...base, success: true, message: 'Demo state loaded.', result: { offers: s.offers.filter(o => o.practice === p.id), step: s.steps[p.id] ?? 0 }, store: s.store } }
    else result = dispatch(s, p, req.workflow, req.action, req.payload)
    s.receipts[req.request_id] = { fingerprint, result }
    if (Object.keys(s.receipts).length > 500) throw new Error('Session action limit reached. Reset the demo session.')
    s.proposals = Object.fromEntries(Object.entries(s.proposals).filter(([, v]) => v.expires > Date.now()))
    return { snapshot: s, write: true, envelope: { ...base, success: true, message: String(result.message ?? 'Workflow completed.'), result, store: s.store } }
  } catch (error) { return { snapshot, write: false, envelope: { ...base, success: false, error: 'WORKFLOW_REJECTED', message: error instanceof Error ? error.message : 'Workflow failed.', result: {}, store: null } } }
}
