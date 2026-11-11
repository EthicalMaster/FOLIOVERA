/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Page 1: Overview (DashboardView)
 * Displays real GitHub synchronization status, discovered changes, pending reviews,
 * persistent database status, and quick resume generation.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Layers,
  Code2,
  ShieldCheck,
  FileText,
  ArrowRight,
  Play,
  Plus,
  CheckCircle2,
  GitBranch,
  RefreshCw,
  AlertCircle,
  X
} from 'lucide-react';
import {
  VerifiedCareerProfile,
  SystemHealth,
  isClaimApproved,
  resolveLifecycleState
} from '../../shared/types/career-profile';
import { ActiveTab } from './Layout';
import { MistyForestBannerSVG, OrganicWavePatternSVG } from './common/EditorialVisuals';
import { apiFetch } from '../lib/api-client';

interface DashboardViewProps {
  profile: VerifiedCareerProfile | null;
  health: SystemHealth | null;
  onNavigate: (tab: ActiveTab) => void;
  onProfileRefresh?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  profile,
  health,
  onNavigate,
  onProfileRefresh
}) => {
  const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
  const [syncUsername, setSyncUsername] = useState(
    profile?.settings?.githubConnection?.username || ''
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  if (!profile) return null;

  const approvedClaims = profile.claims.filter(c => isClaimApproved(c));
  const pendingOrDiscoveredClaims = profile.claims.filter(c => {
    const state = resolveLifecycleState(c);
    return state === 'discovered' || state === 'pending_review';
  });
  const resumeCount = profile.resumeVersions?.length ?? 0;
  const latestResume = profile.resumeVersions?.[0];
  const ghConn = profile.settings?.githubConnection;
  const latestSync = profile.syncHistory?.[0];

  const handleQuickGitHubSync = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetUser = syncUsername.trim() || ghConn?.username;
    if (!targetUser) return;
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await apiFetch('/api/github/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: targetUser, maxRepos: 6 })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || 'GitHub synchronization failed');
      }
      setSyncFeedback({
        type: 'ok',
        text: `Synced @${json.data.syncRecord.username}: ${json.data.repositoriesScanned} repos scanned, ${json.data.newClaimsCount} new claims discovered (${json.data.duplicatesSkipped} duplicates skipped).`
      });
      if (onProfileRefresh) onProfileRefresh();
    } catch (err) {
      setSyncFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'GitHub sync failed'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const kpiCards = [
    {
      id: 'projects',
      label: 'Approved Projects & Claims',
      value: approvedClaims.length + profile.projects.length,
      delta: `${(profile.repositories ?? []).length} synced repos`,
      icon: Layers,
      targetTab: 'profile' as ActiveTab
    },
    {
      id: 'skills',
      label: 'Skills Mapped',
      value: profile.skills.length,
      delta: `+${pendingOrDiscoveredClaims.filter(c => c.category === 'skill').length} in review`,
      icon: Code2,
      targetTab: 'profile' as ActiveTab
    },
    {
      id: 'evidence',
      label: 'Evidence Sources',
      value: profile.evidenceVault.length,
      delta: undefined,
      icon: ShieldCheck,
      targetTab: 'evidence' as ActiveTab
    },
    {
      id: 'resumes',
      label: 'Resume Versions',
      value: resumeCount,
      delta: undefined,
      icon: FileText,
      targetTab: 'resume' as ActiveTab
    }
  ];

  return (
    <div className="space-y-6">
      {/* Storyboard Hero Banner: "Your Work, Turned into Opportunity" */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="relative rounded-2xl overflow-hidden border border-[#D8D4C8] dark:border-[#262E2B] shadow-sm min-h-[190px] sm:min-h-[210px] flex items-center justify-between p-6 sm:p-9"
      >
        <div className="absolute inset-0 z-0">
          <MistyForestBannerSVG />
        </div>

        <div className="relative z-10 max-w-xl space-y-2.5 text-[#F6F5F1]">
          <h2 className="font-editorial text-2xl sm:text-4xl font-normal leading-tight tracking-tight text-white drop-shadow-xs">
            Your Work,
            <br />
            Turned into Opportunity
          </h2>
          <p className="text-xs sm:text-sm font-medium text-[#E9E5DD]/90 tracking-wide pt-0.5">
            Track <span aria-hidden="true" className="mx-1.5">·</span>
            Verify <span aria-hidden="true" className="mx-1.5">·</span>
            Build <span aria-hidden="true" className="mx-1.5">·</span>
            Apply
          </p>
        </div>

        <div className="relative z-10 shrink-0 self-end sm:self-center">
          <button
            onClick={() => setWorkflowModalOpen(true)}
            className="w-11 h-11 rounded-full bg-[#181D1B]/75 hover:bg-[#365C4C] text-[#F6F5F1] border border-white/25 backdrop-blur-xs flex items-center justify-center transition-all duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BE925E]"
            aria-label="Inspect autonomous verification workflow"
            title="Inspect verification & synthesis pipeline"
          >
            <Play className="w-4 h-4 fill-current ml-0.5" />
          </button>
        </div>
      </motion.section>

      {/* Live GitHub Intelligence & Synchronization Bar (Step 3 & Step 6) */}
      <section className="bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#181D1B] dark:bg-[#242E2A] text-[#F6F5F1] flex items-center justify-center shrink-0">
              <GitBranch className="w-4 h-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-semibold text-[#242824] dark:text-[#F1F3F1]">
                <span>GitHub Intelligence Sync</span>
                {ghConn?.username && (
                  <span className="font-mono text-xs text-[#365C4C] dark:text-[#78B39A]">
                    @{ghConn.username}
                  </span>
                )}
                {latestSync && (
                  <span className="text-[11px] font-normal text-[#767E76]">
                    · Last synced {new Date(latestSync.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {latestSync.rateLimitRemaining !== undefined ? ` · API quota: ${latestSync.rateLimitRemaining} rem` : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#545B54] dark:text-[#B4BDB7]">
                Connect any public GitHub username to discover repositories, inspect author commits, and queue verifiable claims.
              </p>
            </div>
          </div>

          <form onSubmit={handleQuickGitHubSync} className="flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={syncUsername}
              onChange={e => setSyncUsername(e.target.value)}
              placeholder="GitHub username (e.g. octocat)"
              aria-label="GitHub username to synchronize"
              className="w-48 sm:w-56 px-3 py-2 text-xs rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#D6D2C8] dark:border-[#2C3531] text-[#242824] dark:text-[#F1F3F1] focus:outline-none focus:ring-2 focus:ring-[#365C4C]"
            />
            <button
              type="submit"
              disabled={isSyncing || !syncUsername.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white bg-[#365C4C] hover:bg-[#2B4B3E] disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync GitHub'}</span>
            </button>
          </form>
        </div>

        {syncFeedback && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center justify-between gap-3 ${
              syncFeedback.type === 'ok'
                ? 'bg-[#DDE6DC]/70 dark:bg-[#243B31]/60 text-[#243E33] dark:text-[#A5DEC6]'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {syncFeedback.type === 'ok' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{syncFeedback.text}</span>
            </div>
            {syncFeedback.type === 'ok' && (
              <button
                onClick={() => onNavigate('review')}
                className="font-semibold underline shrink-0"
              >
                Open Review Queue →
              </button>
            )}
          </div>
        )}
      </section>

      {/* 4 Editorial KPI Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <motion.button
              key={card.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: idx * 0.04 }}
              onClick={() => onNavigate(card.targetTab)}
              className="text-left bg-[#FDFCFA] dark:bg-[#1A1F1D] hover:bg-[#F3F0E8] dark:hover:bg-[#222926] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-5 transition-all duration-150 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#365C4C]"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-8 h-8 rounded-lg bg-[#F6F5F1] dark:bg-[#242E2A] border border-[#E2DFD7] dark:border-[#2F3B36] flex items-center justify-center text-[#242824] dark:text-[#DDE6DC]">
                  <Icon className="w-4 h-4" />
                </div>
                {card.delta && (
                  <span className="px-2 py-0.5 rounded-md bg-[#DDE6DC] dark:bg-[#243B31] text-[#28483B] dark:text-[#8CD1B5] text-[11px] font-mono font-semibold tabular-nums">
                    {card.delta}
                  </span>
                )}
              </div>

              <div className="text-2xl sm:text-3xl font-bold text-[#242824] dark:text-[#F1F3F1] font-mono tabular-nums tracking-tight">
                {card.value}
              </div>
              <div className="text-xs font-medium text-[#545B54] dark:text-[#B4BDB7] mt-1 flex items-center justify-between">
                <span>{card.label}</span>
                <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-[#365C4C] dark:text-[#68A289]" />
              </div>
            </motion.button>
          );
        })}
      </section>

      {/* Bottom Split Row: Recent Activity (Left) + Build a Resume (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.12 }}
          className="lg:col-span-7 bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-6 flex flex-col justify-between"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-editorial text-lg font-semibold text-[#242824] dark:text-[#F1F3F1]">
                Recent Activity & Pending Reviews ({pendingOrDiscoveredClaims.length})
              </h3>
              <button
                onClick={() => onNavigate('review')}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#545B54] dark:text-[#B4BDB7] hover:text-[#242824] dark:hover:text-white transition-colors"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-[#ECE9E1] dark:divide-[#262E2B]">
              {pendingOrDiscoveredClaims.slice(0, 3).map(claim => (
                <div key={claim.id} className="py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#181D1B] dark:bg-[#262E2B] text-[#F6F5F1] flex items-center justify-center shrink-0 mt-0.5">
                      <GitBranch className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#242824] dark:text-[#F1F3F1] truncate">
                        {claim.proposedChangeType === 'add_project'
                          ? 'Repository evidence discovered'
                          : claim.proposedChangeType === 'add_skill'
                          ? 'Technical skill extracted'
                          : 'Career update awaiting review'}
                      </div>
                      <div className="text-xs text-[#545B54] dark:text-[#B4BDB7] truncate mt-0.5">
                        <span className="font-medium text-[#242824] dark:text-[#DDE6DC]">
                          {claim.sourceLabel || claim.repositoryRef || 'spectr-graphite'}
                        </span>
                        <span aria-hidden="true" className="mx-1.5">·</span>
                        <span>
                          {claim.ownershipStatus === 'uncertain_ownership'
                            ? 'Clarification needed'
                            : claim.discoveredRelativeTime || 'Pending review'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onNavigate('review')}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[#EBE3D5] hover:bg-[#DFD4C1] dark:bg-[#2E2920] dark:hover:bg-[#3B3428] text-[#5C4528] dark:text-[#E5C193] transition-colors shrink-0 whitespace-nowrap"
                  >
                    Review
                  </button>
                </div>
              ))}

              {latestResume && (
                <div className="py-3.5 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#365C4C] text-[#F6F5F1] flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[#242824] dark:text-[#F1F3F1] truncate">
                        Resume updated
                      </div>
                      <div className="text-xs text-[#545B54] dark:text-[#B4BDB7] truncate mt-0.5">
                        <span>{latestResume.targetRole}</span>
                        <span aria-hidden="true" className="mx-1.5">·</span>
                        <span className="font-mono">{latestResume.versionLabel}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => onNavigate('resume')}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[#E9E5DD] hover:bg-[#DDD8CE] dark:bg-[#242E2A] dark:hover:bg-[#2E3B36] text-[#242824] dark:text-[#F1F3F1] transition-colors shrink-0 whitespace-nowrap"
                  >
                    View
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-[#ECE9E1] dark:border-[#262E2B] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#767E76]">
            <span>Persistent Storage: {health?.storageDriver || 'sqlite_local'} ({health?.databasePath || 'living-resume.sqlite'})</span>
            <span className="font-mono tabular-nums">
              {approvedClaims.length}/{profile.claims.length} claims approved
            </span>
          </div>
        </motion.section>

        {/* Build a Resume CTA Card (5 cols) */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.16 }}
          className="lg:col-span-5 relative overflow-hidden bg-[#EFECE6] dark:bg-[#1E2623] border border-[#DFDBD0] dark:border-[#2C3833] rounded-2xl p-6 flex flex-col justify-between min-h-[210px]"
        >
          <div className="relative z-10 space-y-2">
            <h3 className="font-editorial text-xl font-semibold text-[#242824] dark:text-[#F1F3F1]">
              Build a Resume
            </h3>
            <p className="text-xs sm:text-sm text-[#545B54] dark:text-[#B4BDB7] max-w-xs leading-relaxed">
              Create a tailored, ATS-ready resume for a specific role using only your approved, evidence-backed career claims.
            </p>
          </div>

          <div className="relative z-10 pt-6 flex items-center justify-between gap-3">
            <button
              onClick={() => onNavigate('resume')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-[#F6F5F1] bg-[#365C4C] hover:bg-[#2B4B3E] shadow-xs transition-all duration-150 hover:translate-y-[-1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#242824] whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Generate Resume</span>
            </button>
          </div>

          <OrganicWavePatternSVG className="absolute bottom-0 right-0 w-56 h-28" />
        </motion.section>
      </div>

      {/* Interactive Pipeline Walkthrough Modal */}
      <AnimatePresence>
        {workflowModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs"
              onClick={() => setWorkflowModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="fixed inset-x-4 top-20 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-50 w-full max-w-xl bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#2C3531] rounded-2xl shadow-2xl p-6 space-y-5"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#E9E5DD] dark:border-[#262E2B]">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[#365C4C] dark:text-[#68A289] font-semibold">
                    Foliovera Intelligence Pipeline
                  </span>
                  <h3 className="font-editorial text-xl font-semibold text-[#242824] dark:text-[#F1F3F1]">
                    How Your Career Profile Stays Current
                  </h3>
                </div>
                <button
                  onClick={() => setWorkflowModalOpen(false)}
                  className="p-1.5 rounded-lg text-[#767E76] hover:text-[#242824] dark:hover:text-white"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {[
                  {
                    step: '01. Discover Repositories',
                    desc: 'Connects to the official GitHub API to inspect public repos, languages, READMEs, and author-matched commits.'
                  },
                  {
                    step: '02. Sanitize & Extract',
                    desc: 'UntrustedDataGuard neutralizes prompt injections before deterministic evidence extraction.'
                  },
                  {
                    step: '03. Clarify & Approve',
                    desc: 'Uncertain contribution ownership (e.g. forks) requests your clarification before entering your profile.'
                  },
                  {
                    step: '04. Tailor & Export',
                    desc: 'Resume Studio synthesizes role-targeted ATS resumes using strictly approved claims.'
                  }
                ].map(item => (
                  <div
                    key={item.step}
                    className="p-3.5 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#E2DFD7] dark:border-[#262E2B] space-y-1"
                  >
                    <div className="font-semibold text-[#242824] dark:text-[#F1F3F1]">{item.step}</div>
                    <p className="text-[#545B54] dark:text-[#B4BDB7] leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    setWorkflowModalOpen(false);
                    onNavigate('review');
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-[#365C4C] hover:bg-[#2B4B3E] transition-colors"
                >
                  Inspect Review Queue ({pendingOrDiscoveredClaims.length})
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
