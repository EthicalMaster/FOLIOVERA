/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Living Resume Agent — Replaceable Database Storage Interface
 * Supports full persistence, deduplication, claim lifecycle management,
 * repository sync tracking, and historical auditability.
 */

import type {
  VerifiedCareerProfile,
  EvidenceSource,
  CareerClaim,
  VerificationStatus,
  AuditLogEntry,
  SystemHealth,
  GitHubRepositoryRecord,
  SyncHistoryRecord
} from '../../shared/types/career-profile.ts';

export interface StorageAdapter {
  getProfile(): Promise<VerifiedCareerProfile | null>;
  saveProfile(profile: VerifiedCareerProfile): Promise<void>;

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
