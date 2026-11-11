# Foliovera (`EthicalMaster/FOLIOVERA`)

> **Your career, always current.**  
> An AI-powered career intelligence platform that transforms verified achievements into living professional profiles and tailored resumes.

Foliovera (formerly *Living Resume Agent*) is engineered with **Firebase Authentication (Google Sign-In)**, **Single-Owner MVP Authorization**, **Cloud Firestore durable storage**, strict source provenance, and prompt-injection security boundaries.

---

## Core Engineering & Security Principles

1. **Cryptographic Identity & Owner-Only Authorization (Phase 1.5)**:
   - All private profile reads, claim verifications, GitHub syncs, and Gemini resume generations require a valid Firebase ID token verified server-side (`firebase-admin/auth`).
   - Single-owner MVP access policy (`FOLIOVERA_OWNER_EMAIL` / `FOLIOVERA_OWNER_UID`) rejects unauthorized accounts (`403 FORBIDDEN_NOT_OWNER`) and fails closed if misconfigured.
2. **Durable Cloud Persistence (`FirestoreStorageAdapter`)**:
   - Production career profiles, verified claims, evidence vaults, sync history, and generated resume versions are stored durably in **Cloud Firestore** (`/users/{ownerUid}` and subcollections), surviving Cloud Run deployments and container restarts.
   - Local development and offline test suites remain supported via `PersistentSqliteStorageAdapter` (`node:sqlite` WAL) and `InMemoryStorageAdapter`.
3. **Strict Sample Data Isolation**:
   - Reference sample data (*Alex Morgan*) is isolated to the read-only Demo Sandbox (`/api/demo/profile`) and blocked from entering real owner profiles or generated resumes.
4. **Evidence Traceability & Zero Fabrication (Rules 4 & 5)**:
   - Every career claim must reference at least one verifiable `EvidenceSource` ID. Only approved claims (`isClaimApproved`) are eligible for resume generation.
5. **Untrusted Data Quarantine (Rule 6)**:
   - Repository descriptions, READMEs, and commits are scanned by `UntrustedDataGuard` before claim extraction or AI synthesis.

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
# Lint Firestore security rules
npx eslint firestore.rules
```

### Automated Testing
```bash
# Executes all unit, security, authentication, Firestore persistence, and GitHub sync tests
npm test
```

### Production Build & Startup
```bash
# Builds optimized client bundle in /dist
npm run build
# Starts production Node 22 server
npm start
```

---

## Environment & Firebase Configuration

See [`.env.example`](./.env.example) for all supported environment variables:

| Variable | Description |
| :--- | :--- |
| `FOLIOVERA_OWNER_EMAIL` | Authorized owner email address for single-user MVP access (default: `saifeetaher5@gmail.com`) |
| `FOLIOVERA_OWNER_UID` | Optional authorized Firebase UID for single-user MVP access |
| `STORAGE_DRIVER` | `firestore` (production default), `sqlite` (local file DB), or `in-memory` (unit tests) |
| `GEMINI_API_KEY` | Server-side Gemini API key for AI-assisted resume tailoring |
| `GITHUB_TOKEN` | Optional server-side fine-grained GitHub PAT for higher public API rate limits |
