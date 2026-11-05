# DentalOS pilot: data-flow and privacy review notes

Prepared 5 November 2026 from the local code and n8n table definitions. This is an inventory for a Dutch practice and a qualified privacy adviser, not an agreement or a claim of legal compliance. Use synthetic data until the decisions below are made and tested.

## Current data path

1. A signed-in dashboard account authenticates with Supabase Auth. A `practice_memberships` row supplies one practice ID and a role (`owner`, `admin`, or `staff`). The dashboard server checks that membership before it calls n8n.
2. The dashboard server sends an authenticated request to local n8n. The webhook key stays in server settings. n8n reads or changes its local SQLite data tables for the assigned practice.
3. The current n8n workflows prepare test records and approvals. The inbox records test text. No phone, WhatsApp, or SMS delivery provider is connected. A separately developed Ava voice program is not connected to an inbound number and has not passed a spoken end-to-end test.
4. If the voice program is enabled later, its current code uses LiveKit, OpenAI GPT-4.1 mini for language generation, and Deepgram Nova-3 for speech recognition. Their processing locations, contracts, retention, and any further subprocessors must be checked before patient speech is used.

## Data found in the local tables

| Area | Current fields that matter for review |
| --- | --- |
| Patients | Name, phone, preferred channel, language, consent flags, recall due date |
| Appointments | Patient ID, dentist, chair, treatment, status, start/end times |
| Conversations and messages | Patient ID, channel, status, message text, sender, timestamps |
| Approvals and waitlist | Patient recipients, proposed message text, treatment, status |
| Activity and proposals | Descriptions, related IDs, proposal tokens and stored request payloads |
| Accounts | Email, user ID, practice assignment and role in Supabase Auth/membership |

These fields can reveal a person's relationship with a dental practice even when no clinical notes are stored. The current local data is synthetic. Patient and conversation rows do not yet have a verified retention or deletion process. There are separate `consent_appointment` and `consent_marketing` Booleans in n8n. The dashboard patient switch changes only `consent_appointment`; recall checks `consent_marketing`. Neither Boolean records the source, wording, time, or evidence of a patient's choice.

## Decisions before accepting real patient data

- Agree with the practice what DentalOS may do, what staff must approve, which patient details are necessary, and which channels may carry them. Ask the practice to identify its practice-management system and the permitted integration or staff handoff.
- Establish the controller/processor roles from the actual service arrangement, then have a qualified adviser tailor a written **verwerkersovereenkomst**. The Dutch privacy authority lists required subjects including instructions, confidentiality, security, subprocessors, data-subject assistance, deletion/return, and audit rights. [Autoriteit Persoonsgegevens: verwerkersovereenkomst](https://autoriteitpersoonsgegevens.nl/themas/basis-avg/avg-algemeen/verwerkersovereenkomst)
- Review whether a DPIA is needed for the proposed patient, voice, messaging, and AI processing. The practice should make that decision with its privacy adviser; DentalOS must be ready to supply a data-flow description and risk controls. [Autoriteit Persoonsgegevens: DPIA](https://autoriteitpersoonsgegevens.nl/nl/onderwerpen/europese-privacywetgeving/data-protection-impact-assessment-dpia)
- Check each provider's region, contract, subprocessors, transfer mechanism, retention, access logs, and deletion path. The Dutch authority has a health-data cloud checklist for the practice's assessment. [Autoriteit Persoonsgegevens: gezondheidsgegevens in de cloud](https://autoriteitpersoonsgegevens.nl/themas/gezondheid/gezondheidsgegevens-gebruiken-en-delen/stappenplan-gezondheidsgegevens-in-de-cloud)
- Add a permission record that captures who obtained permission, the wording and channel, when it was obtained, and when it was withdrawn. Keep the current default of outreach off for new patients. Define distinct workflows for appointment communications and recall/outreach; expose the relevant status and evidence to authorized staff without implying the appointment switch grants recall permission.
- Decide and implement retention periods, patient access/correction/deletion procedures, incident reporting contacts, staff permissions, and a tested backup restore. Do not promise a deletion or audit capability that has not been built.

## Current verification

- The local dashboard returned 401 for signed-out store and action requests and redirected a signed-out page request to login.
- An anonymous request using only the Supabase publishable key returned a database permission error for `practice_memberships` (HTTP 401, code `42501`). Supabase documents that a publishable key without a signed-in user acts as `anon`, and table grants and row-level security both govern access. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- A separate confirmed test account was assigned `staff` access to the synthetic Utrecht practice. In Chrome its dashboard showed the staff role, only Utrecht in the practice chooser, and disabled or hidden manager controls. A direct signed-in cross-practice API attempt was not performed; controlled server policy tests cover that rule.

This inventory must be updated after the hosting region, phone/messaging provider, practice software, and first pilot scope are selected.
