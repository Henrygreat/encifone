# Phase 5.1 communications enhancement

## Summary and initial audit

Work started from clean local `master` at `d8828c3`, also the local `origin/master` reference and Phase 5 branch head. That commit includes the Twilio changes from the interrupted session. This work is on `feature/phase-5-1-communication-enhancement`. The authoritative roadmap still defines Phase 5 as dashboard, read-only AI Command Centre and audit. The owner’s communications enhancement crosses into later roadmap scopes and remains partially implemented.

| Area | Baseline findings | Enhancement status |
| --- | --- | --- |
| A · Integration Centre | One settings page with inline forms for website chat, Resend and Twilio. AI configuration already in member settings. | Provider cards, filters, genuine month-to-date message counts and dedicated administration pages. Existing AI configuration is reused. |
| B · Website chat | One widget per organisation, signed sessions, external installation, allowlist and text conversations. | Multiple widgets, tenant-scoped editing, separate internal name, connection detection, copy controls and installation guide. Full branding, true live preview, offline workflows, attachments and transcripts remain open. |
| C–E · Mailboxes | No Gmail, Microsoft Graph or SMTP/IMAP mailbox implementation. | OAuth, synchronisation and secure SMTP/IMAP support remain open. |
| F · Resend | Shared inbox accounts, signed receive and delivery events, text threading, credential replacement and test/disconnect controls. Existing transactional finance mail uses its separate settings. | Existing functionality reachable from its dedicated page. Complaint tracking, retry lifecycle and broader transactional coverage remain open. |
| G · SMS | Twilio two-way text handling, signed callbacks, opt-out and segment estimates. | Existing configuration retained. Other adapters, number discovery, consent preferences, templates and costs remain open. |
| H · WhatsApp | No official Meta adapter. | Integration, templates, consent and media remain open. |
| I · Inbox | Three-panel workspace, polling, manual routing, statuses, search, notes, collision checks, basic CRM context. | Channel switching, attachments, saved replies, richer context and create actions remain open. |
| J · Calendar | Staff scheduling, day/week/month/agenda ranges, conflict prevention and in-app reminders. My Work has its own task workflow. | Availability, public booking, recurrence and external calendar sync remain open. |
| K · AI | Existing consent-gated Anthropic adapter and human-reviewed draft workflow. | Verified live-provider behaviour and knowledge retrieval remain open. |
| L–N · Automation, analytics and architecture | Existing Redis worker and transactional appointment reminders, notification service, database-backed conversation analytics, independent email/SMS modules. | Routing rules, SLAs, other reminder workflows, provider exports and unified event/sync contracts remain open. |

## Provider status and operation

| Provider | Availability | Verification |
| --- | --- | --- |
| Website chat | Configuration required until enabled and detected, optional per widget. | Local browser against a separate website origin. |
| Resend | Configurable, shared mailbox with read-only receiving API test. | Mocked requests and signed webhook fixtures. |
| Twilio | Configurable for an existing SMS-enabled number. | Mocked requests and signed webhook fixtures. |
| Anthropic | Existing organisation AI settings, requires configured key and opt-in. | Missing-provider behaviour tested. |
| Gmail, Google Workspace, Outlook, Microsoft 365, SMTP/IMAP and Zoho Mail | Coming soon, connection disabled. | Unimplemented. |
| WhatsApp Cloud API, Vonage, Telnyx, Termii and Africa’s Talking | Coming soon, connection disabled. | Unimplemented. |
| Google Calendar, Microsoft Outlook Calendar and EncifOne Booking Pages | Coming soon, connection disabled. | Unimplemented. |

Use **Communication Centre** to reach provider management. Resend and Twilio setup instructions, callback events and an environment summary are in the [Phase 5 provider guide](PHASE_5_CAPSTONE_REPORT.md#configuration-and-release). Website setup instructions are in the [widget installation guide](WEBSITE_CHAT_INSTALLATION.md). No live provider requests were made for validation.

## Database, routes and security

- `20261128113000_phase51_multiple_widgets` changes the organisation uniqueness constraint on `ChatWidget` to a non-unique index and adds nullable `widgetName`, `lastConnectedAt` and `lastConnectedOrigin`. Existing widget keys, records and sessions survive. The public identifier remains unique.
- `/communications` is the Integration Centre. `/communications/manage/[provider]` accepts `website-chat`, `resend` or `twilio`. It requires organisation settings permission. The existing public `GET /api/chat/[key]` records detection after origin checking and rate limiting. No new public endpoints.
- Server writes scope selected widget IDs to the active organisation. The existing public widget origin check and signed visitor token remain in use. Tests cover attempts to operate on a foreign widget and to reuse a signed session on another widget. Connection timestamps are bounded observations of allowed-origin traffic.
- Mailbox and phone queries project configuration metadata without returning stored credentials. The existing app credential store uses AES-256-GCM derived from `AUTH_SECRET`. OAuth, attachment handling, retention policy and comprehensive compliance verification remain open.

## Deployment

There are no new environment variables, production dependencies, containers or deployment layers. Keep the canonical HTTPS `APP_URL`, existing database and Redis configuration, and stable `AUTH_SECRET` on the application and worker. Review this branch and manually merge only the changes accepted for release. Follow the [deployment runbook](DEPLOYMENT_RUNBOOK.md), including a backup, migration deployment on staging first and app and worker health checks. The migration is forward-only for release planning because the old unique index cannot be restored while any organisation has multiple widgets. If reverting application code after enabling multiple widgets, preserve the database and plan the widget data migration explicitly.

Phase 5.1 and Phase 6 release readiness remain open while required integrations, automation, accessibility coverage and live-provider acceptance remain incomplete.

## Validation and recovery checkpoint

- Local application commits are `3ce5daf` for the Communication Centre and `5744a28` for multi-widget management. The test database has 26 applied migrations. Prisma generation, schema validation and development database drift comparison passed.
- Type checking and the production build passed. ESLint reported zero errors and two pre-existing React Hook Form compiler warnings. All 129 Vitest tests and six Chromium workflows passed, including four Phase 4 finance regressions.
- Chromium exercised Communication Centre layout at desktop, tablet and mobile widths across Aurora, Professional Dark and Professional Light, with no document overflow observed in those samples. It also exercised external widget messaging and Calendar scheduling. Formal WCAG and assistive-technology testing remain open.
- Docker Compose configuration validated. No container topology or image configuration changed. A fresh Docker image size measurement and a staging worker smoke test remain open.
- Resume with the Google OAuth mailbox lifecycle and its signed state, token encryption, sync and mocked failure coverage. The provider catalog leaves all unimplemented account flows unavailable. The table above records remaining work by milestone.
