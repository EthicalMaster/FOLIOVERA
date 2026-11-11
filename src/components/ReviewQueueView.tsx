/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Page 5: Review Queue (ReviewQueueView)
 * Implements the explicit claim lifecycle (Discovered -> Pending Review -> Approved | Rejected)
 * and Step 5 Contribution Ownership Clarification workflow when authorship is uncertain.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GitBranch,
  Sparkles,
  Briefcase,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  AlertTriangle,
  MessageSquarePlus,
  RotateCcw
} from 'lucide-react';
import {
  VerifiedCareerProfile,
  CareerClaim,
  resolveLifecycleState
} from '../../shared/types/career-profile';
import { ActiveTab } from './Layout';

interface ReviewQueueViewProps {
  profile: VerifiedCareerProfile;
  onQueueUpdated: () => void;
  onNavigate: (tab: ActiveTab) => void;
}

export const ReviewQueueView: React.FC<ReviewQueueViewProps> = ({
  profile,
  onQueueUpdated,
  onNavigate
}) => {
  const actionableClaims = profile.claims.filter(c => {
    const state = resolveLifecycleState(c);
    return state === 'discovered' || state === 'pending_review';
  });
  const resolvedClaims = profile.claims.filter(c => {
    const state = resolveLifecycleState(c);
    return state === 'approved' || state === 'rejected';
  });

  const [selectedIds, setSelectedIds] = useState<string[]>(
    actionableClaims.slice(0, 2).map(c => c.id)
  );
  const [clarificationDrafts, setClarificationDrafts] = useState<Record<string, string>>({});
  const [openClarifyId, setOpenClarifyId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const selectAllPending = () => {
    if (selectedIds.length === actionableClaims.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(actionableClaims.map(c => c.id));
    }
  };

  const handleSingleVerify = async (
    claim: CareerClaim,
    status: 'user_confirmed' | 'rejected' | 'pending_review'
  ) => {
    setProcessing(true);
    try {
      const clarificationResponse = clarificationDrafts[claim.id]?.trim();
      const res = await fetch(`/api/claims/${claim.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          clarificationResponse: clarificationResponse || undefined,
          note:
            status === 'user_confirmed'
              ? clarificationResponse
                ? `Approved with ownership clarification: ${clarificationResponse}`
                : 'Approved by candidate in Review Queue'
              : status === 'pending_review'
              ? 'Re-queued for candidate review'
              : 'Rejected by candidate in Review Queue'
        })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setToastMessage(
          status === 'user_confirmed'
            ? `Claim approved · Added to your Foliovera Career Profile`
            : status === 'pending_review'
            ? `Claim moved to Pending Review`
            : `Claim rejected and excluded from profile`
        );
        setSelectedIds(prev => prev.filter(id => id !== claim.id));
        setOpenClarifyId(null);
        onQueueUpdated();
        setTimeout(() => setToastMessage(null), 4000);
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleBatchVerify = async (
    targetIds: string[],
    status: 'user_confirmed' | 'rejected'
  ) => {
    if (targetIds.length === 0) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/claims/batch-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimIds: targetIds,
          status,
          note:
            status === 'user_confirmed'
              ? 'Approved by candidate in Review Queue'
              : 'Rejected by candidate in Review Queue'
        })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setToastMessage(
          status === 'user_confirmed'
            ? `Update verified · ${targetIds.length} item${targetIds.length > 1 ? 's' : ''} added to Career Profile`
            : `Rejected ${targetIds.length} item${targetIds.length > 1 ? 's' : ''}`
        );
        setSelectedIds(prev => prev.filter(id => !targetIds.includes(id)));
        onQueueUpdated();
        setTimeout(() => setToastMessage(null), 4000);
      }
    } finally {
      setProcessing(false);
    }
  };

  const getUpdateHeading = (claim: CareerClaim) => {
    if (claim.proposedChangeType === 'add_project') return 'Add new project';
    if (claim.proposedChangeType === 'add_skill') return 'Add skill';
    if (claim.proposedChangeType === 'update_experience') return 'Update experience';
    return 'Verify career claim';
  };

  const getUpdateIcon = (claim: CareerClaim) => {
    if (claim.proposedChangeType === 'add_project') {
      return <GitBranch className="w-4 h-4 text-[#242824] dark:text-[#F1F3F1]" />;
    }
    if (claim.proposedChangeType === 'add_skill') {
      return <Sparkles className="w-4 h-4 text-[#365C4C] dark:text-[#78B39A]" />;
    }
    return <Briefcase className="w-4 h-4 text-[#BE925E]" />;
  };

  const renderOwnershipBadge = (claim: CareerClaim) => {
    if (claim.ownershipStatus === 'uncertain_ownership') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 text-[11px] font-medium">
          <AlertTriangle className="w-3 h-3" />
          <span>Uncertain Ownership · Clarification Requested</span>
        </span>
      );
    }
    if (claim.ownershipStatus === 'contributor') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#E9E5DD] dark:bg-[#262E2B] text-[#545B54] dark:text-[#B4BDB7] text-[11px] font-medium">
          <span>Contributor</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#DDE6DC] dark:bg-[#243B31] text-[#28483B] dark:text-[#8CD1B5] text-[11px] font-medium">
        <span>Verified Author</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#242824] dark:text-[#F1F3F1]">
            Review Queue
          </h2>
          <p className="text-xs sm:text-sm text-[#545B54] dark:text-[#B4BDB7] mt-0.5">
            New updates discovered from your repositories and archives that need your confirmation before altering your profile.
          </p>
        </div>

        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[#181D1B] text-[#F6F5F1] border border-[#365C4C] shadow-lg text-xs font-medium"
            >
              <CheckCircle2 className="w-4 h-4 text-[#68A289]" />
              <span>{toastMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Review Queue Card */}
      <section className="bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#E9E5DD] dark:border-[#262E2B]">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={actionableClaims.length > 0 && selectedIds.length === actionableClaims.length}
              onChange={selectAllPending}
              disabled={actionableClaims.length === 0}
              className="w-4 h-4 rounded accent-[#365C4C] cursor-pointer"
              aria-label="Select all pending updates"
            />
            <span className="text-xs font-semibold text-[#242824] dark:text-[#F1F3F1]">
              Discovered & Pending Confirmation ({actionableClaims.length})
            </span>
          </div>

          <button
            onClick={() => onNavigate('claims')}
            className="text-xs font-medium text-[#365C4C] dark:text-[#68A289] hover:underline"
          >
            Open Full Claims Matrix →
          </button>
        </div>

        {actionableClaims.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#DDE6DC] dark:bg-[#243B31] text-[#365C4C] dark:text-[#78B39A] mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="font-editorial text-lg font-medium text-[#242824] dark:text-[#F1F3F1]">
              All caught up!
            </div>
            <p className="text-xs text-[#545B54] dark:text-[#B4BDB7] max-w-md mx-auto">
              Every discovered career claim has been reviewed. Sync a GitHub username on the Overview tab or re-queue any historical item below.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {actionableClaims.map(claim => {
              const checked = selectedIds.includes(claim.id);
              const lifecycle = resolveLifecycleState(claim);
              const needsClarification = claim.ownershipStatus === 'uncertain_ownership';
              const showClarifyBox = needsClarification || openClarifyId === claim.id;

              return (
                <motion.div
                  key={claim.id}
                  layout
                  className={`p-4 sm:p-5 rounded-2xl border transition-all space-y-3 ${
                    checked
                      ? 'bg-[#F6F5F1] dark:bg-[#222926] border-[#365C4C]'
                      : 'bg-[#FDFCFA] dark:bg-[#151A18] border-[#E2DFD7] dark:border-[#262E2B]'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelect(claim.id)}
                        className="mt-1.5 w-4 h-4 rounded accent-[#365C4C] cursor-pointer shrink-0"
                        aria-label={`Select ${claim.sourceLabel || claim.statement}`}
                      />
                      <div className="w-9 h-9 rounded-xl bg-[#E9E5DD]/80 dark:bg-[#242E2A] flex items-center justify-center shrink-0 mt-0.5">
                        {getUpdateIcon(claim)}
                      </div>
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-[#242824] dark:text-[#F1F3F1]">
                            {getUpdateHeading(claim)}
                          </span>
                          <span className="text-xs font-medium text-[#365C4C] dark:text-[#78B39A]">
                            · {claim.sourceLabel || claim.category}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#E9E5DD] dark:bg-[#262E2B] text-[10px] font-mono uppercase text-[#242824] dark:text-[#DDE6DC]">
                            {lifecycle === 'discovered' ? 'Discovered' : 'Pending Review'}
                          </span>
                          {renderOwnershipBadge(claim)}
                        </div>
                        <p className="text-xs sm:text-sm text-[#242824] dark:text-[#F1F3F1] leading-relaxed">
                          {claim.statement}
                        </p>
                        {claim.supportingExplanation && (
                          <p className="text-xs text-[#545B54] dark:text-[#B4BDB7]">
                            <span className="font-semibold">Why supported:</span> {claim.supportingExplanation}
                          </p>
                        )}
                        <div className="text-[11px] font-mono text-[#767E76] flex flex-wrap items-center gap-3 pt-0.5">
                          <span>Evidence: {claim.evidenceIds.join(', ')}</span>
                          <span>·</span>
                          <span>Confidence: {Math.round(claim.confidenceScore * 100)}%</span>
                          {claim.repositoryRef && (
                            <>
                              <span>·</span>
                              <span>Repo: {claim.repositoryRef}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0 pl-8 sm:pl-0">
                      <span className="text-xs text-[#767E76] font-mono whitespace-nowrap">
                        {claim.discoveredRelativeTime || 'Recent'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {!showClarifyBox && (
                          <button
                            type="button"
                            onClick={() => setOpenClarifyId(claim.id)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#545B54] dark:text-[#B4BDB7] hover:bg-[#E9E5DD] dark:hover:bg-[#262E2B] transition-colors inline-flex items-center gap-1"
                            title="Add personal contribution note before approving"
                          >
                            <MessageSquarePlus className="w-3.5 h-3.5" />
                            <span>Clarify</span>
                          </button>
                        )}
                        <button
                          disabled={processing}
                          onClick={() => handleSingleVerify(claim, 'rejected')}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#E9E5DD] hover:bg-[#DDD8CE] dark:bg-[#262E2B] text-[#545B54] dark:text-[#B4BDB7] transition-colors"
                        >
                          Reject
                        </button>
                        <button
                          disabled={processing}
                          onClick={() => handleSingleVerify(claim, 'user_confirmed')}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#365C4C] hover:bg-[#2B4B3E] text-white transition-colors"
                        >
                          Approve
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Step 5: Contribution Ownership Clarification Box */}
                  {showClarifyBox && (
                    <div className="ml-0 sm:ml-13 p-3.5 rounded-xl bg-[#FDFCFA] dark:bg-[#0E1110] border border-[#D8D4C8] dark:border-[#2C3531] space-y-2">
                      <div className="text-xs font-medium text-[#242824] dark:text-[#F1F3F1]">
                        {claim.clarificationPrompt ||
                          'Clarify your personal engineering contribution or role on this repository:'}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={clarificationDrafts[claim.id] || ''}
                          onChange={e =>
                            setClarificationDrafts(prev => ({
                              ...prev,
                              [claim.id]: e.target.value
                            }))
                          }
                          placeholder="e.g. Authored the core Raft state machine and benchmark suite..."
                          className="flex-1 px-3 py-2 text-xs rounded-xl bg-[#F6F5F1] dark:bg-[#1A1F1D] border border-[#D6D2C8] dark:border-[#2C3531] text-[#242824] dark:text-[#F1F3F1]"
                        />
                        <button
                          disabled={processing}
                          onClick={() => handleSingleVerify(claim, 'user_confirmed')}
                          className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-[#365C4C] hover:bg-[#2B4B3E] text-white whitespace-nowrap"
                        >
                          Confirm & Approve
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Batch Footer Action Bar */}
        {actionableClaims.length > 0 && (
          <div className="pt-4 border-t border-[#E9E5DD] dark:border-[#262E2B] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <span className="text-xs text-[#545B54] dark:text-[#B4BDB7]">
              {selectedIds.length} update{selectedIds.length === 1 ? '' : 's'} selected for batch confirmation
            </span>
            <div className="flex items-center gap-3">
              <button
                disabled={processing || selectedIds.length === 0}
                onClick={() => handleBatchVerify(selectedIds, 'rejected')}
                className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#E9E5DD] hover:bg-[#DDD8CE] dark:bg-[#262E2B] dark:hover:bg-[#303A36] text-[#242824] dark:text-[#F1F3F1] disabled:opacity-50 transition-colors"
              >
                Reject
              </button>
              <button
                disabled={processing || selectedIds.length === 0}
                onClick={() => handleBatchVerify(selectedIds, 'user_confirmed')}
                className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-xs font-semibold bg-[#365C4C] hover:bg-[#2B4B3E] text-white disabled:opacity-50 transition-colors tabular-nums"
              >
                Approve ({selectedIds.length})
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Resolved & Quarantined Audit History */}
      <section className="bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-editorial text-base font-semibold text-[#242824] dark:text-[#F1F3F1]">
            Previously Reviewed & Quarantined Claims ({resolvedClaims.length})
          </h3>
          <span className="text-xs text-[#767E76]">Rule 4 & Rule 6 Audit Log</span>
        </div>

        <div className="divide-y divide-[#E9E5DD] dark:divide-[#262E2B]">
          {resolvedClaims.map(claim => (
            <div key={claim.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="font-medium text-[#242824] dark:text-[#F1F3F1]">{claim.statement}</div>
                <div className="text-[11px] font-mono text-[#767E76]">
                  ID: {claim.id} · Evidence: {claim.evidenceIds.join(', ')}
                  {claim.clarificationResponse ? ` · Clarified: "${claim.clarificationResponse}"` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {claim.verificationStatus === 'rejected' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-100 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 font-medium">
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Rejected / Quarantined</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#DDE6DC] dark:bg-[#243B31] text-[#28483B] dark:text-[#8CD1B5] font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{claim.verificationStatus === 'verified_source' ? 'Source-Supported' : 'Candidate Approved'}</span>
                  </span>
                )}
                <button
                  disabled={processing}
                  onClick={() => handleSingleVerify(claim, 'pending_review')}
                  className="p-1.5 rounded-lg text-[#767E76] hover:text-[#242824] dark:hover:text-white"
                  title="Move back to Pending Review"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
