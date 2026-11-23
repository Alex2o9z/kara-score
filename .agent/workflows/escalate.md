# Escalation Workflow

When an issue persists after 2 focused attempts (per the 2-Strike Rule in `RULES.md`):

1. **Halt Execution:**
   - Cease all file modifications immediately. Do NOT add speculative workaround packages.
2. **Collect Evidence:**
   - Run `git status` to capture current workspace state.
   - Gather exact terminal output and stack traces.
3. **Emit Escalation Report:**
   Output a structured report for human / Gemini Pro review:
   - **Task ID:** Current task ID.
   - **Error Log:** Exact failing command and complete error stack trace.
   - **Attempt 1:** Hypothesis, changes made, and failure outcome.
   - **Attempt 2:** Hypothesis, changes made, and failure outcome.
   - **Debug HUD / Telemetry:** Current audio/timeline/engine state snapshot (if applicable).
   - **Git Status:** Modified/untracked files summary.
   - **Blocker Decision Needed:** Specific architectural or technical question requiring decision.
