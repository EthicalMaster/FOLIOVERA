# Foliovera — System Architecture & Engineering Specification

**Document Version:** 2.5.0 (Phase 1.5: Production Security, Identity & Durable Career Storage)  
**Repository:** `EthicalMaster/FOLIOVERA`  
**Tagline:** *Your career, always current.*

---

## 1. System Architecture & End-to-End Data Flow

Foliovera combines cryptographic identity verification (Firebase Authentication), durable cloud document persistence (Cloud Firestore), and deterministic provenance extraction with optional Gemini AI resume synthesis.

### Data Flow & Security Pipeline
```
[Client Browser (React 19 + TypeScript + Firebase Auth SDK)]
   ├── Google Sign-In Popup (signInWithPopup) -> Firebase ID Token
   ├── Automatic Bearer Token Injection (src/lib/api-client.ts)
   └── Isolated Read-Only Demo Sandbox (/api/demo/profile)
           │
           ▼
[Express Security Gateway (server/security/auth-middleware.ts & api-protection.ts)]
   ├── Firebase Admin ID Token Verification (firebase-admin/auth)
   ├── Single-User MVP Owner Authorization (FOLIOVERA_OWNER_UID / FOLIOVERA_OWNER_EMAIL)
   ├── Sliding-Window Rate Limiter & Input Payload Validation
   └── Secret Redaction (scrubbing ghp_*, github_pat_*, AIza*, Bearer tokens)
           │
           ▼
[GitHubSyncOrchestrator & UntrustedDataGuard (Rule 6)]
   ├── Official GitHub REST API (api.github.com)
   ├── Prompt Injection Scanner & Quarantine ([DEFUSED_UNTRUSTED_SEQUENCE:*])
   └── CareerEvidenceExtractor (verified_author vs. uncertain_ownership)
           │
           ▼
[Replaceable StorageAdapter Layer (server/storage/storage.interface.ts)]
   ├── Production Default: FirestoreStorageAdapter (server/storage/firestore-storage.ts)
   │     • Cloud Firestore Database: ai-studio-livingresumeagen-782346cd-b534-4b21-898d-4ccf402003ee
   │     • Document hierarchy: /users/{ownerUid} + subcollections (claims, evidence, repositories, syncHistory, auditLogs)
   │     • Enforced by deployed firestore.rules & SchemaValidator
   ├── Local Development: PersistentSqliteStorageAdapter (node:sqlite WAL)
   └── Isolated Testing: InMemoryStorageAdapter
           │
           ▼
[Resume Studio Engine (POST /api/resume/generate)]
   ├── Strictly filters to Approved claims only (isClaimApproved)
   ├── Blocks sample data (isSampleData: true) from entering owner resumes
   └── Persists generated ResumeVersion records durably in Cloud Firestore
```

---

## 2. Cloud Firestore Data Model (`server/storage/firestore-storage.ts`)

| Collection / Document Path | Purpose | Key Enforced Fields |
| :--- | :--- | :--- |
| `/users/{ownerUid}` | Root career profile document | `id`, `ownerUid`, `isSampleData: false`, `candidateName`, `headline`, `summary`, `skills`, `experiences`, `projects`, `education`, `resumeVersions`, `settings` |
| `/users/{ownerUid}/claims/{claimId}` | Extracted and user-verified career claims | `id`, `ownerUid`, `category`, `statement`, `evidenceIds`, `verificationStatus`, `lifecycleState`, `fingerprint` |
| `/users/{ownerUid}/evidence/{evidenceId}` | Cryptographic provenance & artifacts | `id`, `ownerUid`, `type`, `title`, `uri`, `contentHash`, `provenance`, `securityScan`, `verificationStatus`, `fingerprint` |
| `/users/{ownerUid}/repositories/{repoId}` | Synchronized GitHub repository metadata | `id`, `ownerUid`, `fullName`, `htmlUrl`, `fork`, `languages`, `commitCountByUser`, `lastSyncedAt` |
| `/users/{ownerUid}/syncHistory/{syncId}` | GitHub synchronization audit records | `id`, `ownerUid`, `username`, `status`, `repositoriesScanned`, `newClaimsCount`, `duplicatesSkipped` |
| `/users/{ownerUid}/auditLogs/{logId}` | Immutable verification & mutation trail | `id`, `ownerUid`, `timestamp`, `actor`, `action`, `targetId`, `note` |

---

## 3. Storage Durability & Migration Strategy

1. **Production Cloud Durability (`STORAGE_DRIVER=firestore`)**:
   - Survives Cloud Run container restarts, scale-to-zero events, and new revision deployments.
   - Never silently degrades to volatile memory; if Firestore is unreachable, `FirestoreStorageAdapter` throws `StorageOperationError` (`503 STORAGE_OPERATION_FAILED`).
2. **Sample Data Isolation**:
   - `SAMPLE_CAREER_PROFILE` (*Alex Morgan*) is strictly isolated to `GET /api/demo/profile` (`isSampleData: true`).
   - Newly authenticated owners automatically receive a clean empty profile (`createEmptyOwnerProfile`, `isSampleData: false`).
3. **Export / Import Migration (`GET /api/profile/export`, `POST /api/profile/import`)**:
   - Allows exporting existing SQLite or Firestore career vaults as portable JSON bundles (`ProfileExportBundle`) and importing them into Cloud Firestore while preserving claim verification states (`user_confirmed`, `pending_review`, `rejected`), review history, and evidence links.
