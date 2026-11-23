# Session Handoff Workflow

Execute this workflow at the end of every agent session:

1. **Inspect Git State:**
   ```powershell
   git status
   git log -1 --oneline
   ```
2. **Update `TASKS.md` (`# SESSION HANDOFF`):**
   - Update `Last Updated:` date.
   - Record `Last Completed Task` (Task ID, Result, Commit). Mark `[x]` in backlog ONLY if verified.
   - Document `Current Blocker` (Problem, Evidence, Attempted Solutions) or state `None`.
   - Set `First Action Next Session` (Task ID, Expected Result, Files to Read).
   - List all modified/untracked files under `Uncommitted Changes`.
3. **Verify Zero Code Impact:**
   - Do NOT edit any source code or config files during handoff.
4. **Output Handoff Block:**
   - Print the verbatim `# SESSION HANDOFF` markdown block in the final turn response.
