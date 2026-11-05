# DentalOS local demo — 1 November 2026

Status: usable for supervised demonstrations with synthetic records. **Not approved for real-patient operation or unattended practice use.** No paid hosting was purchased; the owner chose to keep demonstrations local.

## Update — 5 November 2026, before the client meeting

- The local dashboard and n8n both responded. The dashboard loaded the Utrecht practice after a fresh browser reload. All 18 dashboard policy tests passed again.
- A private online SQLite backup of the local n8n database and its matching encryption config was saved at `.codex-backup/local-demo-2026-11-05-post-status/` after the workflow fixes and demo appointment. File permissions are restricted to the Mac owner. A separate temporary restore passed SQLite integrity and row-count checks. This is a local recovery copy, not an offsite backup or a production backup program.
- `start-local-demo.command` was added to the running app folder and tested against the already-running services. It checks both local services and can start them after a reboot. Its cold-start branch has not been exercised end to end. Double-click it before the meeting, then sign in at `http://127.0.0.1:3001/`.
- A synthetic patient in the Rotterdam seed practice opted in, received one **prepared** Dutch Luna reminder approval, and did not receive a duplicate on retry. The test approval was rejected. No external message was delivered.
- A live Iris test exposed a real issue: the bridge chose an unsent appointment from 7 October instead of a fresh one, and described an internally saved follow-up as "sent." The test changed only synthetic Rotterdam records. The published Iris core and bridge now require a completed visit that ended within the past 72 hours; the response and activity description say "prepared," and a new internal test conversation is marked Web rather than WhatsApp. Isolated selection checks passed, the publication left practice table fingerprints unchanged, and a live check confirmed that old and future completed visits are rejected. A **positive recent completed-visit test remains open** because the controlled dashboard will not create a past appointment.
- Ava's separate voice project now rejects impossible clock minutes and no longer logs full patient input or webhook replies. Eight local tests and Ruff checks passed. No spoken call, LiveKit audio run, phone connection, or cloud simulation was performed. Its starter scenario file is not evidence of DentalOS voice coverage.
- Test artifacts include one clearly labelled synthetic Rotterdam patient, a future appointment marked Completed solely for the Iris check, and a follow-up entry for an older synthetic Rotterdam visit produced before the fix. Review these QA records before using Rotterdam in a demonstration. Utrecht's demo practice was unchanged by this test.
- After that test, a separate, opted-out synthetic patient named **Noor Demo** was registered in Utrecht with a confirmed appointment for Friday 6 November at 15:00 Amsterdam time. The Friday schedule showed that appointment in Chrome. A preliminary QA booking at the same time was cancelled and remains in history; filter the calendar to **Confirmed** for the meeting. No reminder or contact was delivered.
- The dashboard service and the published n8n state bridge now refuse to mark future appointments Arrived or Completed, and refuse completion before the appointment starts in Amsterdam time. Two new dashboard status tests passed, bringing the policy suite to 20. A direct n8n refusal check left Noor Demo's Friday appointment Confirmed. Direct valid Arrived and Completed transitions passed on an older synthetic Rotterdam visit; Utrecht's snapshot stayed unchanged. This test intentionally updated that Rotterdam QA visit.

The client meeting is a screen-shared product demonstration. The Zoom link is separate from DentalOS; a remote client cannot open this Mac's `127.0.0.1` address. Keep real patient information out of the demonstration.

## What was changed

- Connected the missing Next.js session-refresh entry point. Existing-account login no longer incorrectly enforces the signup password-length rule.
- Enforced account, role, practice and record ownership before dashboard actions. Bounded JSON bodies, rejected invalid dates and unsupported actions, and removed confirmation-token replay from the dashboard booking path.
- Scoped n8n table reads and updates to the requested practice. Removed silent snapshot row limits and fabricated patient emails. The unauthenticated calendar feed remains disabled.
- Validated booking times, patient identity and overlaps in the workflow itself. Fixed a new patient-lookup fan-out error found by live testing. Rescheduling preserves duration, dentist and chair.
- Kept this local n8n instance on 127.0.0.1 with production workflow concurrency set to one. The simultaneous-booking test passed under this configuration; this is not a database-level lock for a future multi-instance deployment.
- Added persistent inbox history for dashboard test messages, Milo responses, staff notes and resolution events. Older conversations retain only whatever summary existed; previously lost replies cannot be reconstructed.
- Added an Add patient form. New registrations default to reminders/outreach disabled; duplicates are blocked both by the dashboard and by the registration workflow.
- Prevented overlapping refreshes and stale refresh results overwriting newer changes. Background tabs stop polling. Connection failures stay visible. Failed inbox requests retain the unsaved text.

## Verification and its limits

- 18 dashboard policy/service test groups passed, including cross-practice records, roles, malformed input, approval IDs, appointment conflicts and request-size limits.
- The initial workflow hardening passed 1,022 structural and synthetic assertions. These are **not** 1,022 end-to-end tests.
- Inbox workflow candidates passed 62 synthetic/structural checks; registration candidates passed eight checks.
- 18 live booking checks passed: registration, booking, rescheduling, cancellation, duplicate refusal, concurrent booking refusal, and unchanged snapshots for the other two practices.
- 14 live inbox checks passed: both authors persisted, selected conversation routing, staff takeover/note/resolution, foreign conversation refusal, and unchanged snapshots for the other two practices.
- Additional live checks verified paused Ava/Milo made no appointment or conversation changes; their original enabled states were restored. Leo produced Monday's briefing. Finn prepared one pending waitlist approval and did not duplicate it on retry. Only that test-created approval was rejected afterward.
- Luna had no new eligible reminders/recalls in the tested live data. Repeating both requests created no duplicate approvals. This does not prove positive message preparation for a newly eligible recipient.
- Iris had no eligible completed visit. Its positive follow-up path was not exercised by this live run.
- Browser checks verified sign-in, persistence across reload, patient registration with consent off, booking, native-keyboard rescheduling, cancellation, and persisted inbox history. Browser automation's date/time `fill` method did not update the controlled fields reliably; native keyboard input did. No date-picker code was changed on that basis.
- Five HTTP access checks passed: signed-out page redirect, rejected store/action requests, blocked cross-origin action, and GET refusal on sign-out. Mobile inbox layout had no horizontal page overflow at 390 px; navigation worked and the original viewport was restored.
- Production build and TypeScript checks passed.
- Each workflow publication compared table fingerprints before/after and found practice data unchanged. Subsequent authorized tests intentionally created synthetic records. Three clearly labelled QA patients, cancelled test appointments and a resolved QA conversation remain for inspection. No test records were silently deleted.

## Run the demonstration

1. Keep the Mac awake, with the local n8n process running. Its current listener is `127.0.0.1:5678`. A Mac shutdown stops the backend.
2. In the `dentally-live` folder, use `npm run dev -- --port 3001` if the dashboard is not already running. If port 3001 is occupied, use the existing app instead of starting a second copy on another port.
3. Open `http://127.0.0.1:3001/` consistently and sign in. `localhost` and `127.0.0.1` have separate browser cookies.
4. In Patients, add a clearly labelled synthetic patient with a non-deliverable test contact. Confirm the profile is opted out.
5. Book a future weekday appointment, reschedule it, and cancel it. The schedule is DentalOS's local schedule, not a connected practice-management system.
6. Show the resolved QA inbox conversation to demonstrate saved history. Test messages are not delivered by WhatsApp or SMS.
7. Explain the six-agent interface as the current tested workflow prototype. Do not claim all six agents are connected to patient communication channels.

The checked-out dashboard runs with npm; starting it does not involve v0. Keep `.env.local`, `.n8n/config`, database files, credentials and `.codex-backup` out of Git and recordings.

## Still required before a real-patient pilot

- Persistent online hosting with HTTPS, monitoring, backup and a demonstrated restore. No hosting was provisioned in this session.
- Confirmed rotation of the previously exposed webhook key and review of any other exposed tokens. This session did not rotate credentials.
- A provisioned, isolated real practice. Several n8n request validators still accept only the three synthetic practice IDs. Adding a Supabase membership alone does not provision a real practice.
- End-to-end role tests with separate staff/admin accounts, plus a production authentication/email setup review. The role tests here used controlled service fixtures, not separately signed-in staff accounts.
- Phone/WhatsApp/SMS provider setup, consent and delivery-state handling, plus real delivery/receipt tests. The current saved inbox messages are explicitly test records.
- Ava voice testing, the patient acceptance step for waitlist offers, and a reviewed integration or explicit staff handoff to the practice's actual scheduling system.
- Positive eligible-recipient tests for Luna and Iris, including retries, approval changes and failures.
- Appropriate practice onboarding agreements and privacy/security review for the actual providers and data flows. EU hosting alone does not establish readiness.

## Hosting research — current decision is €0/local

Railway can run n8n with a persistent volume and offers an Amsterdam region. Hobby starts at $5/month with $5 of resource usage included; usage can exceed that. Its free/trial volume is limited to 0.5 GB, smaller than the current local n8n database. Do not assume a free migration of this database will fit.

n8n Cloud offers a 14-day, 1,000-execution trial and stores hosted data in Frankfurt. Starter is advertised at €20/month **billed annually**, not a €20 monthly commitment. The current 30-second dashboard refresh can create 960 workflow calls during one eight-hour viewing day, before actions. A direct move to execution-metered hosting would need cost and concurrency redesign.

Render's free service sleeps after inactivity and cannot attach persistent storage. It is not a suitable host for this SQLite-based practice backend.

Sources checked: [Railway pricing](https://docs.railway.com/pricing/plans), [Railway regions](https://docs.railway.com/deployments/regions), [n8n trial](https://docs.n8n.io/deploy/use-n8n-cloud/start-your-free-trial), [n8n pricing](https://n8n.io/pricing/), [Render free limits](https://render.com/docs/free).

Private test reports and reversible workflow backups are under `.codex-backup/` in the working checkout. They are intentionally excluded from Git.
