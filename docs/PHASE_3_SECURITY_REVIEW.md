# Phase 3 Security Review

_Last updated: 2026-11-27_

## Review Scope

Security review focused on newly added Phase 3 modules and APIs:

- projects, tasks, workforce, service requests, helpdesk, workflows, knowledge base, assets
- portal operational endpoints and pages
- workflow queue/worker execution path

## Controls Verified

- Tenant isolation is server-side:
  - internal APIs/services derive organisation from active membership
  - portal APIs derive organisation/client from portal session only
- Capability checks present in service layer for all new internal modules.
- Portal responses scoped to `organisationId` + `clientId`.
- Internal comments are excluded from portal list/read paths.
- Workflow trigger requires ownership of workflow definition in acting organisation.
- Audit logs are emitted for key state transitions (create/update/archive/trigger/failure paths).

## Threat Checks

- Cross-tenant read/write attempt on projects: blocked (`NotFound` in other-org context).
- Cross-tenant workflow trigger: blocked (`Workflow not found`).
- Duplicate workflow trigger replay with same idempotency key: execution row not duplicated.

## Residual Risks

- Helpdesk ticket reference generation currently uses count-based sequencing; high-concurrency creation could require stronger uniqueness strategy if collision risk rises.
- Workflow actions currently support a controlled action set; future action expansion must preserve strict allow-list behavior.

## Recommendations

1. Add explicit portal negative-path integration tests for internal-comment non-disclosure at route level.
2. Add concurrency test for ticket reference generation under parallel creates.
3. Keep all future workflow action handlers in a strict typed allow-list with per-action validation.
