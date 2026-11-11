/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Architecture & Phased Roadmap Explorer
 * Interactive visualization of system data flows, security boundaries, and deliverables.
 */

import React, { useState } from 'react';
import {
  Layers,
  Shield,
  Database,
  CheckCircle2,
  Clock,
  GitBranch,
  FileText,
  Sparkles,
  Target
} from 'lucide-react';

export const ArchitectureRoadmapView: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'architecture' | 'data-model' | 'security' | 'roadmap'>('architecture');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#242824] dark:text-[#F1F3F1]">
          Engineering Architecture & Phased Roadmap
        </h2>
        <p className="text-xs sm:text-sm text-[#545B54] dark:text-[#B4BDB7] mt-0.5">
          Technical specifications, security invariants, and incremental delivery milestones for Foliovera.
        </p>
      </div>

      {/* Segmented Section Navigator */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#E9E5DD]/80 dark:bg-[#1A1F1D] border border-[#DDD8CE] dark:border-[#262E2B] rounded-xl max-w-fit">
        {[
          { id: 'architecture', label: 'Architecture (v1.0) & Data Flow' },
          { id: 'data-model', label: 'Verified Career Profile Model' },
          { id: 'security', label: 'Security & Untrusted Boundaries' },
          { id: 'roadmap', label: 'Phased Delivery Roadmap' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id as any)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              activeSection === tab.id
                ? 'bg-[#365C4C] text-[#F6F5F1] shadow-xs'
                : 'text-[#545B54] dark:text-[#B4BDB7] hover:text-[#242824] dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Section 1: Architecture & Data Flow (Matching Storyboard Architecture v1.0) */}
      {activeSection === 'architecture' && (
        <div className="space-y-6">
          {/* Visual Architecture v1.0 Diagram from Storyboard */}
          <div className="bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-6 space-y-6">
            <h3 className="font-editorial text-lg font-semibold text-[#242824] dark:text-[#F1F3F1] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#365C4C]" />
              <span>Architecture (v1.0) — Evidence-to-Resume Pipeline</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              {/* Left Column: Inputs */}
              <div className="space-y-3">
                {[
                  { title: 'GitHub API', sub: 'Repos, Commits, Merged PRs', icon: GitBranch },
                  { title: 'LinkedIn Import', sub: 'Verified Profile Data Archive', icon: Layers },
                  { title: 'Manual Input', sub: 'Certs, Experience Attestations', icon: FileText }
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="p-3.5 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#E2DFD7] dark:border-[#262E2B] flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#E9E5DD] dark:bg-[#242E2A] flex items-center justify-center text-[#242824] dark:text-[#DDE6DC]">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-[#242824] dark:text-[#F1F3F1]">{item.title}</div>
                        <div className="text-[11px] text-[#767E76]">{item.sub}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Center Hub: Career Agent + UntrustedDataGuard */}
              <div className="p-6 rounded-2xl bg-[#181D1B] text-[#F6F5F1] border border-[#365C4C] text-center space-y-2 shadow-md">
                <div className="w-10 h-10 rounded-xl bg-[#365C4C] text-white mx-auto flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="font-editorial text-base font-semibold">Career Agent</div>
                <div className="text-[11px] text-[#B4BDB7]">
                  Gemini 3.8 Flash + Deterministic Matcher
                </div>
                <div className="pt-2 text-[10px] font-mono text-[#8CD1B5]">
                  Quarantined by UntrustedDataGuard
                </div>
              </div>

              {/* Right Column: Outputs */}
              <div className="space-y-3">
                {[
                  { title: 'Verified Career DB', sub: 'Pluggable StorageAdapter', icon: Database },
                  { title: 'Resume Generator', sub: 'PDF / Markdown / ATS TXT', icon: FileText },
                  { title: 'Role Matcher', sub: 'Targeted Resumes with Citations', icon: Target }
                ].map(item => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="p-3.5 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#E2DFD7] dark:border-[#262E2B] flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#DDE6DC] dark:bg-[#243B31] flex items-center justify-center text-[#365C4C] dark:text-[#78B39A]">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-[#242824] dark:text-[#F1F3F1]">{item.title}</div>
                        <div className="text-[11px] text-[#767E76]">{item.sub}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section 2: Data Model */}
      {activeSection === 'data-model' && (
        <div className="bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-6 space-y-4">
          <h3 className="font-editorial text-lg font-semibold text-[#242824] dark:text-[#F1F3F1] flex items-center gap-2">
            <Database className="w-4 h-4 text-[#365C4C]" />
            <span>Verified Career Profile Data Model Schema</span>
          </h3>
          <p className="text-xs sm:text-sm text-[#545B54] dark:text-[#B4BDB7] leading-relaxed">
            Every data structure enforces the cardinal rule: <strong>No claim exists without verifiable evidence.</strong>
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-xl border border-[#E2DFD7] dark:border-[#262E2B] bg-[#F6F5F1] dark:bg-[#0E1110] space-y-2 text-xs">
              <span className="font-mono font-bold text-[#242824] dark:text-[#F1F3F1]">
                CareerClaim Entity
              </span>
              <ul className="space-y-1 font-mono text-[11px] text-[#545B54] dark:text-[#B4BDB7]">
                <li>• <strong>id</strong>: string</li>
                <li>• <strong>category</strong>: 'work_experience' | 'skill' | 'metric' | 'project'</li>
                <li>• <strong>statement</strong>: string (Atomic technical fact)</li>
                <li>• <strong className="text-[#365C4C] dark:text-[#68A289]">evidenceIds</strong>: string[] (Required link to vault)</li>
                <li>• <strong>verificationStatus</strong>: 'verified_source' | 'user_confirmed' | 'pending_review' | 'rejected'</li>
              </ul>
            </div>

            <div className="p-4 rounded-xl border border-[#E2DFD7] dark:border-[#262E2B] bg-[#F6F5F1] dark:bg-[#0E1110] space-y-2 text-xs">
              <span className="font-mono font-bold text-[#242824] dark:text-[#F1F3F1]">
                EvidenceSource Entity
              </span>
              <ul className="space-y-1 font-mono text-[11px] text-[#545B54] dark:text-[#B4BDB7]">
                <li>• <strong>id</strong>: string</li>
                <li>• <strong>type</strong>: 'github_commit' | 'github_repo' | 'linkedin_import' | 'credential_document'</li>
                <li>• <strong>provenance</strong>: &#123; commitSha, repository, authorLogin, sourceTimestamp &#125;</li>
                <li>• <strong>securityScan</strong>: &#123; sanitized, injectionRiskDetected, flaggedPatterns &#125;</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Section 3: Security & Boundaries */}
      {activeSection === 'security' && (
        <div className="bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-6 space-y-4">
          <h3 className="font-editorial text-lg font-semibold text-[#242824] dark:text-[#F1F3F1] flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#365C4C]" />
            <span>Strict Security & Anti-Hallucination Boundaries</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 text-xs">
            {[
              {
                rule: 'Rule 4 & 5: Traceability & Zero Fabrication',
                desc: 'Resume Studio strictly filters out pending or rejected claims. Every exported resume bullet cites its underlying evidence IDs.'
              },
              {
                rule: 'Rule 6: Untrusted External Content',
                desc: 'All imported READMEs, commits, and descriptions pass through UntrustedDataGuard to neutralize prompt injections.'
              },
              {
                rule: 'Rule 3: Server-Side Credential Quarantine',
                desc: 'GEMINI_API_KEY and GITHUB_TOKEN remain strictly server-side. Zero secrets are exposed in client code.'
              },
              {
                rule: 'Rule 12: Human-Supervised Control',
                desc: 'Newly discovered career updates always enter the Review Queue first and never modify external accounts.'
              }
            ].map(item => (
              <div
                key={item.rule}
                className="p-4 rounded-xl border border-[#E2DFD7] dark:border-[#262E2B] bg-[#F6F5F1] dark:bg-[#0E1110] space-y-1.5"
              >
                <div className="font-semibold text-[#242824] dark:text-[#F1F3F1]">{item.rule}</div>
                <p className="text-[#545B54] dark:text-[#B4BDB7] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 4: Roadmap */}
      {activeSection === 'roadmap' && (
        <div className="bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-6 space-y-5">
          <h3 className="font-editorial text-lg font-semibold text-[#242824] dark:text-[#F1F3F1]">
            Phased Implementation Roadmap
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {[
              {
                phase: 'Phase 0 & 1 (Complete)',
                title: 'Engineering Foundation & Editorial Workspace',
                desc: 'Full-stack Express + Vite architecture, pluggable StorageAdapter, UntrustedDataGuard, and 6-page editorial career intelligence platform.'
              },
              {
                phase: 'Phase 2 (Active)',
                title: 'Server-Side Gemini & Deterministic Resume Studio',
                desc: 'Role-specific resume tailoring grounded strictly in verified career claims with PDF/Markdown/ATS exports.'
              },
              {
                phase: 'Phase 3 (Planned)',
                title: 'Live GitHub Conditional Sync & Relational DB',
                desc: 'ETag-cached GitHub repository polling and drop-in PostgreSQL / Cloud SQL adapter.'
              },
              {
                phase: 'Phase 4 (Planned)',
                title: 'Cryptographic Attestation & Multi-Profile Vault',
                desc: 'Signed verifiable credentials and multi-role portfolio snapshots.'
              }
            ].map(item => (
              <div
                key={item.phase}
                className="p-4 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#E2DFD7] dark:border-[#262E2B] space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-[#365C4C] dark:text-[#68A289]">{item.phase}</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#365C4C]" />
                </div>
                <div className="font-semibold text-sm text-[#242824] dark:text-[#F1F3F1]">{item.title}</div>
                <p className="text-[#545B54] dark:text-[#B4BDB7] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
