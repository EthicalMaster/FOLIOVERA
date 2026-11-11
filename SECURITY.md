# Foliovera — Security Policy & Invariants

This document outlines the security architecture, threat model, and anti-tampering invariants enforced by the **Foliovera** (`foliovera`) codebase.

---

## 1. Core Security Invariants

### Invariant 1: Untrusted Data Quarantine (Rule 6)
Public GitHub repositories, README files, commits, pull requests, issue threads, and user-uploaded text files are treated strictly as **untrusted data**.
- No external text is ever interpolated directly into AI model system instructions.
- All external inputs pass through `UntrustedDataGuard.sanitize()`, which detects and defuses prompt injection vectors (e.g., `ignore previous instructions`, `<system>` tag spoofing, roleplay escalation, and fake HR override instructions).
- When `UntrustedDataGuard` detects an injection pattern in a synced repository README or commit message, `CareerEvidenceExtractor` quarantines the evidence item (`verificationStatus = 'rejected'`) and refuses to extract career claims from it.

### Invariant 2: Zero Secret Exposure & Log Redaction (Rule 3)
- API keys (`GEMINI_API_KEY`, `GITHUB_TOKEN`, database paths) are stored strictly on the server side in environment variables.
- No secrets use the `VITE_` prefix, preventing accidental bundling into client JavaScript.
- `GitHubIntegrationService.redactSecrets()` scrubs `ghp_*`, `github_pat_*`, and `Bearer` tokens from all thrown errors and HTTP responses.

### Invariant 3: Honest Verification & Anti-Fabrication Boundary (Rule 4 & Rule 5)
- Existence of a repository on GitHub does **not** automatically prove personal authorship of every claim inside its README.
- Forked repositories or repositories without author-matched commits are flagged as `uncertain_ownership` and require human clarification before approval.
- The resume generation pipeline (`/api/resume/generate`) strictly filters to approved claims (`isClaimApproved(claim)`) and excludes `discovered`, `pending_review`, and `rejected` claims.

### Invariant 4: No Autonomous External Modification (Rule 12)
- Foliovera operates on a **Read-Only / Human-Supervised** model.
- The application never modifies external GitHub repositories, never pushes commits, and never automatically publishes resumes or job applications.
