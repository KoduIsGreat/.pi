# Plan Mode Extension — Phased Workflow

A structured workflow that guides through brainstorming, spec writing, implementation planning, execution, simplification, and code review — inspired by [superpowers](https://github.com/obra/superpowers).

## Philosophy

Instead of jumping straight from idea to implementation, this extension enforces a deliberate process:

1. **Brainstorm** — Back-and-forth exploration with the agent asking one question at a time
2. **Spec** — Write a design document capturing what was decided
3. **Plan** — Write a detailed, step-by-step implementation plan
4. **Execute** — Implement with progress tracking
5. **Simplify** — Cleanup pass on all changed files
6. **Review** — Code review against the spec and plan, apply Critical/Important fixes
7. **Simplify** — Final cleanup if the review made changes

Phases 5-7 run automatically after execution completes.

## Commands

| Command | Description |
|---------|-------------|
| `/plan` | Start plan mode (brainstorm phase) or toggle off |
| `/plan off` | Disable plan mode |
| `/phase` | Show current phase |
| `/phase <name>` | Jump to a specific phase |
| `/todos` | Show execution progress |
| `Ctrl+Alt+P` | Toggle plan mode on/off |

## Workflow

### 1. Brainstorm Phase 💬

```
/plan
> "I want to add caching to the API layer"
```

The agent will:
- Explore project context (files, docs, git history)
- Ask clarifying questions **one at a time** (prefers multiple choice)
- Propose 2-3 approaches with trade-offs and a recommendation
- Validate design decisions incrementally

When the design is clear, the agent says "Ready to write the spec" → menu appears.

### 2. Spec Phase 📐

The agent writes a design document covering:
- Goal, background, design, interfaces
- Error handling, testing strategy
- What's explicitly out of scope
- Self-reviews for placeholders, contradictions, ambiguity

Saves the spec to disk (e.g. `docs/specs/<topic>-design.md`).
You review and request changes until satisfied → advance.

### 3. Plan Phase 📋

The agent writes a concrete implementation plan:
- Exact file paths for every change
- Bite-sized steps (2-5 minutes each)
- Test-first where appropriate
- No placeholders or vague steps

Saves the plan to disk (e.g. `docs/plans/<topic>-plan.md`).
You review → advance.

### 4. Execute Phase 🚀

Full tool access restored. The agent:
- Executes steps in order
- Marks completion with `[DONE:n]` tags
- Progress widget tracks completion
- Stops and asks if blocked (doesn't guess)

### 5. Simplify Phase ✨ (automatic)

Runs automatically when execution completes:
- Finds all changed files via `git diff --name-only`
- Reviews for clarity, consistency, maintainability
- Preserves all functionality

### 6. Review Phase 🔍 (automatic)

Runs automatically after simplify:
- Reads the code-review skill
- Checks spec/plan compliance first
- Reviews code quality (correctness, architecture, security, testing)
- Applies Critical and Important fixes directly
- Notes Minor issues without fixing

### 7. Final Simplify (if needed)

If the review made changes, one more simplify pass runs automatically. Then the workflow completes.

## Phase Transitions

**Interactive phases** (brainstorm → spec → plan → execute): transitions happen when the agent signals readiness and you confirm via a menu:
- **→ Move to next phase**
- **↺ Continue** — stay and keep discussing
- **✎ Refine** — open editor to give feedback
- **✗ Exit** — leave plan mode entirely

**Automatic phases** (simplify → review → simplify): these chain automatically after execution completes with no user interaction needed.

## Tools by Phase

| Phase | Tools |
|-------|-------|
| 💬 Brainstorm | read, bash (read-only), grep, find, ls, questionnaire |
| 📐 Spec | above + write |
| 📋 Plan | above + write |
| 🚀 Execute | read, bash, edit, write (full access) |
| ✨ Simplify | full access |
| 🔍 Review | full access |

## Session Persistence

Phase, todo items, and post-review state persist across session resume.
