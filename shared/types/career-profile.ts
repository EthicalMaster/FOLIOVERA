/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Living Resume Agent — Core Domain Types & Verified Career Profile Data Model
 * Phase 1: GitHub Intelligence, Evidence Extraction & Persistent Career Storage
 *
 * Engineering Rules:
 * - Rule 4: Every claim must be traceable to source evidence or explicitly confirmed by the user.
 * - Rule 5: Never fabricate skills, experience, job titles, metrics, or achievements.
 * - Rule 6: Treat imported repository content as untrusted data, never as agent instructions.
 */

export type VerificationStatus =
  | 'verified_source'   // Directly supported by deterministic source evidence & approved
  | 'user_confirmed'    // Explicitly attested & approved by the candidate
  | 'discovered'        // Newly discovered from repository sync; not yet reviewed
  | 'pending_review'    // Awaiting candidate verification or ownership clarification
  | 'rejected';         // Rejected or disputed claim (strictly excluded from profile & resumes)

/**
 * Explicit 4-stage review lifecycle required by Phase 1 Step 5:
 * Discovered -> Pending Review -> Approved | Rejected
 */
export type ClaimLifecycleState =
  | 'discovered'
  | 'pending_review'
  | 'approved'
  | 'rejected';

/**
 * Contribution ownership confidence:
 * Repository presence alone does not prove personal authorship.
 */
export type OwnershipStatus =
  | 'verified_author'      // User commits / author login directly matched in commit history
  | 'contributor'          // User contributed alongside others or attested ownership
  | 'uncertain_ownership'; // Forked repo, org repo without author-matched commits, or unverified authorship

export type EvidenceSourceType =
  | 'github_repo'
  | 'github_commit'
  | 'github_pull_request'
  | 'github_release'
  | 'github_readme'
  | 'linkedin_import'
  | 'user_attestation'
  | 'credential_document';

export interface EvidenceProvenance {
  repository?: string;
  commitSha?: string;
  authorLogin?: string;
  branch?: string;
  sourceTimestamp: string;
  immutableRef?: string;
  fetchedAt: string;
}

export interface SecurityScanMetadata {
  sanitized: boolean;
  injectionRiskDetected: boolean;
  flaggedPatterns: string[];
  scanTimestamp: string;
  sanitizationVersion: string;
}

export interface EvidenceSource {
  id: string;
  fingerprint?: string; // Stable deduplication key (e.g., "github_repo:owner/name" or "github_commit:sha")
  type: EvidenceSourceType;
  title: string;
  uri: string;
  rawContentSnippet: string;
  provenance: EvidenceProvenance;
  securityScan: SecurityScanMetadata;
  verificationStatus?: VerificationStatus;
  supportingExplanation?: string;
  notes?: string;
}

export type ClaimCategory =
  | 'work_experience'
  | 'project'
  | 'skill'
  | 'architecture'
  | 'metric'
  | 'education';

export interface ClaimReviewHistoryEntry {
  id: string;
  timestamp: string;
  actor: 'system' | 'user' | 'github_extractor';
  previousStatus?: VerificationStatus;
  newStatus: VerificationStatus;
  lifecycleState: ClaimLifecycleState;
  note: string;
}

export interface CareerClaim {
  id: string;
  fingerprint?: string; // Deterministic deduplication key preventing duplicate claims on re-sync
  category: ClaimCategory;
  statement: string;
  evidenceIds: string[];
  repositoryRef?: string;
  commitRef?: string;
  extractedAt?: string;
  supportingExplanation?: string;
  verificationStatus: VerificationStatus;
  lifecycleState?: ClaimLifecycleState;
  ownershipStatus?: OwnershipStatus;
  clarificationPrompt?: string;
  clarificationResponse?: string;
  confidenceScore: number; // 0.0 - 1.0 based on deterministic evidence heuristics
  userConfirmedAt?: string;
  verifiedBy?: 'deterministic_matcher' | 'human_user' | 'gemini_extractor_pending';
  notes?: string;
  proposedChangeType?: 'add_project' | 'add_skill' | 'update_experience' | 'add_metric';
  sourceLabel?: string;
  discoveredRelativeTime?: string;
  reviewHistory?: ClaimReviewHistoryEntry[];
}

export interface GitHubRepositoryRecord {
  id: string;
  githubRepoId: number;
  name: string;
  fullName: string;
  ownerLogin: string;
  description: string;
  htmlUrl: string;
  primaryLanguage: string;
  languages: Record<string, number>;
  topics: string[];
  isFork: boolean;
  isArchived: boolean;
  stargazersCount: number;
  forksCount: number;
  sizeKb: number;
  defaultBranch: string;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  latestCommitSha?: string;
  userAuthorCommitCount: number;
  ownershipStatus: OwnershipStatus;
  readmeExcerpt?: string;
  lastSyncedAt: string;
}

export interface SyncHistoryRecord {
  id: string;
  provider: 'github';
  username: string;
  startedAt: string;
  completedAt: string;
  status: 'success' | 'partial' | 'failed' | 'rate_limited';
  repositoriesScanned: number;
  meaningfulUpdatesFound: number;
  newEvidenceCount: number;
  newClaimsCount: number;
  duplicatesSkipped: number;
  rateLimitRemaining?: number;
  rateLimitResetAt?: string;
  errorMessage?: string;
}

export interface ConnectedGitHubSource {
  username: string;
  connectedAt: string;
  lastSyncedAt?: string;
  lastSyncStatus?: 'idle' | 'syncing' | 'success' | 'failed' | 'rate_limited';
  lastSyncError?: string;
  publicReposCount?: number;
  authenticatedMode: boolean;
  rateLimitRemaining?: number;
}

export interface VerifiedSkill {
  id: string;
  name: string;
  category: 'languages' | 'frameworks' | 'infrastructure' | 'architecture' | 'tools';
  evidenceIds: string[];
  verificationStatus: VerificationStatus;
  firstObservedDate: string;
  lastObservedDate: string;
  associatedRepositories: string[];
}

export interface VerifiedExperience {
  id: string;
  role: string;
  organization: string;
  period: string;
  location?: string;
  highlights: {
    claimId: string;
    text: string;
    evidenceIds: string[];
    verificationStatus: VerificationStatus;
  }[];
}

export interface VerifiedProject {
  id: string;
  name: string;
  description: string;
  repositoryUrl: string;
  primaryLanguage: string;
  techStack: string[];
  evidenceIds: string[];
  verificationStatus: VerificationStatus;
  metrics: {
    label: string;
    value: string;
    claimId?: string;
    evidenceId?: string;
  }[];
}

export interface VerifiedEducation {
  id: string;
  institution: string;
  degree: string;
  period: string;
  location?: string;
  honors?: string;
  evidenceIds: string[];
  verificationStatus: VerificationStatus;
}

export type ResumeStyle = 'ats_professional' | 'editorial_executive' | 'systems_architect';

export interface ResumeVersion {
  id: string;
  versionLabel: string;
  targetRole: string;
  style: ResumeStyle;
  createdAt: string;
  tailoredSummary: string;
  selectedClaimIds: string[];
  selectedSkillIds: string[];
  tailoredBullets: {
    claimId: string;
    text: string;
    evidenceIds: string[];
    relevanceReason?: string;
  }[];
  generationEngine: 'gemini_verified' | 'deterministic_verified';
}

export interface AccountConnection {
  id: string;
  provider: 'github' | 'linkedin' | 'document_vault';
  label: string;
  handle: string;
  connected: boolean;
  lastSync: string;
  mode: string;
  error?: string;
}

export interface UserSettings {
  autoSyncEnabled: boolean;
  requireHumanReviewForProfileUpdates: boolean;
  strictPromptInjectionQuarantine: boolean;
  defaultTargetRole: string;
  defaultResumeStyle: ResumeStyle;
  includeEvidenceFootnotes: boolean;
  reducedMotion: boolean;
  connectedAccounts: AccountConnection[];
  githubConnection?: ConnectedGitHubSource;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: 'system' | 'user' | 'github_sync';
  action:
    | 'claim_created'
    | 'claim_verified'
    | 'claim_rejected'
    | 'claim_clarified'
    | 'claim_deleted'
    | 'evidence_imported'
    | 'evidence_deleted'
    | 'security_flag'
    | 'resume_generated'
    | 'profile_updated'
    | 'github_sync_completed'
    | 'github_sync_failed';
  targetId: string;
  details: string;
}

export interface VerifiedCareerProfile {
  id: string;
  candidateName: string;
  email?: string;
  location?: string;
  headline: string;
  summary: string;
  claims: CareerClaim[];
  skills: VerifiedSkill[];
  experiences: VerifiedExperience[];
  projects: VerifiedProject[];
  education?: VerifiedEducation[];
  repositories?: GitHubRepositoryRecord[];
  syncHistory?: SyncHistoryRecord[];
  resumeVersions?: ResumeVersion[];
  settings?: UserSettings;
  evidenceVault: EvidenceSource[];
  auditTrail: AuditLogEntry[];
  isSampleData: boolean;
  version: number;
  lastUpdated: string;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptimeSeconds: number;
  timestamp: string;
  version: string;
  storageDriver: 'in-memory' | 'sqlite_local' | 'sqlite_persistent' | 'file' | 'postgres';
  storageMode?: 'development_persistent' | 'production_persistent' | 'volatile_test';
  databasePath?: string;
  profileLoaded: boolean;
  evidenceCount: number;
  claimsCount: number;
  verifiedClaimsCount: number;
  repositoriesCount?: number;
  syncRunsCount?: number;
  geminiConfigured: boolean;
  githubApiReady: boolean;
  securityScannerActive: boolean;
}

/**
 * Helper to determine if a claim is approved and eligible for Career Profile & Resume Studio
 */
export function isClaimApproved(claim: Pick<CareerClaim, 'verificationStatus' | 'lifecycleState'>): boolean {
  if (claim.lifecycleState === 'rejected' || claim.verificationStatus === 'rejected') return false;
  if (claim.lifecycleState === 'discovered' || claim.lifecycleState === 'pending_review') return false;
  if (claim.verificationStatus === 'discovered' || claim.verificationStatus === 'pending_review') return false;
  return (
    claim.lifecycleState === 'approved' ||
    claim.verificationStatus === 'verified_source' ||
    claim.verificationStatus === 'user_confirmed'
  );
}

/**
 * Maps VerificationStatus to explicit ClaimLifecycleState
 */
export function resolveLifecycleState(claim: Pick<CareerClaim, 'verificationStatus' | 'lifecycleState'>): ClaimLifecycleState {
  if (claim.lifecycleState) return claim.lifecycleState;
  switch (claim.verificationStatus) {
    case 'verified_source':
    case 'user_confirmed':
      return 'approved';
    case 'discovered':
      return 'discovered';
    case 'pending_review':
      return 'pending_review';
    case 'rejected':
      return 'rejected';
  }
}
