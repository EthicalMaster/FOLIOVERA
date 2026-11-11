/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Living Resume Agent — Runtime Schema Validator & Fingerprint Generator
 * Enforces Step 2 Requirements:
 * 1. Stable unique identifiers and schema validation.
 * 2. Deterministic fingerprinting to prevent duplicate records during repeated synchronization.
 * 3. Rule 4 enforcement: Every claim must link to >= 1 valid evidence record.
 */

import crypto from 'crypto';
import {
  CareerClaim,
  EvidenceSource,
  VerifiedCareerProfile,
  VerificationStatus
} from '../../shared/types/career-profile';

const VALID_STATUSES: VerificationStatus[] = [
  'verified_source',
  'user_confirmed',
  'discovered',
  'pending_review',
  'rejected'
];

export class SchemaValidator {
  /**
   * Generates a deterministic SHA-256 fingerprint for deduplication across repeated syncs
   */
  public static computeFingerprint(namespace: string, ...parts: (string | undefined | null)[]): string {
    const normalized = parts
      .map(p => (p || '').trim().toLowerCase().replace(/\s+/g, ' '))
      .join('|');
    const hash = crypto.createHash('sha256').update(`${namespace}:${normalized}`).digest('hex').slice(0, 20);
    return `${namespace}_${hash}`;
  }

  public static validateEvidence(evidence: EvidenceSource): void {
    if (!evidence || typeof evidence !== 'object') {
      throw new Error('SchemaValidationError: Evidence must be an object');
    }
    if (!evidence.id || typeof evidence.id !== 'string' || !evidence.id.trim()) {
      throw new Error('SchemaValidationError: Evidence requires a non-empty string id');
    }
    if (!evidence.title || typeof evidence.title !== 'string' || !evidence.title.trim()) {
      throw new Error(`SchemaValidationError: Evidence "${evidence.id}" requires a non-empty title`);
    }
    if (!evidence.uri || typeof evidence.uri !== 'string' || !evidence.uri.trim()) {
      throw new Error(`SchemaValidationError: Evidence "${evidence.id}" requires a valid uri`);
    }
    if (!evidence.provenance || typeof evidence.provenance.sourceTimestamp !== 'string') {
      throw new Error(`SchemaValidationError: Evidence "${evidence.id}" requires provenance.sourceTimestamp`);
    }
    if (!evidence.securityScan || typeof evidence.securityScan.sanitized !== 'boolean') {
      throw new Error(`SchemaValidationError: Evidence "${evidence.id}" requires securityScan metadata`);
    }
  }

  public static validateClaim(claim: CareerClaim, knownEvidenceIds?: Set<string>): void {
    if (!claim || typeof claim !== 'object') {
      throw new Error('SchemaValidationError: Claim must be an object');
    }
    if (!claim.id || typeof claim.id !== 'string' || !claim.id.trim()) {
      throw new Error('SchemaValidationError: Claim requires a non-empty string id');
    }
    if (!claim.statement || typeof claim.statement !== 'string' || !claim.statement.trim()) {
      throw new Error(`SchemaValidationError: Claim "${claim.id}" requires a non-empty statement`);
    }
    if (!Array.isArray(claim.evidenceIds) || claim.evidenceIds.length === 0) {
      throw new Error(
        `SchemaValidationError (Rule 4 Violation): Claim "${claim.id}" must reference at least one evidence source`
      );
    }
    if (!VALID_STATUSES.includes(claim.verificationStatus)) {
      throw new Error(
        `SchemaValidationError: Claim "${claim.id}" has invalid verificationStatus "${claim.verificationStatus}"`
      );
    }
    if (knownEvidenceIds) {
      for (const evId of claim.evidenceIds) {
        if (!knownEvidenceIds.has(evId)) {
          throw new Error(
            `SchemaValidationError: Claim "${claim.id}" references non-existent evidence ID "${evId}"`
          );
        }
      }
    }
  }

  public static validateProfile(profile: VerifiedCareerProfile): void {
    if (!profile || typeof profile !== 'object') {
      throw new Error('SchemaValidationError: Profile must be an object');
    }
    if (!profile.id || typeof profile.id !== 'string') {
      throw new Error('SchemaValidationError: Profile requires a valid id');
    }
    if (!profile.candidateName || typeof profile.candidateName !== 'string') {
      throw new Error('SchemaValidationError: Profile requires candidateName');
    }
    if (!Array.isArray(profile.evidenceVault)) {
      throw new Error('SchemaValidationError: Profile requires evidenceVault array');
    }
    if (!Array.isArray(profile.claims)) {
      throw new Error('SchemaValidationError: Profile requires claims array');
    }

    const evidenceIdSet = new Set<string>();
    for (const ev of profile.evidenceVault) {
      this.validateEvidence(ev);
      evidenceIdSet.add(ev.id);
    }

    for (const claim of profile.claims) {
      this.validateClaim(claim, evidenceIdSet);
    }
  }
}
