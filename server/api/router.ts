/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Phase 1.5 Backend API Router
 * Enforces Firebase Admin ID Token Authentication, Single-Owner Authorization,
 * Owner-Scoped Durable Storage (Firestore / SQLite), Sample Data Isolation,
 * Input Length & Schema Validation, Rate Limiting, and Approved-Only Resume Generation.
 */

import { Router, type Request, type Response, type RequestHandler } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { defaultStorage } from '../storage/memory-storage.ts';
import type { StorageAdapter } from '../storage/storage.interface.ts';
import { SAMPLE_CAREER_PROFILE } from '../storage/sample-data.ts';
import { FirestoreStorageAdapter, StorageOperationError } from '../storage/firestore-storage.ts';
import { UntrustedDataGuard } from '../security/untrusted-data-guard.ts';
import {
  createOwnerAuthMiddleware,
  type TokenVerifier,
  type OwnerAuthPolicy
} from '../security/auth-middleware.ts';
import {
  createRateLimiter,
  redactSecrets,
  RequestValidationError,
  validateProfileUpdatePayload,
  validateClaimPatchPayload,
  validateEvidenceCreatePayload,
  validateResumeGeneratePayload
} from '../security/api-protection.ts';
import { GitHubSyncOrchestrator } from '../services/github-sync-orchestrator.ts';
import { GitHubApiError } from '../services/github-service.ts';
import {
  isClaimApproved,
  type CareerClaim,
  type EvidenceSource,
  type EvidenceSourceType,
  type ResumeStyle,
  type ResumeVersion,
  type VerificationStatus
} from '../../shared/types/career-profile.ts';

export interface ApiRouterOptions {
  storage?: StorageAdapter;
  verifier?: TokenVerifier;
  policy?: OwnerAuthPolicy;
  authMiddleware?: RequestHandler;
}

const SAMPLE_CLAIM_IDS = new Set(SAMPLE_CAREER_PROFILE.claims.map(c => c.id));
const SAMPLE_EVIDENCE_IDS = new Set(SAMPLE_CAREER_PROFILE.evidenceVault.map(e => e.id));

function resolveOwnerStorage(
  baseStorage: StorageAdapter,
  req: Request,
  hasExplicitStorageOverride = false
): StorageAdapter {
  const owner = req.authenticatedOwner;
  if (!owner || !owner.uid) {
    throw new Error('Request is missing authenticated owner context.');
  }
  const explicitDriver = process.env.STORAGE_DRIVER;
  const isRealFirebaseJwt =
    typeof owner.idToken === 'string' && owner.idToken.split('.').length === 3;
  if (
    !hasExplicitStorageOverride &&
    isRealFirebaseJwt &&
    explicitDriver !== 'sqlite' &&
    explicitDriver !== 'in-memory'
  ) {
    return new FirestoreStorageAdapter({ owner });
  }
  return baseStorage.forOwner ? baseStorage.forOwner(owner) : baseStorage;
}

/**
 * Helper: Promotes approved project/skill claims into profile.projects / profile.skills
 */
async function promoteApprovedClaimsToProfile(
  scopedStorage: StorageAdapter,
  approvedClaims: CareerClaim[]
): Promise<void> {
  const profile = await scopedStorage.getProfile();
  if (!profile) return;

  let changed = false;

  for (const claim of approvedClaims) {
    if (!isClaimApproved(claim)) continue;

    if (
      (claim.category === 'skill' || claim.proposedChangeType === 'add_skill') &&
      claim.sourceLabel
    ) {
      const skillName = claim.sourceLabel.trim();
      const exists = profile.skills.some(s => s.name.toLowerCase() === skillName.toLowerCase());
      if (!exists) {
        profile.skills.push({
          id: `skill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
          name: skillName,
          category: 'languages',
          evidenceIds: claim.evidenceIds,
          verificationStatus: 'user_confirmed',
          firstObservedDate: new Date().toISOString().slice(0, 10),
          lastObservedDate: new Date().toISOString().slice(0, 10),
          associatedRepositories: claim.repositoryRef ? [claim.repositoryRef] : []
        });
        changed = true;
      }
    }

    if (
      (claim.category === 'project' || claim.proposedChangeType === 'add_project') &&
      claim.sourceLabel
    ) {
      const projName = claim.sourceLabel.trim();
      const exists = profile.projects.some(p => p.name.toLowerCase() === projName.toLowerCase());
      if (!exists) {
        const repos = await scopedStorage.listRepositories();
        const matchedRepo = repos.find(
          r => r.name.toLowerCase() === projName.toLowerCase() || r.fullName === claim.repositoryRef
        );

        profile.projects.unshift({
          id: `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
          name: projName,
          description: matchedRepo?.description || claim.statement,
          repositoryUrl:
            matchedRepo?.htmlUrl ||
            (claim.repositoryRef ? `https://github.com/${claim.repositoryRef}` : 'https://github.com'),
          primaryLanguage: matchedRepo?.primaryLanguage || 'TypeScript',
          techStack: matchedRepo
            ? Object.keys(matchedRepo.languages).slice(0, 4)
            : ['TypeScript'],
          evidenceIds: claim.evidenceIds,
          verificationStatus: 'user_confirmed',
          metrics: [
            ...(matchedRepo && matchedRepo.stargazersCount > 0
              ? [{ label: 'GitHub Stars', value: String(matchedRepo.stargazersCount), claimId: claim.id }]
              : []),
            {
              label: 'Verification',
              value: claim.clarificationResponse ? 'Clarified & Approved' : 'Candidate Approved',
              claimId: claim.id
            }
          ]
        });
        changed = true;
      }
    }
  }

  if (changed) {
    await scopedStorage.saveProfile(profile);
  }
}

function sendControlledError(res: Response, error: unknown, defaultCode: string, defaultMessage: string): Response {
  if (error instanceof RequestValidationError) {
    return res.status(400).json({
      success: false,
      error: {
        code: error.code,
        message: redactSecrets(error.message)
      }
    });
  }
  if (error instanceof StorageOperationError) {
    const status =
      error.code === 'SAMPLE_DATA_REJECTED' ||
      error.code === 'SAMPLE_PROFILE_IMPORT_FORBIDDEN' ||
      error.code === 'PROFILE_ALREADY_EXISTS'
        ? 400
        : 503;
    return res.status(status).json({
      success: false,
      error: {
        code: error.code,
        message: redactSecrets(error.message)
      }
    });
  }
  const msg = error instanceof Error ? error.message : defaultMessage;
  if (msg.startsWith('SchemaValidationError')) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'SCHEMA_VALIDATION_ERROR',
        message: redactSecrets(msg)
      }
    });
  }
  const status = msg.toLowerCase().includes('not found') ? 404 : 500;
  return res.status(status).json({
    success: false,
    error: {
      code: defaultCode,
      message: redactSecrets(msg)
    }
  });
}

export function createApiRouter(options: ApiRouterOptions = {}): Router {
  const router = Router();
  const baseStorage = options.storage || defaultStorage;
  const requireOwnerAuth =
    options.authMiddleware ||
    createOwnerAuthMiddleware({
      verifier: options.verifier,
      policy: options.policy
    });

  const generalApiLimiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 120,
    operationLabel: 'API requests'
  });

  const expensiveOpLimiter = createRateLimiter({
    windowMs: 60_000,
    maxRequests: 10,
    operationLabel: 'AI resume synthesis & GitHub synchronization'
  });

  router.use(generalApiLimiter);

  /**
   * 1. Public Minimal Health Check (No private records or sensitive paths exposed)
   */
  router.get('/health', async (_req: Request, res: Response) => {
    try {
      const health = await baseStorage.getSystemHealth();
      res.status(200).json({
        success: true,
        data: {
          status: health.status,
          uptimeSeconds: health.uptimeSeconds,
          timestamp: health.timestamp,
          version: '1.5.0-phase1.5',
          storageDriver: health.storageDriver,
          storageMode: health.storageMode,
          profileLoaded: true,
          evidenceCount: health.evidenceCount,
          claimsCount: health.claimsCount,
          verifiedClaimsCount: health.verifiedClaimsCount,
          repositoriesCount: health.repositoriesCount ?? 0,
          syncRunsCount: health.syncRunsCount ?? 0,
          geminiConfigured: health.geminiConfigured,
          githubApiReady: health.githubApiReady,
          securityScannerActive: health.securityScannerActive,
          authConfigured: true
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: redactSecrets(error instanceof Error ? error.message : 'Health check failure')
        }
      });
    }
  });

  /**
   * 2. Public System Architecture Info
   */
  router.get('/system/info', async (_req: Request, res: Response) => {
    const health = await baseStorage.getSystemHealth();
    res.status(200).json({
      success: true,
      data: {
        appName: 'Foliovera',
        tagline: 'Your career, always current.',
        phase: 'Phase 1.5 — Production Security, Identity & Durable Career Storage',
        architecture: 'React 19 + Express + Firebase Auth (Admin SDK) + Cloud Firestore / SQLite',
        geminiSdkInstalled: true,
        storageDriver: health.storageDriver,
        storageMode: health.storageMode,
        storageArchitecture: `${health.storageDriver} (${health.storageMode})`,
        authRequired: true,
        securityRulesEnforced: [
          'Rule 3: Credentials never exposed to client or printed in logs',
          'Rule 4: Every career claim traceable to source evidence',
          'Rule 5: Zero hallucination / no fabricated skills or metrics',
          'Rule 6: Repository content treated strictly as untrusted data',
          'Phase 1.5: Firebase Admin ID token verification & single-owner authorization',
          'Phase 1.5: Strict isolation between sample demo data and personal profiles'
        ]
      }
    });
  });

  /**
   * 3. Read-Only Isolated Demonstration Profile (Alex Morgan)
   * Explicitly labeled isSampleData=true; never modifies or touches owner storage.
   */
  router.get('/demo/profile', (_req: Request, res: Response) => {
    const clonedSample = JSON.parse(JSON.stringify(SAMPLE_CAREER_PROFILE));
    clonedSample.isSampleData = true;
    res.status(200).json({
      success: true,
      data: clonedSample
    });
  });

  // ============================================================================
  // PROTECTED OWNER-ONLY ENDPOINTS (All routes below require verified owner token)
  // ============================================================================

  /**
   * Verify current authenticated owner session
   */
  router.get('/auth/session', requireOwnerAuth, async (req: Request, res: Response) => {
    const health = await baseStorage.getSystemHealth();
    res.status(200).json({
      success: true,
      data: {
        authenticated: true,
        isOwner: true,
        owner: {
          uid: req.authenticatedOwner!.uid,
          email: req.authenticatedOwner!.email,
          displayName: req.authenticatedOwner!.displayName
        },
        storageDriver: health.storageDriver,
        storageMode: health.storageMode
      }
    });
  });

  /**
   * Get authenticated owner's verified career profile
   */
  router.get('/profile', requireOwnerAuth, async (req: Request, res: Response) => {
    try {
      const scopedStorage = resolveOwnerStorage(baseStorage, req);
      const profile = await scopedStorage.getProfile();
      res.status(200).json({
        success: true,
        data: profile
      });
    } catch (error) {
      return sendControlledError(res, error, 'PROFILE_RETRIEVAL_FAILED', 'Could not fetch profile');
    }
  });

  /**
   * Initialize a genuinely empty personal profile for the authenticated owner
   */
  router.post('/profile/initialize', requireOwnerAuth, async (req: Request, res: Response) => {
    try {
      const scopedStorage = resolveOwnerStorage(baseStorage, req);
      const existing = await scopedStorage.getProfile();
      const forceReset = req.body?.forceReset === true;

      if (existing && !existing.isSampleData && existing.claims.length > 0 && !forceReset) {
        return res.status(200).json({
          success: true,
          data: existing
        });
      }

      if (scopedStorage.initializeEmptyProfile) {
        const created = await scopedStorage.initializeEmptyProfile(req.authenticatedOwner!);
        return res.status(201).json({
          success: true,
          data: created
        });
      }

      return res.status(200).json({
        success: true,
        data: existing
      });
    } catch (error) {
      return sendControlledError(res, error, 'PROFILE_INIT_FAILED', 'Failed to initialize empty owner profile');
    }
  });

  /**
   * Export authenticated owner's career profile bundle
   */
  router.get('/profile/export', requireOwnerAuth, async (req: Request, res: Response) => {
    try {
      const scopedStorage = resolveOwnerStorage(baseStorage, req);
      if (scopedStorage.exportProfileBundle) {
        const bundle = await scopedStorage.exportProfileBundle(req.authenticatedOwner!.uid);
        return res.status(200).json({
          success: true,
          data: bundle
        });
      }
      const profile = await scopedStorage.getProfile();
      return res.status(200).json({
        success: true,
        data: {
          schemaVersion: '1.5.0',
          exportedAt: new Date().toISOString(),
          ownerUid: req.authenticatedOwner!.uid,
          isSampleData: false,
          profile
        }
      });
    } catch (error) {
      return sendControlledError(res, error, 'PROFILE_EXPORT_FAILED', 'Failed to export profile bundle');
    }
  });

  /**
   * Import validated career data into authenticated owner's storage
   * Rejects sample demonstration profiles and preserves claim verification history.
   */
  router.post(
    '/profile/import',
    requireOwnerAuth,
    expensiveOpLimiter,
    async (req: Request, res: Response) => {
      try {
        const scopedStorage = resolveOwnerStorage(baseStorage, req);
        const incoming = req.body?.profile || req.body;
        const mode = req.body?.mode === 'initialize_if_empty' ? 'initialize_if_empty' : 'merge';

        if (!incoming || typeof incoming !== 'object') {
          throw new RequestValidationError('Import payload must contain a valid career profile object.');
        }

        if (!scopedStorage.importProfileBundle) {
          throw new Error('Active storage driver does not support profile bundle import.');
        }

        const result = await scopedStorage.importProfileBundle(
          req.authenticatedOwner!.uid,
          incoming,
          { mode }
        );
        const updatedProfile = await scopedStorage.getProfile();

        return res.status(200).json({
          success: true,
          data: {
            importSummary: result,
            profile: updatedProfile
          }
        });
      } catch (error) {
        return sendControlledError(res, error, 'PROFILE_IMPORT_FAILED', 'Failed to import career profile');
      }
    }
  );

  /**
   * Update authenticated owner's career profile
   */
  router.put('/profile', requireOwnerAuth, async (req: Request, res: Response) => {
    try {
      validateProfileUpdatePayload(req.body);
      const scopedStorage = resolveOwnerStorage(baseStorage, req);
      const current = await scopedStorage.getProfile();
      if (!current) {
        return res.status(404).json({
          success: false,
          error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not initialized' }
        });
      }

      const updates = req.body;
      const updatedProfile = {
        ...current,
        ownerUid: req.authenticatedOwner!.uid,
        isSampleData: false,
        candidateName:
          typeof updates.candidateName === 'string' && updates.candidateName.trim()
            ? updates.candidateName.trim()
            : current.candidateName,
        headline:
          typeof updates.headline === 'string' ? updates.headline.trim() : current.headline,
        summary:
          typeof updates.summary === 'string' ? updates.summary.trim() : current.summary,
        location:
          typeof updates.location === 'string' ? updates.location.trim() : current.location,
        email:
          typeof updates.email === 'string' ? updates.email.trim() : current.email,
        skills: Array.isArray(updates.skills) ? updates.skills : current.skills,
        experiences: Array.isArray(updates.experiences) ? updates.experiences : current.experiences,
        projects: Array.isArray(updates.projects) ? updates.projects : current.projects,
        education: Array.isArray(updates.education) ? updates.education : current.education,
        settings: updates.settings ? { ...current.settings, ...updates.settings } : current.settings
      };

      await scopedStorage.saveProfile(updatedProfile);
      await scopedStorage.appendAuditLog({
        actor: 'user',
        action: 'profile_updated',
        targetId: current.id,
        details:
          typeof updates.auditNote === 'string'
            ? updates.auditNote
            : 'Updated career profile details and preferences.'
      });

      const refreshed = await scopedStorage.getProfile();
      res.status(200).json({
        success: true,
        data: refreshed
      });
    } catch (error) {
      return sendControlledError(res, error, 'PROFILE_UPDATE_FAILED', 'Failed to update profile');
    }
  });

  /**
   * Connect GitHub username and synchronize repositories, evidence, and claims
   */
  router.post(
    '/github/sync',
    requireOwnerAuth,
    expensiveOpLimiter,
    async (req: Request, res: Response) => {
      try {
        const { username, maxRepos } = req.body || {};
        if (!username || typeof username !== 'string' || !username.trim() || username.length > 64) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_USERNAME',
              message: 'Please provide a valid GitHub username (1-64 chars) to synchronize.'
            }
          });
        }

        const scopedStorage = resolveOwnerStorage(baseStorage, req);
        const orchestrator = new GitHubSyncOrchestrator(scopedStorage);
        const result = await orchestrator.syncUserRepositories(username, {
          maxRepos: typeof maxRepos === 'number' ? Math.min(Math.max(maxRepos, 1), 25) : 8
        });

        const refreshedProfile = await scopedStorage.getProfile();
        res.status(200).json({
          success: true,
          data: {
            ...result,
            profile: refreshedProfile
          }
        });
      } catch (error) {
        const statusCode = error instanceof GitHubApiError ? error.statusCode : 400;
        const safeMsg = redactSecrets(
          error instanceof Error ? error.message : 'GitHub synchronization failed'
        );
        res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
          success: false,
          error: {
            code:
              error instanceof GitHubApiError && error.isRateLimit
                ? 'GITHUB_RATE_LIMITED'
                : 'GITHUB_SYNC_FAILED',
            message: safeMsg
          }
        });
      }
    }
  );

  /**
   * List synced GitHub repositories for authenticated owner
   */
  router.get('/github/repositories', requireOwnerAuth, async (req: Request, res: Response) => {
    try {
      const scopedStorage = resolveOwnerStorage(baseStorage, req);
      const repos = await scopedStorage.listRepositories();
      res.status(200).json({
        success: true,
        data: repos
      });
    } catch (error) {
      return sendControlledError(res, error, 'REPOS_RETRIEVAL_FAILED', 'Could not fetch repositories');
    }
  });

  /**
   * List synchronization history for authenticated owner
   */
  router.get('/github/sync-history', requireOwnerAuth, async (req: Request, res: Response) => {
    try {
      const scopedStorage = resolveOwnerStorage(baseStorage, req);
      const history = await scopedStorage.listSyncHistory();
      res.status(200).json({
        success: true,
        data: history
      });
    } catch (error) {
      return sendControlledError(res, error, 'SYNC_HISTORY_FAILED', 'Could not fetch sync history');
    }
  });

  /**
   * Claims list endpoint for authenticated owner
   */
  router.get('/claims', requireOwnerAuth, async (req: Request, res: Response) => {
    try {
      const scopedStorage = resolveOwnerStorage(baseStorage, req);
      const profile = await scopedStorage.getProfile();
      res.status(200).json({
        success: true,
        data: profile?.claims ?? []
      });
    } catch (error) {
      return sendControlledError(res, error, 'CLAIMS_RETRIEVAL_FAILED', 'Could not fetch claims');
    }
  });

  /**
   * Edit / Clarify a claim statement or contribution ownership
   */
  router.patch('/claims/:id', requireOwnerAuth, async (req: Request, res: Response) => {
    try {
      validateClaimPatchPayload(req.body);
      const scopedStorage = resolveOwnerStorage(baseStorage, req);
      const claimId = req.params.id;
      const { statement, category, clarificationResponse, ownershipStatus, notes } = req.body;

      const updated = await scopedStorage.updateClaim(claimId, {
        statement,
        category,
        clarificationResponse,
        ownershipStatus,
        notes
      });

      res.status(200).json({
        success: true,
        data: updated
      });
    } catch (error) {
      return sendControlledError(res, error, 'CLAIM_UPDATE_FAILED', 'Failed to update claim');
    }
  });

  /**
   * Delete a claim record
   */
  router.delete('/claims/:id', requireOwnerAuth, async (req: Request, res: Response) => {
    try {
      const scopedStorage = resolveOwnerStorage(baseStorage, req);
      const deleted = await scopedStorage.deleteClaim(req.params.id, 'user');
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: { code: 'CLAIM_NOT_FOUND', message: 'Claim not found' }
        });
      }
      res.status(200).json({ success: true, data: { id: req.params.id, deleted: true } });
    } catch (error) {
      return sendControlledError(res, error, 'CLAIM_DELETE_FAILED', 'Failed to delete claim');
    }
  });

  /**
   * Claim verification status update endpoint
   */
  router.post('/claims/:id/verify', requireOwnerAuth, async (req: Request, res: Response) => {
    try {
      const scopedStorage = resolveOwnerStorage(baseStorage, req);
      const claimId = req.params.id;
      const { status, note, clarificationResponse } = req.body || {};

      const allowedStatuses: VerificationStatus[] = [
        'verified_source',
        'user_confirmed',
        'discovered',
        'pending_review',
        'rejected'
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_STATUS',
            message:
              'Status must be one of: "verified_source", "user_confirmed", "discovered", "pending_review", "rejected"'
          }
        });
      }

      const updatedClaim = await scopedStorage.updateClaimVerification(
        claimId,
        status,
        'user',
        typeof note === 'string' ? note.slice(0, 1000) : undefined,
        typeof clarificationResponse === 'string' ? clarificationResponse.slice(0, 1000) : undefined
      );

      if (isClaimApproved(updatedClaim)) {
        await promoteApprovedClaimsToProfile(scopedStorage, [updatedClaim]);
      }

      res.status(200).json({
        success: true,
        data: updatedClaim
      });
    } catch (error) {
      return sendControlledError(
        res,
        error,
        'VERIFICATION_UPDATE_FAILED',
        'Failed to update claim verification'
      );
    }
  });

  /**
   * Batch verify/reject claims in the Review Queue
   */
  router.post('/claims/batch-verify', requireOwnerAuth, async (req: Request, res: Response) => {
    try {
      const scopedStorage = resolveOwnerStorage(baseStorage, req);
      const { claimIds, status, note } = req.body || {};
      if (!Array.isArray(claimIds) || claimIds.length === 0 || claimIds.length > 100) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_CLAIM_IDS',
            message: 'claimIds must be a non-empty array of up to 100 IDs'
          }
        });
      }
      if (!['verified_source', 'user_confirmed', 'pending_review', 'rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_STATUS', message: 'Invalid verification status' }
        });
      }

      const updated: CareerClaim[] = [];
      for (const id of claimIds) {
        const claim = await scopedStorage.updateClaimVerification(
          String(id),
          status,
          'user',
          typeof note === 'string'
            ? note.slice(0, 1000)
            : `Batch ${status === 'rejected' ? 'rejected' : 'approved'} via Review Queue`
        );
        updated.push(claim);
      }

      if (status === 'user_confirmed' || status === 'verified_source') {
        await promoteApprovedClaimsToProfile(scopedStorage, updated);
      }

      res.status(200).json({
        success: true,
        data: updated
      });
    } catch (error) {
      return sendControlledError(res, error, 'BATCH_VERIFY_FAILED', 'Batch verification failed');
    }
  });

  /**
   * Evidence vault list endpoint
   */
  router.get('/evidence', requireOwnerAuth, async (req: Request, res: Response) => {
    try {
      const scopedStorage = resolveOwnerStorage(baseStorage, req);
      const evidenceList = await scopedStorage.listEvidence();
      res.status(200).json({
        success: true,
        data: evidenceList
      });
    } catch (error) {
      return sendControlledError(res, error, 'EVIDENCE_RETRIEVAL_FAILED', 'Could not fetch evidence');
    }
  });

  /**
   * Add new evidence source to Vault (automatically passes through UntrustedDataGuard)
   */
  router.post('/evidence', requireOwnerAuth, async (req: Request, res: Response) => {
    try {
      validateEvidenceCreatePayload(req.body);
      const scopedStorage = resolveOwnerStorage(baseStorage, req);
      const { title, type, uri, rawContentSnippet, repository, commitSha, notes } = req.body;
      if (!title || !rawContentSnippet) {
        return res.status(400).json({
          success: false,
          error: { code: 'MISSING_FIELDS', message: 'Title and rawContentSnippet are required' }
        });
      }

      const scanResult = UntrustedDataGuard.sanitize(String(rawContentSnippet));
      const validTypes: EvidenceSourceType[] = [
        'github_repo',
        'github_commit',
        'github_pull_request',
        'github_release',
        'github_readme',
        'linkedin_import',
        'user_attestation',
        'credential_document'
      ];
      const sourceType: EvidenceSourceType = validTypes.includes(type) ? type : 'user_attestation';

      const newEvidence: EvidenceSource = {
        id: `evi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        type: sourceType,
        title: String(title).trim(),
        uri:
          typeof uri === 'string' && uri.trim()
            ? uri.trim()
            : `attestation://vault/${Date.now()}`,
        rawContentSnippet: scanResult.sanitizedText,
        provenance: {
          repository:
            typeof repository === 'string' && repository.trim() ? repository.trim() : undefined,
          commitSha:
            typeof commitSha === 'string' && commitSha.trim() ? commitSha.trim() : undefined,
          authorLogin: req.authenticatedOwner?.email || req.authenticatedOwner?.uid || 'verified-owner',
          sourceTimestamp: new Date().toISOString(),
          fetchedAt: new Date().toISOString()
        },
        securityScan: scanResult.metadata,
        verificationStatus: scanResult.metadata.injectionRiskDetected ? 'rejected' : 'user_confirmed',
        supportingExplanation: 'Manually ingested by authenticated owner and scanned by UntrustedDataGuard.',
        notes:
          typeof notes === 'string'
            ? notes
            : 'Ingested via Evidence Vault with UntrustedDataGuard verification'
      };

      const { evidence } = await scopedStorage.upsertEvidence(newEvidence);
      res.status(201).json({
        success: true,
        data: evidence
      });
    } catch (error) {
      return sendControlledError(res, error, 'EVIDENCE_CREATE_FAILED', 'Could not create evidence record');
    }
  });

  /**
   * Single evidence details endpoint
   */
  router.get('/evidence/:id', requireOwnerAuth, async (req: Request, res: Response) => {
    try {
      const scopedStorage = resolveOwnerStorage(baseStorage, req);
      const evidence = await scopedStorage.getEvidence(req.params.id);
      if (!evidence) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'EVIDENCE_NOT_FOUND',
            message: `Evidence with ID ${req.params.id} does not exist`
          }
        });
      }

      res.status(200).json({
        success: true,
        data: evidence
      });
    } catch (error) {
      return sendControlledError(res, error, 'EVIDENCE_RETRIEVAL_FAILED', 'Could not fetch evidence');
    }
  });

  /**
   * Delete evidence item endpoint
   */
  router.delete('/evidence/:id', requireOwnerAuth, async (req: Request, res: Response) => {
    try {
      const scopedStorage = resolveOwnerStorage(baseStorage, req);
      const deleted = await scopedStorage.deleteEvidence(req.params.id, 'user');
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: { code: 'EVIDENCE_NOT_FOUND', message: 'Evidence not found' }
        });
      }
      res.status(200).json({ success: true, data: { id: req.params.id, deleted: true } });
    } catch (error) {
      return sendControlledError(res, error, 'EVIDENCE_DELETE_FAILED', 'Failed to delete evidence');
    }
  });

  /**
   * Generate Role-Tailored Resume Version (Approved Claims Only & Zero Sample Contamination)
   */
  router.post(
    '/resume/generate',
    requireOwnerAuth,
    expensiveOpLimiter,
    async (req: Request, res: Response) => {
      try {
        validateResumeGeneratePayload(req.body);
        const scopedStorage = resolveOwnerStorage(baseStorage, req);
        const { targetRole, style, jobDescription, selectedClaimIds } = req.body || {};
        const profile = await scopedStorage.getProfile();
        if (!profile) {
          return res.status(404).json({
            success: false,
            error: { code: 'PROFILE_NOT_FOUND', message: 'Career profile not found' }
          });
        }

        // CRITICAL INVARIANT: Real user resumes must NEVER include sample profile data or sample claims
        if (profile.isSampleData) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'SAMPLE_PROFILE_GENERATION_FORBIDDEN',
              message: 'Cannot generate a personal verified resume from demonstration sample data.'
            }
          });
        }

        const roleTitle =
          typeof targetRole === 'string' && targetRole.trim()
            ? targetRole.trim()
            : 'Senior Distributed Systems Engineer';
        const resumeStyle: ResumeStyle = [
          'ats_professional',
          'editorial_executive',
          'systems_architect'
        ].includes(style)
          ? style
          : 'ats_professional';

        // Filter to APPROVED claims only, and strictly exclude any sample claim/evidence IDs
        const approvedClaims = profile.claims.filter(
          c =>
            isClaimApproved(c) &&
            !SAMPLE_CLAIM_IDS.has(c.id) &&
            !c.evidenceIds.some(eId => SAMPLE_EVIDENCE_IDS.has(eId))
        );

        const activeClaims =
          Array.isArray(selectedClaimIds) && selectedClaimIds.length > 0
            ? approvedClaims.filter(c => selectedClaimIds.includes(c.id))
            : approvedClaims;

        if (activeClaims.length === 0) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'NO_APPROVED_CLAIMS',
              message:
                'At least one approved, non-sample career claim is required to generate a verified resume.'
            }
          });
        }

        const skillNames = profile.skills.slice(0, 4).map(s => s.name);
        let tailoredSummary =
          skillNames.length > 0
            ? `${roleTitle} with proven expertise in ${skillNames.join(', ')}. Backed by ${activeClaims.length} approved, source-linked engineering accomplishments.`
            : `${roleTitle} backed by ${activeClaims.length} approved, source-linked engineering accomplishments.`;

        let tailoredBullets = activeClaims.map(c => ({
          claimId: c.id,
          text: c.statement,
          evidenceIds: c.evidenceIds,
          relevanceReason: `Approved claim linked to ${c.evidenceIds.join(', ')}`
        }));
        let generationEngine: 'gemini_verified' | 'deterministic_verified' = 'deterministic_verified';

        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey && apiKey !== 'MY_GEMINI_API_KEY' && apiKey.trim().length > 10) {
          try {
            const ai = new GoogleGenAI({
              apiKey,
              httpOptions: {
                headers: { 'User-Agent': 'aistudio-build' }
              }
            });

            const sanitizedJobContext =
              typeof jobDescription === 'string' && jobDescription.trim()
                ? UntrustedDataGuard.sanitize(jobDescription).sanitizedText
                : 'Focus on scalable architecture, reliability, and measurable technical impact.';

            const prompt = [
              `Target Role: ${roleTitle}`,
              `Resume Style: ${resumeStyle}`,
              `Job Context: ${sanitizedJobContext}`,
              `Approved Candidate Claims (ONLY use facts from these exact approved claims; NEVER invent metrics, titles, or skills):`,
              JSON.stringify(
                activeClaims.map(c => ({
                  id: c.id,
                  statement: c.statement,
                  evidenceIds: c.evidenceIds
                }))
              )
            ].join('\n\n');

            const response = await ai.models.generateContent({
              model: 'gemini-3.8-flash',
              contents: prompt,
              config: {
                systemInstruction:
                  'You are a strict, evidence-bound ATS resume tailoring engine. You must NEVER fabricate skills, metrics, or achievements. Write a concise 2-sentence executive summary tailored to the target role using ONLY the provided approved claims, and refine each approved claim for ATS clarity while keeping its exact metrics and claimId intact.',
                responseMimeType: 'application/json',
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    tailoredSummary: { type: Type.STRING },
                    bullets: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          claimId: { type: Type.STRING },
                          text: { type: Type.STRING },
                          relevanceReason: { type: Type.STRING }
                        }
                      }
                    }
                  }
                }
              }
            });

            const parsed = JSON.parse((response.text ?? '{}').trim());
            if (typeof parsed.tailoredSummary === 'string' && parsed.tailoredSummary.trim()) {
              tailoredSummary = parsed.tailoredSummary.trim();
            }
            if (Array.isArray(parsed.bullets) && parsed.bullets.length > 0) {
              const validBullets = [];
              for (const b of parsed.bullets) {
                const matchingClaim = activeClaims.find(c => c.id === b.claimId);
                if (matchingClaim && typeof b.text === 'string' && b.text.trim()) {
                  validBullets.push({
                    claimId: matchingClaim.id,
                    text: b.text.trim(),
                    evidenceIds: matchingClaim.evidenceIds,
                    relevanceReason:
                      typeof b.relevanceReason === 'string'
                        ? b.relevanceReason
                        : 'Tailored to role requirements'
                  });
                }
              }
              if (validBullets.length > 0) {
                tailoredBullets = validBullets;
                generationEngine = 'gemini_verified';
              }
            }
          } catch (geminiErr) {
            console.warn(
              '[Resume Generator] Falling back to deterministic verified engine:',
              redactSecrets(geminiErr instanceof Error ? geminiErr.message : String(geminiErr))
            );
          }
        }

        const existingVersions = profile.resumeVersions ?? [];
        const nextMajor = existingVersions.length + 1;
        const newVersion: ResumeVersion = {
          id: `res-v${Date.now().toString(36)}`,
          versionLabel: `v${nextMajor}.0`,
          targetRole: roleTitle,
          style: resumeStyle,
          createdAt: new Date().toISOString(),
          tailoredSummary,
          selectedClaimIds: activeClaims.map(c => c.id),
          selectedSkillIds: profile.skills.map(s => s.id),
          tailoredBullets,
          generationEngine
        };

        profile.resumeVersions = [newVersion, ...existingVersions];
        await scopedStorage.saveProfile(profile);
        await scopedStorage.appendAuditLog({
          actor: 'user',
          action: 'resume_generated',
          targetId: newVersion.id,
          details: `Generated tailored resume ${newVersion.versionLabel} for "${roleTitle}" (${tailoredBullets.length} approved claims cited).`
        });

        res.status(201).json({
          success: true,
          data: newVersion
        });
      } catch (error) {
        return sendControlledError(
          res,
          error,
          'RESUME_GENERATION_FAILED',
          'Failed to generate resume'
        );
      }
    }
  );

  /**
   * Untrusted data scan endpoint (Protected by owner auth & size limits)
   */
  router.post('/security/scan', requireOwnerAuth, (req: Request, res: Response) => {
    try {
      const { content } = req.body || {};
      if (typeof content !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PAYLOAD',
            message: 'Field "content" must be a string'
          }
        });
      }
      if (content.length > 32768) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: 'Field "content" exceeds maximum length of 32768 characters'
          }
        });
      }

      const result = UntrustedDataGuard.sanitize(content);
      const delimitedPrompt = UntrustedDataGuard.formatForAgentPrompt(
        'repository_content',
        result.sanitizedText
      );

      res.status(200).json({
        success: true,
        data: {
          ...result,
          delimitedPromptPreview: delimitedPrompt
        }
      });
    } catch (error) {
      return sendControlledError(res, error, 'SCAN_FAILED', 'Scan execution failed');
    }
  });

  /**
   * Audit log entries endpoint (Protected by owner auth)
   */
  router.get('/audit-logs', requireOwnerAuth, async (req: Request, res: Response) => {
    try {
      const scopedStorage = resolveOwnerStorage(baseStorage, req);
      const logs = await scopedStorage.getAuditLogs();
      res.status(200).json({
        success: true,
        data: logs
      });
    } catch (error) {
      return sendControlledError(res, error, 'AUDIT_LOGS_FAILED', 'Could not fetch audit logs');
    }
  });

  return router;
}

export const apiRouter = createApiRouter();
