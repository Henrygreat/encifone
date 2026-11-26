-- Enables the pgvector extension, provided by the pgvector/pgvector:pg18
-- Docker image (and expected to be pre-enabled/available on the Coolify-
-- managed PostgreSQL 18 + pgvector instance in production).
--
-- This migration ONLY enables the extension. No vector column, index, or
-- AI/knowledge-base table is created here — those arrive with the specific
-- module that needs them (Knowledge Base / RAG, per docs/ROADMAP.md), not
-- ahead of need. See docs/DATABASE_SCHEMA.md for the planned shape.
CREATE EXTENSION IF NOT EXISTS vector;
