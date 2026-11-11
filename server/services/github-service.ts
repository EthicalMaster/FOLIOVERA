/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Step 3: Official GitHub API Integration Service
 *
 * Security & Engineering Invariants:
 * - Never expose tokens to frontend JavaScript.
 * - Never print tokens in logs (redactSecrets enforced).
 * - Do not require a personal access token for public-repository discovery.
 * - Never assume the user personally authored all code inside a repository.
 * - Handles pagination, rate limits, network errors, and empty repositories.
 */

import {
  GitHubRepositoryRecord,
  OwnershipStatus
} from '../../shared/types/career-profile';
import { UntrustedDataGuard } from '../security/untrusted-data-guard';

export type FetchFunction = (url: string, init?: RequestInit) => Promise<Response>;

export interface GitHubCommitDetail {
  sha: string;
  message: string;
  authorLogin?: string;
  authorDate: string;
  htmlUrl: string;
}

export interface DiscoveredRepoBundle {
  repository: GitHubRepositoryRecord;
  readmeRawContent?: string;
  userCommits: GitHubCommitDetail[];
  packageManifestDeps?: string[];
}

export interface GitHubDiscoveryResult {
  username: string;
  authenticated: boolean;
  bundles: DiscoveredRepoBundle[];
  rateLimitRemaining?: number;
  rateLimitResetAt?: string;
  warnings: string[];
}

export class GitHubApiError extends Error {
  public readonly statusCode: number;
  public readonly isRateLimit: boolean;
  public readonly rateLimitResetAt?: string;

  constructor(message: string, statusCode: number, isRateLimit = false, rateLimitResetAt?: string) {
    super(GitHubIntegrationService.redactSecrets(message));
    this.name = 'GitHubApiError';
    this.statusCode = statusCode;
    this.isRateLimit = isRateLimit;
    this.rateLimitResetAt = rateLimitResetAt;
  }
}

export class GitHubIntegrationService {
  private fetchImpl: FetchFunction;
  private defaultToken?: string;
  private baseUrl = 'https://api.github.com';

  constructor(options?: FetchFunction | { fetchImpl?: FetchFunction; token?: string }) {
    if (typeof options === 'function') {
      this.fetchImpl = options;
    } else if (options && typeof options === 'object') {
      this.fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
      this.defaultToken = options.token;
    } else {
      this.fetchImpl = globalThis.fetch.bind(globalThis);
    }
  }

  /**
   * Redacts any GitHub tokens or Bearer credentials from logs and error messages
   */
  public static redactSecrets(input: string): string {
    if (!input) return '';
    return input
      .replace(/gh[pousr]_[A-Za-z0-9_]{10,255}/g, '[REDACTED_GITHUB_TOKEN]')
      .replace(/github_pat_[A-Za-z0-9_]{10,255}/g, '[REDACTED_GITHUB_PAT]')
      .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]');
  }

  public static validateUsername(username: string): string {
    const trimmed = (username || '').trim().replace(/^@/, '');
    if (!trimmed || !/^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/.test(trimmed)) {
      throw new Error('Invalid GitHub username format.');
    }
    return trimmed;
  }

  private buildHeaders(token?: string): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Foliovera/1.0',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    const effectiveToken = token || this.defaultToken || process.env.GITHUB_TOKEN;
    if (effectiveToken && effectiveToken.trim().length > 5) {
      headers.Authorization = `Bearer ${effectiveToken.trim()}`;
    }
    return headers;
  }

  /**
   * Discovers public (and optional authenticated) repositories for a GitHub username
   * with pagination, rate-limit tracking, README extraction, and author-matched commit verification.
   */
  public async discoverUserRepositories(
    rawUsername: string,
    options: {
      maxRepos?: number;
      perPage?: number;
      maxPages?: number;
      token?: string;
    } = {}
  ): Promise<GitHubDiscoveryResult> {
    const username = GitHubIntegrationService.validateUsername(rawUsername);
    const maxRepos = options.maxRepos ?? 12;
    const perPage = Math.min(options.perPage ?? 30, 100);
    const maxPages = options.maxPages ?? 2;
    const headers = this.buildHeaders(options.token);
    const authenticated = Boolean(headers.Authorization);

    let rateLimitRemaining: number | undefined;
    let rateLimitResetAt: string | undefined;
    const warnings: string[] = [];
    const rawRepos: any[] = [];

    // 1. Paginated repository list fetch
    for (let page = 1; page <= maxPages; page++) {
      const url = `${this.baseUrl}/users/${encodeURIComponent(username)}/repos?sort=pushed&direction=desc&per_page=${perPage}&page=${page}`;
      let response: Response;
      try {
        response = await this.fetchImpl(url, { headers });
      } catch (netErr) {
        throw new GitHubApiError(
          `Network error connecting to GitHub API: ${netErr instanceof Error ? netErr.message : 'Unknown error'}`,
          503
        );
      }

      const remHeader = response.headers.get('x-ratelimit-remaining');
      const resetHeader = response.headers.get('x-ratelimit-reset');
      if (remHeader !== null && !Number.isNaN(Number(remHeader))) {
        rateLimitRemaining = Number(remHeader);
      }
      if (resetHeader !== null && !Number.isNaN(Number(resetHeader))) {
        rateLimitResetAt = new Date(Number(resetHeader) * 1000).toISOString();
      }

      if (response.status === 404) {
        throw new GitHubApiError(`GitHub user "${username}" was not found.`, 404);
      }

      if (response.status === 403 || response.status === 429) {
        const isRateLimited =
          response.status === 429 ||
          rateLimitRemaining === 0 ||
          (await response.clone().text()).toLowerCase().includes('rate limit');
        if (isRateLimited) {
          throw new GitHubApiError(
            `GitHub API rate limit exceeded.${rateLimitResetAt ? ` Resets at ${rateLimitResetAt}.` : ' Configure a server-side GITHUB_TOKEN for 5,000 req/hr.'}`,
            response.status,
            true,
            rateLimitResetAt
          );
        }
        throw new GitHubApiError(`GitHub API access forbidden (HTTP ${response.status}).`, response.status);
      }

      if (!response.ok) {
        throw new GitHubApiError(`GitHub API responded with status ${response.status}.`, response.status);
      }

      const pageData = await response.json();
      if (!Array.isArray(pageData) || pageData.length === 0) {
        break;
      }

      rawRepos.push(...pageData);
      if (pageData.length < perPage || rawRepos.length >= maxRepos) {
        break;
      }
    }

    const selectedRepos = rawRepos.slice(0, maxRepos);
    const bundles: DiscoveredRepoBundle[] = [];

    for (const raw of selectedRepos) {
      const fullName = String(raw.full_name || `${username}/${raw.name}`);
      const isFork = Boolean(raw.fork);
      const sizeKb = Number(raw.size || 0);
      const isEmptyRepo = sizeKb === 0;
      const primaryLanguage = raw.language ? String(raw.language) : 'Unknown';
      const topics = Array.isArray(raw.topics) ? raw.topics.map(String) : [];

      let languages: Record<string, number> = {};
      if (primaryLanguage !== 'Unknown') {
        languages[primaryLanguage] = 100;
      }

      let readmeRawContent: string | undefined;
      const userCommits: GitHubCommitDetail[] = [];

      // Only query sub-resources if repository is not empty and rate limit budget allows
      const canQuerySubresources =
        !isEmptyRepo && (rateLimitRemaining === undefined || rateLimitRemaining > 3);

      if (canQuerySubresources) {
        // 2a. Fetch languages breakdown
        try {
          const langRes = await this.fetchImpl(`${this.baseUrl}/repos/${fullName}/languages`, { headers });
          if (langRes.ok) {
            const langJson = await langRes.json();
            if (langJson && typeof langJson === 'object') {
              languages = langJson;
            }
          }
        } catch {
          warnings.push(`Could not fetch language breakdown for ${fullName}`);
        }

        // 2b. Fetch README (Untrusted external content!)
        try {
          const readmeRes = await this.fetchImpl(`${this.baseUrl}/repos/${fullName}/readme`, { headers });
          if (readmeRes.ok) {
            const readmeJson = await readmeRes.json();
            if (readmeJson && typeof readmeJson.content === 'string') {
              const decoded = Buffer.from(readmeJson.content, readmeJson.encoding || 'base64').toString('utf-8');
              readmeRawContent = decoded.slice(0, 16384);
            }
          }
        } catch {
          // README is optional; ignore if absent
        }

        // 2c. Fetch commits specifically authored by the connected username
        // Critical Security Rule: Never assume user personally authored all code in a repository!
        try {
          const commitsUrl = `${this.baseUrl}/repos/${fullName}/commits?author=${encodeURIComponent(username)}&per_page=5`;
          const commitsRes = await this.fetchImpl(commitsUrl, { headers });
          if (commitsRes.ok) {
            const commitsData = await commitsRes.json();
            if (Array.isArray(commitsData)) {
              for (const c of commitsData) {
                if (c && c.sha && c.commit) {
                  userCommits.push({
                    sha: String(c.sha),
                    message: String(c.commit.message || '').split('\n')[0].slice(0, 220),
                    authorLogin: c.author?.login ? String(c.author.login) : username,
                    authorDate: String(c.commit.author?.date || raw.pushed_at || new Date().toISOString()),
                    htmlUrl: String(c.html_url || `https://github.com/${fullName}/commit/${c.sha}`)
                  });
                }
              }
            }
          }
        } catch {
          warnings.push(`Could not inspect commit authorship for ${fullName}`);
        }
      }

      // Determine ownership confidence honestly
      let ownershipStatus: OwnershipStatus = 'uncertain_ownership';
      if (!isFork && userCommits.length > 0) {
        ownershipStatus = 'verified_author';
      } else if (isFork && userCommits.length > 0) {
        ownershipStatus = 'contributor';
      } else {
        // Fork with 0 matched commits, empty repo, or repo where commits weren't authored by username
        ownershipStatus = 'uncertain_ownership';
      }

      const sanitizedDesc = UntrustedDataGuard.sanitize(String(raw.description || '')).sanitizedText;
      const sanitizedReadmeExcerpt = readmeRawContent
        ? UntrustedDataGuard.sanitize(readmeRawContent.slice(0, 500)).sanitizedText
        : undefined;

      const repoRecord: GitHubRepositoryRecord = {
        id: `gh-repo-${raw.id || fullName.replace(/[^a-zA-Z0-9]/g, '-')}`,
        githubRepoId: Number(raw.id || Date.now()),
        name: String(raw.name || fullName.split('/')[1] || 'repo'),
        fullName,
        ownerLogin: String(raw.owner?.login || username),
        description: sanitizedDesc || 'No description provided.',
        htmlUrl: String(raw.html_url || `https://github.com/${fullName}`),
        primaryLanguage,
        languages,
        topics,
        isFork,
        isArchived: Boolean(raw.archived),
        stargazersCount: Number(raw.stargazers_count || 0),
        forksCount: Number(raw.forks_count || 0),
        sizeKb,
        defaultBranch: String(raw.default_branch || 'main'),
        createdAt: String(raw.created_at || new Date().toISOString()),
        updatedAt: String(raw.updated_at || new Date().toISOString()),
        pushedAt: String(raw.pushed_at || raw.updated_at || new Date().toISOString()),
        latestCommitSha: userCommits[0]?.sha,
        userAuthorCommitCount: userCommits.length,
        ownershipStatus,
        readmeExcerpt: sanitizedReadmeExcerpt,
        lastSyncedAt: new Date().toISOString()
      };

      bundles.push({
        repository: repoRecord,
        readmeRawContent,
        userCommits
      });
    }

    return {
      username,
      authenticated,
      bundles,
      rateLimitRemaining,
      rateLimitResetAt,
      warnings
    };
  }
}
