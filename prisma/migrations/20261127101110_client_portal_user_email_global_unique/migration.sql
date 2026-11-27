-- ClientPortalUser.email must be globally unique, not scoped per
-- clientId: the portal login form takes only email+password (no
-- clientId to disambiguate), so one email can only ever map to one
-- portal account. Corrects the constraint from the immediately-prior
-- migration (20261127100720) before any application code depended on
-- it — never editing that already-applied migration file itself, per
-- CLAUDE.md rule 13.

-- DropIndex
DROP INDEX "ClientPortalUser_clientId_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortalUser_email_key" ON "ClientPortalUser"("email");

-- CreateIndex
CREATE INDEX "ClientPortalUser_clientId_idx" ON "ClientPortalUser"("clientId");
