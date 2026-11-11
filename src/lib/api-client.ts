/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Foliovera — Phase 1.5: Authenticated API Client
 * Automatically attaches verified Firebase ID tokens (Bearer) to backend API requests,
 * handles token expiration/renewal, and emits structured auth events for UI feedback.
 */

import { auth } from './firebase';

export interface AuthSecurityEventDetail {
  status: number;
  code: string;
  message: string;
}

export const AUTH_SECURITY_EVENT = 'foliovera:auth-security-event';

export function dispatchAuthSecurityEvent(detail: AuthSecurityEventDetail): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<AuthSecurityEventDetail>(AUTH_SECURITY_EVENT, { detail }));
  }
}

/**
 * Performs an authenticated fetch to the Foliovera backend API.
 * Attaches `Authorization: Bearer <idToken>` whenever a Firebase user is signed in.
 * If the server responds with 401 (expired/invalid token), attempts one forced token refresh.
 */
export async function apiFetch(
  input: string,
  init: RequestInit = {},
  retryOnExpired = true
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const token = await currentUser.getIdToken(false);
      headers.set('Authorization', `Bearer ${token}`);
    } catch (err) {
      console.warn('[apiFetch] Failed to retrieve cached ID token:', err);
    }
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status === 401 && currentUser && retryOnExpired) {
    // Attempt a single forced token refresh in case the token just expired
    try {
      const freshToken = await currentUser.getIdToken(true);
      headers.set('Authorization', `Bearer ${freshToken}`);
      const retriedResponse = await fetch(input, {
        ...init,
        headers,
      });
      if (retriedResponse.status === 401 || retriedResponse.status === 403) {
        const cloned = retriedResponse.clone();
        const body = await cloned.json().catch(() => null);
        dispatchAuthSecurityEvent({
          status: retriedResponse.status,
          code: body?.error?.code || (retriedResponse.status === 401 ? 'AUTH_TOKEN_EXPIRED' : 'FORBIDDEN_NOT_OWNER'),
          message: body?.error?.message || 'Your session has expired or is unauthorized.',
        });
      }
      return retriedResponse;
    } catch {
      dispatchAuthSecurityEvent({
        status: 401,
        code: 'AUTH_TOKEN_EXPIRED',
        message: 'Your session has expired. Please sign in again to continue.',
      });
      return response;
    }
  }

  if (response.status === 401 || response.status === 403) {
    const cloned = response.clone();
    const body = await cloned.json().catch(() => null);
    dispatchAuthSecurityEvent({
      status: response.status,
      code: body?.error?.code || (response.status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN_NOT_OWNER'),
      message: body?.error?.message || 'Authentication or owner authorization failed.',
    });
  }

  return response;
}
