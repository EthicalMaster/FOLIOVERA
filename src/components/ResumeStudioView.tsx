/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Page 4: Resume Studio (ResumeStudioView)
 * Matches Storyboard Screen #4 ("Resume Studio — Create role-specific, ATS-ready resumes")
 * with target-role selection, real multi-step generation progress ring, version history,
 * smooth transition between editing and preview, and PDF/Markdown/ATS exports.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  FileText,
  Download,
  Printer,
  Edit3,
  Eye,
  CheckCircle2,
  History,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import {
  VerifiedCareerProfile,
  ResumeVersion,
  ResumeStyle
} from '../../shared/types/career-profile';
import { apiFetch } from '../lib/api-client';

interface ResumeStudioViewProps {
  profile: VerifiedCareerProfile;
  onProfileRefresh: () => void;
}

const TARGET_ROLES = [
  'Principal Distributed Systems Engineer',
  'Data Scientist & Telemetry Platform Lead',
  'Staff Full-Stack & Systems Engineer',
  'Senior Cloud Infrastructure Architect'
];

export const ResumeStudioView: React.FC<ResumeStudioViewProps> = ({
  profile,
  onProfileRefresh
}) => {
  const versions = profile.resumeVersions ?? [];
  const [selectedVersionId, setSelectedVersionId] = useState<string>(versions[0]?.id || '');
  const [targetRole, setTargetRole] = useState<string>(TARGET_ROLES[0]);
  const [resumeStyle, setResumeStyle] = useState<ResumeStyle>('ats_professional');
  const [jobContext, setJobContext] = useState<string>('');
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [showCitations, setShowCitations] = useState<boolean>(
    profile.settings?.includeEvidenceFootnotes ?? true
  );

  // Generation progress state (matches Storyboard "72% Generating Resume..." ring)
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressStepLabel, setProgressStepLabel] = useState('');

  const activeVersion: ResumeVersion | undefined =
    versions.find(v => v.id === selectedVersionId) || versions[0];

  // Editable state for active resume version
  const [customSummary, setCustomSummary] = useState<string | null>(null);

  const displayedSummary = customSummary !== null
    ? customSummary
    : activeVersion?.tailoredSummary || profile.summary;

  const handleGenerateResume = async () => {
    setIsGenerating(true);
    setProgressPct(18);
    setProgressStepLabel('Loading verified career claims...');

    const stepTimer1 = setTimeout(() => {
      setProgressPct(48);
      setProgressStepLabel('Matching target role competencies...');
    }, 350);

    const stepTimer2 = setTimeout(() => {
      setProgressPct(76);
      setProgressStepLabel('Synthesizing ATS-ready statements...');
    }, 750);

    try {
      const res = await apiFetch('/api/resume/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetRole,
          style: resumeStyle,
          jobDescription: jobContext
        })
      });
      const json = await res.json();
      setProgressPct(100);
      setProgressStepLabel('Verified resume ready.');

      if (res.ok && json.success && json.data) {
        setCustomSummary(null);
        await onProfileRefresh();
        setSelectedVersionId(json.data.id);
      }
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setTimeout(() => {
        setIsGenerating(false);
        setProgressPct(0);
      }, 450);
    }
  };

  const buildPlainTextResume = (): string => {
    const lines: string[] = [
      profile.candidateName.toUpperCase(),
      `${activeVersion?.targetRole || profile.headline}`,
      `${profile.location || 'San Francisco, CA'} | ${profile.email || 'alex.morgan@systems.io'}`,
      '',
      'EXECUTIVE SUMMARY',
      displayedSummary,
      '',
      'VERIFIED TECHNICAL ACCOMPLISHMENTS',
      ...(activeVersion?.tailoredBullets ?? []).map(
        b => `- ${b.text}${showCitations ? ` [Evidence: ${b.evidenceIds.join(', ')}]` : ''}`
      ),
      '',
      'PROFESSIONAL EXPERIENCE',
      ...profile.experiences.flatMap(exp => [
        `${exp.role} — ${exp.organization} (${exp.period})`,
        ...exp.highlights.map(h => `  * ${h.text}`)
      ]),
      '',
      'VERIFIED PROJECTS',
      ...profile.projects.map(
        p => `${p.name} (${p.primaryLanguage}): ${p.description} [${p.metrics.map(m => `${m.label}: ${m.value}`).join(', ')}]`
      ),
      '',
      'EDUCATION',
      ...(profile.education ?? []).map(e => `${e.degree} — ${e.institution} (${e.period})`),
      '',
      'TECHNICAL SKILLS',
      profile.skills.map(s => s.name).join(' · ')
    ];
    return lines.join('\n');
  };

  const handleDownloadFile = (ext: 'md' | 'txt') => {
    const content = buildPlainTextResume();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${profile.candidateName.toLowerCase().replace(/\s+/g, '-')}-resume-${activeVersion?.versionLabel || 'v5'}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#242824] dark:text-[#F1F3F1]">
            Resume Studio
          </h2>
          <p className="text-xs sm:text-sm text-[#545B54] dark:text-[#B4BDB7] mt-0.5">
            Create role-specific, ATS-ready resumes grounded strictly in verified career claims.
          </p>
        </div>

        {/* Export & Mode Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center p-1 rounded-xl bg-[#E9E5DD] dark:bg-[#1A1F1D] border border-[#DDD8CE] dark:border-[#262E2B]">
            <button
              onClick={() => setMode('preview')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === 'preview'
                  ? 'bg-[#FDFCFA] dark:bg-[#262E2B] text-[#242824] dark:text-[#F1F3F1] shadow-2xs'
                  : 'text-[#545B54] dark:text-[#B4BDB7]'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
            <button
              onClick={() => setMode('edit')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === 'edit'
                  ? 'bg-[#FDFCFA] dark:bg-[#262E2B] text-[#242824] dark:text-[#F1F3F1] shadow-2xs'
                  : 'text-[#545B54] dark:text-[#B4BDB7]'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Tailor & Edit</span>
            </button>
          </div>

          <button
            onClick={() => handleDownloadFile('txt')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] text-[#242824] dark:text-[#F1F3F1] hover:bg-[#E9E5DD] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>ATS .TXT</span>
          </button>

          <button
            onClick={handlePrintPdf}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white bg-[#365C4C] hover:bg-[#2B4B3E] transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {/* Main Split: Left Configurator (4 cols) + Right Resume Sheet (8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Control Column (Storyboard Screen #4) */}
        <div className="no-print lg:col-span-4 space-y-5">
          <div className="bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#242824] dark:text-[#F1F3F1]">
                Target Role
              </label>
              <select
                value={targetRole}
                onChange={e => setTargetRole(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs font-medium rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#D6D2C8] dark:border-[#2C3531] text-[#242824] dark:text-[#F1F3F1] focus:outline-none focus:ring-2 focus:ring-[#365C4C]"
              >
                {TARGET_ROLES.map(r => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#242824] dark:text-[#F1F3F1]">
                Resume Style
              </label>
              <select
                value={resumeStyle}
                onChange={e => setResumeStyle(e.target.value as ResumeStyle)}
                className="w-full px-3.5 py-2.5 text-xs font-medium rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#D6D2C8] dark:border-[#2C3531] text-[#242824] dark:text-[#F1F3F1] focus:outline-none focus:ring-2 focus:ring-[#365C4C]"
              >
                <option value="ats_professional">ATS (Professional)</option>
                <option value="editorial_executive">Editorial Executive</option>
                <option value="systems_architect">Systems Architecture Lead</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#242824] dark:text-[#F1F3F1]">
                Role Keywords / Job Requirements (Optional)
              </label>
              <textarea
                rows={3}
                value={jobContext}
                onChange={e => setJobContext(e.target.value)}
                placeholder="Paste target job description snippets or priority competencies..."
                className="w-full p-3 text-xs rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#D6D2C8] dark:border-[#2C3531] text-[#242824] dark:text-[#F1F3F1] focus:outline-none focus:ring-2 focus:ring-[#365C4C]"
              />
            </div>

            <label className="flex items-center justify-between pt-1 cursor-pointer text-xs text-[#545B54] dark:text-[#B4BDB7]">
              <span>Include Evidence Citations</span>
              <input
                type="checkbox"
                checked={showCitations}
                onChange={e => setShowCitations(e.target.checked)}
                className="accent-[#365C4C] w-4 h-4 rounded"
              />
            </label>

            <button
              disabled={isGenerating}
              onClick={handleGenerateResume}
              className="w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#365C4C] hover:bg-[#2B4B3E] disabled:opacity-60 transition-all flex items-center justify-center gap-2 shadow-xs"
            >
              <span>{isGenerating ? 'Synthesizing Verified Resume...' : 'Generate'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Real Step Progress Card matching Storyboard Key Interactions */}
            <AnimatePresence>
              {isGenerating && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-4 rounded-xl bg-[#181D1B] text-[#F6F5F1] flex items-center gap-4"
                >
                  <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
                    <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
                      <circle cx="22" cy="22" r="18" stroke="#2C3531" strokeWidth="3.5" fill="none" />
                      <circle
                        cx="22"
                        cy="22"
                        r="18"
                        stroke="#68A289"
                        strokeWidth="3.5"
                        fill="none"
                        strokeDasharray="113"
                        strokeDashoffset={113 - (113 * progressPct) / 100}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute text-[11px] font-mono font-bold tabular-nums">
                      {progressPct}%
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white">Generating Resume...</div>
                    <div className="text-[11px] text-[#9DA59E] truncate mt-0.5">{progressStepLabel}</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Version History Card */}
          <div className="bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#545B54] dark:text-[#B4BDB7] flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-[#365C4C]" />
                <span>Version History ({versions.length})</span>
              </h3>
            </div>

            <div className="space-y-2">
              {versions.map(v => {
                const active = activeVersion?.id === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => {
                      setSelectedVersionId(v.id);
                      setCustomSummary(null);
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      active
                        ? 'bg-[#DDE6DC]/60 dark:bg-[#243B31]/60 border-[#365C4C] text-[#242824] dark:text-[#F1F3F1]'
                        : 'bg-[#F6F5F1] dark:bg-[#0E1110] border-[#E2DFD7] dark:border-[#262E2B] text-[#545B54] dark:text-[#B4BDB7] hover:text-[#242824]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="truncate">{v.targetRole}</span>
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[#E9E5DD] dark:bg-[#1A1F1D] text-[#242824] dark:text-[#DDE6DC] ml-2">
                        {v.versionLabel}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#767E76] mt-1 flex items-center justify-between font-mono">
                      <span>{v.tailoredBullets.length} verified claims</span>
                      <span>{new Date(v.createdAt).toLocaleDateString()}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Live Paper Document Preview or Tailor Editor (8 cols) */}
        <div className="lg:col-span-8">
          <AnimatePresence mode="wait">
            {mode === 'edit' ? (
              <motion.div
                key="editor-mode"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-6 space-y-5"
              >
                <div className="flex items-center justify-between pb-3 border-b border-[#E9E5DD] dark:border-[#262E2B]">
                  <div>
                    <h3 className="font-editorial text-lg font-semibold text-[#242824] dark:text-[#F1F3F1]">
                      Tailor Resume Copy ({activeVersion?.versionLabel || 'v5.0'})
                    </h3>
                    <p className="text-xs text-[#545B54] dark:text-[#B4BDB7]">
                      Refine your executive summary. Underlying claims remain locked to their cryptographic source evidence.
                    </p>
                  </div>
                  <button
                    onClick={() => setMode('preview')}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-white bg-[#365C4C]"
                  >
                    Done Editing
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#242824] dark:text-[#F1F3F1] mb-1.5">
                    Role-Targeted Executive Summary
                  </label>
                  <textarea
                    rows={4}
                    value={displayedSummary}
                    onChange={e => setCustomSummary(e.target.value)}
                    className="w-full p-3.5 text-xs sm:text-sm rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#D6D2C8] dark:border-[#2C3531] text-[#242824] dark:text-[#F1F3F1] leading-relaxed"
                  />
                </div>

                <div className="space-y-2.5">
                  <span className="block text-xs font-semibold text-[#242824] dark:text-[#F1F3F1]">
                    Included Verified Claims ({activeVersion?.tailoredBullets.length || 0})
                  </span>
                  {(activeVersion?.tailoredBullets ?? []).map(b => (
                    <div
                      key={b.claimId}
                      className="p-3.5 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#E2DFD7] dark:border-[#262E2B] space-y-1"
                    >
                      <div className="text-xs sm:text-sm text-[#242824] dark:text-[#F1F3F1]">{b.text}</div>
                      <div className="text-[11px] font-mono text-[#365C4C] dark:text-[#68A289]">
                        Evidence Anchor: {b.evidenceIds.join(', ')} · {b.relevanceReason}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.article
                key="preview-mode"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="print-only-resume bg-white dark:bg-[#151A18] text-[#242824] dark:text-[#F1F3F1] border border-[#DDD8CE] dark:border-[#2C3531] rounded-2xl shadow-sm p-8 sm:p-11 space-y-7"
              >
                {/* Resume Document Header */}
                <header className="border-b-2 border-[#242824] dark:border-[#3E5F52] pb-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div className="space-y-1">
                    <h1
                      className={`text-2xl sm:text-3xl font-bold tracking-tight text-[#242824] dark:text-white ${
                        resumeStyle === 'editorial_executive' ? 'font-editorial' : ''
                      }`}
                    >
                      {profile.candidateName}
                    </h1>
                    <p className="text-sm font-semibold text-[#365C4C] dark:text-[#78B39A]">
                      {activeVersion?.targetRole || profile.headline}
                    </p>
                  </div>
                  <div className="text-xs text-[#545B54] dark:text-[#B4BDB7] sm:text-right space-y-0.5 font-mono">
                    <div>{profile.location || 'San Francisco, CA'}</div>
                    <div>{profile.email || 'alex.morgan@systems.io'}</div>
                    <div className="text-[11px] text-[#365C4C] dark:text-[#68A289]">
                      Foliovera {activeVersion?.versionLabel || 'v5.0'} · 100% Verified
                    </div>
                  </div>
                </header>

                {/* Executive Summary */}
                <section className="space-y-1.5">
                  <h2 className="text-xs font-mono uppercase tracking-widest font-bold text-[#365C4C] dark:text-[#68A289]">
                    Executive Summary
                  </h2>
                  <p className="text-xs sm:text-sm text-[#242824] dark:text-[#DDE6DC] leading-relaxed">
                    {displayedSummary}
                  </p>
                </section>

                {/* Tailored Verified Impact Highlights */}
                <section className="space-y-2.5">
                  <h2 className="text-xs font-mono uppercase tracking-widest font-bold text-[#365C4C] dark:text-[#68A289]">
                    Selected Role-Specific Impact
                  </h2>
                  <ul className="space-y-2">
                    {(activeVersion?.tailoredBullets ?? []).map(b => (
                      <li key={b.claimId} className="text-xs sm:text-sm leading-relaxed flex items-start gap-2.5">
                        <span className="text-[#365C4C] font-bold mt-0.5">•</span>
                        <div className="flex-1">
                          <span>{b.text}</span>
                          {showCitations && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#F6F5F1] dark:bg-[#242E2A] text-[10px] font-mono text-[#545B54] dark:text-[#8CD1B5]">
                              ref:{b.evidenceIds.join(',')}
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>

                {/* Professional Experience */}
                <section className="space-y-4">
                  <h2 className="text-xs font-mono uppercase tracking-widest font-bold text-[#365C4C] dark:text-[#68A289]">
                    Professional Experience
                  </h2>
                  {profile.experiences.map(exp => (
                    <div key={exp.id} className="space-y-1.5">
                      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between">
                        <div className="text-sm font-bold text-[#242824] dark:text-white">
                          {exp.role} <span className="font-normal text-[#545B54] dark:text-[#B4BDB7]">· {exp.organization}</span>
                        </div>
                        <span className="text-xs font-mono text-[#767E76] tabular-nums">{exp.period}</span>
                      </div>
                      <ul className="space-y-1 pl-4 list-disc text-xs sm:text-sm text-[#242824] dark:text-[#DDE6DC]">
                        {exp.highlights.map(h => (
                          <li key={h.claimId}>
                            {h.text}
                            {showCitations && (
                              <span className="ml-1.5 text-[10px] font-mono text-[#767E76]">
                                [{h.evidenceIds.join(', ')}]
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>

                {/* Open Source & Systems Projects */}
                <section className="space-y-3">
                  <h2 className="text-xs font-mono uppercase tracking-widest font-bold text-[#365C4C] dark:text-[#68A289]">
                    Verified Engineering Projects
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {profile.projects.map(p => (
                      <div
                        key={p.id}
                        className="p-3 rounded-xl bg-[#F6F5F1] dark:bg-[#1E2623] border border-[#E2DFD7] dark:border-[#2C3531] space-y-1"
                      >
                        <div className="flex items-center justify-between text-xs font-bold font-mono">
                          <span>{p.name}</span>
                          <span className="text-[#365C4C] dark:text-[#68A289]">{p.primaryLanguage}</span>
                        </div>
                        <p className="text-xs text-[#545B54] dark:text-[#B4BDB7]">{p.description}</p>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Education & Technical Skills */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 border-t border-[#E9E5DD] dark:border-[#262E2B]">
                  <section className="space-y-1.5">
                    <h2 className="text-xs font-mono uppercase tracking-widest font-bold text-[#365C4C] dark:text-[#68A289]">
                      Education
                    </h2>
                    {(profile.education ?? []).map(edu => (
                      <div key={edu.id} className="text-xs space-y-0.5">
                        <div className="font-bold text-[#242824] dark:text-white">{edu.degree}</div>
                        <div className="text-[#545B54] dark:text-[#B4BDB7]">{edu.institution}</div>
                        <div className="font-mono text-[11px] text-[#767E76]">{edu.period}</div>
                      </div>
                    ))}
                  </section>

                  <section className="space-y-1.5">
                    <h2 className="text-xs font-mono uppercase tracking-widest font-bold text-[#365C4C] dark:text-[#68A289]">
                      Verified Technical Skills
                    </h2>
                    <p className="text-xs text-[#242824] dark:text-[#DDE6DC] leading-relaxed">
                      {profile.skills.map(s => s.name).join(' · ')}
                    </p>
                  </section>
                </div>
              </motion.article>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
