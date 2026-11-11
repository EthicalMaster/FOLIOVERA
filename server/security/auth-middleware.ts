/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Server-Side Firebase Authentication & Single-Owner Authorization Middleware
 * Verifies Firebase ID tokens server-side using the Firebase Admin SDK (`firebase-admin/auth`).
 *
 * Security Invariants:
 * 1. Never trusts client-provided user IDs, email headers, or role claims.
 * 2. Fails closed if owner authorization is misconfigured.
 * 3. Rejects unauthenticated requests (401) and authenticated non-owner accounts (403).
 */

import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { OwnerIdentityMeta } from '../storage/storage.interface.ts';

export interface VerifiedTokenClaims {
  uid: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  exp?: number;
}

export type TokenVerifier = (idToken: string) => Promise<VerifiedTokenClaims>;

export interface OwnerAuthPolicy {
  allowedOwnerUid?: string;
  allowedOwnerEmail?: string;
  requireEmailVerified?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      authenticatedOwner?: OwnerIdentityMeta;
    }
  }
}

let cachedFirebaseApp: App | null = null;

function getFirebaseAdminApp(): App {
  if (cachedFirebaseApp) return cachedFirebaseApp;
  const existing = getApps();
  if (existing.length > 0) {
    cachedFirebaseApp = existing[0];
    return cachedFirebaseApp;
  }

  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '';
  if (!projectId) {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        projectId = parsed.projectId || '';
      } catch {
        // Ignore parse error
      }
    }
  }

  if (!projectId) {
    throw new Error('Firebase projectId is missing; cannot initialize Firebase Admin Auth verifier.');
  }

  cachedFirebaseApp = initializeApp({ projectId });
  return cachedFirebaseApp;
}

/**
 * Default production token verifier using Firebase Admin SDK (`getAuth().verifyIdToken`)
 */
export const defaultFirebaseTokenVerifier: TokenVerifier = async (idToken: string): Promise<VerifiedTokenClaims> => {
  const app = getFirebaseAdminApp();
  const decoded = await getAuth(app).verifyIdToken(idToken, false);
  return {
    uid: decoded.uid,
    email: decoded.email,
    email_verified: decoded.email_verified,
    name: typeof decoded.name === 'string' ? decoded.name : undefined,
    exp: decoded.exp
  };
};

/**
 * Resolves the active single-owner authorization policy from environment variables.
 * Fails closed if both FOLIOVERA_OWNER_UID and FOLIOVERA_OWNER_EMAIL are explicitly disabled.
 */
export function resolveOwnerAuthPolicy(override?: OwnerAuthPolicy): OwnerAuthPolicy {
  if (override) {
    return {
      allowedOwnerUid: override.allowedOwnerUid?.trim() || undefined,
      allowedOwnerEmail: override.allowedOwnerEmail?.trim().toLowerCase() || undefined,
      requireEmailVerified: override.requireEmailVerified !== false
    };
  }

  const envUid = process.env.FOLIOVERA_OWNER_UID?.trim();
  const envEmail =
    process.env.FOLIOVERA_OWNER_EMAIL !== undefined
      ? process.env.FOLIOVERA_OWNER_EMAIL.trim().toLowerCase()
      : 'saifeetaher5@gmail.com';

  return {
    allowedOwnerUid: envUid || undefined,
    allowedOwnerEmail: envEmail || undefined,
    requireEmailVerified: true
  };
}

/**
 * Evaluates whether verified token claims match the configured single-user MVP owner.
 */
export function evaluateOwnerAuthorization(
  claims: VerifiedTokenClaims,
  policy: OwnerAuthPolicy
): { authorized: boolean; reasonCode?: string; reasonMessage?: string } {
  if (!claims || !claims.uid || typeof claims.uid !== 'string' || !claims.uid.trim()) {
    return {
      authorized: false,
      reasonCode: 'INVALID_TOKEN_UID',
      reasonMessage: 'Verified token is missing a valid subject UID.'
    };
  }

  // Fail closed if neither owner UID nor owner email is configured
  if (!policy.allowedOwnerUid && !policy.allowedOwnerEmail) {
    return {
      authorized: false,
      reasonCode: 'AUTH_POLICY_MISCONFIGURED',
      reasonMessage:
        'Server owner authorization policy is not configured (set FOLIOVERA_OWNER_UID or FOLIOVERA_OWNER_EMAIL). Failing closed.'
    };
  }

  if (policy.requireEmailVerified !== false && claims.email_verified === false) {
    return {
      authorized: false,
      reasonCode: 'EMAIL_NOT_VERIFIED',
      reasonMessage: 'Authenticated account email address is not verified.'
    };
  }

  // If FOLIOVERA_OWNER_UID is configured, it must match strictly
  if (policy.allowedOwnerUid) {
    if (claims.uid !== policy.allowedOwnerUid) {
      return {
        authorized: false,
        reasonCode: 'FORBIDDEN_NOT_OWNER',
        reasonMessage: 'Authenticated account UID is not authorized as the owner of this Foliovera instance.'
      };
    }
    return { authorized: true };
  }

  // Otherwise match against the configured owner email
  if (policy.allowedOwnerEmail) {
    const tokenEmail = (claims.email || '').trim().toLowerCase();
    if (!tokenEmail || tokenEmail !== policy.allowedOwnerEmail) {
      return {
        authorized: false,
        reasonCode: 'FORBIDDEN_NOT_OWNER',
        reasonMessage: 'Authenticated Google account is not authorized as the owner of this Foliovera workspace.'
      };
    }
    return { authorized: true };
  }

  return {
    authorized: false,
    reasonCode: 'FORBIDDEN_NOT_OWNER',
    reasonMessage: 'Access denied.'
  };
}

export interface AuthMiddlewareOptions {
  verifier?: TokenVerifier;
  policy?: OwnerAuthPolicy;
}

/**
 * Express middleware that verifies the Authorization: Bearer <idToken> header
 * using the Firebase Admin SDK and enforces single-owner access control.
 */
export function createOwnerAuthMiddleware(options: AuthMiddlewareOptions = {}) {
  const verifier = options.verifier || defaultFirebaseTokenVerifier;

  return async (req: Request, res: Response, next: NextFunction) => {
    const policy = resolveOwnerAuthPolicy(options.policy);

    // Fail closed immediately if owner policy is unconfigured
    if (!policy.allowedOwnerUid && !policy.allowedOwnerEmail) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'AUTH_POLICY_MISCONFIGURED',
          message:
            'Production authentication owner policy is misconfigured. Failing closed to protect career records.'
        }
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_TOKEN_MISSING',
          message: 'Authentication required. Provide a valid Firebase ID token in the Authorization Bearer header.'
        }
      });
    }

    const rawToken = authHeader.slice('Bearer '.length).trim();
    if (!rawToken || rawToken.length < 10 || rawToken.length > 16384) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'AUTH_TOKEN_INVALID',
          message: 'Malformed authentication token.'
        }
      });
    }

    try {
      const claims = await verifier(rawToken);
      const decision = evaluateOwnerAuthorization(claims, policy);

      if (!decision.authorized) {
        const status = decision.reasonCode === 'AUTH_POLICY_MISCONFIGURED' ? 503 : 403;
        return res.status(status).json({
          success: false,
          error: {
            code: decision.reasonCode || 'FORBIDDEN_NOT_OWNER',
            message: decision.reasonMessage || 'Access denied.'
          }
        });
      }

      req.authenticatedOwner = {
        uid: claims.uid,
        email: claims.email,
        displayName: claims.name,
        idToken: rawToken
      };

      next();
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const isExpired =
        rawMessage.toLowerCase().includes('expired') ||
        (err as any)?.code === 'auth/id-token-expired';

      return res.status(401).json({
        success: false,
        error: {
          code: isExpired ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_TOKEN_INVALID',
          message: isExpired
            ? 'Your session token has expired. Please sign in again or refresh your session.'
            : 'Invalid authentication token. Verification failed.'
        }
      });
    }
  };
}
