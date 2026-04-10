Review and simplify the following code. Focus on:

1. **Reduce complexity** — flatten nested logic, simplify conditionals, reduce cyclomatic complexity
2. **Extract functions** — break large functions into smaller, well-named, single-responsibility functions
3. **Remove dead code** — delete unused variables, unreachable branches, commented-out code, and unused imports
4. **Improve readability** — use clear naming, reduce cognitive load, prefer early returns over deep nesting
5. **Simplify patterns** — replace verbose patterns with idiomatic alternatives (e.g., optional chaining, destructuring, built-in methods)
6. **DRY** — extract repeated logic into shared helpers

Preserve all existing behavior and public interfaces. Do not change functionality. If tests exist, ensure they still pass.

Work through the code file by file. For each file, explain what you're simplifying and why before making changes.

{{files}}
