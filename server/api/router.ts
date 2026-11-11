/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Phase 1 Backend API Router
 * Supports Persistent Career Storage, Official GitHub Sync, Career Evidence Extraction,
 * Explicit Claim Review Lifecycle (Discovered -> Pending Review -> Approved | Rejected),
 * Ownership Clarification, and Approved-Only Resume Generation.
 */

import { Router, type Request, type Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { defaultStorage } from '../storage/memory-storage.ts';
import { UntrustedDataGuard } from '../security/untrusted-data-guard.ts';
import { GitHubSyncOrchestrator } from '../services/github-sync-orchestrator.ts';
import { GitHubApiError, GitHubIntegrationService } from '../services/github-service.ts';
import {
  isClaimApproved,
  type CareerClaim,
  type EvidenceSource,
  type EvidenceSourceType,
  type ResumeStyle,
  type ResumeVersion,
  type VerificationStatus
} from '../../shared/types/career-profile.ts';

export const apiRouter = Router();

/**
 * Helper: Promotes approved project/skill claims into profile.projects / profile.skills
 */
async function promoteApprovedClaimsToProfile(approvedClaims: CareerClaim[]): Promise<void> {
  const profile = await defaultStorage.getProfile();
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
        const repos = await defaultStorage.listRepositories();
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
    await defaultStorage.saveProfile(profile);
  }
}

/**
 * Health check endpoint: verified status of server, persistent storage, and security guards
 */
apiRouter.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await defaultStorage.getSystemHealth();
    res.status(200).json({
      success: true,
      data: health
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'HEALTH_CHECK_FAILED',
        message: error instanceof Error ? error.message : 'Unknown health check failure'
      }
    });
  }
});

/**
 * Profile endpoint: returns verified career profile
 */
apiRouter.get('/profile', async (_req: Request, res: Response) => {
  try {
    const profile = await defaultStorage.getProfile();
    res.status(200).json({
      success: true,
      data: profile
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PROFILE_RETRIEVAL_FAILED',
        message: error instanceof Error ? error.message : 'Could not fetch profile'
      }
    });
  }
});

/**
 * Update profile endpoint: updates editable sections of the VerifiedCareerProfile
 */
apiRouter.put('/profile', async (req: Request, res: Response) => {
  try {
    const current = await defaultStorage.getProfile();
    if (!current) {
      return res.status(404).json({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not initialized' }
      });
    }

    const updates = req.body;
    const updatedProfile = {
      ...current,
      candidateName: typeof updates.candidateName === 'string' ? updates.candidateName : current.candidateName,
      headline: typeof updates.headline === 'string' ? updates.headline : current.headline,
      summary: typeof updates.summary === 'string' ? updates.summary : current.summary,
      location: typeof updates.location === 'string' ? updates.location : current.location,
      email: typeof updates.email === 'string' ? updates.email : current.email,
      skills: Array.isArray(updates.skills) ? updates.skills : current.skills,
      experiences: Array.isArray(updates.experiences) ? updates.experiences : current.experiences,
      projects: Array.isArray(updates.projects) ? updates.projects : current.projects,
      education: Array.isArray(updates.education) ? updates.education : current.education,
      settings: updates.settings ? { ...current.settings, ...updates.settings } : current.settings
    };

    await defaultStorage.saveProfile(updatedProfile);
    await defaultStorage.appendAuditLog({
      actor: 'user',
      action: 'profile_updated',
      targetId: current.id,
      details: typeof updates.auditNote === 'string' ? updates.auditNote : 'Updated career profile details and preferences.'
    });

    const refreshed = await defaultStorage.getProfile();
    res.status(200).json({
      success: true,
      data: refreshed
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PROFILE_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update profile'
      }
    });
  }
});

/**
 * Step 3 & Step 4: Connect GitHub username and synchronize repositories, evidence, and claims
 */
apiRouter.post('/github/sync', async (req: Request, res: Response) => {
  try {
    const { username, maxRepos } = req.body;
    if (!username || typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_USERNAME',
          message: 'Please provide a valid GitHub username to synchronize.'
        }
      });
    }

    const orchestrator = new GitHubSyncOrchestrator(defaultStorage);
    const result = await orchestrator.syncUserRepositories(username, {
      maxRepos: typeof maxRepos === 'number' ? Math.min(Math.max(maxRepos, 1), 25) : 8
    });

    const refreshedProfile = await defaultStorage.getProfile();
    res.status(200).json({
      success: true,
      data: {
        ...result,
        profile: refreshedProfile
      }
    });
  } catch (error) {
    const statusCode = error instanceof GitHubApiError ? error.statusCode : 400;
    const safeMsg = GitHubIntegrationService.redactSecrets(
      error instanceof Error ? error.message : 'GitHub synchronization failed'
    );
    res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      success: false,
      error: {
        code: error instanceof GitHubApiError && error.isRateLimit ? 'GITHUB_RATE_LIMITED' : 'GITHUB_SYNC_FAILED',
        message: safeMsg
      }
    });
  }
});

/**
 * List synced GitHub repositories
 */
apiRouter.get('/github/repositories', async (_req: Request, res: Response) => {
  try {
    const repos = await defaultStorage.listRepositories();
    res.status(200).json({
      success: true,
      data: repos
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPOS_RETRIEVAL_FAILED',
        message: error instanceof Error ? error.message : 'Could not fetch repositories'
      }
    });
  }
});

/**
 * List synchronization history
 */
apiRouter.get('/github/sync-history', async (_req: Request, res: Response) => {
  try {
    const history = await defaultStorage.listSyncHistory();
    res.status(200).json({
      success: true,
      data: history
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SYNC_HISTORY_FAILED',
        message: error instanceof Error ? error.message : 'Could not fetch sync history'
      }
    });
  }
});

/**
 * Claims list endpoint
 */
apiRouter.get('/claims', async (_req: Request, res: Response) => {
  try {
    const profile = await defaultStorage.getProfile();
    res.status(200).json({
      success: true,
      data: profile?.claims ?? []
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CLAIMS_RETRIEVAL_FAILED',
        message: error instanceof Error ? error.message : 'Could not fetch claims'
      }
    });
  }
});

/**
 * Edit / Clarify a claim statement or contribution ownership
 */
apiRouter.patch('/claims/:id', async (req: Request, res: Response) => {
  try {
    const claimId = req.params.id;
    const { statement, category, clarificationResponse, ownershipStatus, notes } = req.body;

    const updated = await defaultStorage.updateClaim(claimId, {
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
    res.status(error instanceof Error && error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: {
        code: 'CLAIM_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update claim'
      }
    });
  }
});

/**
 * Delete a claim record
 */
apiRouter.delete('/claims/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await defaultStorage.deleteClaim(req.params.id, 'user');
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: { code: 'CLAIM_NOT_FOUND', message: 'Claim not found' }
      });
    }
    res.status(200).json({ success: true, data: { id: req.params.id, deleted: true } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CLAIM_DELETE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to delete claim'
      }
    });
  }
});

/**
 * Claim verification status update endpoint
 * Supports Discovered -> Pending Review -> Approved (user_confirmed / verified_source) | Rejected
 */
apiRouter.post('/claims/:id/verify', async (req: Request, res: Response) => {
  try {
    const claimId = req.params.id;
    const { status, note, clarificationResponse } = req.body;

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
          message: 'Status must be one of: "verified_source", "user_confirmed", "discovered", "pending_review", "rejected"'
        }
      });
    }

    const updatedClaim = await defaultStorage.updateClaimVerification(
      claimId,
      status,
      'user',
      typeof note === 'string' ? note : undefined,
      typeof clarificationResponse === 'string' ? clarificationResponse : undefined
    );

    if (isClaimApproved(updatedClaim)) {
      await promoteApprovedClaimsToProfile([updatedClaim]);
    }

    res.status(200).json({
      success: true,
      data: updatedClaim
    });
  } catch (error) {
    res.status(error instanceof Error && error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: {
        code: 'VERIFICATION_UPDATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to update claim verification'
      }
    });
  }
});

/**
 * Batch verify/reject claims in the Review Queue
 */
apiRouter.post('/claims/batch-verify', async (req: Request, res: Response) => {
  try {
    const { claimIds, status, note } = req.body;
    if (!Array.isArray(claimIds) || claimIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_CLAIM_IDS', message: 'claimIds must be a non-empty array' }
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
      const claim = await defaultStorage.updateClaimVerification(
        String(id),
        status,
        'user',
        typeof note === 'string' ? note : `Batch ${status === 'rejected' ? 'rejected' : 'approved'} via Review Queue`
      );
      updated.push(claim);
    }

    if (status === 'user_confirmed' || status === 'verified_source') {
      await promoteApprovedClaimsToProfile(updated);
    }

    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'BATCH_VERIFY_FAILED',
        message: error instanceof Error ? error.message : 'Batch verification failed'
      }
    });
  }
});

/**
 * Evidence vault list endpoint
 */
apiRouter.get('/evidence', async (_req: Request, res: Response) => {
  try {
    const evidenceList = await defaultStorage.listEvidence();
    res.status(200).json({
      success: true,
      data: evidenceList
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'EVIDENCE_RETRIEVAL_FAILED',
        message: error instanceof Error ? error.message : 'Could not fetch evidence'
      }
    });
  }
});

/**
 * Add new evidence source to Vault (automatically passes through UntrustedDataGuard)
 */
apiRouter.post('/evidence', async (req: Request, res: Response) => {
  try {
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
      id: `evi-${Date.now().toString(36)}`,
      type: sourceType,
      title: String(title).trim(),
      uri: typeof uri === 'string' && uri.trim() ? uri.trim() : `attestation://vault/${Date.now()}`,
      rawContentSnippet: scanResult.sanitizedText,
      provenance: {
        repository: typeof repository === 'string' && repository.trim() ? repository.trim() : undefined,
        commitSha: typeof commitSha === 'string' && commitSha.trim() ? commitSha.trim() : undefined,
        authorLogin: 'alex-morgan-sample',
        sourceTimestamp: new Date().toISOString(),
        fetchedAt: new Date().toISOString()
      },
      securityScan: scanResult.metadata,
      verificationStatus: scanResult.metadata.injectionRiskDetected ? 'rejected' : 'user_confirmed',
      supportingExplanation: 'Manually ingested by candidate and scanned by UntrustedDataGuard.',
      notes: typeof notes === 'string' ? notes : 'Ingested via Evidence Vault with UntrustedDataGuard verification'
    };

    const { evidence } = await defaultStorage.upsertEvidence(newEvidence);
    res.status(201).json({
      success: true,
      data: evidence
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'EVIDENCE_CREATE_FAILED',
        message: error instanceof Error ? error.message : 'Could not create evidence record'
      }
    });
  }
});

/**
 * Single evidence details endpoint
 */
apiRouter.get('/evidence/:id', async (req: Request, res: Response) => {
  try {
    const evidence = await defaultStorage.getEvidence(req.params.id);
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
    res.status(500).json({
      success: false,
      error: {
        code: 'EVIDENCE_RETRIEVAL_FAILED',
        message: error instanceof Error ? error.message : 'Could not fetch evidence'
      }
    });
  }
});

/**
 * Delete evidence item endpoint
 */
apiRouter.delete('/evidence/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await defaultStorage.deleteEvidence(req.params.id, 'user');
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: { code: 'EVIDENCE_NOT_FOUND', message: 'Evidence not found' }
      });
    }
    res.status(200).json({ success: true, data: { id: req.params.id, deleted: true } });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'EVIDENCE_DELETE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to delete evidence'
      }
    });
  }
});

/**
 * Generate Role-Tailored Resume Version (Step 5 & 6: Approved Claims Only)
 * Strictly excludes discovered, pending_review, or rejected claims.
 */
apiRouter.post('/resume/generate', async (req: Request, res: Response) => {
  try {
    const { targetRole, style, jobDescription, selectedClaimIds } = req.body;
    const profile = await defaultStorage.getProfile();
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'Career profile not found' }
      });
    }

    const roleTitle = typeof targetRole === 'string' && targetRole.trim()
      ? targetRole.trim()
      : 'Senior Distributed Systems Engineer';
    const resumeStyle: ResumeStyle = ['ats_professional', 'editorial_executive', 'systems_architect'].includes(style)
      ? style
      : 'ats_professional';

    // CRITICAL INVARIANT: Strictly filter to APPROVED claims only (Rule 4 & Step 5)
    const approvedClaims = profile.claims.filter(c => isClaimApproved(c));

    const activeClaims = Array.isArray(selectedClaimIds) && selectedClaimIds.length > 0
      ? approvedClaims.filter(c => selectedClaimIds.includes(c.id))
      : approvedClaims;

    if (activeClaims.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_APPROVED_CLAIMS',
          message: 'At least one approved career claim is required to generate a verified resume.'
        }
      });
    }

    let tailoredSummary = `${roleTitle} with proven expertise in ${profile.skills.slice(0, 4).map(s => s.name).join(', ')}. Backed by ${activeClaims.length} approved, source-linked engineering accomplishments.`;
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

        const sanitizedJobContext = typeof jobDescription === 'string' && jobDescription.trim()
          ? UntrustedDataGuard.sanitize(jobDescription).sanitizedText
          : 'Focus on scalable architecture, reliability, and measurable technical impact.';

        const prompt = [
          `Target Role: ${roleTitle}`,
          `Resume Style: ${resumeStyle}`,
          `Job Context: ${sanitizedJobContext}`,
          `Approved Candidate Claims (ONLY use facts from these exact approved claims; NEVER invent metrics, titles, or skills):`,
          JSON.stringify(activeClaims.map(c => ({ id: c.id, statement: c.statement, evidenceIds: c.evidenceIds })))
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
                relevanceReason: typeof b.relevanceReason === 'string' ? b.relevanceReason : 'Tailored to role requirements'
              });
            }
          }
          if (validBullets.length > 0) {
            tailoredBullets = validBullets;
            generationEngine = 'gemini_verified';
          }
        }
      } catch (geminiErr) {
        console.warn('[Resume Generator] Falling back to deterministic verified engine:', geminiErr);
      }
    }

    const existingVersions = profile.resumeVersions ?? [];
    const nextMajor = existingVersions.length + 4;
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
    await defaultStorage.saveProfile(profile);
    await defaultStorage.appendAuditLog({
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
    res.status(500).json({
      success: false,
      error: {
        code: 'RESUME_GENERATION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to generate resume'
      }
    });
  }
});

/**
 * Untrusted data scan endpoint
 */
apiRouter.post('/security/scan', (req: Request, res: Response) => {
  try {
    const { content } = req.body;
    if (typeof content !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PAYLOAD',
          message: 'Field "content" must be a string'
        }
      });
    }

    const result = UntrustedDataGuard.sanitize(content);
    const delimitedPrompt = UntrustedDataGuard.formatForAgentPrompt('repository_content', result.sanitizedText);

    res.status(200).json({
      success: true,
      data: {
        ...result,
        delimitedPromptPreview: delimitedPrompt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SCAN_FAILED',
        message: error instanceof Error ? error.message : 'Scan execution failed'
      }
    });
  }
});

/**
 * Audit log entries endpoint
 */
apiRouter.get('/audit-logs', async (_req: Request, res: Response) => {
  try {
    const logs = await defaultStorage.getAuditLogs();
    res.status(200).json({
      success: true,
      data: logs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'AUDIT_LOGS_FAILED',
        message: error instanceof Error ? error.message : 'Could not fetch audit logs'
      }
    });
  }
});

/**
 * Architectural specification and roadmap progress
 */
apiRouter.get('/system/info', async (_req: Request, res: Response) => {
  const health = await defaultStorage.getSystemHealth();
  res.status(200).json({
    success: true,
    data: {
      appName: 'Foliovera',
      tagline: 'Your career, always current.',
      phase: 'Phase 1 — GitHub Intelligence & Persistent Evidence System',
      architecture: 'Client-Server Decoupled (Vite React + Express TypeScript + Persistent SQLite)',
      geminiSdkInstalled: true,
      storageArchitecture: `PersistentSqliteStorageAdapter (${health.storageDriver} · ${health.storageMode})`,
      securityRulesEnforced: [
        'Rule 3: Credentials never exposed to client or printed in logs',
        'Rule 4: Every career claim traceable to source evidence',
        'Rule 5: Zero hallucination / no fabricated skills or metrics',
        'Rule 6: Repository content treated strictly as untrusted data',
        'Step 5: Repository existence never conflated with personal authorship'
      ]
    }
  });
});
