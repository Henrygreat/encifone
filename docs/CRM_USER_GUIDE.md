# CRM User Guide — EncifOne

Covers what's actually built as of Phase 2A (Milestones A–D, 2026-11-26) — see `docs/IMPLEMENTATION_STATUS.md` for the full build record and `docs/MASTER_ROADMAP.md` for what's planned next. Written guidance only; no screenshots are included (none could be captured in the environment this was authored in) — every flow below was exercised against a running instance and confirmed to work as described.

## 1. Adding a contact

Go to **CRM → Contacts** and select **New contact**. First and last name are required; email, phone, job title, and company are optional. If you pick a company, the contact is linked to it immediately — you'll see it on the company's record. Contacts can be searched (name, job title, or company name) and filtered by status from the toolbar above the table.

**Archiving** a contact (soft delete) is available via the contact's row — archived contacts drop out of the default list but are never deleted from the database, and can be brought back up with the "Archived" status filter.

**Not yet available:** a full contact detail/profile page, tags on the quick-create form (the field exists on the record but isn't exposed in this dialog yet), CSV import/export, duplicate detection, bulk operations. These are real, substantial features queued as near-term follow-ups — not silently dropped.

## 2. Adding a company

Go to **CRM → Companies** and select **New company**. Name is required; industry and website are optional. The company list shows how many contacts and opportunities are linked to each one (`_count` in the API response) — a quick way to spot your most active accounts without opening anything.

**Not yet available:** same as contacts — no detail page, no address/parent-company fields in the quick-create dialog (available in the underlying API, not yet in this form), no CSV import/export.

## 3. Capturing and converting a lead

Go to **CRM → Leads** and select **New lead**. Everything here is free-text until converted — a lead doesn't need a real Company or Contact to exist yet. Fill in whatever you know: name, email, company name, source (e.g. "Website form", "Referral").

When a lead is ready, select **Convert** on its row. This does one of two things, depending on what you give it:

- **Nothing pre-linked:** a new Contact (from the lead's name/email) and a new Company (from the lead's free-text company name) are created and linked to each other, and the lead is marked `CONVERTED`.
- **Already linked, or converting against an existing record:** if the lead already has a matched Contact/Company, or you convert with an explicit `companyId`/`contactId` via the API, that existing record is used instead of creating a duplicate.

A lead can only be converted once — converting an already-converted lead is rejected, not silently re-run (which would otherwise create a second Contact/Company pair every time).

**Not yet available:** real AI-driven lead scoring (`Lead.score` is displayed as a plain number where one exists, but nothing populates it yet — that's Phase 2.8), a conversion dialog that lets you pick an existing Contact/Company from the UI (the API supports it; the Leads page's Convert button always does the "create from free text, or use what's already linked" path).

## 4. Moving a deal through your pipeline

Go to **Sales → Pipeline** (`/deals`). The first time your organisation opens this page, a default pipeline is created automatically — six stages: New, Qualified, Proposal, Negotiation, Won, Lost. **New deal** opens a dialog to add a deal with a name and an optional value (enter it in whole currency units, e.g. `1500.50` — it's converted and stored correctly behind the scenes).

Drag a deal card between columns to move it through your pipeline. Dropping it:

- Into **Won** or **Lost** sets the deal's status and stamps a won/lost timestamp automatically.
- Back into a normal stage **reopens** the deal — any previous won/lost status is cleared, not left stale.
- Within the same column reorders it — the new order is saved immediately.

If a move can't be saved (e.g. a network hiccup), the card snaps back to where it was and you'll see a toast explaining what happened — it never silently loses your change or leaves the board showing something that isn't actually saved.

**Not yet available:** a list/table view toggle (the board is Kanban-only right now), a deal detail page, won/lost reason capture in the UI (the field exists and is used when set via the API).

## 5. Logging activity (calls, meetings, notes, tasks)

The activity timeline component exists and is fully functional (`src/components/activities/activity-timeline.tsx`, backed by `/api/v1/activities`) — but it is **not mounted on any page yet**, because the contact/company/opportunity detail pages it would attach to don't exist yet either (see the gaps noted in sections 1–2 above). You can exercise it directly via the API today:

- `POST /api/v1/activities` with `entityType` (`CONTACT`/`COMPANY`/`LEAD`/`OPPORTUNITY`), `entityId`, `type` (`CALL`/`MEETING`/`EMAIL`/`NOTE`/`TASK`), and `subject`. A logged call/meeting/email/note is recorded as already complete; a `TASK` needs a `dueAt` and starts open.
- `POST /api/v1/activities/{id}/complete` marks an open task done.
- `GET /api/v1/activities?entityType=...&entityId=...` lists everything logged against a record, newest first.

Once a detail page exists for any of those four record types, dropping in `<ActivityTimeline entityType="..." entityId="..." />` gives it a working log-and-complete timeline immediately — the component doesn't need any further backend work.

## 6. The dashboard

**Overview → Home** (`/dashboard`) shows real, computed figures — never a placeholder number. Every KPI (contacts, companies, active leads, open/won deals, pipeline value, a probability-weighted revenue forecast, lead conversion rate), the lead-source chart, recent activity, upcoming follow-ups, and the overdue-tasks count all come from your organisation's actual data. If you haven't added anything yet, each widget says so plainly instead of showing a fabricated figure or a bare blank.

The **AI insights** panel is explicitly labelled "Not yet configured" — no AI provider is wired up yet, so nothing there is generated. That panel will start showing real contact summaries, lead prioritisation, and next-best-action suggestions once an AI provider is connected (Phase 2.8/5), never before.

## 7. What's deliberately not here yet

Logged here so nothing above reads as an oversight:

- Detail/profile pages for contacts, companies, leads, and opportunities (the activity timeline, tags UI, and richer edit forms all depend on these existing first).
- CSV import/export, duplicate detection and merge, bulk operations (select-many-and-act) across any CRM list.
- A list/table view for the sales pipeline (Kanban only today).
- Real AI functionality anywhere in the CRM — lead scoring, insights, next-best-action, natural-language search. Nothing here is faked in the meantime.
- Auth page (login/register) visual polish beyond the existing functional forms.
