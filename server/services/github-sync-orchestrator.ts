/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — GitHub Synchronization Orchestrator
 * Coordinates GitHubIntegrationService, CareerEvidenceExtractor, and StorageAdapter
 * with deduplication, sync history tracking, and rate-limit resilience.
 */

import { StorageAdapter } from '../storage/storage.interface';
import {
  GitHubIntegrationService,
  GitHubApiError,
  FetchFunction
} from './github-service';
import { CareerEvidenceExtractor } from './evidence-extractor';
import { SyncHistoryRecord } from '../../shared/types/career-profile';

export interface SyncExecutionResult {
  syncRecord: SyncHistoryRecord;
  newEvidenceCount: number;
  newClaimsCount: number;
  duplicatesSkipped: number;
  repositoriesScanned: number;
}

export class GitHubSyncOrchestrator {
  private storage: StorageAdapter;
  private githubService: GitHubIntegrationService;

  constructor(
    storage: StorageAdapter,
    fetchOrService?: FetchFunction | GitHubIntegrationService
  ) {
    this.storage = storage;
    this.githubService =
      fetchOrService instanceof GitHubIntegrationService
        ? fetchOrService
        : new GitHubIntegrationService(fetchOrService);
  }

  public async syncUserRepositories(
    rawUsername: string,
    options: { maxRepos?: number; token?: string } = {}
  ): Promise<SyncExecutionResult> {
    const startedAt = new Date().toISOString();
    const cleanUsername = GitHubIntegrationService.validateUsername(rawUsername);
    const syncId = `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      const discovery = await this.githubService.discoverUserRepositories(cleanUsername, {
        maxRepos: options.maxRepos ?? 10,
        token: options.token
      });

      let meaningfulUpdatesFound = 0;
      for (const bundle of discovery.bundles) {
        const { updated } = await this.storage.upsertRepository(bundle.repository);
        if (updated) meaningfulUpdatesFound += 1;
      }

      const extraction = CareerEvidenceExtractor.extractFromBundles(
        discovery.username,
        discovery.bundles
      );

      let newEvidenceCount = 0;
      let duplicatesSkipped = 0;

      for (const ev of extraction.evidenceRecords) {
        const { created } = await this.storage.upsertEvidence(ev);
        if (created) {
          newEvidenceCount += 1;
        } else {
          duplicatesSkipped += 1;
        }
      }

      let newClaimsCount = 0;
      for (const claim of extraction.extractedClaims) {
        const { created } = await this.storage.upsertClaim(claim);
        if (created) {
          newClaimsCount += 1;
        } else {
          duplicatesSkipped += 1;
        }
      }

      const completedAt = new Date().toISOString();
      const syncRecord: SyncHistoryRecord = {
        id: syncId,
        provider: 'github',
        username: discovery.username,
        startedAt,
        completedAt,
        status: 'success',
        repositoriesScanned: discovery.bundles.length,
        meaningfulUpdatesFound,
        newEvidenceCount,
        newClaimsCount,
        duplicatesSkipped,
        rateLimitRemaining: discovery.rateLimitRemaining,
        rateLimitResetAt: discovery.rateLimitResetAt
      };

      await this.storage.addSyncHistory(syncRecord);

      // Update profile settings with connection status
      const profile = await this.storage.getProfile();
      if (profile) {
        const existingSettings = profile.settings ?? {
          autoSyncEnabled: true,
          requireHumanReviewForProfileUpdates: true,
          strictPromptInjectionQuarantine: true,
          defaultTargetRole: 'Principal Distributed Systems Engineer',
          defaultResumeStyle: 'ats_professional',
          includeEvidenceFootnotes: true,
          reducedMotion: false,
          connectedAccounts: []
        };

        const updatedAccounts = (existingSettings.connectedAccounts ?? []).map(acc =>
          acc.provider === 'github'
            ? {
                ...acc,
                handle: `@${discovery.username}`,
                connected: true,
                lastSync: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                mode: discovery.authenticated ? 'Authenticated REST API' : 'Public Read-Only API',
                error: undefined
              }
            : acc
        );

        profile.settings = {
          ...existingSettings,
          connectedAccounts: updatedAccounts,
          githubConnection: {
            username: discovery.username,
            connectedAt: existingSettings.githubConnection?.connectedAt || startedAt,
            lastSyncedAt: completedAt,
            lastSyncStatus: 'success',
            lastSyncError: undefined,
            publicReposCount: discovery.bundles.length,
            authenticatedMode: discovery.authenticated,
            rateLimitRemaining: discovery.rateLimitRemaining
          }
        };

        await this.storage.saveProfile(profile);
      }

      await this.storage.appendAuditLog({
        actor: 'github_sync',
        action: 'github_sync_completed',
        targetId: discovery.username,
        details: `Synced @${discovery.username}: ${discovery.bundles.length} repo(s) scanned, ${newEvidenceCount} new evidence item(s), ${newClaimsCount} new claim(s), ${duplicatesSkipped} duplicate(s) skipped.`
      });

      return {
        syncRecord,
        newEvidenceCount,
        newClaimsCount,
        duplicatesSkipped,
        repositoriesScanned: discovery.bundles.length
      };
    } catch (err) {
      const completedAt = new Date().toISOString();
      const isRateLimit = err instanceof GitHubApiError && err.isRateLimit;
      const errorMessage = GitHubIntegrationService.redactSecrets(
        err instanceof Error ? err.message : 'GitHub synchronization failed'
      );

      const failedRecord: SyncHistoryRecord = {
        id: syncId,
        provider: 'github',
        username: cleanUsername,
        startedAt,
        completedAt,
        status: isRateLimit ? 'rate_limited' : 'failed',
        repositoriesScanned: 0,
        meaningfulUpdatesFound: 0,
        newEvidenceCount: 0,
        newClaimsCount: 0,
        duplicatesSkipped: 0,
        rateLimitResetAt: err instanceof GitHubApiError ? err.rateLimitResetAt : undefined,
        errorMessage
      };

      await this.storage.addSyncHistory(failedRecord);

      const profile = await this.storage.getProfile();
      if (profile && profile.settings) {
        profile.settings.githubConnection = {
          username: cleanUsername,
          connectedAt: profile.settings.githubConnection?.connectedAt || startedAt,
          lastSyncedAt: completedAt,
          lastSyncStatus: isRateLimit ? 'rate_limited' : 'failed',
          lastSyncError: errorMessage,
          authenticatedMode: Boolean(process.env.GITHUB_TOKEN)
        };
        await this.storage.saveProfile(profile);
      }

      await this.storage.appendAuditLog({
        actor: 'github_sync',
        action: 'github_sync_failed',
        targetId: cleanUsername,
        details: `GitHub sync error for @${cleanUsername}: ${errorMessage}`
      });

      throw err;
    }
  }
}
