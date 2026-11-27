# Phase 3 Execution Checklist

_Last updated: 2026-11-27_

This checklist reconciles the owner-requested Phase 3 expansion with the repository roadmap baseline.

## Reconciliation Notes

- Repository roadmap currently defines a narrower Phase 3 (portal/onboarding deepening), with many requested capabilities originally phased later.
- This implementation follows the owner request while preserving completed functionality and tenant-security guarantees.
- No protected design-system files are to be modified during this phase.

## Protected Styling Files (must remain unchanged)

- src/app/globals.css
- src/components/ui/**
- src/components/app-shell/**
- src/components/bento/**
- src/components/three/**

## Milestones

- [x] 3A Service Catalogue completion (schema, service layer, APIs, migration, validation)
- [x] 3B Project Management core
- [x] 3C Task Management + My Work
- [x] 3D Workforce & Resource Planning
- [x] 3E Service Requests
- [x] 3F Helpdesk & Ticketing
- [x] 3G Workflow Automation engine
- [x] 3H Knowledge Base
- [x] 3I Asset Management
- [x] 3J Client Portal Phase 3 integration
- [x] 3K Operational Analytics
- [x] 3L Test hardening + integration validation
- [x] Documentation updates and capstone reports

## Implementation Sequence

1. Add Prisma models/enums/indexes for Projects, Tasks, Workforce, Service Requests, Tickets, Workflows, KB, Assets.
2. Generate migration and Prisma client.
3. Implement module service layers with capability checks and tenant scoping.
4. Add API routes for each module with strict schema validation.
5. Implement app routes/pages using existing component patterns only.
6. Integrate with client portal boundaries and object-level access.
7. Add worker jobs for workflow execution and retries.
8. Add automated tests for tenant isolation, RBAC, lifecycle workflows.
9. Run full validation suite and build.
10. Produce final phase reports with implemented/deferred distinctions.

## Validation Snapshot

- `pnpm typecheck`: pass
- `pnpm test`: pass (111/111)
- `pnpm build`: pass
- `pnpm lint`: pass with 2 pre-existing warnings outside Phase 3 scope (`onboarding-templates` and `activity-timeline` React Compiler watch warnings)
