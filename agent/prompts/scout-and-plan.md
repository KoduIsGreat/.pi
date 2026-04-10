---
description: Scout gathers context and existing specs/plans, planner creates implementation plan (no implementation)
---
Use the subagent tool with the chain parameter to execute this workflow:

1. Use the "scout" agent to find all code relevant to: $@. Also check for any existing specs in docs/specs/ or plans in docs/plans/ that relate to this work. Include their contents in the findings.

2. Use the "planner" agent to create an implementation plan for "$@" using the context from the previous step (use {previous} placeholder). If existing specs or plans were found, the plan must align with them. Output under a "Plan:" header with exact file paths, concrete bite-sized steps, and TDD where appropriate. Save the plan to docs/plans/ using the write tool.

Execute this as a chain, passing output between steps via {previous}. Do NOT implement - just return the plan.
