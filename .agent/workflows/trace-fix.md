# Trace & Fix Workflow (2-Strike Rule)

When `npm run verify` or a test fails, execute this targeted debugging workflow:

1. **Step 1: Root-Cause Tracing (Before Editing)**
   - Read the exact error stack trace, file path, and line numbers.
   - Identify the minimal underlying cause (e.g., type mismatch, missing property, syntax issue).
   - Formulate a concrete hypothesis.
2. **Step 2: Attempt 1 — Minimal Targeted Fix**
   - Apply the minimal code change inside the existing task scope.
   - Run `npm run verify` to test the hypothesis.
3. **Step 3: Attempt 2 — Evidence-Based Correction**
   - If Attempt 1 fails, inspect the new diff and error output.
   - Apply a second refined fix.
   - Run `npm run verify`.
4. **Step 4: Hard Stop on Strike 2**
   - If still failing after Attempt 2, STOP immediately. Do NOT install packages or attempt random edits.
   - Switch to [.agent/workflows/escalate.md](file:///D:/Workspace/ttptqd/2026/2026_12_Pet_Project_Karaoke/karaoke-pitch-web/.agent/workflows/escalate.md).
