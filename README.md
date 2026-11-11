# Foliovera (`foliovera`)

> **Your career, always current.**  
> An AI-powered career intelligence platform that transforms verified achievements into living professional profiles and tailored resumes.

Foliovera (formerly *Living Resume Agent*) is designed to be **free-tier first**, independent of paid ChatGPT subscriptions, and engineered with strict source traceability, persistent relational storage, and prompt-injection security boundaries.

---

## Core Engineering Principles

1. **Evidence Traceability (Rule 4)**: Every career claim is strictly anchored to verifiable repository commits, official PRs, README artifacts, or explicit candidate confirmation.
2. **Zero Fabrication (Rule 5)**: The platform never invents skills, experiences, job titles, metrics, or achievements.
3. **Untrusted Data Isolation (Rule 6)**: Public repository descriptions, READMEs, commit messages, and issues are treated as untrusted data and strictly quarantined from agent instructions via `UntrustedDataGuard`.
4. **Honest Authorship & Ownership Clarification (Phase 1 Step 5)**: Repository existence is never conflated with personal authorship. Forked repositories or repos without author-matched commits default to `uncertain_ownership` and prompt the candidate for clarification before entering the approved profile.
5. **Persistent Relational Storage (Phase 1 Step 2)**: Powered by Node.js 22 native SQLite (`node:sqlite` `DatabaseSync` in WAL mode) at `./data/living-resume.sqlite` with deterministic SHA-256 fingerprint deduplication and zero silent fallback to volatile memory.

---

## Architecture Overview

```
                      +---------------------------------------+
                      |       Client (React + TypeScript)     |
                      |  - Foliovera Editorial Workspace      |
                      |  - Live GitHub Intelligence Sync      |
                      |  - Review Queue & Ownership Clarifier |
                      |  - Traceability Matrix & Resume Studio|
                      +-------------------+-------------------+
                                          |
                                          | HTTP / JSON API
                                          v
                      +---------------------------------------+
                      |       Server (Node.js + Express)      |
                      |  - POST /api/github/sync              |
                      |  - GET/PUT /api/profile               |
                      |  - GET/PATCH/DELETE /api/claims       |
                      |  - POST /api/claims/:id/verify        |
                      |  - POST /api/resume/generate          |
                      +---------+-------------------+---------+
                                |                   |
                 +--------------+                   +-------------+
                 |                                                |
                 v                                                v
  +------------------------------+                 +------------------------------+
  |  GitHubSyncOrchestrator      |                 | PersistentSqliteStorage      |
  | - Official GitHub REST API   |                 | - Native node:sqlite (WAL)   |
  | - UntrustedDataGuard Scan    |                 | - SHA-256 Deduplication      |
  | - Deterministic Extractor    |                 | - Schema Validation          |
  +------------------------------+                 +------------------------------+
```

---

## Quick Start & Verified Commands

### Development
```bash
# Start full-stack Foliovera server (port 3000)
npm run dev
```

### Type Checking & Linting
```bash
# Validates TypeScript types across frontend and backend
npm run typecheck
# or
npm run lint
```

### Automated Testing
```bash
# Executes unit, persistence, GitHub sync, and security tests using Node test runner
npm test
```

### Production Build
```bash
# Builds optimized client bundle in /dist
npm run build
```

---

## Storage & Recovery Documentation

- **Local Development & Default Persistent Database**: `./data/living-resume.sqlite` (override via `SQLITE_DB_PATH`).
- **Cloud Run Deployment & Storage Durability**:
  - Production startup executes `node server.ts` using Node.js 22 native ESM + TypeScript strip-types with explicit `.ts` relative specifiers and `import type` declarations.
  - On Google Cloud Run, the container root filesystem (`./data/living-resume.sqlite`) persists across requests within an active container instance, but is **ephemeral across container instance replacements or scale-to-zero events**.
  - For durable multi-instance production persistence on Cloud Run, either mount a persistent volume (e.g., Cloud Storage FUSE / Filestore) and point `SQLITE_DB_PATH` to the mounted directory, or implement a managed Cloud SQL / PostgreSQL `StorageAdapter`. Foliovera never silently falls back to volatile `:memory:` storage if the configured path is unwritable.
- **Schema Migrations**: Tracked in the `schema_migrations` table (`version = 1`).
- **Backup & Recovery**:
  - **UI Export**: Navigate to **Settings → Export / Backup Career Vault** to download `foliovera-verified-backup-YYYY-MM-DD.json`.
  - **Database Snapshot**: Copy `./data/living-resume.sqlite` while the server is stopped or use SQLite `.backup`.
  - **Clean Re-initialization**: Delete `./data/living-resume.sqlite` and restart the server to re-run schema creation and seed initialization.
