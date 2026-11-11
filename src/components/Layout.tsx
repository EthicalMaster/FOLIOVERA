/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Editorial Application Shell & Sidebar Navigation
 * Tagline: Your career, always current.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  UserCheck,
  Database,
  FileText,
  CheckSquare,
  Settings,
  ShieldCheck,
  FileCheck2,
  BookOpen,
  Bell,
  Sun,
  Moon,
  Menu,
  X,
  ArrowRight,
  Server,
  LogOut,
  Eye,
  Lock
} from 'lucide-react';
import {
  SystemHealth,
  VerifiedCareerProfile,
  resolveLifecycleState
} from '../../shared/types/career-profile';
import { EditorialAvatar, FolioveraBrandMark } from './common/EditorialVisuals';
import type { User } from '../lib/firebase';

export type ActiveTab =
  | 'dashboard'
  | 'profile'
  | 'evidence'
  | 'resume'
  | 'review'
  | 'settings'
  | 'claims'
  | 'security'
  | 'architecture';

interface LayoutProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  profile: VerifiedCareerProfile | null;
  systemHealth: SystemHealth | null;
  isDark: boolean;
  onToggleDark: () => void;
  onRefreshHealth: () => void;
  authUser?: User | null;
  isDemoMode?: boolean;
  onSignOut?: () => void;
  onExitDemoMode?: () => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({
  activeTab,
  onTabChange,
  profile,
  systemHealth,
  isDark,
  onToggleDark,
  onRefreshHealth,
  authUser,
  isDemoMode = false,
  onSignOut,
  onExitDemoMode,
  children
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const pendingReviews =
    profile?.claims.filter(c => {
      const state = resolveLifecycleState(c);
      return state === 'discovered' || state === 'pending_review';
    }) ?? [];
  const pendingCount = pendingReviews.length;
  const firstName = profile?.candidateName ? profile.candidateName.split(' ')[0] : 'Alex';

  const primaryNav: { id: ActiveTab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'profile', label: 'Career Profile', icon: UserCheck },
    { id: 'evidence', label: 'Evidence Vault', icon: Database },
    { id: 'resume', label: 'Resume Studio', icon: FileText },
    { id: 'review', label: 'Review Queue', icon: CheckSquare, badge: pendingCount > 0 ? pendingCount : undefined },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  const engineeringNav: { id: ActiveTab; label: string; icon: React.ElementType }[] = [
    { id: 'claims', label: 'Claims Matrix', icon: FileCheck2 },
    { id: 'security', label: 'Security Guard', icon: ShieldCheck },
    { id: 'architecture', label: 'Architecture', icon: BookOpen }
  ];

  const formattedDate = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date(2026, 10, 11));

  const renderSidebarContent = (isMobile = false) => (
    <div className="flex flex-col h-full justify-between text-[#E9E5DD] select-none">
      <div className="space-y-7">
        {/* Foliovera Brand Wordmark & Geometric Mark */}
        <div className="flex items-center justify-between px-2.5 pt-1">
          <button
            onClick={() => {
              onTabChange('dashboard');
              if (isMobile) setMobileMenuOpen(false);
            }}
            className="flex items-center gap-3 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BE925E] rounded-xl"
          >
            <FolioveraBrandMark size="md" />
            <div>
              <span className="font-editorial text-lg font-semibold tracking-wide text-[#F6F5F1] block leading-none">
                Foliovera
              </span>
              <span className="text-[10px] tracking-wider uppercase text-[#8C9690] block mt-1">
                Always Current
              </span>
            </div>
          </button>
          {isMobile && (
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="p-1.5 text-[#9DA59E] hover:text-white rounded-lg"
              aria-label="Close navigation menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Primary Storyboard Navigation */}
        <nav aria-label="Main Navigation" className="space-y-1">
          {primaryNav.map(item => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  if (isMobile) setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BE925E] ${
                  active
                    ? 'bg-[#365C4C] text-[#F6F5F1] shadow-xs'
                    : 'text-[#B4BDB7] hover:text-[#F6F5F1] hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#DDE6DC]' : 'text-[#8C9690]'}`} />
                  <span className="truncate whitespace-nowrap">{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span
                    className="ml-2 px-1.5 py-0.5 text-[11px] font-mono font-semibold rounded-md bg-[#BE925E] text-[#181D1B] tabular-nums"
                    aria-label={`${item.badge} pending updates`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Preserved Engineering & Verification Views */}
        <div className="pt-2 border-t border-white/10">
          <div className="px-3.5 pb-2 text-[11px] font-medium text-[#7C8780] tracking-wider">
            Verification & Audit
          </div>
          <nav aria-label="Engineering Views" className="space-y-1">
            {engineeringNav.map(item => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onTabChange(item.id);
                    if (isMobile) setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BE925E] ${
                    active
                      ? 'bg-[#365C4C] text-[#F6F5F1]'
                      : 'text-[#9DA59E] hover:text-[#F6F5F1] hover:bg-white/5'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-[#DDE6DC]' : 'text-[#7C8780]'}`} />
                  <span className="truncate whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Candidate Identity Card */}
      <div className="pt-4 border-t border-white/10 space-y-2">
        <button
          onClick={onRefreshHealth}
          title="Ping backend /api/health"
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[11px] font-mono text-[#9DA59E] hover:text-[#F6F5F1] hover:bg-white/5 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Server className="w-3 h-3 text-[#68A289]" />
            <span>
              {isDemoMode
                ? 'Demo Sandbox'
                : systemHealth?.storageDriver === 'firestore'
                ? 'Cloud Firestore'
                : systemHealth?.storageDriver || 'SQLite'}
            </span>
          </span>
          <span className="tabular-nums text-[#DDE6DC]">
            {isDemoMode
              ? 'Read-Only Sample'
              : systemHealth?.status === 'healthy'
              ? 'Durable · OK'
              : 'Connecting...'}
          </span>
        </button>

        <button
          onClick={() => {
            onTabChange('profile');
            if (isMobile) setMobileMenuOpen(false);
          }}
          className="w-full flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-[#222825] hover:bg-[#29312D] border border-white/5 transition-colors text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BE925E]"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <EditorialAvatar size="sm" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#F6F5F1] truncate">
                {profile?.candidateName || authUser?.displayName || 'Alex Morgan'}
              </div>
              <div className="text-[11px] text-[#8C9690] truncate">
                {authUser?.email || profile?.email || 'alex.morgan@systems.io'}
              </div>
            </div>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-[#8C9690] group-hover:text-[#F6F5F1] group-hover:translate-x-0.5 transition-all shrink-0" />
        </button>

        {authUser && onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#222825]/60 hover:bg-[#2E2222] text-[11px] font-medium text-[#B4BDB7] hover:text-red-200 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5 truncate">
              <Lock className="w-3 h-3 text-[#68A289]" />
              <span className="truncate">Owner Session Active</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[#DDE6DC] shrink-0">
              <LogOut className="w-3 h-3" />
              <span>Sign Out</span>
            </span>
          </button>
        )}

        {isDemoMode && onExitDemoMode && (
          <button
            type="button"
            onClick={onExitDemoMode}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#BE925E]/20 hover:bg-[#BE925E]/30 border border-[#BE925E]/40 text-[11px] font-medium text-[#F6F5F1] transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Eye className="w-3 h-3 text-[#BE925E]" />
              <span>Demo Sandbox</span>
            </span>
            <span className="underline">Sign In as Owner</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F6F5F1] dark:bg-[#0E1110] text-[#242824] dark:text-[#F1F3F1] flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar */}
      <aside className="no-print hidden lg:flex w-64 shrink-0 bg-[#181D1B] dark:bg-[#090B0A] border-r border-[#262E2B] p-5 flex-col justify-between sticky top-0 h-screen">
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile Drawer Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="no-print fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="no-print fixed inset-y-0 left-0 z-50 w-72 bg-[#181D1B] p-5 flex flex-col justify-between lg:hidden shadow-2xl"
            >
              {renderSidebarContent(true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Sample / Demo Sandbox Isolation Banner */}
        {(isDemoMode || profile?.isSampleData) && (
          <div className="no-print bg-[#242824] text-[#F6F5F1] border-b border-[#365C4C]/40 px-4 sm:px-8 py-2.5 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-[#BE925E] text-[#181D1B] font-semibold uppercase tracking-wider text-[10px]">
                Sample Data Isolation Active
              </span>
              <span className="text-[#DDE6DC]">
                {isDemoMode
                  ? 'Viewing isolated read-only demo profile (Alex Morgan). Changes are disabled and never enter private Cloud Firestore storage.'
                  : 'This workspace currently contains sample demonstration data.'}
              </span>
            </div>
            {isDemoMode && onExitDemoMode && (
              <button
                type="button"
                onClick={onExitDemoMode}
                className="px-3 py-1 rounded-lg bg-[#365C4C] hover:bg-[#2B4B3E] text-white font-medium transition-colors cursor-pointer"
              >
                Sign in with Google for Personal Vault →
              </button>
            )}
          </div>
        )}

        {/* Top Contextual Bar */}
        <header className="no-print sticky top-0 z-30 bg-[#F6F5F1]/90 dark:bg-[#0E1110]/90 backdrop-blur-md border-b border-[#E2DFD7] dark:border-[#222926]">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 rounded-xl bg-[#E9E5DD] dark:bg-[#1A1F1D] text-[#242824] dark:text-[#F1F3F1] hover:opacity-90"
                aria-label="Open navigation sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <h1 className="font-editorial text-xl sm:text-2xl font-semibold tracking-tight text-[#242824] dark:text-[#F1F3F1] truncate">
                  Good morning, {firstName}
                </h1>
                <p className="text-xs sm:text-sm text-[#545B54] dark:text-[#B4BDB7] truncate">
                  {pendingCount > 0
                    ? `Your career, always current · ${pendingCount} discovered update${pendingCount > 1 ? 's' : ''} awaiting your confirmation.`
                    : 'Your career, always current · All profile achievements verified.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 relative">
              <div className="hidden sm:flex items-center px-3.5 py-1.5 rounded-full bg-[#E9E5DD]/80 dark:bg-[#1A1F1D] border border-[#DDD8CE] dark:border-[#262E2B] text-xs font-medium text-[#545B54] dark:text-[#B4BDB7] whitespace-nowrap">
                {formattedDate}
              </div>

              {/* Notification Bell */}
              <div className="relative">
                <button
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className="p-2 rounded-full bg-[#E9E5DD]/70 dark:bg-[#1A1F1D] border border-[#DDD8CE] dark:border-[#262E2B] text-[#242824] dark:text-[#F1F3F1] hover:bg-[#E2DDD3] dark:hover:bg-[#242E2A] transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#365C4C]"
                  aria-label="View review queue notifications"
                >
                  <Bell className="w-4 h-4" />
                  {pendingCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#BE925E] text-[#181D1B] text-[10px] font-mono font-bold flex items-center justify-center tabular-nums">
                      {pendingCount}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {notificationsOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-80 bg-[#FDFCFA] dark:bg-[#1A1F1D] border border-[#E2DFD7] dark:border-[#2C3531] rounded-2xl shadow-xl p-4 z-50 space-y-3"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-[#E9E5DD] dark:border-[#262E2B]">
                        <span className="text-xs font-semibold text-[#242824] dark:text-[#F1F3F1]">
                          Foliovera Review Queue ({pendingCount})
                        </span>
                        <button
                          onClick={() => setNotificationsOpen(false)}
                          className="text-xs text-[#767E76] hover:text-[#242824] dark:hover:text-white"
                        >
                          Close
                        </button>
                      </div>

                      {pendingReviews.length === 0 ? (
                        <p className="text-xs text-[#545B54] dark:text-[#B4BDB7] py-3 text-center">
                          All career updates have been verified.
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {pendingReviews.map(item => (
                            <button
                              key={item.id}
                              onClick={() => {
                                setNotificationsOpen(false);
                                onTabChange('review');
                              }}
                              className="w-full text-left p-2.5 rounded-xl bg-[#F6F5F1] dark:bg-[#0E1110] hover:bg-[#E9E5DD] dark:hover:bg-[#242E2A] transition-colors space-y-1"
                            >
                              <div className="flex items-center justify-between text-[11px] text-[#767E76]">
                                <span className="font-semibold text-[#365C4C] dark:text-[#68A289]">
                                  {item.sourceLabel || item.category}
                                </span>
                                <span className="font-mono">{item.discoveredRelativeTime || 'New'}</span>
                              </div>
                              <p className="text-xs text-[#242824] dark:text-[#F1F3F1] line-clamp-2">
                                {item.statement}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={() => {
                          setNotificationsOpen(false);
                          onTabChange('review');
                        }}
                        className="w-full py-2 text-xs font-medium text-white bg-[#365C4C] hover:bg-[#2B4B3E] rounded-xl transition-colors"
                      >
                        Open Review Queue
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Theme Toggle */}
              <button
                onClick={onToggleDark}
                className="p-2 rounded-full bg-[#E9E5DD]/70 dark:bg-[#1A1F1D] border border-[#DDD8CE] dark:border-[#262E2B] text-[#242824] dark:text-[#F1F3F1] hover:bg-[#E2DDD3] dark:hover:bg-[#242E2A] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#365C4C]"
                aria-label={isDark ? 'Switch to light editorial theme' : 'Switch to dark graphite theme'}
                title={isDark ? 'Switch to Light Mode (#F6F5F1)' : 'Switch to Dark Mode (#0E1110)'}
              >
                {isDark ? <Sun className="w-4 h-4 text-[#BE925E]" /> : <Moon className="w-4 h-4" />}
              </button>

              {/* Profile Avatar Trigger */}
              <button
                onClick={() => onTabChange('profile')}
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#365C4C]"
                aria-label="Open Career Profile"
              >
                <EditorialAvatar size="md" />
              </button>
            </div>
          </div>
        </header>

        {/* Main Viewport Container */}
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
};
