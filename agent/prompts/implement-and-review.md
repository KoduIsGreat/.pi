---
description: Implement then review against spec/plan - worker implements, reviewer checks compliance, worker fixes and simplifies
---
Use the subagent tool with the chain parameter to execute this workflow:

1. Use the "worker" agent to implement: $@. Before starting, check for any related specs in docs/specs/ or plans in docs/plans/. Follow them if found. After completing, list all files changed.

2. Use the "reviewer" agent to review the implementation (use {previous} placeholder). Read the code-review skill at ~/.pi/agent/skills/code-review/SKILL.md first. Check for spec/plan compliance — does the implementation achieve what was planned? Categorize issues by severity (Critical, Important, Minor).

3. Use the "worker" agent to address the review feedback (use {previous} placeholder). Fix any Critical and Important issues. Then run a simplify pass on all changed files — review for clarity, consistency, and maintainability while preserving functionality.

Execute this as a chain, passing output between steps via {previous}.
