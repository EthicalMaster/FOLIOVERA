/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — API Abuse Prevention, Rate Limiting, Input Validation & Secret Redaction
 * Enforces Step 5: Request schema validation, input-length limits, rate limits for
 * expensive operations, safe error handling, and secret redaction.
 */

import type { Request, Response, NextFunction } from 'express';

export class RequestValidationError extends Error {
  public readonly code = 'INVALID_REQUEST_PAYLOAD';
  constructor(message: string) {
    super(message);
    this.name = 'RequestValidationError';
  }
}

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  operationLabel: string;
}

/**
 * In-memory sliding-window rate limiter per authenticated UID or client IP
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const hits = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key =
      req.authenticatedOwner?.uid ||
      (typeof req.headers['x-forwarded-for'] === 'string'
        ? req.headers['x-forwarded-for'].split(',')[0].trim()
        : req.ip || 'anonymous');

    const windowStart = now - options.windowMs;
    const recent = (hits.get(key) || []).filter(ts => ts > windowStart);

    if (recent.length >= options.maxRequests) {
      const retryAfterSec = Math.ceil(options.windowMs / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded for ${options.operationLabel}. Maximum ${options.maxRequests} requests per ${retryAfterSec}s.`
        }
      });
    }

    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

/**
 * Redacts API keys, Bearer tokens, and GitHub tokens from any string before logging or returning to client
 */
export function redactSecrets(input: string): string {
  if (!input) return '';
  let out = input
    .replace(/gh[pousr]_[A-Za-z0-9_]{10,255}/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/github_pat_[A-Za-z0-9_]{10,255}/g, '[REDACTED_GITHUB_PAT]')
    .replace(/AIza[0-9A-Za-z\-_]{20,100}/g, '[REDACTED_GOOGLE_API_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]');

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey.length > 8 && geminiKey !== 'MY_GEMINI_API_KEY') {
    out = out.split(geminiKey).join('[REDACTED_GEMINI_KEY]');
  }
  const ghToken = process.env.GITHUB_TOKEN;
  if (ghToken && ghToken.length > 8) {
    out = out.split(ghToken).join('[REDACTED_GITHUB_TOKEN]');
  }
  return out;
}

function assertMaxStringLength(val: unknown, fieldName: string, maxLen: number): void {
  if (val !== undefined && val !== null) {
    if (typeof val !== 'string') {
      throw new RequestValidationError(`Field "${fieldName}" must be a string.`);
    }
    if (val.length > maxLen) {
      throw new RequestValidationError(
        `Field "${fieldName}" exceeds maximum length of ${maxLen} characters (received ${val.length}).`
      );
    }
  }
}

function assertMaxArrayLength(val: unknown, fieldName: string, maxItems: number): void {
  if (val !== undefined && val !== null) {
    if (!Array.isArray(val)) {
      throw new RequestValidationError(`Field "${fieldName}" must be an array.`);
    }
    if (val.length > maxItems) {
      throw new RequestValidationError(
        `Field "${fieldName}" exceeds maximum count of ${maxItems} items (received ${val.length}).`
      );
    }
  }
}

export function validateProfileUpdatePayload(body: any): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestValidationError('Profile update payload must be a JSON object.');
  }
  // Never allow client payload to override ownerUid or mark profile as sample data
  if ('ownerUid' in body) {
    throw new RequestValidationError('Field "ownerUid" cannot be modified by client payload.');
  }
  if (body.isSampleData === true) {
    throw new RequestValidationError('Cannot set isSampleData=true on an authenticated owner profile.');
  }

  assertMaxStringLength(body.candidateName, 'candidateName', 120);
  assertMaxStringLength(body.headline, 'headline', 240);
  assertMaxStringLength(body.summary, 'summary', 4000);
  assertMaxStringLength(body.location, 'location', 160);
  assertMaxStringLength(body.email, 'email', 254);
  assertMaxStringLength(body.auditNote, 'auditNote', 500);

  assertMaxArrayLength(body.skills, 'skills', 200);
  assertMaxArrayLength(body.experiences, 'experiences', 100);
  assertMaxArrayLength(body.projects, 'projects', 100);
  assertMaxArrayLength(body.education, 'education', 50);
}

export function validateClaimPatchPayload(body: any): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestValidationError('Claim update payload must be a JSON object.');
  }
  assertMaxStringLength(body.statement, 'statement', 1000);
  assertMaxStringLength(body.category, 'category', 32);
  assertMaxStringLength(body.clarificationResponse, 'clarificationResponse', 1000);
  assertMaxStringLength(body.ownershipStatus, 'ownershipStatus', 32);
  assertMaxStringLength(body.notes, 'notes', 1000);
}

export function validateEvidenceCreatePayload(body: any): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestValidationError('Evidence payload must be a JSON object.');
  }
  assertMaxStringLength(body.title, 'title', 300);
  assertMaxStringLength(body.uri, 'uri', 1024);
  assertMaxStringLength(body.rawContentSnippet, 'rawContentSnippet', 32768);
  assertMaxStringLength(body.repository, 'repository', 256);
  assertMaxStringLength(body.commitSha, 'commitSha', 128);
  assertMaxStringLength(body.notes, 'notes', 1000);
}

export function validateResumeGeneratePayload(body: any): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new RequestValidationError('Resume generation payload must be a JSON object.');
  }
  assertMaxStringLength(body.targetRole, 'targetRole', 160);
  assertMaxStringLength(body.style, 'style', 64);
  assertMaxStringLength(body.jobDescription, 'jobDescription', 8000);
  assertMaxArrayLength(body.selectedClaimIds, 'selectedClaimIds', 100);
}
