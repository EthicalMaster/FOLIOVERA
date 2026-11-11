/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Page 6: Settings (SettingsView)
 * Matches Storyboard Screen #6 ("Settings — Manage accounts, sync, and preferences"):
 * Connected Accounts, Automation, Resume Defaults, Privacy & Data, and Export / Backup.
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Link2,
  Zap,
  FileText,
  Shield,
  Download,
  CheckCircle2,
  Sun,
  Moon,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import {
  VerifiedCareerProfile,
  UserSettings,
  ResumeStyle
} from '../../shared/types/career-profile';

interface SettingsViewProps {
  profile: VerifiedCareerProfile;
  isDark: boolean;
  onToggleDark: () => void;
  onProfileUpdated: (updated: VerifiedCareerProfile) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  profile,
  isDark,
  onToggleDark,
  onProfileUpdated
}) => {
  const defaultSettings: UserSettings = profile.settings ?? {
    autoSyncEnabled: true,
    requireHumanReviewForProfileUpdates: true,
    strictPromptInjectionQuarantine: true,
    defaultTargetRole: 'Principal Distributed Systems Engineer',
    defaultResumeStyle: 'ats_professional',
    includeEvidenceFootnotes: true,
    reducedMotion: false,
    connectedAccounts: []
  };

  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const persistSettings = async (nextSettings: UserSettings, note: string) => {
    setSettings(nextSettings);
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: nextSettings,
          auditNote: note
        })
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        onProfileUpdated(json.data);
        setSavedNotice('Preferences saved.');
        setTimeout(() => setSavedNotice(null), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAccount = (accountId: string) => {
    const nextAccounts = settings.connectedAccounts.map(acc =>
      acc.id === accountId
        ? { ...acc, connected: !acc.connected, lastSync: !acc.connected ? 'Just now' : acc.lastSync }
        : acc
    );
    persistSettings(
      { ...settings, connectedAccounts: nextAccounts },
      `Updated account connection state for ${accountId}.`
    );
  };

  const handleExportProfileBackup = () => {
    const payload = JSON.stringify(profile, null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `foliovera-verified-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSavedNotice('Exported Foliovera verified career profile JSON backup.');
    setTimeout(() => setSavedNotice(null), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-editorial text-2xl sm:text-3xl font-semibold text-[#242824] dark:text-[#F1F3F1]">
            Settings
          </h2>
          <p className="text-xs sm:text-sm text-[#545B54] dark:text-[#B4BDB7] mt-0.5">
            Manage account connections, background sync automation, privacy controls, and appearance.
          </p>
        </div>

        {savedNotice && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#DDE6DC] dark:bg-[#243B31] text-[#28483B] dark:text-[#8CD1B5] text-xs font-medium"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{savedNotice}</span>
          </motion.div>
        )}
      </div>

      {/* 1. Connected Accounts (Storyboard Row #1) */}
      <section className="bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F6F5F1] dark:bg-[#242E2A] flex items-center justify-center text-[#242824] dark:text-[#DDE6DC]">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-[#242824] dark:text-[#F1F3F1]">
                Connected Accounts
              </h3>
              <p className="text-xs text-[#545B54] dark:text-[#B4BDB7]">
                Read-only evidence sources. Foliovera never modifies external profiles.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-md bg-[#DDE6DC] dark:bg-[#243B31] text-[#28483B] dark:text-[#8CD1B5] text-xs font-medium">
            {settings.connectedAccounts.filter(a => a.connected).length} Connected
          </span>
        </div>

        <div className="divide-y divide-[#ECE9E1] dark:divide-[#262E2B]">
          {settings.connectedAccounts.map(acc => (
            <div key={acc.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-[#242824] dark:text-[#F1F3F1] flex items-center gap-2">
                  <span>{acc.label}</span>
                  <span className="text-xs font-mono text-[#767E76]">{acc.handle}</span>
                </div>
                <div className="text-xs text-[#767E76] mt-0.5">
                  {acc.mode} · Last synced: {acc.lastSync}
                </div>
              </div>
              <button
                onClick={() => handleToggleAccount(acc.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors self-start sm:self-center ${
                  acc.connected
                    ? 'bg-[#DDE6DC] dark:bg-[#243B31] text-[#28483B] dark:text-[#8CD1B5]'
                    : 'bg-[#E9E5DD] dark:bg-[#262E2B] text-[#545B54] dark:text-[#B4BDB7]'
                }`}
              >
                {acc.connected ? 'Connected' : 'Connect'}
              </button>
            </div>
          ))}
        </div>

        {profile.syncHistory && profile.syncHistory.length > 0 && (
          <div className="pt-3 border-t border-[#ECE9E1] dark:border-[#262E2B] space-y-2">
            <div className="text-xs font-semibold text-[#242824] dark:text-[#F1F3F1] flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-[#365C4C]" />
              <span>Recent GitHub Synchronization History ({profile.syncHistory.length})</span>
            </div>
            <div className="space-y-1.5">
              {profile.syncHistory.slice(0, 3).map(item => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#E2DFD7] dark:border-[#262E2B] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#545B54] dark:text-[#B4BDB7]"
                >
                  <span>
                    @{item.username} · {item.repositoriesScanned} repos · +{item.newClaimsCount} claims ({item.duplicatesSkipped} dupes skipped)
                  </span>
                  <span>{new Date(item.completedAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 2. Automation & Review Governance (Storyboard Row #2) */}
      <section className="bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#F6F5F1] dark:bg-[#242E2A] flex items-center justify-center text-[#242824] dark:text-[#DDE6DC]">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-[#242824] dark:text-[#F1F3F1]">
              Automation & Sync Governance
            </h3>
            <p className="text-xs text-[#545B54] dark:text-[#B4BDB7]">
              Control how repository commits and career updates are discovered and queued.
            </p>
          </div>
        </div>

        <div className="space-y-3 pt-1">
          <label className="flex items-center justify-between p-3.5 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#E2DFD7] dark:border-[#262E2B] cursor-pointer">
            <div>
              <div className="text-xs sm:text-sm font-medium text-[#242824] dark:text-[#F1F3F1]">
                Automatic Repository & Commit Detection
              </div>
              <div className="text-xs text-[#767E76]">
                Periodically check connected sources using free-tier ETag conditional requests.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.autoSyncEnabled}
              onChange={e =>
                persistSettings(
                  { ...settings, autoSyncEnabled: e.target.checked },
                  `Toggled automatic repository detection to ${e.target.checked}.`
                )
              }
              className="w-4 h-4 accent-[#365C4C] rounded"
            />
          </label>

          <label className="flex items-center justify-between p-3.5 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#E2DFD7] dark:border-[#262E2B] cursor-pointer">
            <div>
              <div className="text-xs sm:text-sm font-medium text-[#242824] dark:text-[#F1F3F1]">
                Require Candidate Approval Before Profile Changes (Rule 4)
              </div>
              <div className="text-xs text-[#767E76]">
                Discovered achievements always enter the Review Queue first.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.requireHumanReviewForProfileUpdates}
              onChange={e =>
                persistSettings(
                  { ...settings, requireHumanReviewForProfileUpdates: e.target.checked },
                  'Updated human review requirement.'
                )
              }
              className="w-4 h-4 accent-[#365C4C] rounded"
            />
          </label>
        </div>
      </section>

      {/* 3. Resume Defaults (Storyboard Row #3) */}
      <section className="bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#F6F5F1] dark:bg-[#242E2A] flex items-center justify-center text-[#242824] dark:text-[#DDE6DC]">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-[#242824] dark:text-[#F1F3F1]">
              Resume Defaults
            </h3>
            <p className="text-xs text-[#545B54] dark:text-[#B4BDB7]">
              Default formatting and citation preferences for Resume Studio.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
          <div>
            <label className="block font-medium text-[#545B54] dark:text-[#B4BDB7] mb-1">
              Default Resume Style
            </label>
            <select
              value={settings.defaultResumeStyle}
              onChange={e =>
                persistSettings(
                  { ...settings, defaultResumeStyle: e.target.value as ResumeStyle },
                  'Updated default resume style.'
                )
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#D6D2C8] dark:border-[#2C3531] text-[#242824] dark:text-[#F1F3F1]"
            >
              <option value="ats_professional">ATS (Professional)</option>
              <option value="editorial_executive">Editorial Executive</option>
              <option value="systems_architect">Systems Architect</option>
            </select>
          </div>

          <div className="flex items-end">
            <label className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#D6D2C8] dark:border-[#2C3531] cursor-pointer">
              <span className="font-medium text-[#242824] dark:text-[#F1F3F1]">
                Include Evidence Citations by Default
              </span>
              <input
                type="checkbox"
                checked={settings.includeEvidenceFootnotes}
                onChange={e =>
                  persistSettings(
                    { ...settings, includeEvidenceFootnotes: e.target.checked },
                    'Updated default citation visibility.'
                  )
                }
                className="w-4 h-4 accent-[#365C4C] rounded"
              />
            </label>
          </div>
        </div>
      </section>

      {/* 4. Privacy, Security & Appearance (Storyboard Row #4) */}
      <section className="bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#F6F5F1] dark:bg-[#242E2A] flex items-center justify-center text-[#242824] dark:text-[#DDE6DC]">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-[#242824] dark:text-[#F1F3F1]">
              Privacy, Security & Appearance
            </h3>
            <p className="text-xs text-[#545B54] dark:text-[#B4BDB7]">
              Editorial theme palette and UntrustedDataGuard security boundary settings.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
          <div className="p-3.5 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#E2DFD7] dark:border-[#262E2B] flex items-center justify-between">
            <div>
              <div className="font-semibold text-[#242824] dark:text-[#F1F3F1]">Color Theme</div>
              <div className="text-[#767E76]">
                {isDark ? 'Graphite Dark (#0E1110)' : 'Editorial Ivory (#F6F5F1)'}
              </div>
            </div>
            <button
              onClick={onToggleDark}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E9E5DD] dark:bg-[#242E2A] text-[#242824] dark:text-[#F1F3F1] font-medium"
            >
              {isDark ? <Sun className="w-3.5 h-3.5 text-[#BE925E]" /> : <Moon className="w-3.5 h-3.5" />}
              <span>Switch Theme</span>
            </button>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] border border-[#E2DFD7] dark:border-[#262E2B] flex items-center justify-between">
            <div>
              <div className="font-semibold text-[#242824] dark:text-[#F1F3F1]">Prompt Injection Quarantine</div>
              <div className="text-[#767E76]">UntrustedDataGuard Active (Rule 6)</div>
            </div>
            <span className="px-2.5 py-1 rounded-md bg-[#DDE6DC] dark:bg-[#243B31] text-[#28483B] dark:text-[#8CD1B5] font-medium">
              Enforced
            </span>
          </div>
        </div>
      </section>

      {/* 5. Export / Backup (Storyboard Row #5) */}
      <section className="bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#262E2B] rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#F6F5F1] dark:bg-[#242E2A] flex items-center justify-center text-[#242824] dark:text-[#DDE6DC]">
            <Download className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-[#242824] dark:text-[#F1F3F1]">
              Export / Backup Career Vault
            </h3>
            <p className="text-xs text-[#545B54] dark:text-[#B4BDB7]">
              Download a portable JSON snapshot of your verified profile, claims, and cryptographic evidence links.
            </p>
          </div>
        </div>

        <button
          onClick={handleExportProfileBackup}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium text-white bg-[#365C4C] hover:bg-[#2B4B3E] transition-colors shrink-0 self-start sm:self-center"
        >
          <Download className="w-4 h-4" />
          <span>Export Backup (.JSON)</span>
        </button>
      </section>
    </div>
  );
};
