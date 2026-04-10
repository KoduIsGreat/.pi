---
description: Full implementation workflow - scout → plan → implement → review → simplify
---
Use the subagent tool with the chain parameter to execute this workflow:

1. Use the "scout" agent to gather context: find all code relevant to "$@", check for any existing specs or plans in docs/specs/ or docs/plans/ that relate to this work

2. Use the "planner" agent to create an implementation plan for "$@" using the scout's context (use {previous} placeholder). The plan should reference any existing specs/plans found. Output a numbered plan under a "Plan:" header with exact file paths and concrete steps.

3. Use the "worker" agent to implement the plan from the previous step (use {previous} placeholder). After completing all steps, include a list of files changed.

4. Use the "reviewer" agent to review the implementation (use {previous} placeholder). Read the code-review skill at ~/.pi/agent/skills/code-review/SKILL.md first. Check the changes against the plan and any specs found in step 1. Categorize issues by severity.

5. Use the "worker" agent to apply any Critical or Important feedback from the review, then run a simplify pass on all changed files — review for clarity, consistency, and maintainability while preserving functionality (use {previous} placeholder).

Execute this as a chain, passing output between steps via {previous}.
