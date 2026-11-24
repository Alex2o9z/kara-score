# SESSION HANDOFF

Last Updated: 2026-11-23

## 1. Last Completed Task
- **Task ID:** `T3.1`
- **Result:** Implemented `PitchTrack` (DOM/GPU-accelerated CSS `transform: translate3d(...)` visualizer covering vocal MIDI range A2–A5 with Tier 1 scrolling target notes + Tier 2 live semitone lane + live cursor HUD), `LatencyControl` (-300ms to +300ms slider with 0ms quick reset & localStorage persistence), and `ResultModal` (auto-opens on ENDED or manual trigger with score, tier badge, max combo, 4 Smart Vocal metrics breakdown, exact accuracy %, and replay action). Integrated cleanly into `src/App.tsx`.
- **Commit:** (uncommitted — per L3 guardrails)

## 2. Current Blocker
- **Problem:** None
- **Evidence:** `npm run verify` passed cleanly across `typecheck`, `lint`, `test` (9 files, 83 tests), and `build`.
- **Attempted Solutions:** Used derived state pattern for `ResultModal` lifecycle avoiding cascading render lint violations; GPU-composited CSS transforms for 60fps rendering without canvas redraws.

## 3. First Action Next Session
- **Task ID:** `T3.2`
- **Expected Result:** Implement static song cache index (`public/songs/index.json`), URL query parameter launch (`?v=<id>&title=<title>`), mobile paste/search UI, and song lookup / URL parsing tests.
- **Files to Read:** [RULES.md](file:///D:/Workspace/ttptqd/2026/2026_12_Pet_Project_Karaoke/karascore/RULES.md), [SPEC.md](file:///D:/Workspace/ttptqd/2026/2026_12_Pet_Project_Karaoke/karascore/SPEC.md), [ARCHITECTURE.md](file:///D:/Workspace/ttptqd/2026/2026_12_Pet_Project_Karaoke/karascore/ARCHITECTURE.md), [TASKS.md](file:///D:/Workspace/ttptqd/2026/2026_12_Pet_Project_Karaoke/karascore/TASKS.md)

## 4. Uncommitted Changes
- `src/App.tsx`
- `src/components/LatencyControl.tsx`
- `src/components/PitchTrack.tsx`
- `src/components/ResultModal.tsx`
- `TASKS.md`

---

# TASK BACKLOG

## Phase 1 — Foundation & Guardrails
- [x] **`T1.1`**: Pre-flight workspace validation, safety boundaries & guardrail definition.
- [x] **`T1.2`**: Scaffold Vite 8 + React 19 + TypeScript + Tailwind CSS v4, install `pitchy`, `vitest`, `@vitest/ui`, `jsdom`, and configure verification scripts.
- [x] **`T1.3`**: Author core engineering specifications, KaraScore branding, and operating documentation (`RULES.md`, `SPEC.md`, `ARCHITECTURE.md`, `TASKS.md`).
- [x] **`T1.4`**: Initialize Git commits, create `dev` branch, push repository branches to GitHub remote, and connect repository to Cloudflare Pages.
- [x] **`G1`**: Gate 1 — Verify automated CI/CD continuous deployment builds and live hosting URL on Cloudflare Pages.

## Phase 2A — Pure Engines
- [x] **`T2.1`**: Implement pure audio and pitch detection engines (`AudioEngine`, `PitchDetector`, `PitchSmoother`, `noteUtils`, 2-Tier Scoring: Exact Melody + Smart Vocal Score).
- [x] **`T2.2`**: Implement song manifest parser, timeline interpolation, and comprehensive Vitest unit tests (including anti-cheat metrics).

## Phase 2B — Walking Skeleton
- [x] **`T2.3`**: Implement `YouTubePlayerAdapter` wrapping YouTube IFrame API states, playback controls, and error events.
- [x] **`T2.4`**: Implement Walking Skeleton integrating live mic capture, YouTube playback synchronization, and dev-only Debug HUD (with 4 Smart Vocal metrics).
- [ ] **`G2`**: Gate 2 — End-to-end walking skeleton validation on desktop hardware with wired headphones.

## Phase 3 — Iterative Build
- [x] **`T3.1`**: Implement GPU-accelerated Pitch Track visualizer component strictly below video, Latency Offset Slider, and Result Modal with 4-metric breakdown.
- [ ] **`T3.2`**: Implement static song cache index, URL query launch (`?v=&title=`), mobile paste/search UI, and URL parsing tests.
- [ ] **`T3.3`**: Implement Companion Chrome Extension (Manifest V3 in `extension/`) injecting `"🎤 Hát chấm điểm"` launch button on YouTube search & watch pages.
- [ ] **`G3`**: Gate 3 — End-to-end verification of full scored karaoke flow across Exact and Smart Vocal modes.

## Phase 4 — Polish & Release
- [ ] **`T4.1`**: Implement Free Pitch Mode polish, error recovery UI for YouTube embed restrictions, and UX refinements.
- [ ] **`G4`**: Gate 4 — Production release audit and mobile HTTPS browser validation via Cloudflare Pages preview URL.
