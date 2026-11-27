# Phase 3 Deployment Checklist

_Last updated: 2026-11-27_

## Current Branch Intent

This phase was implemented on `feature/phase-3-complete-implementation` and is not pushed/deployed from this session.

## Pre-Merge Checklist

- [x] Prisma schema validates locally.
- [x] New migrations generated and applied locally.
- [x] TypeScript typecheck passes.
- [x] Tests pass (111/111).
- [x] Production build passes.
- [x] No changes to protected design-system files.
- [x] New Phase 3 docs created.

## CI Expectations

Before merge/push, ensure required CI checks remain green:

- lint/typecheck
- migration integrity
- tests
- build
- docker smoke + multi-network checks

## Production Safety Checks

- [ ] Confirm environment variables for worker queue and app are present in target environment.
- [ ] Confirm database migration plan and rollback notes are reviewed.
- [ ] Confirm portal endpoints are reachable only through authenticated portal session flow.
- [ ] Confirm monitoring/alerting covers worker job failures and dead-letter growth.

## Go/No-Go Criteria

Go only when CI is fully green, migration integrity is clean, and no open tenant-isolation/security defects are present.
