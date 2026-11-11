/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Page 2: Career Profile (CareerProfileView)
 * Editable skills, education, experiences, projects, and verified achievements.
 * Matches Storyboard Screen #2 ("Career Profile — Your verified professional identity").
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Edit3,
  Check,
  X,
  Plus,
  CheckCircle2,
  ShieldCheck,
  MapPin,
  Mail,
  Briefcase,
  FolderGit2,
  Code2,
  GraduationCap,
  ExternalLink
} from 'lucide-react';
import {
  VerifiedCareerProfile,
  VerifiedSkill,
  VerifiedExperience,
  VerifiedProject,
  VerifiedEducation
} from '../../shared/types/career-profile';
import { EditorialAvatar } from './common/EditorialVisuals';
import { ActiveTab } from './Layout';

interface CareerProfileViewProps {
  profile: VerifiedCareerProfile;
  onProfileUpdated: (updated: VerifiedCareerProfile) => void;
  onNavigate: (tab: ActiveTab) => void;
}

type ProfileSectionTab = 'about' | 'experience' | 'projects' | 'skills' | 'education';

export const CareerProfileView: React.FC<CareerProfileViewProps> = ({
  profile,
  onProfileUpdated,
  onNavigate
}) => {
  const [activeSubTab, setActiveSubTab] = useState<ProfileSectionTab>('about');
  const [editingAbout, setEditingAbout] = useState(false);
  const [draftHeadline, setDraftHeadline] = useState(profile.headline);
  const [draftSummary, setDraftSummary] = useState(profile.summary);
  const [draftLocation, setDraftLocation] = useState(profile.location || 'San Francisco, CA');
  const [saving, setSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Add Skill form state
  const [addingSkill, setAddingSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState<VerifiedSkill['category']>('languages');

  // Add Project form state
  const [addingProject, setAddingProject] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');
  const [newProjLang, setNewProjLang] = useState('TypeScript');

  // Add Experience form state
  const [addingExp, setAddingExp] = useState(false);
  const [newExpRole, setNewExpRole] = useState('');
  const [newExpOrg, setNewExpOrg] = useState('');
  const [newExpPeriod, setNewExpPeriod] = useState('2025 — Present');
  const [newExpHighlight, setNewExpHighlight] = useState('');

  // Add Education form state
  const [addingEdu, setAddingEdu] = useState(false);
  const [newEduInst, setNewEduInst] = useState('');
  const [newEduDegree, setNewEduDegree] = useState('');
  const [newEduPeriod, setNewEduPeriod] = useState('2021 — 2023');

  const saveProfilePatch = async (patch: Partial<VerifiedCareerProfile> & { auditNote?: string }) => {
    setSaving(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        onProfileUpdated(json.data);
        setFeedbackMsg('Profile updated and recorded in verification audit log.');
        setTimeout(() => setFeedbackMsg(null), 3500);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAbout = async () => {
    await saveProfilePatch({
      headline: draftHeadline,
      summary: draftSummary,
      location: draftLocation,
      auditNote: 'Updated professional summary and headline in Career Profile.'
    });
    setEditingAbout(false);
  };

  const handleAddSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillName.trim()) return;
    const newSkill: VerifiedSkill = {
      id: `skill-${Date.now().toString(36)}`,
      name: newSkillName.trim(),
      category: newSkillCategory,
      evidenceIds: [profile.evidenceVault[0]?.id || 'evi-gh-001'],
      verificationStatus: 'user_confirmed',
      firstObservedDate: new Date().toISOString().slice(0, 10),
      lastObservedDate: new Date().toISOString().slice(0, 10),
      associatedRepositories: ['alex-morgan-sample/spectr-graphite']
    };
    await saveProfilePatch({
      skills: [...profile.skills, newSkill],
      auditNote: `Added user-confirmed skill "${newSkill.name}".`
    });
    setNewSkillName('');
    setAddingSkill(false);
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim() || !newProjDesc.trim()) return;
    const newProj: VerifiedProject = {
      id: `proj-${Date.now().toString(36)}`,
      name: newProjName.trim(),
      description: newProjDesc.trim(),
      repositoryUrl: `https://github.com/alex-morgan-sample/${newProjName.trim().toLowerCase().replace(/\s+/g, '-')}`,
      primaryLanguage: newProjLang,
      techStack: [newProjLang, 'Node.js'],
      evidenceIds: [profile.evidenceVault[0]?.id || 'evi-gh-001'],
      verificationStatus: 'user_confirmed',
      metrics: [{ label: 'Verification', value: 'Candidate Attested' }]
    };
    await saveProfilePatch({
      projects: [newProj, ...profile.projects],
      auditNote: `Added verified project "${newProj.name}".`
    });
    setNewProjName('');
    setNewProjDesc('');
    setAddingProject(false);
  };

  const handleAddExperience = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpRole.trim() || !newExpOrg.trim()) return;
    const newExp: VerifiedExperience = {
      id: `exp-${Date.now().toString(36)}`,
      role: newExpRole.trim(),
      organization: newExpOrg.trim(),
      period: newExpPeriod.trim(),
      location: profile.location || 'Remote',
      highlights: newExpHighlight.trim()
        ? [
            {
              claimId: `claim-user-${Date.now()}`,
              text: newExpHighlight.trim(),
              evidenceIds: [profile.evidenceVault[0]?.id || 'evi-doc-004'],
              verificationStatus: 'user_confirmed'
            }
          ]
        : []
    };
    await saveProfilePatch({
      experiences: [newExp, ...profile.experiences],
      auditNote: `Added experience role "${newExp.role} at ${newExp.organization}".`
    });
    setNewExpRole('');
    setNewExpOrg('');
    setNewExpHighlight('');
    setAddingExp(false);
  };

  const handleAddEducation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEduInst.trim() || !newEduDegree.trim()) return;
    const newEdu: VerifiedEducation = {
      id: `edu-${Date.now().toString(36)}`,
      institution: newEduInst.trim(),
      degree: newEduDegree.trim(),
      period: newEduPeriod.trim(),
      evidenceIds: ['evi-cert-006'],
      verificationStatus: 'user_confirmed'
    };
    await saveProfilePatch({
      education: [...(profile.education ?? []), newEdu],
      auditNote: `Added education record "${newEdu.degree} at ${newEdu.institution}".`
    });
    setNewEduInst('');
    setNewEduDegree('');
    setAddingEdu(false);
  };

  const subTabs: { id: ProfileSectionTab; label: string }[] = [
    { id: 'about', label: 'About' },
    { id: 'experience', label: 'Experience' },
    { id: 'projects', label: 'Projects' },
    { id: 'skills', label: 'Skills' },
    { id: 'education', label: 'Education' }
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#242824] dark:text-[#F1F3F1]">
            Career Profile
          </h2>
          <p className="text-xs sm:text-sm text-[#545B54] dark:text-[#B4BDB7] mt-0.5">
            Your verified professional identity. Every entry is backed by repository commits or attested records.
          </p>
        </div>

        {feedbackMsg && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#DDE6DC] dark:bg-[#243B31] text-[#28483B] dark:text-[#8CD1B5] text-xs font-medium"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedbackMsg}</span>
          </motion.div>
        )}
      </div>

      {/* Main Identity Card (Storyboard Screen #2) */}
      <section className="bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <EditorialAvatar size="lg" />
            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="font-editorial text-2xl font-semibold text-[#242824] dark:text-[#F1F3F1]">
                  {profile.candidateName}
                </h3>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-[#365C4C] dark:text-[#78B39A]">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Verified Identity</span>
                </span>
              </div>
              <p className="text-sm font-medium text-[#545B54] dark:text-[#B4BDB7]">
                {profile.headline}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-[#767E76] pt-1">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {profile.location || 'San Francisco, CA'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  {profile.email || 'alex.morgan@systems.io'}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigate('resume')}
            className="px-4 py-2 rounded-xl text-xs font-medium text-white bg-[#365C4C] hover:bg-[#2B4B3E] transition-colors self-start sm:self-center whitespace-nowrap"
          >
            Preview in Resume Studio
          </button>
        </div>

        {/* Storyboard Sub-Navigation Tabs: About | Experience | Projects | Skills | Education */}
        <div className="border-b border-[#E9E5DD] dark:border-[#262E2B] flex items-center gap-6 overflow-x-auto">
          {subTabs.map(tab => {
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`pb-3 text-xs sm:text-sm font-medium transition-colors relative whitespace-nowrap ${
                  active
                    ? 'text-[#242824] dark:text-[#F1F3F1] font-semibold'
                    : 'text-[#767E76] hover:text-[#242824] dark:hover:text-[#F1F3F1]'
                }`}
              >
                {tab.label}
                {active && (
                  <motion.span
                    layoutId="profileSubTabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#365C4C] dark:bg-[#68A289] rounded-full"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* TAB 1: ABOUT & VERIFIED ACHIEVEMENTS */}
        {activeSubTab === 'about' && (
          <div className="space-y-6 pt-1">
            <div className="p-5 rounded-2xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#E2DFD7] dark:border-[#262E2B] space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-editorial text-base font-semibold text-[#242824] dark:text-[#F1F3F1]">
                  About
                </h4>
                {!editingAbout ? (
                  <button
                    onClick={() => {
                      setDraftHeadline(profile.headline);
                      setDraftSummary(profile.summary);
                      setDraftLocation(profile.location || 'San Francisco, CA');
                      setEditingAbout(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-[#E9E5DD] dark:bg-[#1A1F1D] text-[#242824] dark:text-[#F1F3F1] hover:bg-[#DDD8CE] transition-colors"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingAbout(false)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-[#545B54] hover:text-[#242824]"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                    <button
                      disabled={saving}
                      onClick={handleSaveAbout}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium text-white bg-[#365C4C] hover:bg-[#2B4B3E] disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{saving ? 'Saving...' : 'Save'}</span>
                    </button>
                  </div>
                )}
              </div>

              {!editingAbout ? (
                <p className="text-sm text-[#545B54] dark:text-[#B4BDB7] leading-relaxed">
                  {profile.summary}
                </p>
              ) : (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-[#545B54] mb-1">Professional Headline</label>
                    <input
                      type="text"
                      value={draftHeadline}
                      onChange={e => setDraftHeadline(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#D6D2C8] dark:border-[#2C3531] text-[#242824] dark:text-[#F1F3F1]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#545B54] mb-1">Location</label>
                    <input
                      type="text"
                      value={draftLocation}
                      onChange={e => setDraftLocation(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#D6D2C8] dark:border-[#2C3531] text-[#242824] dark:text-[#F1F3F1]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#545B54] mb-1">Executive Bio & Career Focus</label>
                    <textarea
                      rows={4}
                      value={draftSummary}
                      onChange={e => setDraftSummary(e.target.value)}
                      className="w-full p-3 text-xs rounded-xl bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#D6D2C8] dark:border-[#2C3531] text-[#242824] dark:text-[#F1F3F1] leading-relaxed"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Verified Career Achievements Summary */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-editorial text-base font-semibold text-[#242824] dark:text-[#F1F3F1]">
                  Verified Key Achievements
                </h4>
                <button
                  onClick={() => onNavigate('claims')}
                  className="text-xs font-medium text-[#365C4C] dark:text-[#68A289] hover:underline"
                >
                  Inspect Full Claims Matrix →
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {profile.claims
                  .filter(c => c.verificationStatus === 'verified_source' || c.verificationStatus === 'user_confirmed')
                  .map(claim => (
                    <div
                      key={claim.id}
                      className="p-4 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#E2DFD7] dark:border-[#262E2B] space-y-2"
                    >
                      <div className="flex items-center justify-between text-[11px] text-[#767E76]">
                        <span className="uppercase font-mono font-semibold text-[#365C4C] dark:text-[#68A289]">
                          {claim.category.replace('_', ' ')}
                        </span>
                        <span className="font-mono tabular-nums">
                          {claim.evidenceIds.join(', ')} · {Math.round(claim.confidenceScore * 100)}% match
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-[#242824] dark:text-[#F1F3F1] leading-relaxed">
                        {claim.statement}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: EXPERIENCE */}
        {activeSubTab === 'experience' && (
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between">
              <h4 className="font-editorial text-base font-semibold text-[#242824] dark:text-[#F1F3F1] flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-[#365C4C]" />
                <span>Verified Work Experience</span>
              </h4>
              <button
                onClick={() => setAddingExp(!addingExp)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-[#365C4C] hover:bg-[#2B4B3E] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Role</span>
              </button>
            </div>

            {addingExp && (
              <form
                onSubmit={handleAddExperience}
                className="p-4 rounded-2xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#D6D2C8] dark:border-[#2C3531] space-y-3 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Role Title (e.g. Staff Systems Engineer)"
                    value={newExpRole}
                    onChange={e => setNewExpRole(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#D6D2C8] dark:border-[#2C3531]"
                  />
                  <input
                    type="text"
                    required
                    placeholder="Organization"
                    value={newExpOrg}
                    onChange={e => setNewExpOrg(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#D6D2C8] dark:border-[#2C3531]"
                  />
                  <input
                    type="text"
                    placeholder="Period (e.g. 2024 — Present)"
                    value={newExpPeriod}
                    onChange={e => setNewExpPeriod(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#D6D2C8] dark:border-[#2C3531]"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Verified key accomplishment statement..."
                  value={newExpHighlight}
                  onChange={e => setNewExpHighlight(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#D6D2C8] dark:border-[#2C3531]"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAddingExp(false)}
                    className="px-3 py-1.5 rounded-lg text-[#545B54]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-[#365C4C] text-white font-medium"
                  >
                    Save Experience
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-4">
              {profile.experiences.map(exp => (
                <div
                  key={exp.id}
                  className="p-5 rounded-2xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#E2DFD7] dark:border-[#262E2B] space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div>
                      <h5 className="text-base font-semibold text-[#242824] dark:text-[#F1F3F1]">
                        {exp.role}
                      </h5>
                      <div className="text-xs text-[#545B54] dark:text-[#B4BDB7]">
                        {exp.organization} {exp.location ? `· ${exp.location}` : ''}
                      </div>
                    </div>
                    <span className="text-xs font-mono text-[#767E76] tabular-nums">{exp.period}</span>
                  </div>

                  <ul className="space-y-2 pt-1">
                    {exp.highlights.map(h => (
                      <li
                        key={h.claimId}
                        className="text-xs sm:text-sm text-[#242824] dark:text-[#DDE6DC] flex items-start gap-2.5 leading-relaxed"
                      >
                        <CheckCircle2 className="w-4 h-4 text-[#365C4C] dark:text-[#68A289] shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <span>{h.text}</span>
                          <span className="ml-2 text-[11px] font-mono text-[#767E76]">
                            [{h.evidenceIds.join(', ')}]
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: PROJECTS */}
        {activeSubTab === 'projects' && (
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between">
              <h4 className="font-editorial text-base font-semibold text-[#242824] dark:text-[#F1F3F1] flex items-center gap-2">
                <FolderGit2 className="w-4 h-4 text-[#365C4C]" />
                <span>Verified Repositories & Systems Projects</span>
              </h4>
              <button
                onClick={() => setAddingProject(!addingProject)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-[#365C4C] hover:bg-[#2B4B3E] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Project</span>
              </button>
            </div>

            {addingProject && (
              <form
                onSubmit={handleAddProject}
                className="p-4 rounded-2xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#D6D2C8] dark:border-[#2C3531] space-y-3 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Repository / Project Name"
                    value={newProjName}
                    onChange={e => setNewProjName(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#D6D2C8] dark:border-[#2C3531]"
                  />
                  <input
                    type="text"
                    placeholder="Primary Language (e.g. TypeScript, Rust)"
                    value={newProjLang}
                    onChange={e => setNewProjLang(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#D6D2C8] dark:border-[#2C3531]"
                  />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Concise technical description and verifiable impact..."
                  value={newProjDesc}
                  onChange={e => setNewProjDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#D6D2C8] dark:border-[#2C3531]"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setAddingProject(false)} className="px-3 py-1.5 text-[#545B54]">
                    Cancel
                  </button>
                  <button type="submit" className="px-4 py-1.5 rounded-lg bg-[#365C4C] text-white font-medium">
                    Save Project
                  </button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {profile.projects.map(proj => (
                <div
                  key={proj.id}
                  className="p-5 rounded-2xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#E2DFD7] dark:border-[#262E2B] flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-base font-semibold text-[#242824] dark:text-[#F1F3F1] font-mono">
                        {proj.name}
                      </h5>
                      <span className="px-2 py-0.5 rounded-md bg-[#DDE6DC] dark:bg-[#243B31] text-[#28483B] dark:text-[#8CD1B5] text-[11px] font-medium">
                        Verified
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-[#545B54] dark:text-[#B4BDB7] leading-relaxed">
                      {proj.description}
                    </p>
                  </div>

                  <div className="space-y-3 pt-2 border-t border-[#E2DFD7] dark:border-[#262E2B]">
                    <div className="flex flex-wrap gap-3 text-xs">
                      {proj.metrics.map(m => (
                        <div key={m.label} className="bg-[#FDFCFA] dark:bg-[#1A1F1D] px-2.5 py-1 rounded-lg border border-[#E2DFD7] dark:border-[#262E2B]">
                          <span className="text-[#767E76] mr-1.5">{m.label}:</span>
                          <span className="font-mono font-semibold text-[#242824] dark:text-[#F1F3F1] tabular-nums">{m.value}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-xs text-[#767E76]">
                      <span>{proj.techStack.join(' · ')}</span>
                      <span className="font-mono">Evidence: {proj.evidenceIds.join(', ')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: SKILLS */}
        {activeSubTab === 'skills' && (
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between">
              <h4 className="font-editorial text-base font-semibold text-[#242824] dark:text-[#F1F3F1] flex items-center gap-2">
                <Code2 className="w-4 h-4 text-[#365C4C]" />
                <span>Evidence-Backed Technical Skills ({profile.skills.length})</span>
              </h4>
              <button
                onClick={() => setAddingSkill(!addingSkill)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-[#365C4C] hover:bg-[#2B4B3E] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Skill</span>
              </button>
            </div>

            {addingSkill && (
              <form
                onSubmit={handleAddSkill}
                className="p-4 rounded-2xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#D6D2C8] dark:border-[#2C3531] flex flex-col sm:flex-row gap-3 text-xs"
              >
                <input
                  type="text"
                  required
                  placeholder="Skill name (e.g. Kubernetes, GraphQL, Go)"
                  value={newSkillName}
                  onChange={e => setNewSkillName(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#D6D2C8] dark:border-[#2C3531]"
                />
                <select
                  value={newSkillCategory}
                  onChange={e => setNewSkillCategory(e.target.value as VerifiedSkill['category'])}
                  className="px-3 py-2 rounded-xl bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#D6D2C8] dark:border-[#2C3531]"
                >
                  <option value="languages">Languages</option>
                  <option value="frameworks">Frameworks</option>
                  <option value="infrastructure">Infrastructure</option>
                  <option value="architecture">Architecture</option>
                  <option value="tools">Tools</option>
                </select>
                <button type="submit" className="px-4 py-2 rounded-xl bg-[#365C4C] text-white font-medium">
                  Confirm Skill
                </button>
              </form>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {profile.skills.map(skill => (
                <div
                  key={skill.id}
                  className="p-4 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#E2DFD7] dark:border-[#262E2B] flex flex-col justify-between space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-[#242824] dark:text-[#F1F3F1]">
                        {skill.name}
                      </div>
                      <div className="text-[11px] text-[#767E76] capitalize mt-0.5">
                        {skill.category}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-[#DDE6DC] dark:bg-[#243B31] text-[#28483B] dark:text-[#8CD1B5] text-[10px] font-mono">
                      {skill.evidenceIds.length} source{skill.evidenceIds.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-[#767E76] pt-2 border-t border-[#E9E5DD] dark:border-[#222926] tabular-nums">
                    Active: {skill.firstObservedDate} → {skill.lastObservedDate}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: EDUCATION */}
        {activeSubTab === 'education' && (
          <div className="space-y-4 pt-1">
            <div className="flex items-center justify-between">
              <h4 className="font-editorial text-base font-semibold text-[#242824] dark:text-[#F1F3F1] flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-[#365C4C]" />
                <span>Verified Academic Credentials</span>
              </h4>
              <button
                onClick={() => setAddingEdu(!addingEdu)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-[#365C4C] hover:bg-[#2B4B3E] transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Education</span>
              </button>
            </div>

            {addingEdu && (
              <form
                onSubmit={handleAddEducation}
                className="p-4 rounded-2xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#D6D2C8] dark:border-[#2C3531] grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs"
              >
                <input
                  type="text"
                  required
                  placeholder="Institution Name"
                  value={newEduInst}
                  onChange={e => setNewEduInst(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#D6D2C8] dark:border-[#2C3531]"
                />
                <input
                  type="text"
                  required
                  placeholder="Degree & Major"
                  value={newEduDegree}
                  onChange={e => setNewEduDegree(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#D6D2C8] dark:border-[#2C3531]"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Years (e.g. 2017 — 2021)"
                    value={newEduPeriod}
                    onChange={e => setNewEduPeriod(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#D6D2C8] dark:border-[#2C3531]"
                  />
                  <button type="submit" className="px-4 py-2 rounded-xl bg-[#365C4C] text-white font-medium">
                    Save
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-3">
              {(profile.education ?? []).map(edu => (
                <div
                  key={edu.id}
                  className="p-5 rounded-2xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#E2DFD7] dark:border-[#262E2B] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="text-base font-semibold text-[#242824] dark:text-[#F1F3F1]">
                      {edu.degree}
                    </div>
                    <div className="text-xs sm:text-sm text-[#545B54] dark:text-[#B4BDB7]">
                      {edu.institution} {edu.honors ? `· ${edu.honors}` : ''}
                    </div>
                    <div className="text-[11px] font-mono text-[#767E76] pt-1">
                      Credential Proof: {edu.evidenceIds.join(', ')} (iitm-bs-certificate.pdf)
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="px-2.5 py-1 rounded-md bg-[#DDE6DC] dark:bg-[#243B31] text-[#28483B] dark:text-[#8CD1B5] text-xs font-medium">
                      Verified
                    </span>
                    <span className="text-xs font-mono text-[#767E76] tabular-nums">{edu.period}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
