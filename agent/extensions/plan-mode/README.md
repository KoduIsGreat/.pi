# Plan Mode Extension — Phased Workflow

A structured workflow that guides through brainstorming, spec writing, implementation planning, and execution — inspired by [superpowers](https://github.com/obra/superpowers).

## Philosophy

Instead of jumping straight from idea to implementation, this extension enforces a deliberate process:

1. **Brainstorm** — Back-and-forth exploration with the agent asking one question at a time
2. **Spec** — Write a design document capturing what was decided
3. **Plan** — Write a detailed, step-by-step implementation plan
4. **Execute** — Implement with progress tracking

Each phase is read-only (except execute), preventing premature code changes. The agent naturally signals when it's ready to transition, and you confirm via a menu.

## Commands

| Command | Description |
|---------|-------------|
| `/plan` | Start plan mode (brainstorm phase) or toggle off |
| `/plan off` | Disable plan mode |
| `/phase` | Show current phase |
| `/phase <name>` | Jump to a specific phase (brainstorm, spec, plan, execute) |
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

When the design is clear, the agent says "Ready to write the spec" → you get a menu to advance.

### 2. Spec Phase 📐

The agent writes a design document covering:
- Goal, background, design, interfaces
- Error handling, testing strategy
- What's explicitly out of scope
- Self-reviews for placeholders, contradictions, ambiguity

You review and request changes until satisfied → agent says "Spec approved" → advance.

### 3. Plan Phase 📋

The agent writes a concrete implementation plan:
- Exact file paths for every change
- Bite-sized steps (2-5 minutes each)
- Test-first where appropriate
- No placeholders or vague steps

You review → agent says "Ready to execute" → advance.

### 4. Execute Phase 🚀

Full tool access restored. The agent:
- Executes steps in order
- Marks completion with `[DONE:n]` tags
- Progress widget tracks completion
- Stops and asks if blocked (doesn't guess)

## Phase Transitions

Transitions happen naturally:
1. Agent includes a signal phrase (e.g., "Ready to write the spec")
2. A menu appears with options:
   - **→ Move to next phase** — advance the workflow
   - **↺ Continue** — stay and keep discussing
   - **✎ Refine** — open editor to give feedback
   - **✗ Exit** — leave plan mode entirely

You can also jump phases manually with `/phase <name>`.

## Read-Only Protection

During brainstorm, spec, and plan phases:
- Only read-only tools available (read, bash, grep, find, ls, questionnaire)
- Bash commands filtered through an allowlist
- Edit and write tools are disabled

## Session Persistence

Phase and todo state persists across session resume.
