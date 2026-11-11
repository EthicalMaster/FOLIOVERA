# Foliovera — Phase 0 Payload-First Firestore Security Specification

## 1. Data Invariants
1. **Strict Owner Isolation**: Every document in `/users/{userId}` and its subcollections (`claims`, `evidence`, `repositories`, `syncHistory`, `auditLogs`) belongs exclusively to `userId` (`request.auth.uid == userId`) and requires `request.auth.token.email_verified == true`.
2. **Master Gate Invariant**: Subcollection documents (`/users/{userId}/claims/{claimId}`, etc.) require the parent `/users/{userId}` document to exist (`exists(/databases/$(database)/documents/users/$(userId))`) and `incoming().ownerUid == request.auth.uid`.
3. **Immutable Ownership & Identity**: `id` and `ownerUid` cannot be changed after creation (`incoming().ownerUid == existing().ownerUid && incoming().id == existing().id`).
4. **Sample Data Isolation**: A real user profile in `/users/{userId}` must have `isSampleData == false` so demonstration data never enters durable production user records.
5. **Bounded Strings & Lists**: All string and list fields have explicit `.size()` maximums matching `firebase-blueprint.json`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Profile Read**: `auth = null`, `GET /users/user_1` -> `PERMISSION_DENIED`
2. **Cross-Tenant Profile Read (PII Leak)**: `auth.uid = 'attacker_1'`, `GET /users/owner_1` -> `PERMISSION_DENIED`
3. **Unverified Email Write**: `auth.uid = 'owner_1', email_verified = false`, `CREATE /users/owner_1` -> `PERMISSION_DENIED`
4. **Owner Spoofing on Create**: `auth.uid = 'owner_1'`, `CREATE /users/owner_1` with `{ ownerUid: 'victim_2' }` -> `PERMISSION_DENIED`
5. **Sample Data Injection into Real Profile**: `auth.uid = 'owner_1'`, `CREATE /users/owner_1` with `{ isSampleData: true }` -> `PERMISSION_DENIED`
6. **Shadow Field Injection on Profile Update**: `auth.uid = 'owner_1'`, `UPDATE /users/owner_1` adding `{ isAdmin: true }` -> `PERMISSION_DENIED`
7. **Orphaned Claim Write (No Parent Profile)**: `auth.uid = 'ghost_1'`, `CREATE /users/ghost_1/claims/claim_1` when `/users/ghost_1` does not exist -> `PERMISSION_DENIED`
8. **ID Poisoning Attack**: `auth.uid = 'owner_1'`, `CREATE /users/owner_1/claims/invalid$id!@#` -> `PERMISSION_DENIED`
9. **Denial-of-Wallet Oversized Claim Statement**: `auth.uid = 'owner_1'`, `CREATE /users/owner_1/claims/claim_1` with 5,000-char `statement` (> 1000 max) -> `PERMISSION_DENIED`
10. **Immutable Owner Mutation on Claim Update**: `auth.uid = 'owner_1'`, `UPDATE /users/owner_1/claims/claim_1` changing `ownerUid` to `'other'` -> `PERMISSION_DENIED`
11. **Audit Log Tampering / Deletion**: `auth.uid = 'owner_1'`, `UPDATE` or `DELETE /users/owner_1/auditLogs/log_1` -> `PERMISSION_DENIED` (Audit logs are append-only)
12. **Cross-Tenant List Scraping on Claims**: `auth.uid = 'attacker_1'`, `LIST /users/owner_1/claims` -> `PERMISSION_DENIED`
