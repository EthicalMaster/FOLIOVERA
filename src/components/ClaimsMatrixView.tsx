/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Claims & Evidence Traceability Matrix
 * Enforces Rule 4: Every claim must be traceable to source evidence or explicitly confirmed by user.
 * Enforces Rule 5: Zero fabrication.
 * Enforces Step 5: Explicit lifecycle states (Discovered, Pending Review, Approved, Rejected)
 * and honest source verification labels.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  Clock,
  XCircle,
  ShieldCheck,
  Search,
  ChevronRight,
  GitCommit,
  FileCode,
  FileText,
  AlertTriangle,
  Edit3,
  Trash2,
  Sparkles,
  X
} from 'lucide-react';
import {
  VerifiedCareerProfile,
  CareerClaim,
  EvidenceSource,
  resolveLifecycleState
} from '../../shared/types/career-profile';
import { apiFetch } from '../lib/api-client';

interface ClaimsMatrixViewProps {
  profile: VerifiedCareerProfile | null;
  onClaimStatusUpdated: () => void;
}

export const ClaimsMatrixView: React.FC<ClaimsMatrixViewProps> = ({
  profile,
  onClaimStatusUpdated
}) => {
  const [filterLifecycle, setFilterLifecycle] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedClaim, setSelectedClaim] = useState<CareerClaim | null>(null);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Inline statement editing state
  const [isEditingStatement, setIsEditingStatement] = useState(false);
  const [draftStatement, setDraftStatement] = useState('');
  const [draftClarification, setDraftClarification] = useState('');

  if (!profile) return null;

  const claims = profile.claims;
  const evidenceVault = profile.evidenceVault;

  const filteredClaims = claims.filter(claim => {
    const lifecycle = resolveLifecycleState(claim);
    const matchesFilter =
      filterLifecycle === 'all' ||
      lifecycle === filterLifecycle ||
      claim.verificationStatus === filterLifecycle;
    const matchesSearch =
      claim.statement.toLowerCase().includes(searchQuery.toLowerCase()) ||
      claim.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (claim.repositoryRef && claim.repositoryRef.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  const getLinkedEvidence = (evidenceIds: string[]): EvidenceSource[] => {
    return evidenceVault.filter(e => evidenceIds.includes(e.id));
  };

  const handleVerifyClaim = async (claimId: string, newStatus: 'user_confirmed' | 'rejected') => {
    setIsUpdating(true);
    setUpdateError(null);
    try {
      const res = await apiFetch(`/api/claims/${claimId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          clarificationResponse: draftClarification.trim() || undefined,
          note: newStatus === 'user_confirmed'
            ? 'Candidate confirmed statement accuracy in Claims Matrix'
            : 'Candidate disputed/rejected statement in Claims Matrix'
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Verification update failed');
      }

      if (selectedClaim && selectedClaim.id === claimId) {
        setSelectedClaim(data.data);
      }

      onClaimStatusUpdated();
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to update verification status');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveEditedClaim = async () => {
    if (!selectedClaim || !draftStatement.trim()) return;
    setIsUpdating(true);
    setUpdateError(null);
    try {
      const res = await apiFetch(`/api/claims/${selectedClaim.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statement: draftStatement.trim(),
          clarificationResponse: draftClarification.trim() || selectedClaim.clarificationResponse
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to update claim');
      }
      setSelectedClaim(data.data);
      setIsEditingStatement(false);
      onClaimStatusUpdated();
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to update claim');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteClaim = async (claimId: string) => {
    setIsUpdating(true);
    setUpdateError(null);
    try {
      const res = await apiFetch(`/api/claims/${claimId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to delete claim');
      }
      setSelectedClaim(null);
      onClaimStatusUpdated();
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to delete claim');
    } finally {
      setIsUpdating(false);
    }
  };

  const renderStatusBadge = (claim: CareerClaim) => {
    const lifecycle = resolveLifecycleState(claim);
    if (lifecycle === 'approved') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#365C4C] dark:text-[#78B39A]">
          {claim.verificationStatus === 'verified_source' ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Approved (Source-Supported)</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Approved (Candidate Confirmed)</span>
            </>
          )}
        </span>
      );
    }
    if (lifecycle === 'discovered') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#BE925E]">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Discovered (Awaiting Review)</span>
        </span>
      );
    }
    if (lifecycle === 'pending_review') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#BE925E]">
          <Clock className="w-3.5 h-3.5" />
          <span>Pending Review</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-400">
        <XCircle className="w-3.5 h-3.5" />
        <span>Rejected (Excluded)</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#242824] dark:text-[#F1F3F1]">
            Career Claims & Traceability Matrix
          </h2>
          <p className="text-xs sm:text-sm text-[#545B54] dark:text-[#B4BDB7] mt-0.5">
            Every statement is anchored to repository commits, README documentation, or explicit candidate attestations.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#767E76]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search claims, repos, metrics..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#365C4C] text-[#242824] dark:text-[#F1F3F1]"
          />
        </div>
      </div>

      {/* Explicit 4-Stage Lifecycle Filter Bar */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#E9E5DD]/80 dark:bg-[#1A1F1D] border border-[#DDD8CE] dark:border-[#262E2B] rounded-xl max-w-fit">
        {[
          { id: 'all', label: 'All Claims' },
          { id: 'discovered', label: 'Discovered' },
          { id: 'pending_review', label: 'Pending Review' },
          { id: 'approved', label: 'Approved' },
          { id: 'rejected', label: 'Rejected' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilterLifecycle(tab.id)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              filterLifecycle === tab.id
                ? 'bg-[#365C4C] text-[#F6F5F1] shadow-xs'
                : 'text-[#545B54] dark:text-[#B4BDB7] hover:text-[#242824] dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className={`space-y-3 ${selectedClaim ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
          {filteredClaims.length === 0 ? (
            <div className="text-center py-12 border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl bg-[#FDFCFA] dark:bg-[#1A1F1D] text-[#545B54] text-sm">
              No claims match your current filter and search criteria.
            </div>
          ) : (
            <div className="bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl overflow-hidden divide-y divide-[#ECE9E1] dark:divide-[#262E2B]">
              {filteredClaims.map(claim => {
                const isSelected = selectedClaim?.id === claim.id;
                const linked = getLinkedEvidence(claim.evidenceIds);

                return (
                  <div
                    key={claim.id}
                    onClick={() => {
                      setSelectedClaim(claim);
                      setIsEditingStatement(false);
                      setDraftStatement(claim.statement);
                      setDraftClarification(claim.clarificationResponse || '');
                    }}
                    className={`p-4 sm:p-5 cursor-pointer transition-colors hover:bg-[#F3F0E8] dark:hover:bg-[#222926] ${
                      isSelected ? 'bg-[#DDE6DC]/40 dark:bg-[#243B31]/30 ring-1 ring-inset ring-[#365C4C]' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#767E76]">
                          <span className="font-mono uppercase font-semibold text-[#365C4C] dark:text-[#68A289]">
                            {claim.category.replace('_', ' ')}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            Confidence: <span className="font-mono tabular-nums font-semibold text-[#242824] dark:text-[#F1F3F1]">{Math.round(claim.confidenceScore * 100)}%</span>
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{claim.id}</span>
                        </div>

                        <p className="text-sm font-medium text-[#242824] dark:text-[#F1F3F1] leading-snug">
                          {claim.statement}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
                          {renderStatusBadge(claim)}
                          <span className="text-[#767E76]">·</span>
                          <span className="text-[#545B54] dark:text-[#B4BDB7] font-mono">
                            {linked.length} Evidence Source{linked.length > 1 ? 's' : ''}
                          </span>
                          {claim.ownershipStatus === 'uncertain_ownership' && (
                            <>
                              <span className="text-[#767E76]">·</span>
                              <span className="text-amber-700 dark:text-amber-400 font-medium">
                                Ownership Clarification Needed
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <ChevronRight className="w-4 h-4 text-[#767E76] shrink-0 mt-1" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <AnimatePresence>
          {selectedClaim && (
            <motion.aside
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              className="lg:col-span-5 bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-6 sticky top-24 space-y-5"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#E9E5DD] dark:border-[#262E2B]">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[#365C4C] dark:text-[#68A289] font-semibold">
                    Evidence Traceability Inspector
                  </span>
                  <h3 className="font-editorial text-lg font-semibold text-[#242824] dark:text-[#F1F3F1]">
                    Claim {selectedClaim.id}
                  </h3>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setIsEditingStatement(!isEditingStatement);
                      setDraftStatement(selectedClaim.statement);
                    }}
                    className="p-1.5 text-[#767E76] hover:text-[#242824] dark:hover:text-white"
                    title="Edit claim statement"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteClaim(selectedClaim.id)}
                    className="p-1.5 text-[#767E76] hover:text-rose-600"
                    title="Delete claim"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setSelectedClaim(null)}
                    className="p-1.5 text-[#767E76] hover:text-[#242824] dark:hover:text-white"
                    aria-label="Close drawer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {updateError && (
                <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{updateError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <span className="text-xs font-medium text-[#545B54] dark:text-[#B4BDB7]">Statement</span>
                {isEditingStatement ? (
                  <div className="space-y-2">
                    <textarea
                      rows={3}
                      value={draftStatement}
                      onChange={e => setDraftStatement(e.target.value)}
                      className="w-full p-3 text-xs rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#365C4C] text-[#242824] dark:text-[#F1F3F1]"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setIsEditingStatement(false)}
                        className="px-3 py-1 text-xs text-[#545B54]"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={isUpdating}
                        onClick={handleSaveEditedClaim}
                        className="px-3 py-1 text-xs rounded-lg bg-[#365C4C] text-white font-medium"
                      >
                        Save Statement
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs sm:text-sm font-medium text-[#242824] dark:text-[#F1F3F1] bg-[#F6F5F1] dark:bg-[#0E1110] p-3.5 rounded-xl border border-[#E2DFD7] dark:border-[#262E2B] leading-relaxed">
                    {selectedClaim.statement}
                  </p>
                )}
              </div>

              {selectedClaim.supportingExplanation && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-[#545B54] dark:text-[#B4BDB7]">
                    Why Evidence Supports This Claim
                  </span>
                  <p className="text-xs text-[#545B54] dark:text-[#B4BDB7] bg-[#F6F5F1] dark:bg-[#0E1110] p-3 rounded-xl border border-[#E2DFD7] dark:border-[#262E2B]">
                    {selectedClaim.supportingExplanation}
                  </p>
                </div>
              )}

              <div className="p-4 rounded-xl border border-[#E2DFD7] dark:border-[#262E2B] bg-[#F6F5F1] dark:bg-[#0E1110] space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#242824] dark:text-[#F1F3F1]">
                    Candidate Verification Sign-Off
                  </span>
                  <span className="font-mono text-[#767E76]">Rule 4</span>
                </div>
                <input
                  type="text"
                  value={draftClarification}
                  onChange={e => setDraftClarification(e.target.value)}
                  placeholder="Optional ownership clarification or note..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#D6D2C8] dark:border-[#2C3531] text-[#242824] dark:text-[#F1F3F1]"
                />
                <div className="flex gap-2">
                  <button
                    disabled={isUpdating || selectedClaim.verificationStatus === 'user_confirmed'}
                    onClick={() => handleVerifyClaim(selectedClaim.id, 'user_confirmed')}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#365C4C] rounded-xl hover:bg-[#2B4B3E] disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approve Claim</span>
                  </button>
                  <button
                    disabled={isUpdating || selectedClaim.verificationStatus === 'rejected'}
                    onClick={() => handleVerifyClaim(selectedClaim.id, 'rejected')}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-800 dark:text-rose-300 bg-rose-100/70 dark:bg-rose-950/40 rounded-xl hover:bg-rose-200/70 disabled:opacity-50 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                <span className="text-xs font-semibold text-[#242824] dark:text-[#F1F3F1] block">
                  Underlying Evidence Proofs ({getLinkedEvidence(selectedClaim.evidenceIds).length})
                </span>
                {getLinkedEvidence(selectedClaim.evidenceIds).map(evi => (
                  <div
                    key={evi.id}
                    className="p-3.5 rounded-xl border border-[#E2DFD7] dark:border-[#262E2B] bg-[#F6F5F1] dark:bg-[#0E1110] space-y-2 text-xs"
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-[#242824] dark:text-[#F1F3F1]">
                      {evi.type === 'github_commit' && <GitCommit className="w-3.5 h-3.5 text-[#365C4C]" />}
                      {evi.type === 'github_pull_request' && <FileCode className="w-3.5 h-3.5 text-[#365C4C]" />}
                      {evi.type !== 'github_commit' && evi.type !== 'github_pull_request' && (
                        <FileText className="w-3.5 h-3.5 text-[#BE925E]" />
                      )}
                      <span className="truncate">{evi.title}</span>
                    </div>
                    <p className="text-[#545B54] dark:text-[#B4BDB7] font-mono text-[11px] leading-relaxed">
                      "{evi.rawContentSnippet}"
                    </p>
                  </div>
                ))}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
