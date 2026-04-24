---
name: to-prd
description: Turn the current conversation context into a PRD and submit it as a GitHub issue. Use when user wants to create a PRD from the current context.
---

This skill takes the current conversation context and codebase understanding and produces a PRD. Do NOT interview the user — just synthesize what you already know.

## Process

1. Dispatch a `scout` → `planner` chain to gather codebase context and produce a module sketch. Scout returns compressed findings; planner turns them into a draft module plan.

   ```
   subagent: {
     chain: [
       { agent: "scout", task: "Recon for PRD on <feature under discussion>. Return: (1) relevant existing modules and their interfaces, (2) patterns already in use, (3) where the new feature would integrate, (4) prior art for tests in this area. Do NOT propose designs." },
       { agent: "planner", task: "Using the scout findings, sketch the major modules that will need to be built or modified to implement <feature>. Actively look for opportunities to extract deep modules (small interface, large implementation, rarely-changing) that can be tested in isolation. For each module: name, interface shape, what it hides, and why it's deep (or a note if it's unavoidably shallow). Previous: {previous}" }
     ]
   }
   ```

   A deep module (as opposed to a shallow module) is one which encapsulates a lot of functionality in a simple, testable interface which rarely changes.

2. Present the planner's module sketch to the user. Check that these modules match their expectations. Check which modules they want tests written for. Iterate if needed.

3. Write the PRD using the template below and submit it as a GitHub issue.

<prd-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this PRD.

## Further Notes

Any further notes about the feature.

</prd-template>
