/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — API Contract Tests
 * Verifies health and system endpoints using persistent storage contracts
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { defaultStorage } from '../server/storage/memory-storage.ts';

describe('System Health & Profile Consistency Contract', () => {
  test('health check returns 100% verifiable status flags', async () => {
    const health = await defaultStorage.getSystemHealth();

    assert.strictEqual(health.status, 'healthy');
    assert.strictEqual(health.profileLoaded, true);
    assert.ok(
      health.storageDriver === 'sqlite_local' || health.storageDriver === 'in-memory',
      `Expected sqlite_local or in-memory driver, got ${health.storageDriver}`
    );
    assert.strictEqual(typeof health.uptimeSeconds, 'number');
    assert.ok(health.uptimeSeconds >= 0);
    assert.strictEqual(typeof health.claimsCount, 'number');
    assert.ok(health.claimsCount > 0);
    assert.strictEqual(typeof health.evidenceCount, 'number');
    assert.ok(health.evidenceCount > 0);
    assert.strictEqual(health.securityScannerActive, true);
  });

  test('all career claims maintain valid evidence references', async () => {
    const profile = await defaultStorage.getProfile();
    assert.ok(profile, 'Profile must be loaded');

    const evidenceIds = new Set(profile.evidenceVault.map(e => e.id));

    // Every claim must have at least one valid evidence reference (Rule 4)
    for (const claim of profile.claims) {
      assert.ok(
        claim.evidenceIds.length > 0,
        `Claim ${claim.id} must reference at least one evidence item`
      );
      for (const eId of claim.evidenceIds) {
        assert.ok(
          evidenceIds.has(eId),
          `Claim ${claim.id} references missing evidence item: ${eId}`
        );
      }
    }
  });

  test('skills must link back to valid evidence sources', async () => {
    const profile = await defaultStorage.getProfile();
    assert.ok(profile, 'Profile must be loaded');

    const evidenceIds = new Set(profile.evidenceVault.map(e => e.id));

    for (const skill of profile.skills) {
      assert.ok(
        skill.evidenceIds.length > 0,
        `Skill "${skill.name}" must reference at least one evidence item`
      );
      for (const eId of skill.evidenceIds) {
        assert.ok(
          evidenceIds.has(eId),
          `Skill "${skill.name}" references missing evidence ID: ${eId}`
        );
      }
    }
  });
});
