/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Replaceable Database Storage Interface (Phase 1.5)
 * Supports owner-scoped persistence, deduplication, claim lifecycle management,
 * repository sync tracking, historical auditability, and safe profile migration.
 */

import type {
  VerifiedCareerProfile,
  EvidenceSource,
  CareerClaim,
  VerificationStatus,
  AuditLogEntry,
  SystemHealth,
  GitHubRepositoryRecord,
  SyncHistoryRecord,
  ProfileExportBundle,
  ProfileImportResult
} from '../../shared/types/career-profile.ts';

export interface OwnerIdentityMeta {
  uid: string;
  email?: string;
  displayName?: string;
  idToken?: string;
}

export interface StorageAdapter {
  /**
   * Returns an owner-scoped view of the storage adapter so all operations
   * are strictly isolated to the authenticated owner UID.
   */
  forOwner?(owner: OwnerIdentityMeta): StorageAdapter;

  getProfile(): Promise<VerifiedCareerProfile | null>;
  saveProfile(profile: VerifiedCareerProfile): Promise<void>;

  /**
   * Initializes a genuinely empty personal profile for an authenticated owner
   * without seeding demonstration data.
   */
  initializeEmptyProfile?(owner: OwnerIdentityMeta): Promise<VerifiedCareerProfile>;

  /**
   * Safe export and validated import for migrating career data without
   * sample data contamination or silent overwrite.
   */
  exportProfileBundle?(ownerUid: string): Promise<ProfileExportBundle>;
  importProfileBundle?(
    ownerUid: string,
    incomingProfile: VerifiedCareerProfile,
    options?: { mode?: 'merge' | 'initialize_if_empty' }
  ): Promise<ProfileImportResult>;

  // Claims management
  getClaim(claimId: string): Promise<CareerClaim | null>;
  upsertClaim(claim: CareerClaim): Promise<{ claim: CareerClaim; created: boolean }>;
  updateClaim(
    claimId: string,
    updates: Partial<Pick<CareerClaim, 'statement' | 'category' | 'clarificationResponse' | 'ownershipStatus' | 'notes'>>
  ): Promise<CareerClaim>;
  deleteClaim(claimId: string, actor?: 'user' | 'system'): Promise<boolean>;
  updateClaimVerification(
    claimId: string,
    status: VerificationStatus,
    actor: 'user' | 'system',
    note?: string,
    clarificationResponse?: string
  ): Promise<CareerClaim>;

  // Evidence management
  getEvidence(evidenceId: string): Promise<EvidenceSource | null>;
  listEvidence(): Promise<EvidenceSource[]>;
  addEvidence(evidence: EvidenceSource): Promise<void>;
  upsertEvidence(evidence: EvidenceSource): Promise<{ evidence: EvidenceSource; created: boolean }>;
  deleteEvidence(evidenceId: string, actor?: 'user' | 'system'): Promise<boolean>;

  // GitHub Repository & Sync History persistence
  listRepositories(): Promise<GitHubRepositoryRecord[]>;
  upsertRepository(repo: GitHubRepositoryRecord): Promise<{ repo: GitHubRepositoryRecord; updated: boolean }>;
  listSyncHistory(): Promise<SyncHistoryRecord[]>;
  addSyncHistory(record: SyncHistoryRecord): Promise<void>;

  // Audit logs & health
  getAuditLogs(): Promise<AuditLogEntry[]>;
  appendAuditLog(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry>;
  getSystemHealth(): Promise<SystemHealth>;
}
