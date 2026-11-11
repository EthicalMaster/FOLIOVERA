/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Foliovera — Main Application Root (Phase 1.5 Security & Durable Storage)
 * Coordinates Firebase Authentication (Google Sign-In), owner authorization states,
 * isolated demo sandbox preview, and all 6 Storyboard Pages + 3 Engineering Audit Views.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Layout, ActiveTab } from './components/Layout';
import { DashboardView } from './components/DashboardView';
import { CareerProfileView } from './components/CareerProfileView';
import { EvidenceVaultView } from './components/EvidenceVaultView';
import { ResumeStudioView } from './components/ResumeStudioView';
import { ReviewQueueView } from './components/ReviewQueueView';
import { SettingsView } from './components/SettingsView';
import { ClaimsMatrixView } from './components/ClaimsMatrixView';
import { SecurityGuardView } from './components/SecurityGuardView';
import { ArchitectureRoadmapView } from './components/ArchitectureRoadmapView';
import { SignInView } from './components/SignInView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingState, FailureState, EmptyState } from './components/common/StateViews';
import { VerifiedCareerProfile, SystemHealth } from '../shared/types/career-profile';
import {
  auth,
  onAuthStateChanged,
  signInWithGoogle,
  signOutUser,
  type User,
} from './lib/firebase';
import {
  apiFetch,
  AUTH_SECURITY_EVENT,
  type AuthSecurityEventDetail,
} from './lib/api-client';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [profile, setProfile] = useState<VerifiedCareerProfile | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState<boolean>(false);

  // Firebase Auth & Security State
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  const toggleDarkMode = useCallback(() => {
    setIsDark(prev => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return next;
    });
  }, []);

  // Listen for Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setAuthUser(user);
      setIsAuthReady(true);
      if (user) {
        setIsDemoMode(false);
        setAuthError(null);
        setAuthCode(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen for 401/403 security events from apiFetch
  useEffect(() => {
    const handleSecurityEvent = (event: Event) => {
      const custom = event as CustomEvent<AuthSecurityEventDetail>;
      if (!custom.detail) return;
      setAuthCode(custom.detail.code);
      setAuthError(custom.detail.message);
    };
    window.addEventListener(AUTH_SECURITY_EVENT, handleSecurityEvent);
    return () => window.removeEventListener(AUTH_SECURITY_EVENT, handleSecurityEvent);
  }, []);

  const fetchProfileAndHealth = useCallback(async () => {
    if (!isAuthReady) return;
    if (!authUser && !isDemoMode) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const profileEndpoint = isDemoMode ? '/api/demo/profile' : '/api/profile';
      const [profileRes, healthRes] = await Promise.all([
        apiFetch(profileEndpoint),
        apiFetch('/api/health'),
      ]);

      if (profileRes.status === 401 || profileRes.status === 403) {
        const errBody = await profileRes.json().catch(() => null);
        setAuthCode(
          errBody?.error?.code ||
            (profileRes.status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN_NOT_OWNER')
        );
        setAuthError(
          errBody?.error?.message ||
            'Authentication or owner authorization failed.'
        );
        setProfile(null);
        setIsLoading(false);
        return;
      }

      if (!profileRes.ok) {
        const errBody = await profileRes.json().catch(() => null);
        throw new Error(
          errBody?.error?.message ||
            `Profile API responded with HTTP status ${profileRes.status}`
        );
      }
      if (!healthRes.ok) {
        throw new Error(`Health API responded with HTTP status ${healthRes.status}`);
      }

      const profileData = await profileRes.json();
      const healthData = await healthRes.json();

      if (!profileData.success || !profileData.data) {
        throw new Error(profileData.error?.message || 'Failed to parse verified profile');
      }

      setAuthError(null);
      setAuthCode(null);
      setProfile(profileData.data);
      setSystemHealth(healthData.data || null);
    } catch (err) {
      console.error('[App Load Error]:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Unknown network failure loading career profile'
      );
    } finally {
      setIsLoading(false);
    }
  }, [isAuthReady, authUser, isDemoMode]);

  useEffect(() => {
    void fetchProfileAndHealth();
  }, [fetchProfileAndHealth]);

  const handleRefreshHealthOnly = async () => {
    try {
      const res = await apiFetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setSystemHealth(data.data);
      }
    } catch (err) {
      console.warn('Health ping failed:', err);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    setAuthCode(null);
    try {
      await signInWithGoogle();
      setIsDemoMode(false);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    setProfile(null);
    setAuthError(null);
    setAuthCode(null);
    setIsDemoMode(false);
  };

  const handleEnterDemoSandbox = () => {
    setAuthError(null);
    setAuthCode(null);
    setIsDemoMode(true);
  };

  const handleExitDemoMode = () => {
    setIsDemoMode(false);
    setProfile(null);
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#F6F5F1] flex items-center justify-center p-6">
        <LoadingState message="Verifying cryptographic identity & Cloud Firestore session..." />
      </div>
    );
  }

  const requiresSignInGate =
    (!authUser && !isDemoMode) ||
    authCode === 'FORBIDDEN_NOT_OWNER' ||
    authCode === 'AUTH_TOKEN_EXPIRED';

  if (requiresSignInGate) {
    return (
      <ErrorBoundary>
        <SignInView
          currentUser={authUser}
          authError={authError}
          authCode={authCode}
          isSigningIn={isSigningIn}
          onGoogleSignIn={handleGoogleSignIn}
          onSignOut={handleSignOut}
          onEnterDemoSandbox={handleEnterDemoSandbox}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Layout
        activeTab={activeTab}
        onTabChange={setActiveTab}
        profile={profile}
        systemHealth={systemHealth}
        isDark={isDark}
        onToggleDark={toggleDarkMode}
        onRefreshHealth={handleRefreshHealthOnly}
        authUser={authUser}
        isDemoMode={isDemoMode}
        onSignOut={handleSignOut}
        onExitDemoMode={handleExitDemoMode}
      >
        {isLoading ? (
          <LoadingState message="Loading verified career profile and provenance vault..." />
        ) : error ? (
          <FailureState
            title="Could not connect to backend service"
            message={error}
            onRetry={fetchProfileAndHealth}
          />
        ) : !profile ? (
          <EmptyState
            title="No career profile active"
            description="Initialize your personal verified profile storage layer."
            actionLabel="Reload Profile"
            onAction={fetchProfileAndHealth}
          />
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardView
                profile={profile}
                health={systemHealth}
                onNavigate={setActiveTab}
                onProfileRefresh={fetchProfileAndHealth}
              />
            )}

            {activeTab === 'profile' && (
              <CareerProfileView
                profile={profile}
                onProfileUpdated={updated => setProfile(updated)}
                onNavigate={setActiveTab}
              />
            )}

            {activeTab === 'evidence' && (
              <EvidenceVaultView
                evidenceList={profile.evidenceVault}
                onEvidenceAdded={fetchProfileAndHealth}
              />
            )}

            {activeTab === 'resume' && (
              <ResumeStudioView
                profile={profile}
                onProfileRefresh={fetchProfileAndHealth}
              />
            )}

            {activeTab === 'review' && (
              <ReviewQueueView
                profile={profile}
                onQueueUpdated={fetchProfileAndHealth}
                onNavigate={setActiveTab}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                profile={profile}
                isDark={isDark}
                onToggleDark={toggleDarkMode}
                onProfileUpdated={updated => setProfile(updated)}
              />
            )}

            {activeTab === 'claims' && (
              <ClaimsMatrixView
                profile={profile}
                onClaimStatusUpdated={fetchProfileAndHealth}
              />
            )}

            {activeTab === 'security' && <SecurityGuardView />}

            {activeTab === 'architecture' && <ArchitectureRoadmapView />}
          </>
        )}
      </Layout>
    </ErrorBoundary>
  );
}
