"use client";

import React, { memo } from "react";

export interface StudyLampIllustrationProps {
  className?: string;
}

export const StudyLampIllustration = memo(function StudyLampIllustration({
  className = "w-full h-auto",
}: StudyLampIllustrationProps) {
  return (
    <svg
      viewBox="0 0 320 220"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* Soft Ambient Light Gradient Cone */}
        <linearGradient id="lampConeLight" x1="0.1" y1="0.05" x2="0.65" y2="0.95">
          <stop offset="0%" stopColor="#fef08a" stopOpacity="0.38" />
          <stop offset="22%" stopColor="#fde047" stopOpacity="0.22" />
          <stop offset="55%" stopColor="#c084fc" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#9333ea" stopOpacity="0.0" />
        </linearGradient>

        {/* Metallic Arm & Shade Gradient with userSpaceOnUse coordinates */}
        <linearGradient id="lampMetalGrad" gradientUnits="userSpaceOnUse" x1="40" y1="180" x2="110" y2="40">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#e4e4e7" />
          <stop offset="70%" stopColor="#d4d4d8" />
          <stop offset="100%" stopColor="#a1a1aa" />
        </linearGradient>

        {/* Laptop Glowing Screen Gradient */}
        <linearGradient id="laptopScreenGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e1b4b" />
          <stop offset="50%" stopColor="#4c1d95" />
          <stop offset="100%" stopColor="#2e1065" />
        </linearGradient>

        {/* Open Textbook Page Gradients */}
        <linearGradient id="bookPageLeftGrad" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b0764" />
          <stop offset="100%" stopColor="#2e1065" />
        </linearGradient>

        <linearGradient id="bookPageRightGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4c1d95" />
          <stop offset="100%" stopColor="#3b0764" />
        </linearGradient>

        {/* Warm Tabletop Light Spill Puddle Gradient */}
        <linearGradient id="lampDeskPuddle" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fef08a" stopOpacity="0.0" />
          <stop offset="25%" stopColor="#fef08a" stopOpacity="0.25" />
          <stop offset="50%" stopColor="#fde047" stopOpacity="0.32" />
          <stop offset="75%" stopColor="#fef08a" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#fef08a" stopOpacity="0.0" />
        </linearGradient>

        {/* Night Crescent Moon Aura Gradient */}
        <radialGradient id="moonGlowGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fef08a" stopOpacity="0.35" />
          <stop offset="60%" stopColor="#fde047" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#fef08a" stopOpacity="0.0" />
        </radialGradient>

        {/* Radial Bulb Glow Filter */}
        <filter id="lampBulbGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Radial Screen Glow Filter */}
        <filter id="laptopGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Ambient Room Glow */}
        <filter id="ambientBackdropGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="28" />
        </filter>

        <style>{`
          @keyframes studyLampLightPulse {
            0%, 100% { opacity: 0.92; }
            50% { opacity: 1; }
          }
          @keyframes studyLampBulbPulse {
            0%, 100% { opacity: 0.88; transform: scale(0.97); }
            50% { opacity: 1; transform: scale(1.03); }
          }
          @keyframes studyLampScreenPulse {
            0%, 100% { opacity: 0.92; }
            50% { opacity: 1; }
          }
          @keyframes studyLampTwinkle {
            0%, 100% { opacity: 0.55; transform: scale(0.9); }
            50% { opacity: 1; transform: scale(1.12); }
          }
          @keyframes studyLampMoonGlow {
            0%, 100% { opacity: 0.88; transform: translateY(0); }
            50% { opacity: 1; transform: translateY(-1.2px); }
          }
          @keyframes studySteamCurl {
            0% { transform: translateY(0) scaleX(0.9); opacity: 0; }
            30% { opacity: 0.65; }
            100% { transform: translateY(-7px) scaleX(1.15); opacity: 0; }
          }
          .study-lamp-cone {
            animation: studyLampLightPulse 4s ease-in-out infinite;
            will-change: opacity;
          }
          .study-lamp-bulb {
            transform-origin: 102px 58px;
            animation: studyLampBulbPulse 4s ease-in-out infinite;
            will-change: transform, opacity;
          }
          .study-lamp-screen {
            animation: studyLampScreenPulse 3.5s ease-in-out infinite;
            will-change: opacity;
          }
          .study-lamp-moon {
            animation: studyLampMoonGlow 6s ease-in-out infinite;
            will-change: transform, opacity;
          }
          .study-lamp-steam-1 {
            animation: studySteamCurl 3.4s ease-out infinite;
            will-change: transform, opacity;
          }
          .study-lamp-steam-2 {
            animation: studySteamCurl 3.4s ease-out 1.7s infinite;
            will-change: transform, opacity;
          }
          .study-lamp-star-1 {
            transform-origin: 172px 75px;
            animation: studyLampTwinkle 2.8s ease-in-out infinite;
            will-change: transform, opacity;
          }
          .study-lamp-star-2 {
            transform-origin: 142px 105px;
            animation: studyLampTwinkle 3.2s ease-in-out 0.8s infinite;
            will-change: transform, opacity;
          }
          .study-lamp-star-3 {
            transform-origin: 222px 115px;
            animation: studyLampTwinkle 2.5s ease-in-out 1.5s infinite;
            will-change: transform, opacity;
          }
          @media (prefers-reduced-motion: reduce) {
            .study-lamp-cone,
            .study-lamp-bulb,
            .study-lamp-screen,
            .study-lamp-moon,
            .study-lamp-steam-1,
            .study-lamp-steam-2,
            .study-lamp-star-1,
            .study-lamp-star-2,
            .study-lamp-star-3 {
              animation: none !important;
            }
          }
        `}</style>
      </defs>

      {/* 1. Atmospheric Ambient Radial Glow & Night Sky Elements */}
      <ellipse
        cx="145"
        cy="125"
        rx="95"
        ry="75"
        fill="#8b5cf6"
        opacity="0.14"
        filter="url(#ambientBackdropGlow)"
      />

      {/* Dreamy Night Sky Crescent Moon */}
      <g className="study-lamp-moon">
        <circle cx="265" cy="38" r="18" fill="url(#moonGlowGrad)" />
        <path
          d="M 261 27 A 11 11 0 1 0 271 47 A 9 9 0 1 1 261 27 Z"
          fill="#fef08a"
          opacity="0.94"
        />
      </g>

      {/* Ambient Starlight Constellation Lines */}
      <line x1="172" y1="75" x2="222" y2="115" stroke="#c084fc" strokeWidth="0.7" strokeDasharray="2 3" opacity="0.32" />
      <line x1="172" y1="75" x2="261" y2="37" stroke="#c084fc" strokeWidth="0.7" strokeDasharray="2 3" opacity="0.25" />
      <line x1="142" y1="105" x2="172" y2="75" stroke="#fef08a" strokeWidth="0.6" strokeDasharray="2 3" opacity="0.28" />

      {/* 2. Radiant Luminous Light Beam Cone */}
      <polygon
        points="92,48 116,40 238,178 68,178"
        fill="url(#lampConeLight)"
        className="study-lamp-cone"
      />

      {/* 3. Desk Task Lamp Assembly */}
      {/* Lamp Weighted Circular Base */}
      <ellipse
        cx="48"
        cy="178"
        rx="16"
        ry="4.5"
        fill="#27272a"
        stroke="#e4e4e7"
        strokeWidth="1.5"
      />
      <rect x="46" y="171" width="4" height="6" rx="1.5" fill="#e4e4e7" />

      {/* Lower Steel Arm */}
      <line
        x1="48"
        y1="172"
        x2="60"
        y2="108"
        stroke="#e4e4e7"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {/* Lower Elbow Joint Pivot */}
      <circle cx="60" cy="108" r="4.5" fill="#18181b" stroke="#e4e4e7" strokeWidth="1.6" />
      <circle cx="60" cy="108" r="1.5" fill="#ffffff" />

      {/* Upper Steel Arm */}
      <line
        x1="60"
        y1="108"
        x2="96"
        y2="52"
        stroke="#e4e4e7"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {/* Upper Head Joint Pivot */}
      <circle cx="96" cy="52" r="4" fill="#18181b" stroke="#e4e4e7" strokeWidth="1.6" />
      <circle cx="96" cy="52" r="1.2" fill="#ffffff" />

      {/* Modern Bell / Cone Lampshade */}
      <path
        d="M 86 44 L 108 36 L 115 56 L 90 64 Z"
        fill="#27272a"
        stroke="#e4e4e7"
        strokeWidth="1.8"
      />
      {/* Golden Reflector Rim with Bulb Glow */}
      <g className="study-lamp-bulb">
        <ellipse
          cx="103"
          cy="59"
          rx="11"
          ry="4.5"
          fill="#fef08a"
          transform="rotate(-18 103 59)"
          filter="url(#lampBulbGlow)"
        />
        <circle
          cx="101"
          cy="57"
          r="3.5"
          fill="#ffffff"
          filter="url(#lampBulbGlow)"
        />
      </g>

      {/* 4. Desk Surface & Minimalist Architecture */}
      {/* Tabletop Beam */}
      <rect
        x="20"
        y="178"
        width="280"
        height="4"
        rx="2"
        fill="#27272a"
        stroke="#3f3f46"
        strokeWidth="1"
      />
      {/* Neon Purple Desk Edge Reflector Line */}
      <line
        x1="22"
        y1="178"
        x2="298"
        y2="178"
        stroke="#c084fc"
        strokeWidth="1.2"
        opacity="0.65"
      />
      {/* Warm Tabletop Light Spill Puddle directly under the Lamp Beam */}
      <ellipse
        cx="145"
        cy="178"
        rx="65"
        ry="4"
        fill="url(#lampDeskPuddle)"
      />

      {/* Cozy Potted Desk Succulent on Left Table Edge */}
      <g>
        <polygon points="26,178 36,178 38,168 24,168" fill="#18181b" stroke="#71717a" strokeWidth="1" />
        <ellipse cx="31" cy="168" rx="7" ry="1.5" fill="#27272a" />
        <path d="M 31 168 C 29 161 31 154 31 154 C 31 154 33 161 31 168 Z" fill="#34d399" />
        <path d="M 30 168 C 24 166 22 161 24 158 C 27 160 29 164 30 168 Z" fill="#10b981" />
        <path d="M 32 168 C 38 166 40 161 38 158 C 35 160 33 164 32 168 Z" fill="#059669" />
      </g>
      {/* Minimalist Desk Legs */}
      <line
        x1="40"
        y1="182"
        x2="32"
        y2="214"
        stroke="#3f3f46"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <line
        x1="280"
        y1="182"
        x2="288"
        y2="214"
        stroke="#3f3f46"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Under-desk brace line */}
      <line
        x1="34"
        y1="214"
        x2="286"
        y2="214"
        stroke="#27272a"
        strokeWidth="1.5"
        opacity="0.4"
      />

      {/* 5. Glowing Modern Laptop under Light Cone */}
      {/* Laptop Keyboard Base Tray */}
      <polygon
        points="114,178 168,178 164,172 118,172"
        fill="#18181b"
        stroke="#71717a"
        strokeWidth="1"
      />
      {/* Touchpad */}
      <rect x="136" y="174" width="10" height="2" rx="0.5" fill="#3f3f46" />

      {/* Laptop Display Chassis */}
      <polygon
        points="118,172 164,172 164,132 118,132"
        fill="#090a0f"
        stroke="#8b5cf6"
        strokeWidth="1.5"
      />
      {/* Radiant Glowing Screen */}
      <rect
        x="121"
        y="135"
        width="40"
        height="34"
        rx="1.5"
        fill="url(#laptopScreenGrad)"
        filter="url(#laptopGlow)"
        className="study-lamp-screen"
      />
      {/* Code / Study Text Syntax Bars on Screen */}
      <rect x="125" y="141" width="18" height="2" rx="1" fill="#c084fc" opacity="0.95" />
      <rect x="125" y="146" width="28" height="2" rx="1" fill="#38bdf8" opacity="0.9" />
      <rect x="125" y="151" width="22" height="2" rx="1" fill="#a7f3d0" opacity="0.9" />
      <rect x="125" y="156" width="15" height="2" rx="1" fill="#f472b6" opacity="0.9" />
      <rect x="125" y="161" width="25" height="2" rx="1" fill="#e0e7ff" opacity="0.9" />

      {/* 6. Open Illuminated Textbook beside Laptop */}
      {/* Left Open Page */}
      <path
        d="M 200 178 C 187 173 179 167 173 170 L 173 156 C 179 153 187 159 200 164 Z"
        fill="url(#bookPageLeftGrad)"
        stroke="#a855f7"
        strokeWidth="1.2"
      />
      {/* Right Open Page */}
      <path
        d="M 200 178 C 213 173 221 167 227 170 L 227 156 C 221 153 213 159 200 164 Z"
        fill="url(#bookPageRightGrad)"
        stroke="#c084fc"
        strokeWidth="1.2"
      />
      {/* Book Center Spine */}
      <line x1="200" y1="164" x2="200" y2="178" stroke="#d8b4fe" strokeWidth="1.5" />
      {/* Ruled Text Lines on Pages */}
      <line x1="177" y1="161" x2="195" y2="167" stroke="#e9d5ff" strokeWidth="0.8" opacity="0.65" />
      <line x1="177" y1="165" x2="195" y2="171" stroke="#e9d5ff" strokeWidth="0.8" opacity="0.65" />
      <line x1="205" y1="167" x2="223" y2="161" stroke="#e9d5ff" strokeWidth="0.8" opacity="0.65" />
      <line x1="205" y1="171" x2="223" y2="165" stroke="#e9d5ff" strokeWidth="0.8" opacity="0.65" />
      {/* Book Ribbon Bookmark */}
      <path d="M 200 178 C 201 183 199 186 200 188" stroke="#f472b6" strokeWidth="1.6" strokeLinecap="round" />

      {/* Steaming Cozy Ceramic Coffee / Tea Mug on Right Table */}
      <g>
        {/* Soft Rising Steam Wisps */}
        <path
          d="M 249 160 C 246 154 252 149 248 143"
          stroke="#d8b4fe"
          strokeWidth="1.2"
          strokeLinecap="round"
          fill="none"
          className="study-lamp-steam-1"
        />
        <path
          d="M 253 159 C 256 153 251 148 254 141"
          stroke="#e9d5ff"
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
          className="study-lamp-steam-2"
        />
        {/* Ceramic Mug Body */}
        <rect x="244" y="163" width="14" height="15" rx="2.5" fill="#2e1065" stroke="#a855f7" strokeWidth="1" />
        {/* Mug Rim & Warm Drink */}
        <ellipse cx="251" cy="163" rx="7" ry="1.8" fill="#581c87" stroke="#c084fc" strokeWidth="0.8" />
        <ellipse cx="251" cy="163.5" rx="5.5" ry="1.2" fill="#78350f" />
        {/* Mug Handle */}
        <path d="M 258 166 C 262.5 166 262.5 174 258 174" stroke="#a855f7" strokeWidth="1.4" fill="none" />
      </g>

      {/* 7. Twinkling Ambient Micro Sparkles & Stars */}
      {/* Star 1 (Golden Sparkle) */}
      <path
        d="M 172 70 Q 172 75 177 75 Q 172 75 172 80 Q 172 75 167 75 Q 172 75 172 70 Z"
        fill="#fef08a"
        opacity="0.95"
        className="study-lamp-star-1"
      />
      {/* Star 2 (Lavender Sparkle) */}
      <path
        d="M 142 102 Q 142 105 145 105 Q 142 105 142 108 Q 142 105 139 105 Q 142 105 142 102 Z"
        fill="#e9d5ff"
        opacity="0.85"
        className="study-lamp-star-2"
      />
      {/* Star 3 (Violet Sparkle) */}
      <path
        d="M 222 111 Q 222 115 226 115 Q 222 115 222 119 Q 222 115 218 115 Q 222 115 222 111 Z"
        fill="#c084fc"
        opacity="0.9"
        className="study-lamp-star-3"
      />
      {/* Tiny Ambient Floating Dots */}
      <circle cx="192" cy="98" r="1.5" fill="#fef08a" opacity="0.85" />
      <circle cx="238" cy="140" r="1.2" fill="#a7f3d0" opacity="0.75" />
      <circle cx="78" cy="140" r="1.2" fill="#c084fc" opacity="0.65" />
      <circle cx="120" cy="85" r="1" fill="#fbcfe8" opacity="0.7" />
    </svg>
  );
});
