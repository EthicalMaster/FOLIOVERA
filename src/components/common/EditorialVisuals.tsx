/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Foliovera — Editorial Visual & Brand Identity Assets
 * Bespoke geometric Foliovera brand mark, atmospheric misty forest banner,
 * monochrome editorial avatar, and organic contour waves. Zero external URL dependencies.
 */

import React from 'react';

export const FolioveraBrandMark: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string }> = ({
  size = 'md',
  className = ''
}) => {
  const dim = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-11 h-11'
  }[size];

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${dim} shrink-0 ${className}`}
      aria-label="Foliovera Brand Emblem"
    >
      <rect width="64" height="64" rx="16" fill="#222926" />
      <rect
        x="2.5"
        y="2.5"
        width="59"
        height="59"
        rx="13.5"
        stroke="#365C4C"
        strokeWidth="2"
        strokeOpacity="0.85"
      />
      {/* Architectural Folio Spine & Leaf */}
      <path d="M20 16H44V23H27V30H40V37H27V48H20V16Z" fill="#F6F5F1" />
      {/* Bronze Verification Check Accent */}
      <path
        d="M36.5 41L41 45.5L48.5 36.5"
        stroke="#BE925E"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export const MistyForestBannerSVG: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 1200 320"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`w-full h-full object-cover ${className}`}
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="skyMist" x1="0" y1="0" x2="1200" y2="320" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#6D7670" />
        <stop offset="45%" stopColor="#9DA59E" />
        <stop offset="80%" stopColor="#C4CAC3" />
        <stop offset="100%" stopColor="#7C877F" />
      </linearGradient>
      <linearGradient id="distantRidge" x1="600" y1="60" x2="600" y2="280" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#46524B" stopOpacity="0.65" />
        <stop offset="100%" stopColor="#26302B" stopOpacity="0.9" />
      </linearGradient>
      <linearGradient id="midRidge" x1="600" y1="110" x2="600" y2="320" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#2E3B34" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#161D1A" stopOpacity="0.98" />
      </linearGradient>
      <linearGradient id="fogLayer" x1="0" y1="140" x2="0" y2="270" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#E9E5DD" stopOpacity="0.45" />
        <stop offset="50%" stopColor="#DDE6DC" stopOpacity="0.2" />
        <stop offset="100%" stopColor="#181D1B" stopOpacity="0.65" />
      </linearGradient>
      <linearGradient id="leftScrim" x1="0" y1="160" x2="750" y2="160" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#141917" stopOpacity="0.78" />
        <stop offset="65%" stopColor="#1E2622" stopOpacity="0.48" />
        <stop offset="100%" stopColor="#1E2622" stopOpacity="0.1" />
      </linearGradient>
    </defs>

    <rect width="1200" height="320" fill="url(#skyMist)" />
    <path
      d="M0 190 Q180 120 360 155 T740 115 T1080 140 L1200 110 L1200 320 L0 320 Z"
      fill="url(#distantRidge)"
    />
    <path
      d="M0 220 Q240 165 510 195 T920 150 L1200 175 L1200 320 L0 320 Z"
      fill="url(#midRidge)"
    />
    <rect y="130" width="1200" height="190" fill="url(#fogLayer)" />

    <g fill="#151C19" opacity="0.92">
      <polygon points="880,95 852,175 908,175" />
      <polygon points="880,130 842,225 918,225" />
      <polygon points="880,175 830,295 930,295" />

      <polygon points="945,115 920,190 970,190" />
      <polygon points="945,150 910,245 980,245" />
      <polygon points="945,190 898,320 992,320" />

      <polygon points="1030,75 998,165 1062,165" />
      <polygon points="1030,115 986,225 1074,225" />
      <polygon points="1030,165 972,320 1088,320" />

      <polygon points="1105,105 1078,185 1132,185" />
      <polygon points="1105,145 1068,250 1142,250" />
      <polygon points="1105,190 1055,320 1155,320" />

      <polygon points="1165,88 1138,175 1192,175" />
      <polygon points="1165,135 1126,255 1204,255" />
      <polygon points="1165,185 1115,320 1215,320" />

      <polygon points="795,145 772,215 818,215" opacity="0.7" />
      <polygon points="795,180 762,285 828,285" opacity="0.7" />
      <polygon points="730,165 710,235 750,235" opacity="0.5" />
    </g>

    <path d="M0 265 Q420 240 840 275 L1200 245 L1200 320 L0 320 Z" fill="#101513" opacity="0.88" />
    <rect width="1200" height="320" fill="url(#leftScrim)" />
  </svg>
);

export const OrganicWavePatternSVG: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 280 140"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`pointer-events-none select-none ${className}`}
    aria-hidden="true"
  >
    <path
      d="M40 140 C95 110, 155 125, 280 45 L280 140 Z"
      fill="#365C4C"
      fillOpacity="0.12"
    />
    <path
      d="M85 140 C135 115, 190 120, 280 65 L280 140 Z"
      fill="#365C4C"
      fillOpacity="0.18"
    />
    <path
      d="M130 140 C175 120, 220 120, 280 88 L280 140 Z"
      fill="#242824"
      fillOpacity="0.22"
    />
  </svg>
);

export const EditorialAvatar: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string }> = ({
  size = 'md',
  className = ''
}) => {
  const dimensions = {
    sm: 'w-8 h-8',
    md: 'w-9 h-9',
    lg: 'w-20 h-20'
  }[size];

  return (
    <div
      className={`${dimensions} rounded-full overflow-hidden bg-[#D5D1C8] dark:bg-[#2A312E] border border-[#C5C0B5] dark:border-[#3A443F] shrink-0 flex items-center justify-center relative ${className}`}
      title="Alex Morgan — Senior Full-Stack & Distributed Systems Engineer"
    >
      <svg viewBox="0 0 100 100" className="w-full h-full" aria-label="Alex Morgan portrait">
        <defs>
          <linearGradient id="avatarBg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#E4E1DA" />
            <stop offset="100%" stopColor="#B8B4AC" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill="url(#avatarBg)" />
        <path d="M14 100 C16 74, 34 67, 50 67 C66 67, 84 74, 86 100 Z" fill="#1E2321" />
        <polygon points="41,67 50,82 59,67" fill="#F6F5F1" />
        <rect x="43" y="54" width="14" height="16" rx="4" fill="#C8C2B8" />
        <ellipse cx="50" cy="41" rx="16.5" ry="20" fill="#DCD7CE" />
        <path
          d="M33 38 C32 21, 44 16, 54 18 C64 19, 68 27, 67 39 C65 31, 58 26, 48 26 C39 26, 35 31, 33 38 Z"
          fill="#222624"
        />
        <circle cx="44" cy="40" r="1.4" fill="#242824" />
        <circle cx="56" cy="40" r="1.4" fill="#242824" />
        <path d="M46 50 Q50 52.5 54 50" stroke="#242824" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
};
