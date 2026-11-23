# Agent Guidelines & Entrypoint

All AI agents working on this project MUST review the authoritative project documentation before making changes:
- [RULES.md](file:///D:/Workspace/ttptqd/2026/2026_12_Pet_Project_Karaoke/karaoke-pitch-web/RULES.md) — 10 non-negotiable operating principles and approval tiers.
- [SPEC.md](file:///D:/Workspace/ttptqd/2026/2026_12_Pet_Project_Karaoke/karaoke-pitch-web/SPEC.md) — Product specifications, JSON schemas, and scoring algorithm.
- [ARCHITECTURE.md](file:///D:/Workspace/ttptqd/2026/2026_12_Pet_Project_Karaoke/karaoke-pitch-web/ARCHITECTURE.md) — Pure engine boundaries and YouTube policy compliance.
- [TASKS.md](file:///D:/Workspace/ttptqd/2026/2026_12_Pet_Project_Karaoke/karaoke-pitch-web/TASKS.md) — Check `# SESSION HANDOFF` first for active context and blockers.

## 4 Hard Stoppers
1. **Windows PowerShell Only:** No Bash syntax (`rm -rf`, `export`, `touch`). Prefer `npm scripts`.
2. **Approval Tiers:** L1 (Autonomous inside `src/` & `public/songs/`), L2 (Ask first for root configs, packages, >5 files), L3 (Human-only for git commits, pushes, and destructive actions).
3. **Mandatory Verification:** `npm run verify` (`typecheck && lint && test && build`) MUST pass with code 0 before reporting any task complete.
4. **Git Safety:** NEVER run `git commit`, `git push`, or history alterations without explicit human instructions.
