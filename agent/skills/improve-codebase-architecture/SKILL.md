---
name: improve-codebase-architecture
description: Explore a codebase to find opportunities for architectural improvement, focusing on making the codebase more testable by deepening shallow modules. Use when user wants to improve architecture, find refactoring opportunities, consolidate tightly-coupled modules, or make a codebase more AI-navigable.
---

# Improve Codebase Architecture

Explore a codebase like an AI would, surface architectural friction, discover opportunities for improving testability, and propose module-deepening refactors as GitHub issue RFCs.

A **deep module** (John Ousterhout, "A Philosophy of Software Design") has a small interface hiding a large implementation. Deep modules are more testable, more AI-navigable, and let you test at the boundary instead of inside.

## Process

### 1. Explore the codebase

Dispatch a `scout` subagent (thorough) to navigate the codebase and surface architectural friction. Do NOT follow rigid heuristics — the scout should explore organically and report where friction appears:

```
subagent: {
  agent: "scout",
  task: "Thorough architectural recon. Navigate organically and surface friction points. Specifically: (1) places where understanding one concept requires bouncing between many small files, (2) modules so shallow the interface is nearly as complex as the implementation, (3) pure functions extracted just for testability where real bugs hide in the callers, (4) tightly-coupled modules creating integration risk at the seams, (5) untested or hard-to-test parts. The friction IS the signal. Return a structured list of candidate clusters with file paths, coupling notes, and test coverage observations."
}
```

The friction the scout surfaces is your starting material for Step 2.

### 2. Present candidates

Present a numbered list of deepening opportunities. For each candidate, show:

- **Cluster**: Which modules/concepts are involved
- **Why they're coupled**: Shared types, call patterns, co-ownership of a concept
- **Dependency category**: See [REFERENCE.md](REFERENCE.md) for the four categories
- **Test impact**: What existing tests would be replaced by boundary tests

Do NOT propose interfaces yet. Ask the user: "Which of these would you like to explore?"

### 3. User picks a candidate

### 4. Frame the problem space

Before spawning sub-agents, write a user-facing explanation of the problem space for the chosen candidate:

- The constraints any new interface would need to satisfy
- The dependencies it would need to rely on
- A rough illustrative code sketch to make the constraints concrete — this is not a proposal, just a way to ground the constraints

Show this to the user, then immediately proceed to Step 5. The user reads and thinks about the problem while the sub-agents work in parallel.

### 5. Design multiple interfaces

Dispatch 3+ `planner` subagents in **parallel**. Each must produce a **radically different** interface for the deepened module.

```
subagent: {
  tasks: [
    { agent: "planner", task: "<shared technical brief>. Design constraint: Minimize the interface — aim for 1-3 entry points max." },
    { agent: "planner", task: "<shared technical brief>. Design constraint: Maximize flexibility — support many use cases and extension." },
    { agent: "planner", task: "<shared technical brief>. Design constraint: Optimize for the most common caller — make the default case trivial." }
    // Optionally add: ports & adapters pattern for cross-boundary dependencies
  ]
}
```

The shared technical brief includes: file paths, coupling details, dependency category (see [REFERENCE.md](REFERENCE.md)), what's being hidden. This brief is independent of the user-facing explanation in Step 4.

Each planner outputs:

1. Interface signature (types, methods, params)
2. Usage example showing how callers use it
3. What complexity it hides internally
4. Dependency strategy (how deps are handled — see [REFERENCE.md](REFERENCE.md))
5. Trade-offs

Present designs sequentially, then compare them in prose.

After comparing, give your own recommendation: which design you think is strongest and why. If elements from different designs would combine well, propose a hybrid. Be opinionated — the user wants a strong read, not just a menu.

### 6. User picks an interface (or accepts recommendation)

### 7. Create GitHub issue

Create a refactor RFC as a GitHub issue using `gh issue create`. Use the template in [REFERENCE.md](REFERENCE.md). Do NOT ask the user to review before creating — just create it and share the URL.
