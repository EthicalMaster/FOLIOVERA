# Foliovera — System Architecture & Engineering Specification

**Document Version:** 2.0.0 (Phase 1: GitHub Intelligence & Persistent Evidence System + Foliovera Rebrand)  
**Repository Name:** `foliovera`  
**Tagline:** *Your career, always current.*

---

## 1. System Architecture & End-to-End Data Flow

Foliovera separates deterministic verifiable evidence from optional AI-assisted synthesis.

### Data Flow Pipeline
```
[Official GitHub REST API (api.github.com)]
   ├── Public User Profile (/users/:username)
   ├── Public Repositories (/users/:username/repos)
   ├── Repository Languages (/repos/:owner/:repo/languages)
   ├── Repository README (/repos/:owner/:repo/readme)
   └── Author-Matched Commits (/repos/:owner/:repo/commits?author=:username)
           │
           ▼
[UntrustedDataGuard (Security Boundary — Rule 6)]
   ├── Length ceiling enforcement (Max 32KB per snippet)
   ├── Prompt Injection regex scanner (instruction overrides, role escalation, <system> tags)
   ├── Neutralization tagger ([DEFUSED_UNTRUSTED_SEQUENCE:*])
   └── Quarantines malicious READMEs/commits so zero claims are extracted from injected payloads
           │
           ▼
[CareerEvidenceExtractor (Deterministic-First — Rule 9)]
   ├── Creates EvidenceSource records for repo metadata, language distributions, READMEs, and commits
   ├── Evaluates authorship & contribution ownership:
   │     • Non-fork + author commits > 0 -> ownershipStatus = 'verified_author'
   │     • Fork or 0 matched author commits -> ownershipStatus = 'uncertain_ownership' + clarificationPrompt
   └── Emits CareerClaim records in 'discovered' or 'pending_review' state
           │
           ▼
[PersistentSqliteStorageAdapter (node:sqlite WAL — Step 2)]
   ├── Normalized relational tables:
   │     career_profiles, repositories, evidence_vault, career_claims, sync_history, audit_logs
   ├── SchemaValidator enforces Rule 4 (every claim must reference >= 1 existing EvidenceSource ID)
   └── Deterministic SHA-256 fingerprint prevents duplicate claims/evidence on repeated syncs
           │
           ▼
[Human-in-the-Loop Review Queue & Claims Matrix (Step 5)]
   ├── Explicit 4-stage lifecycle: Discovered -> Pending Review -> Approved | Rejected
   ├── Candidate clarifies personal contribution on uncertain_ownership claims
   └── Approved claims promote verified skills & projects into the active Career Profile
           │
           ▼
[Resume Studio Engine (Step 6)]
   ├── Strictly filters to Approved claims only (isClaimApproved)
   └── Exports role-tailored ATS resumes with source evidence citations
```

---

## 2. Persistent Storage Architecture (`server/storage/persistent-storage.ts`)

### Local Development vs. Production Storage
- **Default Persistent Engine (`STORAGE_DRIVER=sqlite` or unset)**: Uses Node 22's built-in `node:sqlite` (`DatabaseSync`) storing relational tables on disk at `./data/living-resume.sqlite` (retained default filename for backward compatibility; configurable via `SQLITE_DB_PATH`).
- **Isolated Test Engine (`STORAGE_DRIVER=in-memory`)**: Used only when explicitly requested by fast isolated unit tests.
- **No Silent Volatile Fallback**: If persistent SQLite initialization fails, `PersistentSqliteStorageAdapter` throws an explicit startup error rather than silently degrading to an ephemeral in-memory store.

### Deduplication & Idempotency
- Every `EvidenceSource` and `CareerClaim` computes a deterministic SHA-256 `fingerprint` (`server/storage/schema-validator.ts`) from normalized provenance (`type`, `repository`, `commitSha`, `title` or `category`, `repositoryRef`, `statement`).
- Re-running `POST /api/github/sync` for the same GitHub user updates repository metadata and increments `duplicatesSkipped` without creating duplicate evidence or claims.

---

## 3. Security & Anti-Hallucination Boundaries

| Threat Vector | Mitigation Strategy | Implemented Component |
| :--- | :--- | :--- |
| **Prompt Injection via README/Commit** | Regex scanner neutralizes override tokens; `CareerEvidenceExtractor` aborts claim extraction on flagged READMEs and quarantines the evidence record | `server/security/untrusted-data-guard.ts`, `server/services/evidence-extractor.ts` |
| **Credential Exfiltration** | `GITHUB_TOKEN` and `GEMINI_API_KEY` remain strictly server-side; `GitHubIntegrationService.redactSecrets()` scrubs token patterns from all error messages | `server/services/github-service.ts`, `.env.example` |
| **Overstating Repository Authorship** | Forks or repositories with 0 matched author commits are marked `uncertain_ownership` and require candidate clarification in the Review Queue | `server/services/evidence-extractor.ts`, `src/components/ReviewQueueView.tsx` |
| **Unapproved Claims in Resumes** | `/api/resume/generate` enforces `isClaimApproved(c)` and rejects any `discovered`, `pending_review`, or `rejected` claim | `server/api/router.ts` |
