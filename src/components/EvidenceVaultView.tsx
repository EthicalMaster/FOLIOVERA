/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Page 3: Evidence Vault (EvidenceVaultView)
 * Matches Storyboard Screen #3 ("Evidence Vault — All sources that verify your work and skills")
 * with category filter tabs (All | GitHub | LinkedIn | Files | Certificates),
 * animated contextual inspection drawer, and live evidence ingestion.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  GitCommit,
  GitPullRequest,
  FolderGit2,
  FileText,
  Award,
  Briefcase,
  ShieldCheck,
  ShieldAlert,
  Search,
  ArrowRight,
  Copy,
  Check,
  Plus,
  X
} from 'lucide-react';
import { EvidenceSource, EvidenceSourceType } from '../../shared/types/career-profile';

interface EvidenceVaultViewProps {
  evidenceList: EvidenceSource[];
  onEvidenceAdded?: () => void;
}

type VaultCategoryFilter = 'all' | 'github' | 'linkedin' | 'files' | 'certificates';

export const EvidenceVaultView: React.FC<EvidenceVaultViewProps> = ({
  evidenceList,
  onEvidenceAdded
}) => {
  const [activeCategory, setActiveCategory] = useState<VaultCategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceSource | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Add Evidence Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<EvidenceSourceType>('github_commit');
  const [newRepo, setNewRepo] = useState('alex-morgan-sample/spectr-graphite');
  const [newSha, setNewSha] = useState('');
  const [newSnippet, setNewSnippet] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const matchesCategory = (item: EvidenceSource, cat: VaultCategoryFilter): boolean => {
    if (cat === 'all') return true;
    if (cat === 'github') {
      return (
        item.type === 'github_repo' ||
        item.type === 'github_commit' ||
        item.type === 'github_pull_request' ||
        item.type === 'github_release'
      );
    }
    if (cat === 'linkedin') {
      return item.type === 'linkedin_import' || item.title.toLowerCase().includes('linkedin');
    }
    if (cat === 'files') {
      return item.type === 'user_attestation' || item.type === 'credential_document';
    }
    if (cat === 'certificates') {
      return item.type === 'credential_document' || item.title.toLowerCase().includes('certificate');
    }
    return true;
  };

  const filtered = evidenceList.filter(item => {
    const catOk = matchesCategory(item, activeCategory);
    const searchOk =
      !searchQuery.trim() ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.rawContentSnippet.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.provenance.repository && item.provenance.repository.toLowerCase().includes(searchQuery.toLowerCase()));
    return catOk && searchOk;
  });

  const handleCopyHash = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newSnippet.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          type: newType,
          repository: newRepo,
          commitSha: newSha,
          rawContentSnippet: newSnippet
        })
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setAddModalOpen(false);
        setNewTitle('');
        setNewSnippet('');
        setNewSha('');
        setSelectedEvidence(json.data);
        if (onEvidenceAdded) onEvidenceAdded();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getSourceIcon = (type: EvidenceSourceType) => {
    switch (type) {
      case 'github_commit':
        return <GitCommit className="w-4 h-4 text-[#242824] dark:text-[#F1F3F1]" />;
      case 'github_pull_request':
        return <GitPullRequest className="w-4 h-4 text-[#365C4C] dark:text-[#78B39A]" />;
      case 'github_repo':
        return <FolderGit2 className="w-4 h-4 text-[#242824] dark:text-[#F1F3F1]" />;
      case 'linkedin_import':
        return <Briefcase className="w-4 h-4 text-[#365C4C] dark:text-[#78B39A]" />;
      case 'credential_document':
        return <Award className="w-4 h-4 text-[#BE925E]" />;
      default:
        return <FileText className="w-4 h-4 text-[#545B54]" />;
    }
  };

  const getSourceSubtitle = (item: EvidenceSource) => {
    if (item.type.startsWith('github_')) {
      return `GitHub · ${item.provenance.repository || 'Verified Repository'} · ${new Date(item.provenance.sourceTimestamp).toLocaleDateString()}`;
    }
    if (item.type === 'linkedin_import') {
      return `LinkedIn · Synced yesterday`;
    }
    if (item.type === 'credential_document') {
      return `File · Cryptographic PDF Credential`;
    }
    return `Attestation · ${new Date(item.provenance.sourceTimestamp).toLocaleDateString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#242824] dark:text-[#F1F3F1]">
            Evidence Vault
          </h2>
          <p className="text-xs sm:text-sm text-[#545B54] dark:text-[#B4BDB7] mt-0.5">
            All cryptographic commits, repositories, and attested files that verify your work and skills.
          </p>
        </div>

        <button
          onClick={() => setAddModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium text-white bg-[#365C4C] hover:bg-[#2B4B3E] transition-colors self-start sm:self-center whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Ingest Evidence Source</span>
        </button>
      </div>

      {/* Filter Bar & Search (Storyboard Screen #3: All | GitHub | LinkedIn | Files | Certificates) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#E9E5DD]/80 dark:bg-[#1A1F1D] border border-[#DDD8CE] dark:border-[#262E2B] rounded-xl max-w-fit">
          {[
            { id: 'all', label: 'All' },
            { id: 'github', label: 'GitHub' },
            { id: 'linkedin', label: 'LinkedIn' },
            { id: 'files', label: 'Files' },
            { id: 'certificates', label: 'Certificates' }
          ].map(tab => {
            const active = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id as VaultCategoryFilter)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#365C4C] text-[#F6F5F1] shadow-xs'
                    : 'text-[#545B54] dark:text-[#B4BDB7] hover:text-[#242824] dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#767E76]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search commits, repos, files..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#365C4C] text-[#242824] dark:text-[#F1F3F1]"
          />
        </div>
      </div>

      {/* Main Content Layout: Evidence List + Animated Contextual Inspector Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className={`space-y-3 ${selectedEvidence ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
          {filtered.map((item, idx) => {
            const isSelected = selectedEvidence?.id === item.id;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: idx * 0.03 }}
                onClick={() => setSelectedEvidence(item)}
                className={`cursor-pointer bg-[#FDFCFA] dark:bg-[#1A1F1D] hover:bg-[#F3F0E8] dark:hover:bg-[#222926] border rounded-2xl p-4 sm:p-5 transition-all flex items-center justify-between gap-4 ${
                  isSelected
                    ? 'border-[#365C4C] ring-1 ring-[#365C4C]'
                    : 'border-[#E2DFD7] dark:border-[#262E2B]'
                }`}
              >
                <div className="flex items-start gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#F6F5F1] dark:bg-[#242E2A] border border-[#E2DFD7] dark:border-[#2F3B36] flex items-center justify-center shrink-0 mt-0.5">
                    {getSourceIcon(item.type)}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm sm:text-base font-semibold text-[#242824] dark:text-[#F1F3F1] truncate">
                      {item.title}
                    </div>
                    <div className="text-xs text-[#545B54] dark:text-[#B4BDB7] truncate">
                      {getSourceSubtitle(item)}
                    </div>
                    <p className="text-xs text-[#767E76] line-clamp-1 pt-0.5 font-mono">
                      {item.rawContentSnippet}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {item.securityScan.injectionRiskDetected ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 text-xs font-medium">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>Quarantined</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#DDE6DC] dark:bg-[#243B31] text-[#28483B] dark:text-[#8CD1B5] text-xs font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Verified</span>
                    </span>
                  )}
                  <ArrowRight className="w-4 h-4 text-[#767E76]" />
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Contextual Inspection Drawer */}
        <AnimatePresence>
          {selectedEvidence && (
            <motion.aside
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.2 }}
              className="lg:col-span-5 bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-6 sticky top-24 space-y-5"
            >
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#E9E5DD] dark:border-[#262E2B]">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-[#365C4C] dark:text-[#68A289] font-semibold">
                    Source Provenance Inspector
                  </span>
                  <h3 className="font-editorial text-lg font-semibold text-[#242824] dark:text-[#F1F3F1] mt-0.5">
                    {selectedEvidence.title}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedEvidence(null)}
                  className="p-1.5 rounded-lg text-[#767E76] hover:text-[#242824] dark:hover:text-white"
                  aria-label="Close source inspector"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Security Scan Banner */}
              <div
                className={`p-3.5 rounded-xl border text-xs flex items-start gap-3 ${
                  selectedEvidence.securityScan.injectionRiskDetected
                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300'
                    : 'bg-[#DDE6DC]/60 dark:bg-[#243B31]/50 border-[#C5D6C3] dark:border-[#2F4F41] text-[#243E33] dark:text-[#A5DEC6]'
                }`}
              >
                {selectedEvidence.securityScan.injectionRiskDetected ? (
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <div className="font-semibold">
                    {selectedEvidence.securityScan.injectionRiskDetected
                      ? 'Prompt Injection Sequence Defused (Rule 6)'
                      : 'Sanitized & Verified by UntrustedDataGuard'}
                  </div>
                  <div className="text-[11px] opacity-85 font-mono">
                    Scanner: {selectedEvidence.securityScan.sanitizationVersion}
                  </div>
                </div>
              </div>

              {/* Extracted Content Snippet */}
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-[#545B54] dark:text-[#B4BDB7]">
                  Sanitized Source Excerpt
                </span>
                <div className="p-3.5 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#E2DFD7] dark:border-[#262E2B] font-mono text-xs text-[#242824] dark:text-[#DDE6DC] leading-relaxed">
                  {selectedEvidence.rawContentSnippet}
                </div>
              </div>

              {/* Cryptographic Metadata */}
              <div className="space-y-2.5 text-xs pt-2 border-t border-[#E9E5DD] dark:border-[#262E2B] font-mono">
                <div className="flex items-center justify-between">
                  <span className="text-[#767E76]">Evidence ID</span>
                  <span className="text-[#242824] dark:text-[#F1F3F1]">{selectedEvidence.id}</span>
                </div>
                {selectedEvidence.provenance.repository && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#767E76]">Repository</span>
                    <span className="text-[#242824] dark:text-[#F1F3F1]">{selectedEvidence.provenance.repository}</span>
                  </div>
                )}
                {selectedEvidence.provenance.commitSha && (
                  <div className="flex items-center justify-between">
                    <span className="text-[#767E76]">Commit SHA</span>
                    <button
                      onClick={() => handleCopyHash(selectedEvidence.provenance.commitSha!, selectedEvidence.id)}
                      className="inline-flex items-center gap-1.5 text-[#365C4C] dark:text-[#68A289] hover:underline"
                    >
                      <span>{selectedEvidence.provenance.commitSha.slice(0, 12)}</span>
                      {copiedId === selectedEvidence.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[#767E76]">Source Timestamp</span>
                  <span className="tabular-nums text-[#242824] dark:text-[#F1F3F1]">
                    {new Date(selectedEvidence.provenance.sourceTimestamp).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {selectedEvidence.supportingExplanation && (
                <p className="text-xs text-[#242824] dark:text-[#DDE6DC] pt-1">
                  <span className="font-semibold">Provenance Rationale:</span> {selectedEvidence.supportingExplanation}
                </p>
              )}

              {selectedEvidence.notes && (
                <p className="text-xs text-[#545B54] dark:text-[#B4BDB7] italic pt-1">
                  Note: {selectedEvidence.notes}
                </p>
              )}
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Add Evidence Modal */}
      <AnimatePresence>
        {addModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs"
              onClick={() => setAddModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="fixed inset-x-4 top-16 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-50 w-full max-w-lg bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#2C3531] rounded-2xl shadow-2xl p-6 space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#E9E5DD] dark:border-[#262E2B]">
                <h3 className="font-editorial text-lg font-semibold text-[#242824] dark:text-[#F1F3F1]">
                  Ingest New Evidence Source
                </h3>
                <button onClick={() => setAddModalOpen(false)} className="text-[#767E76] hover:text-[#242824]">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateEvidence} className="space-y-3 text-xs">
                <div>
                  <label className="block font-medium text-[#545B54] mb-1">Evidence Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PR #204: Distributed Raft Consensus Snapshot"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#D6D2C8] dark:border-[#2C3531]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-[#545B54] mb-1">Source Type</label>
                    <select
                      value={newType}
                      onChange={e => setNewType(e.target.value as EvidenceSourceType)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#D6D2C8] dark:border-[#2C3531]"
                    >
                      <option value="github_commit">GitHub Commit</option>
                      <option value="github_pull_request">GitHub Pull Request</option>
                      <option value="github_repo">GitHub Repository</option>
                      <option value="linkedin_import">LinkedIn Archive</option>
                      <option value="credential_document">Certificate / PDF</option>
                      <option value="user_attestation">Candidate Attestation</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-[#545B54] mb-1">Commit SHA / Hash (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 9a4b71c02e"
                      value={newSha}
                      onChange={e => setNewSha(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#D6D2C8] dark:border-[#2C3531] font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-medium text-[#545B54] mb-1">
                    Raw Evidence Excerpt (Automatically scanned by UntrustedDataGuard)
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Paste commit benchmark notes, PR summary, or credential details..."
                    value={newSnippet}
                    onChange={e => setNewSnippet(e.target.value)}
                    className="w-full p-3 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#D6D2C8] dark:border-[#2C3531] font-mono"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAddModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-[#545B54]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 rounded-xl bg-[#365C4C] text-white font-medium hover:bg-[#2B4B3E] disabled:opacity-50"
                  >
                    {submitting ? 'Sanitizing & Saving...' : 'Scan & Add to Vault'}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
