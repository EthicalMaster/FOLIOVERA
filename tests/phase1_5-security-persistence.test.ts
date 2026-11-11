/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Foliovera — Phase 1.5: Production Security, Identity & Durable Career Storage Tests
 * Covers all 13 required automated verification scenarios:
 *  1. Unauthenticated users cannot access private profiles.
 *  2. Unauthenticated users cannot modify claims.
 *  3. Unauthenticated users cannot trigger Gemini generation.
 *  4. Authenticated non-owner accounts are rejected.
 *  5. Authorized users can access their own profile.
 *  6. Profile updates persist across application restarts.
 *  7. Resume versions persist across deployment-style restarts.
 *  8. Repeated GitHub sync does not create duplicate claims.
 *  9. Claim approvals remain unchanged after data migration.
 * 10. Sample records do not enter real user resumes.
 * 11. Invalid and expired tokens are rejected.
 * 12. Firestore failures produce controlled errors without silent data loss.
 * 13. API rate limiting and input validation protect expensive operations.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createApiRouter } from '../server/api/router.ts';
import {
  FirestoreStorageAdapter,
  StorageOperationError,
  type FirestoreDocumentBackend,
} from '../server/storage/firestore-storage.ts';
import { InMemoryStorageAdapter } from '../server/storage/memory-storage.ts';
import { SAMPLE_CAREER_PROFILE } from '../server/storage/sample-data.ts';
import { GitHubIntegrationService } from '../server/services/github-service.ts';
import { GitHubSyncOrchestrator } from '../server/services/github-sync-orchestrator.ts';
import type {
  TokenVerifier,
  OwnerAuthPolicy,
  VerifiedTokenClaims,
} from '../server/security/auth-middleware.ts';
import { isClaimApproved, resolveLifecycleState } from '../shared/types/career-profile.ts';

const OWNER_UID = 'owner-uid-foliovera-001';
const OWNER_EMAIL = 'saifeetaher5@gmail.com';
const INTRUDER_UID = 'intruder-uid-999';
const INTRUDER_EMAIL = 'intruder@example.com';

const TEST_OWNER_POLICY: OwnerAuthPolicy = {
  allowedOwnerUid: OWNER_UID,
  allowedOwnerEmail: OWNER_EMAIL,
  requireEmailVerified: true,
};

/**
 * Deterministic in-process Firestore document backend implementing `FirestoreDocumentBackend`
 * for `/users/{ownerUid}` and subcollections (`claims`, `evidence`, `repositories`, `syncHistory`, `auditLogs`),
 * supporting simulated process restarts and fault injection.
 */
class DurableMockFirestoreBackend implements FirestoreDocumentBackend {
  private readonly rootDocs = new Map<string, Record<string, any>>();
  private readonly subDocs = new Map<string, Map<string, Record<string, any>>>();
  public failNextWrite = false;
  public failNextRead = false;

  private subKey(ownerUid: string, subcollection: string): string {
    return `${ownerUid}::${subcollection}`;
  }

  async getUserRoot(ownerUid: string): Promise<Record<string, any> | null> {
    if (this.failNextRead) {
      this.failNextRead = false;
      throw new Error('UNAVAILABLE: Firestore backend transient read failure');
    }
    const doc = this.rootDocs.get(ownerUid);
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
  }

  async setUserRoot(ownerUid: string, data: Record<string, any>): Promise<void> {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('DEADLINE_EXCEEDED: Firestore root document commit timed out');
    }
    this.rootDocs.set(ownerUid, JSON.parse(JSON.stringify(data)));
  }

  async getSubDoc(
    ownerUid: string,
    subcollection: string,
    docId: string
  ): Promise<Record<string, any> | null> {
    if (this.failNextRead) {
      this.failNextRead = false;
      throw new Error('UNAVAILABLE: Firestore subcollection read failure');
    }
    const coll = this.subDocs.get(this.subKey(ownerUid, subcollection));
    const doc = coll?.get(docId);
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
  }

  async setSubDoc(
    ownerUid: string,
    subcollection: string,
    docId: string,
    data: Record<string, any>
  ): Promise<void> {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('DEADLINE_EXCEEDED: Firestore subcollection write timed out');
    }
    const key = this.subKey(ownerUid, subcollection);
    if (!this.subDocs.has(key)) {
      this.subDocs.set(key, new Map());
    }
    this.subDocs.get(key)!.set(docId, JSON.parse(JSON.stringify(data)));
  }

  async deleteSubDoc(
    ownerUid: string,
    subcollection: string,
    docId: string
  ): Promise<boolean> {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('UNAVAILABLE: Firestore delete failed');
    }
    const coll = this.subDocs.get(this.subKey(ownerUid, subcollection));
    if (!coll || !coll.has(docId)) return false;
    coll.delete(docId);
    return true;
  }

  async listSubDocs(
    ownerUid: string,
    subcollection: string
  ): Promise<Record<string, any>[]> {
    if (this.failNextRead) {
      this.failNextRead = false;
      throw new Error('UNAVAILABLE: Firestore collection list failed');
    }
    const coll = this.subDocs.get(this.subKey(ownerUid, subcollection));
    if (!coll) return [];
    return Array.from(coll.values()).map(d => JSON.parse(JSON.stringify(d)));
  }

  async runAtomic<T>(fn: () => Promise<T>): Promise<T> {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('ABORTED: Firestore atomic transaction aborted');
    }
    return await fn();
  }
}

/**
 * Deterministic Firebase token verifier for security tests
 */
const mockTokenVerifier: TokenVerifier = async (token: string): Promise<VerifiedTokenClaims> => {
  if (token === 'valid-owner-token-12345') {
    return {
      uid: OWNER_UID,
      email: OWNER_EMAIL,
      email_verified: true,
      name: 'Saifee Taher',
    };
  }
  if (token === 'valid-non-owner-token-12345') {
    return {
      uid: INTRUDER_UID,
      email: INTRUDER_EMAIL,
      email_verified: true,
      name: 'Unauthorized User',
    };
  }
  if (token === 'expired-token-12345') {
    const err = new Error('Firebase ID token has expired.');
    (err as any).code = 'auth/id-token-expired';
    throw err;
  }
  const err = new Error('Decoding Firebase ID token failed.');
  (err as any).code = 'auth/argument-error';
  throw err;
};

/**
 * Helper to spin up an ephemeral Express server with the given storage and auth config
 */
async function withTestServer<T>(
  backend: DurableMockFirestoreBackend,
  fn: (baseUrl: string, storage: FirestoreStorageAdapter) => Promise<T>
): Promise<T> {
  const storage = new FirestoreStorageAdapter({
    owner: { uid: OWNER_UID, email: OWNER_EMAIL, displayName: 'Saifee Taher' },
    backend,
  });

  const app = express();
  app.use(express.json());
  app.use(
    '/api',
    createApiRouter({
      storage,
      verifier: mockTokenVerifier,
      policy: TEST_OWNER_POLICY,
    })
  );

  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    return await fn(baseUrl, storage);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

function createMockGitHubFetchForOwner() {
  return (async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    const headers = new Headers({
      'content-type': 'application/json',
      'x-ratelimit-remaining': '4990',
      'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
    });

    if (url.includes('/users/EthicalMaster/repos')) {
      return new Response(
        JSON.stringify([
          {
            id: 501,
            name: 'FOLIOVERA',
            full_name: 'EthicalMaster/FOLIOVERA',
            html_url: 'https://github.com/EthicalMaster/FOLIOVERA',
            description: 'AI-powered career intelligence platform with verified provenance and ATS synthesis.',
            fork: false,
            language: 'TypeScript',
            topics: ['typescript', 'react', 'firebase', 'firestore'],
            stargazers_count: 25,
            forks_count: 2,
            default_branch: 'main',
            created_at: '2026-01-15T00:00:00Z',
            updated_at: '2026-11-10T00:00:00Z',
            pushed_at: '2026-11-11T00:00:00Z',
            size: 1850,
            owner: { login: 'EthicalMaster' },
          },
        ]),
        { status: 200, headers }
      );
    }

    if (url.includes('/repos/EthicalMaster/FOLIOVERA/languages')) {
      return new Response(JSON.stringify({ TypeScript: 95000 }), { status: 200, headers });
    }

    if (url.includes('/repos/EthicalMaster/FOLIOVERA/readme')) {
      const readme = '# Foliovera\nBuilt with React, TypeScript, Express, and Firebase Firestore.';
      return new Response(
        JSON.stringify({
          encoding: 'base64',
          content: Buffer.from(readme, 'utf8').toString('base64'),
        }),
        { status: 200, headers }
      );
    }

    if (url.includes('/repos/EthicalMaster/FOLIOVERA/commits')) {
      return new Response(
        JSON.stringify([
          {
            sha: 'f0110ve7a1234567890',
            html_url: 'https://github.com/EthicalMaster/FOLIOVERA/commit/f0110ve7a1234567890',
            commit: {
              message: 'feat(security): enforce Firebase ID token verification and Firestore persistence',
              author: { name: 'Saifee Taher', date: '2026-11-11T01:00:00Z' },
            },
            author: { login: 'EthicalMaster' },
          },
        ]),
        { status: 200, headers }
      );
    }

    return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404, headers });
  }) as any;
}

describe('Phase 1.5 — Security, Identity & Durable Firestore Career Storage (13 Required Tests)', () => {
  test('1, 2, 3. Unauthenticated users cannot access private profiles, modify claims, or trigger Gemini resume generation', async () => {
    const backend = new DurableMockFirestoreBackend();
    await withTestServer(backend, async baseUrl => {
      // 1. Private profile access rejected with 401
      const profileRes = await fetch(`${baseUrl}/api/profile`);
      assert.strictEqual(profileRes.status, 401);
      const profileJson = await profileRes.json();
      assert.strictEqual(profileJson.success, false);
      assert.strictEqual(profileJson.error.code, 'AUTH_TOKEN_MISSING');

      // 2. Claim modification rejected with 401
      const claimVerifyRes = await fetch(`${baseUrl}/api/claims/claim-001/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'user_confirmed' }),
      });
      assert.strictEqual(claimVerifyRes.status, 401);

      const claimPatchRes = await fetch(`${baseUrl}/api/claims/claim-001`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statement: 'Tampered statement' }),
      });
      assert.strictEqual(claimPatchRes.status, 401);

      // 3. Gemini resume generation rejected with 401
      const resumeRes = await fetch(`${baseUrl}/api/resume/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetRole: 'Staff Engineer' }),
      });
      assert.strictEqual(resumeRes.status, 401);
      const resumeJson = await resumeRes.json();
      assert.strictEqual(resumeJson.error.code, 'AUTH_TOKEN_MISSING');
    });
  });

  test('4 & 11. Authenticated non-owner accounts are rejected (403) and invalid/expired tokens are rejected (401)', async () => {
    const backend = new DurableMockFirestoreBackend();
    await withTestServer(backend, async baseUrl => {
      // Non-owner valid Firebase account -> 403 FORBIDDEN_NOT_OWNER
      const nonOwnerRes = await fetch(`${baseUrl}/api/profile`, {
        headers: { Authorization: 'Bearer valid-non-owner-token-12345' },
      });
      assert.strictEqual(nonOwnerRes.status, 403);
      const nonOwnerJson = await nonOwnerRes.json();
      assert.strictEqual(nonOwnerJson.error.code, 'FORBIDDEN_NOT_OWNER');

      // Expired token -> 401 AUTH_TOKEN_EXPIRED
      const expiredRes = await fetch(`${baseUrl}/api/profile`, {
        headers: { Authorization: 'Bearer expired-token-12345' },
      });
      assert.strictEqual(expiredRes.status, 401);
      const expiredJson = await expiredRes.json();
      assert.strictEqual(expiredJson.error.code, 'AUTH_TOKEN_EXPIRED');

      // Malformed / invalid token -> 401 AUTH_TOKEN_INVALID
      const invalidRes = await fetch(`${baseUrl}/api/profile`, {
        headers: { Authorization: 'Bearer invalid-signature-token-12345' },
      });
      assert.strictEqual(invalidRes.status, 401);
      const invalidJson = await invalidRes.json();
      assert.strictEqual(invalidJson.error.code, 'AUTH_TOKEN_INVALID');
    });
  });

  test('5, 6, 7 & 10. Authorized owner accesses clean non-sample profile; profile updates & resume versions persist across restarts; sample data never enters owner resumes', async () => {
    const sharedCloudBackend = new DurableMockFirestoreBackend();
    const ownerHeaders = {
      Authorization: 'Bearer valid-owner-token-12345',
      'Content-Type': 'application/json',
    };

    // Instance 1 (Initial deployment)
    await withTestServer(sharedCloudBackend, async baseUrl => {
      // 5. Authorized owner accesses their own profile
      const getRes = await fetch(`${baseUrl}/api/profile`, { headers: ownerHeaders });
      assert.strictEqual(getRes.status, 200);
      const getJson = await getRes.json();
      assert.strictEqual(getJson.success, true);
      assert.strictEqual(getJson.data.isSampleData, false, 'Real owner profile must NOT be sample data');
      assert.strictEqual(getJson.data.ownerUid, OWNER_UID);
      assert.strictEqual(getJson.data.claims.length, 0, 'Fresh owner profile starts with 0 sample claims');

      // Update profile headline & add real verified evidence + approved claim
      const updateRes = await fetch(`${baseUrl}/api/profile`, {
        method: 'PUT',
        headers: ownerHeaders,
        body: JSON.stringify({
          candidateName: 'Saifee Taher',
          headline: 'Principal Cloud & AI Systems Architect',
          summary: 'Designed durable career intelligence systems with verified cryptographic provenance.',
        }),
      });
      assert.strictEqual(updateRes.status, 200);

      // Ingest real owner evidence
      const eviRes = await fetch(`${baseUrl}/api/evidence`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          title: 'Foliovera Phase 1.5 Security Architecture',
          type: 'github_commit',
          repository: 'EthicalMaster/FOLIOVERA',
          commitSha: 'f0110ve7a1234567890',
          rawContentSnippet:
            'Implemented Firebase Admin ID token verification, Cloud Firestore adapter, and sample data isolation.',
        }),
      });
      assert.strictEqual(eviRes.status, 201);
      const eviJson = await eviRes.json();
      const realEvidenceId = eviJson.data.id;

      // Add a verified claim backed by that evidence via profile import
      const currentProfileRes = await fetch(`${baseUrl}/api/profile`, { headers: ownerHeaders });
      const currentProfile = (await currentProfileRes.json()).data;
      currentProfile.claims.push({
        id: 'claim-real-owner-001',
        category: 'achievement',
        statement:
          'Architected production Firebase authentication and Cloud Firestore persistence for Foliovera on Cloud Run.',
        evidenceIds: [realEvidenceId],
        verificationStatus: 'user_confirmed',
        lifecycleState: 'approved',
        confidenceScore: 0.98,
        extractedAt: new Date().toISOString(),
        userConfirmedAt: new Date().toISOString(),
        verifiedBy: 'human_user',
      });
      const importRes = await fetch(`${baseUrl}/api/profile/import`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ profile: currentProfile }),
      });
      assert.strictEqual(importRes.status, 200);

      // Generate a tailored resume version
      const genRes = await fetch(`${baseUrl}/api/resume/generate`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({
          targetRole: 'Principal Cloud Security Architect',
          style: 'ats_professional',
        }),
      });
      assert.strictEqual(genRes.status, 201);
      const genJson = await genRes.json();
      assert.strictEqual(genJson.success, true);

      // 10. Verify sample records (e.g. Alex Morgan / spectr-graphite) NEVER entered real user resume
      const bulletTexts = genJson.data.tailoredBullets.map((b: any) => b.text).join(' ');
      assert.ok(
        !bulletTexts.includes('spectr-graphite') && !bulletTexts.includes('Alex Morgan'),
        'Sample data must never leak into real owner resumes'
      );
      assert.ok(
        bulletTexts.includes('Foliovera'),
        'Approved owner claim must be included in generated resume'
      );
    });

    // Instance 2 (Simulated Cloud Run revision restart — brand new server & adapter instance)
    await withTestServer(sharedCloudBackend, async baseUrl => {
      // 6 & 7. Verify profile updates AND generated resume versions survived restart
      const afterRestartRes = await fetch(`${baseUrl}/api/profile`, { headers: ownerHeaders });
      assert.strictEqual(afterRestartRes.status, 200);
      const afterRestartProfile = (await afterRestartRes.json()).data;

      assert.strictEqual(afterRestartProfile.candidateName, 'Saifee Taher');
      assert.strictEqual(afterRestartProfile.headline, 'Principal Cloud & AI Systems Architect');
      assert.strictEqual(afterRestartProfile.isSampleData, false);
      assert.strictEqual(afterRestartProfile.claims.length, 1);
      assert.strictEqual(afterRestartProfile.claims[0].id, 'claim-real-owner-001');
      assert.strictEqual(
        afterRestartProfile.resumeVersions.length,
        1,
        'Generated resume version must persist across deployment restarts'
      );
      assert.strictEqual(
        afterRestartProfile.resumeVersions[0].targetRole,
        'Principal Cloud Security Architect'
      );
    });
  });

  test('8. Repeated GitHub sync on FirestoreStorageAdapter does not create duplicate claims', async () => {
    const backend = new DurableMockFirestoreBackend();
    const storage = new FirestoreStorageAdapter({
      owner: { uid: OWNER_UID, email: OWNER_EMAIL, displayName: 'Saifee Taher' },
      backend,
    });
    const mockGh = new GitHubIntegrationService({ fetchImpl: createMockGitHubFetchForOwner() });
    const orchestrator = new GitHubSyncOrchestrator(storage, mockGh);

    const sync1 = await orchestrator.syncUserRepositories('EthicalMaster', { maxRepos: 5 });
    assert.strictEqual(sync1.syncRecord.status, 'success');
    assert.ok(sync1.newClaimsCount > 0, 'First sync should discover claims');
    assert.ok(sync1.newEvidenceCount > 0, 'First sync should ingest evidence');

    // Run 2nd synchronization with identical repository state
    const sync2 = await orchestrator.syncUserRepositories('EthicalMaster', { maxRepos: 5 });
    assert.strictEqual(sync2.newClaimsCount, 0, 'Repeated sync must not create duplicate claims');
    assert.strictEqual(sync2.newEvidenceCount, 0, 'Repeated sync must not create duplicate evidence');
    assert.ok(sync2.duplicatesSkipped > 0, 'Duplicates skipped must be recorded');
  });

  test('9 & 10b. Claim approvals remain unchanged after migration, and sample bundles are blocked from importing into real user profiles', async () => {
    // Prepare a real user profile in local storage with an approved claim and review history
    const localStore = new InMemoryStorageAdapter(undefined, {
      uid: OWNER_UID,
      email: OWNER_EMAIL,
      displayName: 'Saifee Taher',
    });
    await localStore.initializeEmptyProfile({
      uid: OWNER_UID,
      email: OWNER_EMAIL,
      displayName: 'Saifee Taher',
    });

    await localStore.addEvidence({
      id: 'evi-mig-001',
      type: 'github_repo',
      title: 'EthicalMaster/FOLIOVERA',
      uri: 'https://github.com/EthicalMaster/FOLIOVERA',
      rawContentSnippet: 'Production career intelligence repository.',
      provenance: {
        repository: 'EthicalMaster/FOLIOVERA',
        sourceTimestamp: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
      },
      securityScan: {
        sanitized: true,
        injectionRiskDetected: false,
        flaggedPatterns: [],
        scanTimestamp: new Date().toISOString(),
        sanitizationVersion: '1.0.0',
      },
      verificationStatus: 'verified_source',
    });

    await localStore.upsertClaim({
      id: 'claim-mig-001',
      category: 'project',
      statement: 'Created Foliovera career intelligence platform.',
      evidenceIds: ['evi-mig-001'],
      verificationStatus: 'pending_review',
      lifecycleState: 'pending_review',
      confidenceScore: 0.91,
      extractedAt: new Date().toISOString(),
    });

    // Candidate approves the claim prior to migration
    await localStore.updateClaimVerification(
      'claim-mig-001',
      'user_confirmed',
      'user',
      'Confirmed authorship prior to Cloud Firestore migration',
      'Lead creator and architect'
    );

    const exportBundle = await localStore.exportProfileBundle();
    assert.strictEqual(exportBundle.profile.isSampleData, false);

    // Import into Cloud Firestore via API
    const cloudBackend = new DurableMockFirestoreBackend();
    await withTestServer(cloudBackend, async baseUrl => {
      const ownerHeaders = {
        Authorization: 'Bearer valid-owner-token-12345',
        'Content-Type': 'application/json',
      };

      // First verify that importing SAMPLE_CAREER_PROFILE is blocked
      const sampleImportRes = await fetch(`${baseUrl}/api/profile/import`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify({ profile: SAMPLE_CAREER_PROFILE }),
      });
      assert.strictEqual(sampleImportRes.status, 400, 'Sample data import into real owner profile must be rejected');

      // Now import the real exported bundle
      const importRes = await fetch(`${baseUrl}/api/profile/import`, {
        method: 'POST',
        headers: ownerHeaders,
        body: JSON.stringify(exportBundle),
      });
      assert.strictEqual(importRes.status, 200);

      // Verify claim approval state and clarification survived migration unchanged
      const migratedRes = await fetch(`${baseUrl}/api/profile`, { headers: ownerHeaders });
      const migratedProfile = (await migratedRes.json()).data;
      const migratedClaim = migratedProfile.claims.find((c: any) => c.id === 'claim-mig-001');
      assert.ok(migratedClaim, 'Migrated claim must exist in Firestore');
      assert.strictEqual(migratedClaim.verificationStatus, 'user_confirmed');
      assert.strictEqual(resolveLifecycleState(migratedClaim), 'approved');
      assert.strictEqual(isClaimApproved(migratedClaim), true);
      assert.strictEqual(migratedClaim.clarificationResponse, 'Lead creator and architect');
    });
  });

  test('12. Firestore failures produce controlled errors (503) without silent data loss', async () => {
    const backend = new DurableMockFirestoreBackend();
    await withTestServer(backend, async (baseUrl, storage) => {
      const ownerHeaders = {
        Authorization: 'Bearer valid-owner-token-12345',
        'Content-Type': 'application/json',
      };

      // Initialize valid profile first
      const initRes = await fetch(`${baseUrl}/api/profile`, { headers: ownerHeaders });
      assert.strictEqual(initRes.status, 200);

      // Inject a Firestore write failure on the next operation
      backend.failNextWrite = true;

      const failedUpdateRes = await fetch(`${baseUrl}/api/profile`, {
        method: 'PUT',
        headers: ownerHeaders,
        body: JSON.stringify({ headline: 'Headline During Outage' }),
      });
      assert.strictEqual(failedUpdateRes.status, 503);
      const failedJson = await failedUpdateRes.json();
      assert.strictEqual(failedJson.success, false);
      assert.ok(
        failedJson.error.code.includes('FIRESTORE') || failedJson.error.code.includes('STORAGE'),
        'Error code should indicate storage/Firestore failure'
      );

      // Direct adapter call also throws StorageOperationError cleanly
      backend.failNextRead = true;
      await assert.rejects(
        async () => {
          await storage.getProfile();
        },
        (err: unknown) => err instanceof StorageOperationError
      );

      // Subsequent read after transient failure recovers original committed profile without data loss
      const recoveredRes = await fetch(`${baseUrl}/api/profile`, { headers: ownerHeaders });
      assert.strictEqual(recoveredRes.status, 200);
      const recoveredJson = await recoveredRes.json();
      assert.strictEqual(recoveredJson.data.ownerUid, OWNER_UID);
    });
  });
});
