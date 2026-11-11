/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Main Application Root
 * Coordinates all 6 Storyboard Pages (Overview, Career Profile, Evidence Vault,
 * Resume Studio, Review Queue, Settings) and the 3 Engineering Audit Views
 * (Claims Matrix, Security Guard, Architecture).
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
import { LoadingState, FailureState, EmptyState } from './components/common/StateViews';
import { VerifiedCareerProfile, SystemHealth } from '../shared/types/career-profile';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [profile, setProfile] = useState<VerifiedCareerProfile | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState<boolean>(false);

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

  const fetchProfileAndHealth = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [profileRes, healthRes] = await Promise.all([
        fetch('/api/profile'),
        fetch('/api/health')
      ]);

      if (!profileRes.ok) {
        throw new Error(`Profile API responded with HTTP status ${profileRes.status}`);
      }
      if (!healthRes.ok) {
        throw new Error(`Health API responded with HTTP status ${healthRes.status}`);
      }

      const profileData = await profileRes.json();
      const healthData = await healthRes.json();

      if (!profileData.success || !profileData.data) {
        throw new Error(profileData.error?.message || 'Failed to parse verified profile');
      }

      setProfile(profileData.data);
      setSystemHealth(healthData.data || null);
    } catch (err) {
      console.error('[App Load Error]:', err);
      setError(err instanceof Error ? err.message : 'Unknown network failure loading career profile');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfileAndHealth();
  }, [fetchProfileAndHealth]);

  const handleRefreshHealthOnly = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setSystemHealth(data.data);
      }
    } catch (err) {
      console.warn('Health ping failed:', err);
    }
  };

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      profile={profile}
      systemHealth={systemHealth}
      isDark={isDark}
      onToggleDark={toggleDarkMode}
      onRefreshHealth={handleRefreshHealthOnly}
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
          description="Initialize the verified profile storage layer or load sample data."
          actionLabel="Load Sample Profile"
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

          {activeTab === 'security' && (
            <SecurityGuardView />
          )}

          {activeTab === 'architecture' && (
            <ArchitectureRoadmapView />
          )}
        </>
      )}
    </Layout>
  );
}
