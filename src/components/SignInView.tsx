/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Foliovera — Phase 1.5: Editorial Sign-In & Owner Identity Gate
 * Provides Google Sign-In via Firebase Authentication, displays clear states for
 * expired sessions or unauthorized (non-owner) accounts, and offers an explicitly
 * isolated read-only demo sandbox preview.
 */

import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Database,
  Sparkles,
  AlertTriangle,
  Eye,
  LogOut,
  CheckCircle2,
  ArrowRight,
  KeyRound,
} from 'lucide-react';
import { FolioveraBrandMark } from './common/EditorialVisuals';
import type { User } from '../lib/firebase';

export interface SignInViewProps {
  currentUser: User | null;
  authError: string | null;
  authCode: string | null;
  isSigningIn: boolean;
  onGoogleSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onEnterDemoSandbox: () => void;
}

export const SignInView: React.FC<SignInViewProps> = ({
  currentUser,
  authError,
  authCode,
  isSigningIn,
  onGoogleSignIn,
  onSignOut,
  onEnterDemoSandbox,
}) => {
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSignInClick = async () => {
    setLocalError(null);
    try {
      await onGoogleSignIn();
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Google Sign-In could not be completed.'
      );
    }
  };

  const displayError = localError || authError;
  const isForbiddenOwner = authCode === 'FORBIDDEN_NOT_OWNER';
  const isExpiredSession = authCode === 'AUTH_TOKEN_EXPIRED';

  return (
    <div className="min-h-screen bg-[#F6F5F1] text-[#242824] flex flex-col justify-between p-6 md:p-12">
      {/* Top Editorial Header */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#242824] text-[#F6F5F1] flex items-center justify-center shadow-sm">
            <FolioveraBrandMark className="w-5 h-5" />
          </div>
          <div>
            <span className="font-serif text-xl font-semibold tracking-tight text-[#242824] block leading-none">
              Foliovera
            </span>
            <span className="text-[11px] uppercase tracking-[0.16em] text-[#6E756E] font-medium">
              Your career, always current.
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#DDE6DC]/70 border border-[#C5D3C4] text-[#2B4B3E] text-xs font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-[#365C4C]" />
          <span>Firebase Auth · Cloud Firestore Durable Storage</span>
        </div>
      </header>

      {/* Main Split Editorial Gate */}
      <main className="max-w-6xl w-full mx-auto my-auto py-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        {/* Left Column: Editorial Manifesto & Security Posture */}
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#E9E5DD] text-[#242824] text-xs font-medium tracking-wide uppercase">
            <Lock className="w-3.5 h-3.5 text-[#365C4C]" />
            Private Career Intelligence Vault
          </div>

          <h1 className="font-serif text-4xl sm:text-5xl font-normal tracking-tight text-[#242824] leading-[1.12]">
            Verified engineering provenance, protected by cryptographic identity.
          </h1>

          <p className="text-base sm:text-lg text-[#525852] leading-relaxed max-w-2xl">
            Foliovera continuously maintains your verified career profile from GitHub
            repositories and primary evidence, then synthesizes role-specific, ATS-ready
            resumes with zero hallucinated claims.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-white/80 border border-[#E4E2DA]">
              <div className="w-8 h-8 rounded-lg bg-[#DDE6DC] text-[#365C4C] flex items-center justify-center mb-3">
                <KeyRound className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#242824] mb-1">
                Owner-Only Access
              </h3>
              <p className="text-xs text-[#666C66] leading-relaxed">
                Every mutation, claim review, and Gemini synthesis request verifies your
                Firebase ID token server-side.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white/80 border border-[#E4E2DA]">
              <div className="w-8 h-8 rounded-lg bg-[#DDE6DC] text-[#365C4C] flex items-center justify-center mb-3">
                <Database className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#242824] mb-1">
                Durable Cloud Firestore
              </h3>
              <p className="text-xs text-[#666C66] leading-relaxed">
                Verified claims, evidence items, and tailored resume versions persist
                across Cloud Run deployments.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-white/80 border border-[#E4E2DA]">
              <div className="w-8 h-8 rounded-lg bg-[#DDE6DC] text-[#365C4C] flex items-center justify-center mb-3">
                <Sparkles className="w-4 h-4" />
              </div>
              <h3 className="text-sm font-semibold text-[#242824] mb-1">
                Strict Provenance
              </h3>
              <p className="text-xs text-[#666C66] leading-relaxed">
                Sample demonstration records are strictly isolated and never enter your
                personal career profile.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Sign-In Card */}
        <div className="lg:col-span-5">
          <div className="bg-white border border-[#E2DFD7] rounded-2xl p-8 shadow-sm space-y-6">
            <div>
              <span className="text-xs uppercase tracking-[0.14em] text-[#BE925E] font-semibold">
                Owner Authentication
              </span>
              <h2 className="font-serif text-2xl font-semibold text-[#242824] mt-1">
                Sign in to your workspace
              </h2>
              <p className="text-sm text-[#666C66] mt-1">
                Authenticate with your authorized Google account to access your private
                Foliovera career vault.
              </p>
            </div>

            {/* Session Expired Banner */}
            {isExpiredSession && (
              <div
                role="alert"
                className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1"
              >
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Session Expired</span>
                </div>
                <p className="text-amber-800 leading-relaxed">
                  Your Firebase authentication token has expired. Please sign in again to
                  restore secure access.
                </p>
              </div>
            )}

            {/* Unauthorized Non-Owner Banner */}
            {isForbiddenOwner && currentUser && (
              <div
                role="alert"
                className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs space-y-2"
              >
                <div className="font-semibold flex items-center gap-1.5 text-red-800">
                  <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                  <span>Unauthorized Account (Owner-Restricted MVP)</span>
                </div>
                <p className="text-red-800 leading-relaxed">
                  Signed in as <strong>{currentUser.email || currentUser.uid}</strong>,
                  which is not the authorized owner of this Foliovera instance. Private
                  profile records and Gemini generation are restricted.
                </p>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-800 font-medium hover:bg-red-100 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out & switch Google account
                </button>
              </div>
            )}

            {/* Generic Auth Error Banner */}
            {displayError && !isForbiddenOwner && !isExpiredSession && (
              <div
                role="alert"
                className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs space-y-1"
              >
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                  <span>Authentication Notice</span>
                </div>
                <p className="text-red-800 leading-relaxed">{displayError}</p>
              </div>
            )}

            {/* Primary Google Sign-In Button */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleSignInClick}
                disabled={isSigningIn}
                className="w-full py-3.5 px-5 rounded-xl bg-[#365C4C] hover:bg-[#2B4B3E] disabled:opacity-60 text-white font-medium text-sm flex items-center justify-center gap-3 shadow-sm transition-all cursor-pointer"
              >
                <svg className="w-4 h-4 bg-white rounded-full p-0.5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span>
                  {isSigningIn
                    ? 'Verifying Google Identity...'
                    : 'Sign in with Google'}
                </span>
                <ArrowRight className="w-4 h-4 ml-auto opacity-80" />
              </button>

              <div className="flex items-center gap-2 text-[11px] text-[#6E756E] justify-center pt-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#365C4C]" />
                <span>Verified server-side via Firebase Admin SDK</span>
              </div>
            </div>

            {/* Divider */}
            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-[#E6E4DC]" />
              <span className="flex-shrink mx-3 text-[11px] uppercase tracking-widest text-[#8C928C]">
                Or Inspect Architecture
              </span>
              <div className="flex-grow border-t border-[#E6E4DC]" />
            </div>

            {/* Isolated Demo Sandbox Option */}
            <div className="p-4 rounded-xl bg-[#F6F5F1] border border-[#E4E2DA] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#242824] flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-[#BE925E]" />
                  Isolated Read-Only Demo Mode
                </span>
                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[#E9E5DD] text-[#525852] font-medium">
                  Sample Data Only
                </span>
              </div>
              <p className="text-xs text-[#666C66] leading-relaxed">
                Explore the reference profile (<em>Alex Morgan</em>) in an isolated
                read-only sandbox. Demo records are strictly segregated from private
                Firestore storage.
              </p>
              <button
                type="button"
                onClick={onEnterDemoSandbox}
                className="w-full py-2.5 px-4 rounded-lg bg-white hover:bg-[#EFECE4] border border-[#D5D2C8] text-[#242824] text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Explore Read-Only Demo Sandbox</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#666C66]" />
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto pt-6 border-t border-[#E5E2D9] flex flex-col sm:flex-row items-center justify-between text-xs text-[#6E756E] gap-2">
        <span>Foliovera · Phase 1.5 Production Security & Durable Career Storage</span>
        <span>Zero-Fabrication Provenance Architecture</span>
      </footer>
    </div>
  );
};
