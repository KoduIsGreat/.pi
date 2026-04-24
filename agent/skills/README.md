---
name: skills
description: Index of installed agent skills. Not a skill itself — do not invoke.
disable-model-invocation: true
---

# Agent Skills

A collection of agent skills that extend capabilities across planning, development, and tooling.

## Planning & Design

These skills help you think through problems before writing code.

- **to-prd** — Turn the current conversation context into a PRD and submit it as a GitHub issue. No interview — just synthesizes what you've already discussed.

  ```
  npx skills@latest add mattpocock/skills/to-prd
  ```

- **to-issues** — Break any plan, spec, or PRD into independently-grabbable GitHub issues using vertical slices.

  ```
  npx skills@latest add mattpocock/skills/to-issues
  ```

- **grill-me** — Get relentlessly interviewed about a plan or design until every branch of the decision tree is resolved.

  ```
  npx skills@latest add mattpocock/skills/grill-me
  ```

- **design-an-interface** — Generate multiple radically different interface designs for a module using parallel sub-agents.

  ```
  npx skills@latest add mattpocock/skills/design-an-interface
  ```

- **request-refactor-plan** — Create a detailed refactor plan with tiny commits via user interview, then file it as a GitHub issue.

  ```
  npx skills@latest add mattpocock/skills/request-refactor-plan
  ```

- **domain-model** — Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates `CONTEXT.md` / ADRs inline as decisions crystallise.

  ```
  npx skills@latest add mattpocock/skills/domain-model
  ```

## Development

These skills help you write, refactor, and fix code.

- **tdd** — Test-driven development with a red-green-refactor loop. Builds features or fixes bugs one vertical slice at a time.

  ```
  npx skills@latest add mattpocock/skills/tdd
  ```

- **triage-issue** — Investigate a bug by exploring the codebase, identify the root cause, and file a GitHub issue with a TDD-based fix plan.

  ```
  npx skills@latest add mattpocock/skills/triage-issue
  ```

- **improve-codebase-architecture** — Explore a codebase for architectural improvement opportunities, focusing on deepening shallow modules and improving testability.

  ```
  npx skills@latest add mattpocock/skills/improve-codebase-architecture
  ```

- **migrate-to-shoehorn** — Migrate test files from `as` type assertions to @total-typescript/shoehorn.

  ```
  npx skills@latest add mattpocock/skills/migrate-to-shoehorn
  ```

- **scaffold-exercises** — Create exercise directory structures with sections, problems, solutions, and explainers.

  ```
  npx skills@latest add mattpocock/skills/scaffold-exercises
  ```

- **code-review** — Review code changes for quality, bugs, security, and architecture. Dispatches the `reviewer` subagent for isolated review.

  ```
  npx skills@latest add mattpocock/skills/code-review
  ```

- **zoom-out** — Ask the agent to zoom out and give broader context or a higher-level perspective. Useful when unfamiliar with a section of code.

  ```
  npx skills@latest add mattpocock/skills/zoom-out
  ```

## GitHub Workflow

- **qa** — Interactive QA session where you report bugs conversationally and the agent files GitHub issues. Uses `scout` to build codebase context.

  ```
  npx skills@latest add mattpocock/skills/qa
  ```

- **github-triage** — Triage GitHub issues through a label-based state machine with interactive grilling sessions. Uses `scout` to gather codebase context before triage.

  ```
  npx skills@latest add mattpocock/skills/github-triage
  ```

## Tooling & Setup

- **setup-pre-commit** — Set up Husky pre-commit hooks with lint-staged, Prettier, type checking, and tests.

  ```
  npx skills@latest add mattpocock/skills/setup-pre-commit
  ```

- **git-guardrails-claude-code** — Set up Claude Code hooks to block dangerous git commands (push, reset --hard, clean, etc.) before they execute.

  ```
  npx skills@latest add mattpocock/skills/git-guardrails-claude-code
  ```

## Writing & Knowledge

- **write-a-skill** — Create new skills with proper structure, progressive disclosure, and bundled resources.

  ```
  npx skills@latest add mattpocock/skills/write-a-skill
  ```

- **edit-article** — Edit and improve articles by restructuring sections, improving clarity, and tightening prose.

  ```
  npx skills@latest add mattpocock/skills/edit-article
  ```

- **ubiquitous-language** — Extract a DDD-style ubiquitous language glossary from the current conversation.

  ```
  npx skills@latest add mattpocock/skills/ubiquitous-language
  ```

- **obsidian-vault** — Search, create, and manage notes in an Obsidian vault with wikilinks and index notes.

  ```
  npx skills@latest add mattpocock/skills/obsidian-vault
  ```

## Communication Style

- **caveman** — Ultra-compressed communication mode. Cuts token usage ~75% by dropping filler, articles, and pleasantries while keeping full technical accuracy.

  ```
  npx skills@latest add mattpocock/skills/caveman
  ```

## Subagent Conventions

Skills in this repo that delegate work assume pi's subagent extension is installed with the four standard agents at `~/.pi/agent/agents/`:

- **scout** (haiku) — fast codebase recon, returns compressed findings
- **planner** (sonnet) — produces implementation plans from scout output
- **reviewer** (sonnet) — isolated code review
- **worker** (sonnet) — general-purpose delegated task

Skills invoke them via pi's subagent tool: `{ agent, task }`, `{ tasks: [...] }` (parallel), or `{ chain: [...] }` (sequential, `{previous}` placeholder). See `~/.pi/agent/extensions/subagent/README.md` for details.
