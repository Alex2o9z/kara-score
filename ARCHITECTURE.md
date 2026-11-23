# System Architecture & Technical Design: KaraScore

## 1. High-Level Architectural Vision
KaraScore is designed as an offline-first, client-only web application with strict mathematical isolation. Real-time audio processing and scoring logic are strictly separated from UI rendering and browser extensions.

```
┌─────────────────────────────────────────────────────────────────┐
│        Companion Chrome Extension (extension/ - MV3)            │
│     Injects launch button on youtube.com -> opens KaraScore     │
└────────────────────────────────┬────────────────────────────────┘
                                 │ Opens ?v=<ID>&title=<TITLE>
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    React Presentation Layer                     │
│       (Components: VideoPlayer, PitchTrack, ScoreHUD)          │
├─────────────────────────────────────────────────────────────────┤
│                    Custom React Hooks Layer                     │
│          (useAudioEngine, usePitchTrack, useYouTube)            │
├───────────────────────────────┬─────────────────────────────────┤
│      Pure Engines Layer       │         Services Layer          │
│  (Zero DOM/React Dependency)  │  (External Browser / Third-P)   │
│  - AudioEngine & Analyser     │  - YouTubePlayerAdapter         │
│  - PitchDetector (Pitchy)     │    (window.YT IFrame wrapper)   │
│  - PitchSmoother (Median)     │  - SongCacheService             │
│  - TimelineInterpolator       │    (Static JSON index lookup)   │
│  - ScoringEngine (2-Tier)     │                                 │
│  - noteUtils (MIDI/Hz math)   │                                 │
└───────────────────────────────┴─────────────────────────────────┘
```

---

## 2. Technology Stack & Runtime Dependencies

| Layer / Concern | Technology | Version | Purpose / Constraints |
| :--- | :--- | :--- | :--- |
| **Bundler & Dev Server** | Vite | `^8.3.6` | ESM build, instant HMR, tree-shaken production bundles |
| **UI Library** | React | `^19.3.1` | Declarative UI rendering |
| **Language** | TypeScript | `~6.0.3` | Type safety, zero `any` policy, `noEmit` validation |
| **Styling** | Tailwind CSS | `^4.3.5` | Zero-runtime CSS with `@tailwindcss/vite` |
| **Pitch Detection** | Pitchy | `^4.1.0` | McLeod Pitch Method (MPM) running in Web Audio loop |
| **Unit Testing** | Vitest + jsdom | `^5.1.1` | Automated test runner for pure engines & scoring math |
| **Video Playback** | YouTube IFrame API | Official | Client-side backing track playback (zero API keys) |
| **Companion Bridge** | Chrome Extension | MV3 | Ergonomic launch button on YouTube search & watch pages |
| **Hosting & CI/CD** | Cloudflare Pages | Edge | Static asset delivery and PR preview deployments |

---

## 3. Directory Structure & Module Boundaries

```
karascore/
├── extension/                  # Companion Chrome Extension (Manifest V3)
│   ├── manifest.json           # MV3 metadata & permissions
│   ├── content.js              # Injects "🎤 Hát chấm điểm" button on YouTube
│   └── icons/                  # 16x16, 48x48, 128x128 extension icons
├── public/
│   ├── songs/                  # Static pre-authored song charts
│   │   ├── index.json          # Lookup registry of cached songs
│   │   └── demo-song.json      # Sample karaoke chart
│   ├── favicon.svg
│   └── icons.svg
├── src/
│   ├── assets/                 # Static visual assets
│   ├── components/             # React presentation components
│   │   ├── DebugHUD.tsx        # Dev-only telemetry overlay (DEV === true)
│   │   ├── PitchTrack.tsx      # SVG/DOM pitch trail (strictly BELOW video)
│   │   ├── ScoreHUD.tsx        # Real-time score & tier display
│   │   ├── SongSelector.tsx    # Song library & YouTube link input
│   │   └── VideoContainer.tsx  # YouTube IFrame mount container
│   ├── engines/                # Pure TypeScript core logic (Zero React / DOM)
│   │   ├── AudioEngine.ts      # Web Audio context & mic capture
│   │   ├── PitchDetector.ts    # Pitchy MPM wrapper & clarity filtering
│   │   ├── PitchSmoother.ts    # Rolling median / noise reduction filter
│   │   ├── ScoringEngine.ts    # 2-Tier scoring: Exact Melody + Smart Vocal Score
│   │   ├── TimelineInterpolator.ts # High-precision playback time interpolation
│   │   └── noteUtils.ts        # MIDI <-> Hz conversions, note name formatting
│   ├── hooks/                  # React bridge hooks
│   │   ├── useAudioEngine.ts   # Audio lifecycle management
│   │   ├── usePitchScoring.ts  # Tick loop synchronization
│   │   └── useYouTubePlayer.ts # Player state subscription
│   ├── services/
│   │   ├── SongCacheService.ts # Local static JSON chart resolver
│   │   └── YouTubePlayerAdapter.ts # Typed wrapper around window.YT
│   ├── types/                  # Shared data models and interfaces
│   │   ├── audio.ts
│   │   ├── scoring.ts
│   │   ├── song.ts
│   │   └── youtube.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── .agent/                     # Agent instructions and workflows
├── .editorconfig
├── .gitattributes
├── .gitignore
├── eslint.config.js
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── RULES.md
├── SPEC.md
├── ARCHITECTURE.md
└── TASKS.md
```

---

## 4. Auto-Routing & Launch Flow

When KaraScore loads:
1. **URL Parameter Parsing:** Inspect query parameters `?v=<VIDEO_ID>&title=<TITLE>`.
2. **Chart Cache Lookup:** Query `SongCacheService` against `public/songs/index.json`.
   - **Cache Hit:** Load matching song chart (`notes`), initialize `ScoringEngine` in **Exact Melody Mode (Tier 1)**.
   - **Cache Miss:** Initialize `ScoringEngine` in **Smart Vocal Score Mode (Tier 2)**.
3. **Player & Audio Initialization:** Load the video via `YouTubePlayerAdapter`. On explicit user play action, activate microphone and start tick evaluation.

---

## 5. YouTube Embedded Player Policy Compliance
To strictly adhere to **YouTube Developer Policies & Embedded Player Terms of Service**:
1. **Zero Overlays on Video:** Under NO circumstances may UI elements (pitch tracks, lyrics, score HUD, buttons) obscure, overlap, or sit on top of the YouTube video container or native player controls.
2. **Dedicated Visualizer Zone:** The video player occupies an unobstructed container. The **Pitch Track visualizer is rendered strictly BELOW the video frame**.
3. **No Audio Stream Tampering:** Audio is played directly by the YouTube IFrame player. The web application does NOT intercept, capture, or reroute audio streams from YouTube.
4. **No Quota Consumption:** Operates exclusively via the public YouTube IFrame Player API (`https://www.youtube.com/iframe_api`) without consuming YouTube Data API v3 quotas.

---

## 6. Pure Engines Architecture (`src/engines/`)

All engine modules in `src/engines/` maintain functional purity:
- **Zero React Imports:** No `useState`, `useEffect`, or JSX.
- **Zero DOM Manipulation:** No direct DOM queries or mutations.
- **Sub-Millisecond Execution:** Tick evaluation, cents calculations, and median filtering must complete in under 1ms per frame.
- **GPU CSS Pitch Visualization:** Pitch tracking bars and note trails utilize GPU-accelerated CSS `transform: translateX(...)` and `translateY(...)` to achieve 60fps rendering without layout thrashing.

---

## 7. Testing & Quality Assurance Strategy

### 7.1. Automated Unit Testing (Vitest + jsdom)
- **Synthetic Frequency Validation:** Test `PitchDetector` and `noteUtils` using mathematically generated synthetic sine wave buffers (e.g., exact 440 Hz for `A4`, 261.63 Hz for `C4`).
- **Anti-Cheat Validation:** Unit tests confirming that:
  - Silence generates 0% Active Vocal Coverage.
  - A monotone single-note drone generates low Melodic Variety score.
  - In-tune singing on key scales receives full In-Tune Accuracy score.
- **Boundary Precision:** Assert exact 100%, 50%, and 0% tick allocations at boundary thresholds (`24 cents`, `26 cents`, `49 cents`, `51 cents`).

### 7.2. Hardware & Environmental Validation (Gates)
- **Gate 2 (Walking Skeleton):** Mandatory manual validation on desktop hardware using **wired headphones** to prevent Windows Bluetooth Hands-Free profile distortion and ensure acoustic isolation.
- **Gate 4 (Release):** Mobile browser validation under valid HTTPS via Cloudflare Pages preview URL to verify mobile microphone permission handling and touch responsiveness.
