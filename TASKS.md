# SESSION HANDOFF

Last Updated: 2026-11-23

## 1. Last Completed Task
- **Task ID:** `T1.3c`
- **Result:** Synchronized project branding to KaraScore (`karascore`), locked 2-tier scoring specifications (Exact Melody + Smart Vocal Score), documented Companion Chrome Extension MV3 architecture, and synced 16-item backlog.
- **Commit:** (uncommitted — staging deferred to T1.4 per L3 guardrails)

## 2. Current Blocker
- **Problem:** None
- **Evidence:** `npm run verify` passed cleanly across `typecheck`, `lint`, `test`, and `build`.
- **Attempted Solutions:** N/A

## 3. First Action Next Session
- **Task ID:** `T1.4`
- **Expected Result:** Review git status, stage all Phase 1 files, create initial Git commit, create and push `main` and `dev` branches to GitHub remote, and prepare Cloudflare Pages connection.
- **Files to Read:** [RULES.md](file:///D:/Workspace/ttptqd/2026/2026_12_Pet_Project_Karaoke/karascore/RULES.md), [TASKS.md](file:///D:/Workspace/ttptqd/2026/2026_12_Pet_Project_Karaoke/karascore/TASKS.md)

## 4. Uncommitted Changes
- `.agent/rules/project-guardrails.md`
- `.agent/workflows/escalate.md`
- `.agent/workflows/handoff.md`
- `.agent/workflows/trace-fix.md`
- `.editorconfig`
- `.gitattributes`
- `.gitignore`
- `AGENTS.md`
- `ARCHITECTURE.md`
- `eslint.config.js`
- `index.html`
- `package-lock.json`
- `package.json`
- `public/`
- `README.md`
- `RULES.md`
- `SPEC.md`
- `src/`
- `TASKS.md`
- `tsconfig.json`
- `vite.config.ts`
- `vitest.config.ts`

---

# TASK BACKLOG

## Phase 1 — Foundation & Guardrails
- [x] **`T1.1`**: Pre-flight workspace validation, safety boundaries & guardrail definition.
- [x] **`T1.2`**: Scaffold Vite 8 + React 19 + TypeScript + Tailwind CSS v4, install `pitchy`, `vitest`, `@vitest/ui`, `jsdom`, and configure verification scripts.
- [x] **`T1.3`**: Author core engineering specifications, KaraScore branding, and operating documentation (`RULES.md`, `SPEC.md`, `ARCHITECTURE.md`, `TASKS.md`).
- [ ] **`T1.4`**: Initialize Git commits, create `dev` branch, push repository branches to GitHub remote, and connect repository to Cloudflare Pages.
- [ ] **`G1`**: Gate 1 — Verify automated CI/CD continuous deployment builds and live hosting URL on Cloudflare Pages.

## Phase 2A — Pure Engines
- [ ] **`T2.1`**: Implement pure audio and pitch detection engines (`AudioEngine`, `PitchDetector`, `PitchSmoother`, `noteUtils`, 2-Tier Scoring: Exact Melody + Smart Vocal Score).
- [ ] **`T2.2`**: Implement song manifest parser, timeline interpolation, and comprehensive Vitest unit tests (including anti-cheat metrics).

## Phase 2B — Walking Skeleton
- [ ] **`T2.3`**: Implement `YouTubePlayerAdapter` wrapping YouTube IFrame API states, playback controls, and error events.
- [ ] **`T2.4`**: Implement Walking Skeleton integrating live mic capture, YouTube playback synchronization, and dev-only Debug HUD (with 4 Smart Vocal metrics).
- [ ] **`G2`**: Gate 2 — End-to-end walking skeleton validation on desktop hardware with wired headphones.

## Phase 3 — Iterative Build
- [ ] **`T3.1`**: Implement GPU-accelerated Pitch Track visualizer component strictly below video, Latency Offset Slider, and Result Modal with 4-metric breakdown.
- [ ] **`T3.2`**: Implement static song cache index, URL query launch (`?v=&title=`), mobile paste/search UI, and URL parsing tests.
- [ ] **`T3.3`**: Implement Companion Chrome Extension (Manifest V3 in `extension/`) injecting `"🎤 Hát chấm điểm"` launch button on YouTube search & watch pages.
- [ ] **`G3`**: Gate 3 — End-to-end verification of full scored karaoke flow across Exact and Smart Vocal modes.

## Phase 4 — Polish & Release
- [ ] **`T4.1`**: Implement Free Pitch Mode polish, error recovery UI for YouTube embed restrictions, and UX refinements.
- [ ] **`G4`**: Gate 4 — Production release audit and mobile HTTPS browser validation via Cloudflare Pages preview URL.
