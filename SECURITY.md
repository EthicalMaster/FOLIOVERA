# Foliovera — Security Policy & Invariants (Phase 1.5)

This document outlines the security architecture, authentication and authorization invariants, Firestore security rules, and anti-tampering defenses enforced by the **Foliovera** (`EthicalMaster/FOLIOVERA`) codebase.

---

## 1. Authentication & Single-Owner Authorization (Phase 1.5)

### Invariant 1: Server-Side Firebase ID Token Verification
- All private API routes (`/api/profile`, `/api/claims/*`, `/api/evidence`, `/api/github/*`, `/api/resume/generate`, `/api/security/scan`, `/api/audit-logs`, `/api/profile/export`, `/api/profile/import`) are protected by `createOwnerAuthMiddleware` (`server/security/auth-middleware.ts`).
- Every request must present an `Authorization: Bearer <firebase_id_token>` header.
- Tokens are verified cryptographically server-side using the Firebase Admin SDK (`getAuth().verifyIdToken(token, true)`).
- Missing tokens return `401 AUTH_REQUIRED`; expired tokens return `401 AUTH_TOKEN_EXPIRED`; malformed or invalid tokens return `401 AUTH_TOKEN_INVALID`.

### Invariant 2: Fail-Closed Single-Owner MVP Authorization
- Foliovera is a private personal career intelligence vault.
- Even if a third party signs in with a valid Google account, `evaluateOwnerAuthorization()` checks the verified token against `FOLIOVERA_OWNER_UID` and `FOLIOVERA_OWNER_EMAIL`.
- Non-owner accounts are rejected with `403 FORBIDDEN_NOT_OWNER`.
- If owner authorization configuration is missing or empty, the server **fails closed** (`503 AUTH_CONFIG_ERROR`) and denies access rather than falling back to public access.

### Invariant 3: Cloud Firestore Security Rules (`firestore.rules`)
- Deployed Firestore security rules enforce strict `isOwner(userId)` checks across `/users/{userId}` and all subcollections (`claims`, `evidence`, `repositories`, `syncHistory`, `auditLogs`).
- Every document write validates `ownerUid == request.auth.uid`, string length bounds, and required provenance fields.
- Default catch-all rule (`match /{document=**}`) denies all unspecified reads and writes.

---

## 2. Data Provenance & Sample Data Isolation

### Invariant 4: Strict Sample Data Isolation
- Reference sample data (`SAMPLE_CAREER_PROFILE` — *Alex Morgan*) is marked with `isSampleData: true` and served strictly from the read-only `/api/demo/profile` endpoint.
- Authenticated owners receive a clean, non-sample profile (`createEmptyOwnerProfile`, `isSampleData: false`) bound to their `ownerUid`.
- `POST /api/profile/import` and `POST /api/resume/generate` explicitly reject sample records (`isSampleData: true` or sample repository references) from entering real user profiles or generated resumes.

### Invariant 5: Untrusted Data Quarantine (Rule 6)
- Public GitHub repositories, README files, commits, pull requests, and uploaded text snippets are treated strictly as **untrusted data**.
- All external inputs pass through `UntrustedDataGuard.sanitize()`, which detects and neutralizes prompt injection vectors (`ignore previous instructions`, `<system>` tag spoofing, roleplay escalation, fake HR override instructions).
- Quarantined evidence (`verificationStatus = 'rejected'`) is never used for claim extraction or resume synthesis.

### Invariant 6: Honest Verification & Anti-Fabrication Boundary (Rule 4 & Rule 5)
- Forked repositories or repositories without author-matched commits are flagged as `uncertain_ownership` and require explicit candidate clarification before approval.
- The resume generation pipeline (`/api/resume/generate`) strictly filters to approved claims (`isClaimApproved(claim)`) and excludes `discovered`, `pending_review`, and `rejected` claims.

---

## 3. API Abuse Prevention & Secret Redaction

### Invariant 7: Rate Limiting & Input Validation (`server/security/api-protection.ts`)
- Expensive operations are protected by sliding-window rate limiters:
  - `POST /api/resume/generate`: 10 requests / minute
  - `POST /api/github/sync`: 8 requests / minute
  - `POST /api/profile/import`: 6 requests / minute
  - General mutating routes: 60 requests / minute
- Request bodies are bounded to `512kb` and validated for field types, string lengths, and allowed enum values.

### Invariant 8: Zero Secret Exposure & Log Redaction (Rule 3)
- API keys (`GEMINI_API_KEY`, `GITHUB_TOKEN`, service account credentials) are kept strictly server-side.
- `redactSecrets()` scrubs `ghp_*`, `github_pat_*`, `AIza*`, and `Bearer` tokens from all error messages and logs before returning HTTP responses.
