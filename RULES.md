# Engineering Rules & Operating Principles

This document codifies the 10 non-negotiable operating principles for all AI agents and contributors working on **Karaoke Pitch Web (MVP v1)**.

---

## 1. Operating Environment & Tooling
- **Primary Shell:** Windows PowerShell 5.1 / 7+. Always prefer `npm scripts` for cross-platform consistency.
- **Strictly Prohibited:** Bash-specific commands and syntax (`rm -rf`, `export VAR=...`, `touch`, `cat <<EOF`). Use PowerShell equivalents (`Remove-Item -Recurse -Force`, `$env:VAR=...`, `Set-Content`) or native node/npm scripts.
- **Encoding & Line Endings:** UTF-8 encoding and LF line endings are strictly enforced across all files via `.editorconfig` and `.gitattributes`.

---

## 2. Scope & Task Atomicity
- **Single Technical Goal:** Every task must have a single, clearly defined technical objective and unambiguous acceptance criteria.
- **Change Footprint:** Most tasks touch 1–3 files. Touching >5 files is an architectural change requiring L2 approval before implementation.
- **No Unilateral Scope Creep:** Never introduce extra libraries, icon sets, UI frameworks, or unapproved features.

---

## 3. Risk-Based Approval Tiers

| Tier | Category | Scope & Permissions | Examples |
| :--- | :--- | :--- | :--- |
| **L1** | **Autonomous** | Changes within `src/` and `public/songs/`; running tests & verify scripts. | Feature code, unit tests, styling, refactoring pure engines, running `npm run verify`. |
| **L2** | **Ask First (Plan Approval)** | Adding/removing dependencies; modifying root config files; altering directory architecture; changes touching >5 files. | `package.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, installing new packages. |
| **L3** | **Human Only / Explicit Confirmation** | Destructive actions, Git history alterations, remote repository actions, production deployment. | `git reset --hard`, `git push --force`, deleting critical files, deploying live production builds. |

---

## 4. Autonomous L1 Development Loop
- Work iteratively within `src/` and `public/songs/`.
- Never insert workaround libraries or third-party wrappers to silence build, lint, or typecheck failures.
- Fix underlying type definitions, interfaces, or logic directly.

---

## 5. Verification & Proof of Work
- **Strict Exit Criteria:** A task is NOT complete until `npm run verify` passes with exit code 0:
  ```bash
  npm run verify # Runs: tsc --noEmit && eslint . && vitest run && vite build
  ```
- **Evidence Reporting:** Every task completion report must include:
  1. Files created/modified (with relative paths).
  2. Concrete technical decisions made.
  3. Raw or summarized output from `npm run verify` confirming 0 errors.
  4. Current `git status` summary.

---

## 6. Two-Strike Debugging Rule
When encountering any configuration, build, lint, or runtime failure:
1. **Attempt 1:** Diagnose root cause from exact logs and apply a minimal, targeted fix.
2. **Attempt 2:** Verify hypothesis with evidence. If the issue remains unresolved:
3. **STOP Immediately:** Do not try random workarounds, install packages, or loop. Output a structured **Escalation Report** detailing:
   - Failing command & exact error logs.
   - Hypotheses tested and results.
   - Specific blocked decision for human/Gemini Pro guidance.

---

## 7. Mandatory Debug HUD (from T2.4 onwards)
- **Conditional Rendering:** Render strictly when `import.meta.env.DEV === true`. Zero HUD footprint in production builds.
- **Read-Only Invariant:** Must consume reactive engine state in a purely read-only manner. It must NEVER mutate engine state, affect timeline synchronization, or alter scoring calculations.
- **Diagnostics Export:** Must include an `Export Diagnostics JSON` button that bundles current audio context state, pitch buffer metrics, synchronization offsets, and recent scoring ticks for rapid debugging.

---

## 8. Session Continuity & Handoff
- Every session must conclude with:
  1. Running `git status`.
  2. Updating the `# SESSION HANDOFF` block at the top of `TASKS.md` with:
     - `Last Completed Task`
     - `Current Blocker`
     - `First Action Next Session`
     - `Uncommitted Changes`
  3. Marking backlog tasks `[x]` ONLY after full verification (`npm run verify` pass).

---

## 9. Zero Recurring Cost & Strict Microphone Privacy
- **100% Client-Side:** No backend server, no database, no hosted functions, no external API keys.
- **Zero Audio Retention:** Microphone stream is processed in real time in volatile memory (Web Audio API `AudioWorklet` / `ScriptProcessorNode` / `AnalyserNode`) and immediately discarded. Never record, persist, encode, or transmit user audio.
- **Explicit Mic Lifecycle:**
  - Request microphone permission ONLY upon explicit user activation (e.g., clicking "Start Song").
  - On song end, stop, or component unmount, ALWAYS invoke:
    ```ts
    mediaStreamTrack.stop();
    audioContext.close();
    ```

---

## 10. Code Quality, Mocks & Dual-Layer Validation
- **No Production Placeholders:** Mocks, stubs, and synthetic data are permitted **strictly** in unit tests (`*.test.ts`). Production code paths must be fully functional implementations.
- **Dual-Layer Validation:**
  - **Technical Validation:** Automated gate (`npm run verify` = typecheck + lint + test + build).
  - **Product Validation:** Manual verification on real hardware (real browser, real microphone, wired headphones) to validate audio latency, pitch detection stability, and YouTube synchronization.
