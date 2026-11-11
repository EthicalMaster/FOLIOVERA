/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Storage Adapter Unit Tests
 * Uses Node test runner (node:test, node:assert)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryStorageAdapter } from '../server/storage/memory-storage.ts';
import { SAMPLE_CAREER_PROFILE } from '../server/storage/sample-data.ts';

describe('StorageAdapter Contract & In-Memory Implementation', () => {
  test('initializes with sample career profile', async () => {
    const storage = new InMemoryStorageAdapter();
    const profile = await storage.getProfile();

    assert.ok(profile !== null, 'Profile should exist');
    assert.strictEqual(profile.isSampleData, true);
    assert.ok(profile.claims.length > 0, 'Claims should be populated');
    assert.ok(profile.evidenceVault.length > 0, 'Evidence vault should be populated');
  });

  test('updates claim verification status and logs audit entry', async () => {
    const storage = new InMemoryStorageAdapter();
    const pendingClaim = SAMPLE_CAREER_PROFILE.claims.find(c => c.verificationStatus === 'pending_review');
    assert.ok(pendingClaim, 'A pending claim must exist in sample data');

    const updated = await storage.updateClaimVerification(
      pendingClaim.id,
      'user_confirmed',
      'user',
      'Verified via developer review'
    );

    assert.strictEqual(updated.verificationStatus, 'user_confirmed');
    assert.ok(updated.userConfirmedAt, 'userConfirmedAt must be stamped');
    assert.strictEqual(updated.verifiedBy, 'human_user');

    // Verify audit log has the event
    const auditLogs = await storage.getAuditLogs();
    const matchingLog = auditLogs.find(l => l.targetId === pendingClaim.id && l.action === 'claim_verified');
    assert.ok(matchingLog, 'Audit log entry must be recorded');
  });

  test('enforces rejection state for disputed claims', async () => {
    const storage = new InMemoryStorageAdapter();
    const claim = SAMPLE_CAREER_PROFILE.claims[0];

    const rejected = await storage.updateClaimVerification(
      claim.id,
      'rejected',
      'user',
      'Rejected by candidate: not accurate'
    );

    assert.strictEqual(rejected.verificationStatus, 'rejected');

    const auditLogs = await storage.getAuditLogs();
    const matchingLog = auditLogs.find(l => l.targetId === claim.id && l.action === 'claim_rejected');
    assert.ok(matchingLog, 'Audit log entry must be recorded for rejection');
  });

  test('prevents duplicate evidence ID insertion', async () => {
    const storage = new InMemoryStorageAdapter();
    const existingEvidence = SAMPLE_CAREER_PROFILE.evidenceVault[0];

    await assert.rejects(
      async () => {
        await storage.addEvidence(existingEvidence);
      },
      /already exists/
    );
  });

  test('computes system health stats accurately', async () => {
    const storage = new InMemoryStorageAdapter();
    const health = await storage.getSystemHealth();

    assert.strictEqual(health.status, 'healthy');
    assert.strictEqual(health.storageDriver, 'in-memory');
    assert.strictEqual(health.profileLoaded, true);
    assert.ok(health.evidenceCount >= 5);
    assert.ok(health.claimsCount >= 5);
  });
});
