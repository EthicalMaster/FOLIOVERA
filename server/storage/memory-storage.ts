/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Storage Factory & In-Memory Adapter (Phase 1.5)
 * Supports Firestore for durable production career storage, SQLite for local development
 * and isolated testing, and InMemoryStorageAdapter for fast unit tests.
 */

import {
  resolveLifecycleState,
  isClaimApproved,
  type VerifiedCareerProfile,
  type EvidenceSource,
  type CareerClaim,
  type VerificationStatus,
  type AuditLogEntry,
  type SystemHealth,
  type GitHubRepositoryRecord,
  type SyncHistoryRecord,
  type ProfileExportBundle,
  type ProfileImportResult
} from '../../shared/types/career-profile.ts';
import type { StorageAdapter, OwnerIdentityMeta } from './storage.interface.ts';
import { SAMPLE_CAREER_PROFILE, createEmptyOwnerProfile } from './sample-data.ts';
import { SchemaValidator } from './schema-validator.ts';
import { PersistentSqliteStorageAdapter } from './persistent-storage.ts';
import { FirestoreStorageAdapter } from './firestore-storage.ts';

export class InMemoryStorageAdapter implements StorageAdapter {
  private profile: VerifiedCareerProfile;
  private ownerMap: Map<string, InMemoryStorageAdapter>;
  private owner?: OwnerIdentityMeta;
  private startTime: number;

  constructor(
    initialProfile: VerifiedCareerProfile = SAMPLE_CAREER_PROFILE,
    owner?: OwnerIdentityMeta,
    sharedOwnerMap?: Map<string, InMemoryStorageAdapter>
  ) {
    this.profile = JSON.parse(JSON.stringify(initialProfile));
    if (!this.profile.repositories) this.profile.repositories = [];
    if (!this.profile.syncHistory) this.profile.syncHistory = [];
    this.owner = owner;
    this.ownerMap = sharedOwnerMap || new Map();
    this.startTime = Date.now();
  }

  public forOwner(owner: OwnerIdentityMeta): StorageAdapter {
    if (!owner || !owner.uid || !owner.uid.trim()) {
      throw new Error('Valid owner UID is required');
    }
    const uid = owner.uid.trim();
    let existing = this.ownerMap.get(uid);
    if (!existing) {
      const emptyProfile = createEmptyOwnerProfile(uid, owner.email, owner.displayName);
      existing = new InMemoryStorageAdapter(emptyProfile, owner, this.ownerMap);
      this.ownerMap.set(uid, existing);
    }
    return existing;
  }

  public async initializeEmptyProfile(ownerOverride?: OwnerIdentityMeta): Promise<VerifiedCareerProfile> {
    const targetOwner = ownerOverride || this.owner || { uid: 'owner-default' };
    this.profile = createEmptyOwnerProfile(
      targetOwner.uid,
      targetOwner.email,
      targetOwner.displayName
    );
    return JSON.parse(JSON.stringify(this.profile));
  }

  public async getProfile(): Promise<VerifiedCareerProfile | null> {
    return JSON.parse(JSON.stringify(this.profile));
  }

  public async saveProfile(updated: VerifiedCareerProfile): Promise<void> {
    if (this.owner && (updated.isSampleData || updated.id === SAMPLE_CAREER_PROFILE.id)) {
      throw new Error('Sample demonstration profiles cannot be saved into an authenticated owner profile.');
    }
    SchemaValidator.validateProfile(updated);
    this.profile = JSON.parse(JSON.stringify(updated));
    if (this.owner) {
      this.profile.ownerUid = this.owner.uid;
      this.profile.isSampleData = false;
    }
    this.profile.lastUpdated = new Date().toISOString();
    this.profile.version += 1;
  }

  public async getClaim(claimId: string): Promise<CareerClaim | null> {
    const claim = this.profile.claims.find(c => c.id === claimId);
    return claim ? JSON.parse(JSON.stringify(claim)) : null;
  }

  public async upsertClaim(claim: CareerClaim): Promise<{ claim: CareerClaim; created: boolean }> {
    const knownEv = new Set(this.profile.evidenceVault.map(e => e.id));
    SchemaValidator.validateClaim(claim, knownEv);

    const fp =
      claim.fingerprint ||
      SchemaValidator.computeFingerprint('claim', claim.category, claim.statement, claim.repositoryRef || '');

    const idx = this.profile.claims.findIndex(c => c.id === claim.id || (c.fingerprint && c.fingerprint === fp));
    if (idx !== -1) {
      const existing = this.profile.claims[idx];
      const mergedEvidenceIds = Array.from(new Set([...existing.evidenceIds, ...claim.evidenceIds]));
      const updated: CareerClaim = {
        ...existing,
        evidenceIds: mergedEvidenceIds,
        fingerprint: fp
      };
      this.profile.claims[idx] = updated;
      return { claim: JSON.parse(JSON.stringify(updated)), created: false };
    }

    const enriched: CareerClaim = {
      ...claim,
      fingerprint: fp,
      lifecycleState: resolveLifecycleState(claim),
      extractedAt: claim.extractedAt || new Date().toISOString()
    };
    this.profile.claims.unshift(JSON.parse(JSON.stringify(enriched)));
    return { claim: JSON.parse(JSON.stringify(enriched)), created: true };
  }

  public async updateClaim(
    claimId: string,
    updates: Partial<Pick<CareerClaim, 'statement' | 'category' | 'clarificationResponse' | 'ownershipStatus' | 'notes'>>
  ): Promise<CareerClaim> {
    const idx = this.profile.claims.findIndex(c => c.id === claimId);
    if (idx === -1) {
      throw new Error(`Claim not found with ID: ${claimId}`);
    }
    const existing = this.profile.claims[idx];
    const updated: CareerClaim = {
      ...existing,
      ...updates,
      statement: updates.statement?.trim() || existing.statement
    };
    this.profile.claims[idx] = updated;
    this.profile.lastUpdated = new Date().toISOString();
    return JSON.parse(JSON.stringify(updated));
  }

  public async deleteClaim(claimId: string, actor: 'user' | 'system' = 'user'): Promise<boolean> {
    const idx = this.profile.claims.findIndex(c => c.id === claimId);
    if (idx === -1) return false;
    this.profile.claims.splice(idx, 1);
    await this.appendAuditLog({
      actor,
      action: 'claim_deleted',
      targetId: claimId,
      details: `Deleted claim ${claimId}`
    });
    return true;
  }

  public async updateClaimVerification(
    claimId: string,
    status: VerificationStatus,
    actor: 'user' | 'system',
    note?: string,
    clarificationResponse?: string
  ): Promise<CareerClaim> {
    const claimIndex = this.profile.claims.findIndex(c => c.id === claimId);
    if (claimIndex === -1) {
      throw new Error(`Claim not found with ID: ${claimId}`);
    }

    const claim = this.profile.claims[claimIndex];
    const prevStatus = claim.verificationStatus;
    claim.verificationStatus = status;
    claim.lifecycleState = resolveLifecycleState({ verificationStatus: status });

    if (clarificationResponse && clarificationResponse.trim()) {
      claim.clarificationResponse = clarificationResponse.trim();
      if (claim.ownershipStatus === 'uncertain_ownership') {
        claim.ownershipStatus = 'contributor';
      }
    }

    if (status === 'user_confirmed') {
      claim.userConfirmedAt = new Date().toISOString();
      claim.verifiedBy = 'human_user';
    }
    if (note) {
      claim.notes = (claim.notes ? `${claim.notes} | ` : '') + note;
    }

    claim.reviewHistory = [
      {
        id: `rev-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actor,
        previousStatus: prevStatus,
        newStatus: status,
        lifecycleState: claim.lifecycleState,
        note: note || `Updated to ${status}`
      },
      ...(claim.reviewHistory ?? [])
    ];

    for (const exp of this.profile.experiences) {
      for (const h of exp.highlights) {
        if (h.claimId === claimId) {
          h.verificationStatus = status;
        }
      }
    }

    await this.appendAuditLog({
      actor,
      action: status === 'rejected' ? 'claim_rejected' : 'claim_verified',
      targetId: claimId,
      details: `Claim status changed to "${status}" by ${actor}.${note ? ` Note: ${note}` : ''}`
    });

    this.profile.lastUpdated = new Date().toISOString();
    return JSON.parse(JSON.stringify(claim));
  }

  public async getEvidence(evidenceId: string): Promise<EvidenceSource | null> {
    const item = this.profile.evidenceVault.find(e => e.id === evidenceId);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  public async listEvidence(): Promise<EvidenceSource[]> {
    return JSON.parse(JSON.stringify(this.profile.evidenceVault));
  }

  public async addEvidence(evidence: EvidenceSource): Promise<void> {
    SchemaValidator.validateEvidence(evidence);
    const exists = this.profile.evidenceVault.some(e => e.id === evidence.id);
    if (exists) {
      throw new Error(`Evidence with ID ${evidence.id} already exists`);
    }

    this.profile.evidenceVault.push(JSON.parse(JSON.stringify(evidence)));
    await this.appendAuditLog({
      actor: 'system',
      action: 'evidence_imported',
      targetId: evidence.id,
      details: `Imported evidence item "${evidence.title}" (${evidence.type})`
    });

    this.profile.lastUpdated = new Date().toISOString();
  }

  public async upsertEvidence(evidence: EvidenceSource): Promise<{ evidence: EvidenceSource; created: boolean }> {
    SchemaValidator.validateEvidence(evidence);
    const fp =
      evidence.fingerprint ||
      SchemaValidator.computeFingerprint('evidence', evidence.type, evidence.uri, evidence.provenance.commitSha || '');

    const idx = this.profile.evidenceVault.findIndex(
      e => e.id === evidence.id || (e.fingerprint && e.fingerprint === fp)
    );
    if (idx !== -1) {
      const existing = this.profile.evidenceVault[idx];
      const updated: EvidenceSource = { ...existing, ...evidence, id: existing.id, fingerprint: fp };
      this.profile.evidenceVault[idx] = updated;
      return { evidence: JSON.parse(JSON.stringify(updated)), created: false };
    }

    const enriched: EvidenceSource = { ...evidence, fingerprint: fp };
    this.profile.evidenceVault.unshift(JSON.parse(JSON.stringify(enriched)));
    return { evidence: JSON.parse(JSON.stringify(enriched)), created: true };
  }

  public async deleteEvidence(evidenceId: string, actor: 'user' | 'system' = 'user'): Promise<boolean> {
    const idx = this.profile.evidenceVault.findIndex(e => e.id === evidenceId);
    if (idx === -1) return false;
    this.profile.evidenceVault.splice(idx, 1);
    await this.appendAuditLog({
      actor,
      action: 'evidence_deleted',
      targetId: evidenceId,
      details: `Deleted evidence ${evidenceId}`
    });
    return true;
  }

  public async listRepositories(): Promise<GitHubRepositoryRecord[]> {
    return JSON.parse(JSON.stringify(this.profile.repositories ?? []));
  }

  public async upsertRepository(
    repo: GitHubRepositoryRecord
  ): Promise<{ repo: GitHubRepositoryRecord; updated: boolean }> {
    if (!this.profile.repositories) this.profile.repositories = [];
    const idx = this.profile.repositories.findIndex(r => r.fullName === repo.fullName);
    if (idx !== -1) {
      const prev = this.profile.repositories[idx];
      const updated =
        prev.pushedAt !== repo.pushedAt ||
        prev.latestCommitSha !== repo.latestCommitSha ||
        prev.description !== repo.description;
      this.profile.repositories[idx] = JSON.parse(JSON.stringify(repo));
      return { repo, updated };
    }
    this.profile.repositories.unshift(JSON.parse(JSON.stringify(repo)));
    return { repo, updated: true };
  }

  public async listSyncHistory(): Promise<SyncHistoryRecord[]> {
    return JSON.parse(JSON.stringify(this.profile.syncHistory ?? []));
  }

  public async addSyncHistory(record: SyncHistoryRecord): Promise<void> {
    if (!this.profile.syncHistory) this.profile.syncHistory = [];
    this.profile.syncHistory.unshift(JSON.parse(JSON.stringify(record)));
  }

  public async getAuditLogs(): Promise<AuditLogEntry[]> {
    return JSON.parse(JSON.stringify(this.profile.auditTrail));
  }

  public async appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    const newEntry: AuditLogEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry
    };

    this.profile.auditTrail.unshift(newEntry);
    return newEntry;
  }

  public async exportProfileBundle(ownerUid?: string): Promise<ProfileExportBundle> {
    const target = ownerUid ? this.forOwner({ uid: ownerUid }) : this;
    const profile = await target.getProfile();
    if (!profile) throw new Error('Profile not found');
    return {
      schemaVersion: '1.5.0',
      exportedAt: new Date().toISOString(),
      ownerUid: ownerUid || this.owner?.uid || 'default',
      isSampleData: Boolean(profile.isSampleData),
      profile
    };
  }

  public async importProfileBundle(
    ownerUid: string,
    incomingProfile: VerifiedCareerProfile,
    options: { mode?: 'merge' | 'initialize_if_empty' } = {}
  ): Promise<ProfileImportResult> {
    const mode = options.mode || 'merge';
    if (
      incomingProfile.isSampleData === true ||
      incomingProfile.id === SAMPLE_CAREER_PROFILE.id
    ) {
      throw new Error('Sample demonstration profile cannot be imported into authenticated owner storage.');
    }

    const sampleEvidenceIds = new Set(SAMPLE_CAREER_PROFILE.evidenceVault.map(e => e.id));
    const sampleClaimIds = new Set(SAMPLE_CAREER_PROFILE.claims.map(c => c.id));
    const cleanEvidence = (incomingProfile.evidenceVault ?? []).filter(e => !sampleEvidenceIds.has(e.id));
    const cleanClaims = (incomingProfile.claims ?? []).filter(c => !sampleClaimIds.has(c.id));
    const sampleRecordsRejected =
      (incomingProfile.evidenceVault?.length ?? 0) -
      cleanEvidence.length +
      ((incomingProfile.claims?.length ?? 0) - cleanClaims.length);

    const sanitized: VerifiedCareerProfile = {
      ...incomingProfile,
      id: `profile-${ownerUid}`,
      ownerUid,
      isSampleData: false,
      evidenceVault: cleanEvidence,
      claims: cleanClaims,
      lastUpdated: new Date().toISOString(),
      version: (incomingProfile.version || 1) + 1
    };

    SchemaValidator.validateProfile(sanitized);
    const scoped = this.forOwner({ uid: ownerUid }) as InMemoryStorageAdapter;
    scoped.profile = JSON.parse(JSON.stringify(sanitized));

    return {
      importedProfileId: sanitized.id,
      ownerUid,
      claimsImported: cleanClaims.length,
      evidenceImported: cleanEvidence.length,
      repositoriesImported: (sanitized.repositories ?? []).length,
      sampleRecordsRejected,
      mode
    };
  }

  public async getSystemHealth(): Promise<SystemHealth> {
    const verifiedClaims = this.profile.claims.filter(c => isClaimApproved(c)).length;

    return {
      status: 'healthy',
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      version: '1.5.0-phase1.5',
      storageDriver: 'in-memory',
      storageMode: 'volatile_test',
      profileLoaded: true,
      evidenceCount: this.profile.evidenceVault.length,
      claimsCount: this.profile.claims.length,
      verifiedClaimsCount: verifiedClaims,
      repositoriesCount: (this.profile.repositories ?? []).length,
      syncRunsCount: (this.profile.syncHistory ?? []).length,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      githubApiReady: true,
      securityScannerActive: true,
      authConfigured: true
    };
  }
}

/**
 * Initializes the application storage engine.
 * - STORAGE_DRIVER='firestore': Durable Cloud Firestore storage
 * - STORAGE_DRIVER='sqlite' (default for local dev/test): Persistent SQLite storage
 * - STORAGE_DRIVER='in-memory': Isolated in-memory test store
 */
export function createApplicationStorage(driverOverride?: string): StorageAdapter {
  const requestedDriver =
    driverOverride ||
    process.env.STORAGE_DRIVER ||
    (process.env.NODE_ENV === 'production' && process.env.K_SERVICE ? 'firestore' : 'sqlite');

  if (requestedDriver === 'in-memory') {
    return new InMemoryStorageAdapter();
  }
  if (requestedDriver === 'firestore') {
    return new FirestoreStorageAdapter();
  }
  return new PersistentSqliteStorageAdapter();
}

export const defaultStorage: StorageAdapter = createApplicationStorage();
