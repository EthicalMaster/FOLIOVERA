/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Living Resume Agent — Step 4: Career Evidence Extraction Service
 *
 * Principles:
 * - Deterministic extraction wherever practical (languages, topics, known frameworks, author commits).
 * - Treats all external repository content (READMEs, descriptions, commits) as untrusted data via UntrustedDataGuard.
 * - Never invents achievements, quantified results, employment experience, or technical skills.
 * - Flags uncertain contribution ownership (e.g., forked repos or 0 author-matched commits) with a clarification prompt.
 */

import type {
  CareerClaim,
  EvidenceSource,
  OwnershipStatus
} from '../../shared/types/career-profile.ts';
import type { DiscoveredRepoBundle } from './github-service.ts';
import { UntrustedDataGuard } from '../security/untrusted-data-guard.ts';
import { SchemaValidator } from '../storage/schema-validator.ts';

export interface ExtractionBatchResult {
  evidenceRecords: EvidenceSource[];
  extractedClaims: CareerClaim[];
  securityFlagsCount: number;
}

// Curated deterministic catalog of frameworks, libraries, and infrastructure tools
const KNOWN_FRAMEWORKS_AND_TOOLS: { pattern: RegExp; canonicalName: string; category: 'frameworks' | 'infrastructure' | 'tools' }[] = [
  { pattern: /\breact(?:\.js|js)?\b/i, canonicalName: 'React', category: 'frameworks' },
  { pattern: /\bnext(?:\.js|js)\b/i, canonicalName: 'Next.js', category: 'frameworks' },
  { pattern: /\bexpress(?:\.js|js)?\b/i, canonicalName: 'Express.js', category: 'frameworks' },
  { pattern: /\bnode(?:\.js|js)\b/i, canonicalName: 'Node.js', category: 'frameworks' },
  { pattern: /\btailwind(?:css)?\b/i, canonicalName: 'Tailwind CSS', category: 'frameworks' },
  { pattern: /\bpostgres(?:ql)?\b/i, canonicalName: 'PostgreSQL', category: 'infrastructure' },
  { pattern: /\bsqlite\b/i, canonicalName: 'SQLite', category: 'infrastructure' },
  { pattern: /\bdocker\b/i, canonicalName: 'Docker', category: 'infrastructure' },
  { pattern: /\bkubernetes|\bk8s\b/i, canonicalName: 'Kubernetes', category: 'infrastructure' },
  { pattern: /\bopentelemetry\b/i, canonicalName: 'OpenTelemetry', category: 'tools' },
  { pattern: /\bgraphql\b/i, canonicalName: 'GraphQL', category: 'frameworks' },
  { pattern: /\bredis\b/i, canonicalName: 'Redis', category: 'infrastructure' },
  { pattern: /\bvitest|\bjest\b/i, canonicalName: 'Automated Testing (Vitest/Jest)', category: 'tools' },
  { pattern: /\bgithub\s+actions\b/i, canonicalName: 'GitHub Actions CI/CD', category: 'tools' }
];

export class CareerEvidenceExtractor {
  /**
   * Processes discovered repository bundles into deduplicated EvidenceSource and CareerClaim records.
   */
  public static extractFromBundles(
    username: string,
    bundles: DiscoveredRepoBundle[]
  ): ExtractionBatchResult {
    const evidenceRecords: EvidenceSource[] = [];
    const extractedClaims: CareerClaim[] = [];
    let securityFlagsCount = 0;
    const nowIso = new Date().toISOString();

    // Track skills across all repos in this sync batch to create consolidated, multi-evidence skill claims
    const skillEvidenceMap = new Map<
      string,
      {
        evidenceIds: Set<string>;
        repos: Set<string>;
        commits: Set<string>;
        ownership: OwnershipStatus;
        kind: 'language' | 'framework';
      }
    >();

    for (const bundle of bundles) {
      const repo = bundle.repository;
      if (repo.sizeKb === 0 && bundle.userCommits.length === 0 && !bundle.readmeRawContent) {
        // Empty repository: skip claim extraction as there is no substantive evidence
        continue;
      }

      // 1. Sanitize repository description and README via UntrustedDataGuard
      const rawCombinedText = [
        repo.description || '',
        bundle.readmeRawContent ? bundle.readmeRawContent.slice(0, 4000) : ''
      ]
        .filter(Boolean)
        .join('\n\n');

      const scanResult = UntrustedDataGuard.sanitize(rawCombinedText || `Repository ${repo.fullName}`);
      if (scanResult.metadata.injectionRiskDetected) {
        securityFlagsCount += 1;
      }

      const latestCommitSha = bundle.userCommits[0]?.sha || repo.latestCommitSha;
      const repoEvidenceId = SchemaValidator.computeFingerprint('evi_repo', repo.fullName);

      const repoEvidence: EvidenceSource = {
        id: repoEvidenceId,
        fingerprint: SchemaValidator.computeFingerprint('evidence', 'github_repo', repo.htmlUrl),
        type: 'github_repo',
        title: `GitHub Repository: ${repo.fullName}`,
        uri: repo.htmlUrl,
        rawContentSnippet: scanResult.sanitizedText.slice(0, 600) || `Repository ${repo.fullName} (${repo.primaryLanguage})`,
        provenance: {
          repository: repo.fullName,
          commitSha: latestCommitSha,
          authorLogin: repo.ownerLogin,
          branch: repo.defaultBranch,
          sourceTimestamp: repo.pushedAt || nowIso,
          fetchedAt: nowIso
        },
        securityScan: scanResult.metadata,
        verificationStatus: scanResult.metadata.injectionRiskDetected ? 'rejected' : 'pending_review',
        supportingExplanation:
          bundle.userCommits.length > 0
            ? `Repository metadata and ${bundle.userCommits.length} commit(s) authored by @${username} (latest SHA: ${latestCommitSha?.slice(0, 8)}).`
            : repo.isFork
            ? `Forked repository (${repo.fullName}) with 0 directly matched commits by @${username} in recent window.`
            : `Public repository under @${repo.ownerLogin}; commit authorship requires user confirmation.`,
        notes: repo.isFork ? 'Forked repository — personal contribution scope requires candidate confirmation.' : 'Discovered via official GitHub API.'
      };

      evidenceRecords.push(repoEvidence);

      // 2. Also create an explicit commit evidence record if the user authored commits
      let primaryCommitEvidenceId: string | undefined;
      if (bundle.userCommits.length > 0) {
        const topCommit = bundle.userCommits[0];
        const commitScan = UntrustedDataGuard.sanitize(topCommit.message);
        if (commitScan.metadata.injectionRiskDetected) {
          securityFlagsCount += 1;
        }
        primaryCommitEvidenceId = SchemaValidator.computeFingerprint('evi_commit', repo.fullName, topCommit.sha);

        evidenceRecords.push({
          id: primaryCommitEvidenceId,
          fingerprint: SchemaValidator.computeFingerprint('evidence', 'github_commit', topCommit.htmlUrl, topCommit.sha),
          type: 'github_commit',
          title: `Commit ${topCommit.sha.slice(0, 7)} in ${repo.fullName}`,
          uri: topCommit.htmlUrl,
          rawContentSnippet: commitScan.sanitizedText,
          provenance: {
            repository: repo.fullName,
            commitSha: topCommit.sha,
            authorLogin: topCommit.authorLogin || username,
            branch: repo.defaultBranch,
            sourceTimestamp: topCommit.authorDate,
            fetchedAt: nowIso
          },
          securityScan: commitScan.metadata,
          verificationStatus: commitScan.metadata.injectionRiskDetected ? 'rejected' : 'pending_review',
          supportingExplanation: `Authored commit ${topCommit.sha.slice(0, 8)} by @${topCommit.authorLogin || username} in ${repo.fullName}.`
        });
      }

      // If prompt injection was detected in this repository's README/description, quarantine and do NOT extract claims from its untrusted text!
      if (scanResult.metadata.injectionRiskDetected) {
        continue;
      }

      const linkedEvIds = primaryCommitEvidenceId
        ? [repoEvidenceId, primaryCommitEvidenceId]
        : [repoEvidenceId];

      const ownership = repo.ownershipStatus;
      const needsClarification = ownership === 'uncertain_ownership' || repo.isFork;

      const clarificationPrompt = needsClarification
        ? repo.isFork
          ? `Repository "${repo.fullName}" is a fork. GitHub metadata shows the repository exists, but cannot automatically verify which components you personally authored. Please specify your personal contributions before approving.`
          : `No recent commits authored directly by @${username} were matched in "${repo.fullName}". Please confirm your personal role and contributions before approving.`
        : undefined;

      // 3. Extract Project / Contribution Claim
      const languageList = Object.keys(repo.languages).filter(l => l && l !== 'Unknown');
      const primaryTech = languageList.length > 0 ? languageList.slice(0, 3).join(', ') : repo.primaryLanguage;
      const cleanDesc =
        repo.description && repo.description !== 'No description provided.'
          ? repo.description.replace(/\.$/, '')
          : `Software project built with ${primaryTech}`;

      const projectStatement =
        bundle.userCommits.length > 0 && !repo.isFork
          ? `Developed and maintained ${repo.name} (${primaryTech}): ${cleanDesc}, with ${bundle.userCommits.length} verified author commit(s)${repo.stargazersCount > 0 ? ` and ${repo.stargazersCount} GitHub star(s)` : ''}.`
          : `Contributed to repository ${repo.name} (${primaryTech}): ${cleanDesc}.`;

      const projectClaimId = SchemaValidator.computeFingerprint('claim_proj', repo.fullName);
      extractedClaims.push({
        id: projectClaimId,
        fingerprint: SchemaValidator.computeFingerprint('claim', 'project', repo.fullName),
        category: 'project',
        statement: projectStatement,
        evidenceIds: linkedEvIds,
        repositoryRef: repo.fullName,
        commitRef: latestCommitSha,
        extractedAt: nowIso,
        supportingExplanation:
          bundle.userCommits.length > 0
            ? `Supported by repository ${repo.fullName} and ${bundle.userCommits.length} author-matched commit(s) (latest: ${latestCommitSha?.slice(0, 8)}).`
            : `Discovered from public repository ${repo.fullName}; personal authorship requires candidate clarification.`,
        verificationStatus: 'pending_review',
        lifecycleState: needsClarification ? 'pending_review' : 'discovered',
        ownershipStatus: ownership,
        clarificationPrompt,
        confidenceScore: ownership === 'verified_author' ? 0.9 : ownership === 'contributor' ? 0.78 : 0.55,
        verifiedBy: 'deterministic_matcher',
        proposedChangeType: 'add_project',
        sourceLabel: repo.name,
        discoveredRelativeTime: 'Just synced'
      });

      // 4. Accumulate Technical Languages (only from real GitHub language breakdown)
      for (const lang of languageList.slice(0, 4)) {
        const entry = skillEvidenceMap.get(lang) || {
          evidenceIds: new Set<string>(),
          repos: new Set<string>(),
          commits: new Set<string>(),
          ownership,
          kind: 'language' as const
        };
        linkedEvIds.forEach(id => entry.evidenceIds.add(id));
        entry.repos.add(repo.fullName);
        if (latestCommitSha) entry.commits.add(latestCommitSha.slice(0, 8));
        if (ownership === 'verified_author') entry.ownership = 'verified_author';
        skillEvidenceMap.set(lang, entry);
      }

      // 5. Deterministically detect known frameworks & tools from topics + sanitized description/README
      const searchableCorpus = `${repo.topics.join(' ')} ${scanResult.sanitizedText}`;
      for (const fw of KNOWN_FRAMEWORKS_AND_TOOLS) {
        if (fw.pattern.test(searchableCorpus)) {
          const entry = skillEvidenceMap.get(fw.canonicalName) || {
            evidenceIds: new Set<string>(),
            repos: new Set<string>(),
            commits: new Set<string>(),
            ownership,
            kind: 'framework' as const
          };
          linkedEvIds.forEach(id => entry.evidenceIds.add(id));
          entry.repos.add(repo.fullName);
          if (latestCommitSha) entry.commits.add(latestCommitSha.slice(0, 8));
          if (ownership === 'verified_author') entry.ownership = 'verified_author';
          skillEvidenceMap.set(fw.canonicalName, entry);
        }
      }
    }

    // 6. Emit consolidated Skill & Technology Claims
    for (const [skillName, info] of skillEvidenceMap.entries()) {
      const repoList = Array.from(info.repos);
      const commitList = Array.from(info.commits);
      const isUncertain = info.ownership === 'uncertain_ownership';

      const skillClaimId = SchemaValidator.computeFingerprint('claim_skill', skillName.toLowerCase());
      extractedClaims.push({
        id: skillClaimId,
        fingerprint: SchemaValidator.computeFingerprint('claim', 'skill', skillName.toLowerCase()),
        category: 'skill',
        statement: `Applied ${skillName} across ${repoList.length} repository(ies): ${repoList.join(', ')}.`,
        evidenceIds: Array.from(info.evidenceIds),
        repositoryRef: repoList[0],
        commitRef: commitList[0],
        extractedAt: nowIso,
        supportingExplanation: `Detected deterministically in ${info.kind === 'language' ? 'GitHub language analysis' : 'repository topics/documentation'} across ${repoList.join(', ')}${commitList.length > 0 ? ` (commits: ${commitList.join(', ')})` : ''}.`,
        verificationStatus: 'pending_review',
        lifecycleState: isUncertain ? 'pending_review' : 'discovered',
        ownershipStatus: info.ownership,
        clarificationPrompt: isUncertain
          ? `Skill "${skillName}" was detected in ${repoList.join(', ')}, where personal commit authorship is not yet confirmed. Please confirm your hands-on experience with ${skillName}.`
          : undefined,
        confidenceScore: info.ownership === 'verified_author' ? 0.88 : 0.62,
        verifiedBy: 'deterministic_matcher',
        proposedChangeType: 'add_skill',
        sourceLabel: skillName,
        discoveredRelativeTime: 'Just synced'
      });
    }

    return {
      evidenceRecords,
      extractedClaims,
      securityFlagsCount
    };
  }
}
