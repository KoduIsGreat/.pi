---
name: code-review
description: Review code changes for quality, bugs, security, and architecture. Use before merging, after completing features, or when wanting a second opinion on changes. Supports reviewing git diffs, staged changes, or specific files.
---

# Code Review

Review code changes with structured feedback categorized by severity.

## When to Use

- Before merging a branch
- After completing a feature or task
- After fixing a complex bug
- When stuck and wanting a fresh perspective
- As part of plan-mode execution (between phases)

## Quick Start

Review the most recent changes:
```bash
git diff HEAD~1
```

Or review staged changes:
```bash
git diff --cached
```

Or review a branch against main:
```bash
git diff main..HEAD
```

## Process

### 1. Gather Context

Before reviewing, understand what changed and why:

```bash
# What files changed
git diff --stat <base>..<head>

# Full diff
git diff <base>..<head>

# Recent commit messages for intent
git log --oneline <base>..<head>
```

### 2. Review Checklist

**Correctness:**
- Does the code do what it's supposed to?
- Edge cases handled?
- Error paths covered?
- Off-by-one errors, null checks, type safety?

**Architecture:**
- Clean separation of concerns?
- Interfaces well-defined?
- Dependencies reasonable?
- Fits existing patterns in the codebase?

**Security:**
- Input validation?
- No secrets in code?
- Auth/authz checks where needed?
- SQL injection, XSS, etc.?

**Testing:**
- Tests actually verify behavior (not just coverage)?
- Edge cases tested?
- Tests readable and maintainable?

**Maintainability:**
- Code readable without comments explaining the obvious?
- No dead code or TODOs without context?
- DRY without over-abstracting?
- YAGNI — nothing built that isn't needed?

### 3. Categorize Findings

**Critical (must fix)** — Bugs, security issues, data loss risks, broken functionality.

**Important (should fix)** — Missing error handling, architectural problems, test gaps, spec mismatches.

**Minor (consider)** — Style, naming, minor optimizations, documentation.

For each finding:
- **File:line** — exact location
- **What** — the specific issue
- **Why** — why it matters
- **Fix** — how to fix (if not obvious)

### 4. Output Format

```markdown
## Code Review

### Scope
Files reviewed, git range, what was implemented.

### Strengths
What's done well. Be specific — file and line references.

### Issues

#### Critical
- `file.ts:42` — [issue]. [why it matters]. Fix: [how].

#### Important
- `file.ts:100` — [issue]. [why it matters]. Fix: [how].

#### Minor
- `file.ts:150` — [suggestion].

### Verdict
**Ready to merge?** Yes / No / With fixes

[1-2 sentence reasoning]
```

## Receiving Review Feedback

When acting on review feedback:

1. **Don't blindly implement** — verify each suggestion against the codebase first
2. **Clarify before acting** — if any item is unclear, ask about ALL unclear items before implementing any
3. **Push back when wrong** — use technical reasoning, not defensiveness
4. **One fix at a time** — implement, test, verify no regressions
5. **No performative agreement** — don't say "great point!" — just fix it or explain why not

## Using with Subagents

Dispatch a reviewer subagent for isolated review:

```
subagent: {
  agent: "reviewer",
  task: "Review the changes between <base> and <head>. Focus on: <what was implemented>. Check against: <requirements/spec>."
}
```

For plan-mode execution, review after each major task:

```
subagent: {
  agent: "reviewer", 
  task: "Review changes since last commit. The task was: <task description>. Verify it matches the spec."
}
```
