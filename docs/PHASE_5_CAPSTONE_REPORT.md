# Phase 5 communications extension

**Status: partially implemented and validated locally.** The master roadmap defines Phase 5 as the Bento dashboard, read-only AI Command Centre and full vertical-slice audit. It places the email-first Universal Inbox and Helpdesk routing in Phase 6. The owner-issued communications brief extends the scope across those and later phases. The roadmap’s original acceptance criteria remain in force.

## Delivered

| Brief milestone | Validated local scope | Outstanding |
| --- | --- | --- |
| 5.1 Universal Inbox | Responsive conversation list, message history, customer context, text replies, internal notes, manual assignment, shared unread state, priority, tags, statuses, snoozing, filters, pagination and polling. | Attachments, saved replies, per-user unread state and contact, lead, task and ticket creation actions. |
| 5.2 Email | Shared Resend accounts, signed events, text reply threading, inbound deduplication, outbound idempotency and delivery states. | Gmail and Outlook OAuth, SMTP/IMAP, individual mailboxes, CC/BCC, attachments, signatures, templates and comprehensive sync history. A delivery event arriving before the provider message ID is stored can be missed. |
| 5.3 SMS | Read-only verification of existing Twilio numbers, inbound and outbound replies, signed callbacks, deduplication, segment estimates and per-number STOP/START controls. | Templates, carrier-grade validation, aggregate billing and usage dashboards, real-provider verification and reconciliation of ambiguous sends with no callback. |
| 5.4 WhatsApp | | Official Meta Cloud API, media, templates, consent and delivery/read status. |
| 5.5 Website chat | Installation snippet, allowed origins, configurable appearance and text, signed visitor sessions, text-only history and human replies. | Attachments, business hours, dedicated offline handling, logo, contact creation and durable cross-tab visitor sessions. |
| 5.6 Calendar | Staff appointments, four time-range views, local timezone inputs, rescheduling, cancellation, conflict/buffer checks, Inbox entry point and in-app reminders. | Availability and reusable appointment types, recurrence, public booking and external Google/Microsoft sync. |
| 5.7 AI assistant | Existing opted-in gateway, requested suggestion modes and tones, editable drafts and separate human send action. | Live-provider validation, retrieval-backed article suggestions and persistent sentiment metrics. |
| 5.8 Assignment and escalation | Manual assignment, assignee notifications and optimistic reply collision checks. | Team queues, rule routing, SLA targets, escalation and mentions. |
| 5.9 Analytics | Stored conversation, status, channel, staff workload and response/resolution metrics with date, channel and staff filters. | Delivery, cost, sentiment and SLA metrics, charts and compact dashboard integration. |
| 5.10 Automation | Redis worker processes due in-app appointment reminders with bounded retries and duplicate/cancellation protection. | Scheduled outbound messages, business-hours policies, additional lifecycle follow-ups, dead-letter operations and comprehensive execution history. |

Customer context reads permission-scoped contact, company, opportunity, project, Helpdesk, unpaid invoice and previous conversation records. Comprehensive integration with proposals, contracts, tasks, onboarding, the client portal, payments, subscriptions, retainers and knowledge-base workflows remains open. Phase 4 tests passed locally, including PDF and finance browser regression coverage. Live Stripe Connect and transactional Resend verification remain open.

## Application surfaces and migrations

- Staff pages are `/inbox`, `/inbox/analytics`, `/communications` and the updated `/calendar`. The widget script is `/encifone-chat.js`.
- Staff APIs are `/api/v1/inbox`, `/api/v1/inbox/[id]`, `/api/v1/inbox/[id]/assistant`, `/api/v1/appointments` and `/api/v1/appointments/[id]`.
- Public endpoints are `/api/chat/[key]`, `/api/v1/webhooks/inbox-email/[key]` and `/api/v1/webhooks/inbox-sms/[key]`.

| Additive migration | Models |
| --- | --- |
| `20261128022000_phase5_inbox_chat` | `InboxConversation`, `InboxMessage`, `ChatWidget`, `ChatVisitor` |
| `20261128024000_phase5_inbox_email` | `InboxMailbox`, `InboxDelivery` |
| `20261128083500_phase5_appointments` | `Appointment` |
| `20261128085500_phase5_inbox_sms` | `InboxSmsNumber`, `InboxSmsConsent` |

## Configuration and release

1. Set the existing `APP_URL` to the canonical HTTPS application origin, and supply the existing `DATABASE_URL`, `REDIS_URL` and stable `AUTH_SECRET` on the application and worker. There are no new required environment variables. Enter provider credentials in authorised per-organisation settings. Rotating the app encryption secret requires preserving access to stored ciphertext through an explicit rotation procedure.
2. Enable website chat under Communication settings, enter exact allowed HTTPS origins, then copy the installation snippet to the authorised sites. Verify the public widget on a separate origin on staging.
3. Verify a sender domain and configure inbound receiving in Resend. Enter the receiving address, API key and signing secret in Communication settings. Register the displayed webhook for `email.received`, `email.delivered`, `email.bounced` and `email.failed`. Verify send and receive using a controlled staging address. [Resend receiving setup](https://resend.com/docs/dashboard/receiving/introduction) · [Resend webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests)
4. Connect a pre-existing SMS-capable Twilio number in Communication settings. Configure the displayed webhook as the number’s incoming message HTTP POST URL. EncifOne provides the delivery callback URL when sending. Set up applicable country and carrier registration and Twilio opt-out controls. Connection verification performs a read-only number lookup. [Twilio signed requests](https://www.twilio.com/docs/usage/security#validating-requests) · [Twilio message callbacks](https://www.twilio.com/docs/messaging/api/message-resource) · [Twilio opt-out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out)
5. Select an AI provider through the existing organisation AI settings and grant consent before using suggestions. Verify tenant-approved model behaviour with controlled messages before enabling broader use.
6. During owner review, use the existing Coolify application and worker. Back up the target database, apply the additive migrations with `pnpm exec prisma migrate deploy` as described in the deployment runbook, release app and worker together on staging and verify both health checks and the reminder worker. Keep provider features disabled until staging checks pass. Review the branch and perform any merge, push or deployment manually once the outstanding scope and release gates are accepted.

## Security and verification

- Tested cross-organisation record access, foreign widget token rejection, internal note exclusion, provider signature rejection and replay deduplication, duplicate send prevention, SMS opt-out, concurrent appointment conflict handling, cancelled reminder suppression and missing AI provider handling. Connection credentials are encrypted server side and omitted from list responses. Public request bodies are bounded. Widget traffic uses the existing Redis limiter.
- Automated security coverage is scoped to the delivered features. Attachment security, OAuth refresh, formal retention and deletion controls, full consent evidence, live provider handling and broader client-portal integration remain open. Twilio inbound authentication has no timestamp supplied by the protocol, so duplicate message SIDs are checked against stored records.
- Prisma schema validation and generation passed. All migrations applied to isolated development PostgreSQL. TypeScript and production build passed locally. ESLint reported zero errors and two existing React Hook Form compiler warnings. Vitest passed 129 tests in 22 files. Docker Compose configuration validated.
- Chromium passed the two-origin visitor/staff workflow and the Calendar appointment workflow. The Inbox browser checks covered Aurora, Professional Dark and Professional Light across desktop, tablet and mobile widths. Four Phase 4 finance browser regressions passed. This was a functional browser check. Formal WCAG, assistive technology and full device/theme matrix testing remain open.
- Resend and Twilio tests used mocked provider requests with signed webhook fixtures. There were no live provider sends, purchases or live financial transactions.

The branch is `feature/phase-5-communications`. Validated milestones include `016a426` for Inbox and website chat, `4c0040e` for Resend, `af81478` for Calendar and reminders, and `05e1fa5` for AI and customer context. The communications brief and the roadmap’s original Phase 5 acceptance criteria remain open. Phase 6 readiness has not been established.
