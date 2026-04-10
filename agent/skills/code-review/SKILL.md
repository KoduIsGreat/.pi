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

Before reviewing code, establish what the changes are supposed to achieve. Work from the most specific source available:

**Check for specs and plans:**
- Look for spec/design docs referenced in the conversation or in `docs/specs/`, `docs/plans/`, or similar project directories
- If a plan-mode workflow was used, the brainstorm → spec → plan conversation is your primary reference for intent
- Check recent commit messages for references to specs, plans, or issue numbers

**Check for other context:**
- PR description, issue/ticket, or task description from the conversation
- If dispatched as a subagent, the task description is your context — use it

**If no spec/plan exists**, infer intent from commit messages and the diff itself, but note this in your review.

```bash
# What files changed
git diff --stat <base>..<head>

# Full diff
git diff <base>..<head>

# Recent commit messages for intent
git log --oneline <base>..<head>

# Look for specs/plans in the project
find . -path '*/docs/*' -name '*spec*' -o -name '*plan*' -o -name '*design*' 2>/dev/null | head -20
```

### 2. Spec & Plan Compliance

If a spec or plan exists, this is the **first and most important** check. Before looking at code quality, verify the implementation achieves what was planned.

- **Coverage** — Does every requirement in the spec have a corresponding implementation? List any gaps.
- **Faithfulness** — Does the implementation match the spec's design decisions (architecture, interfaces, error handling)? Flag any deviations.
- **Scope** — Is there work that goes beyond the spec (scope creep)? Is there work missing?
- **Testing** — Does the testing match the spec's testing strategy?

If the implementation deviates from the spec, categorize it:
- **Intentional improvement** — the code is better than what the spec described. Note it but don't flag as an issue.
- **Drift** — the code doesn't match the spec and it's unclear if this was intentional. Flag as Important.
- **Missing** — a spec requirement isn't implemented at all. Flag as Critical.

### 3. Review Checklist

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

### 4. Categorize Findings

**Critical (must fix)** — Bugs, security issues, data loss risks, broken functionality.

**Important (should fix)** — Missing error handling, architectural problems, test gaps, spec mismatches.

**Minor (consider)** — Style, naming, minor optimizations, documentation.

For each finding:
- **File:line** — exact location
- **What** — the specific issue
- **Why** — why it matters
- **Fix** — how to fix (if not obvious)

### 5. Output Format

```markdown
## Code Review

### Scope
Files reviewed, git range, what was implemented.
Spec/plan referenced (if any).

### Spec Compliance
(Include this section when a spec or plan exists)
- **Coverage:** All requirements met? List any gaps.
- **Deviations:** Any drift from the spec? Intentional improvements noted.
- **Scope:** Any scope creep or missing work?

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

**Spec compliance:** Full / Partial / No spec found

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
