# Global Agent Guidelines

These defaults apply across all projects unless a project-local `AGENTS.md` overrides them.

## Plans go in `.plans/`

When asked to make, write, or save a plan (PRD, RFC, refactor plan, design doc, implementation plan, etc.):

1. If a `.plans/` directory does not exist at the repository root, create it.
2. Add `.plans/` to the repo's `.gitignore` (creating `.gitignore` if needed, and only adding the entry if it isn't already present). Plans are working artifacts, not committed history — they should never be accidentally committed.
3. Write the plan into `.plans/` with a descriptive filename (e.g. `.plans/2026-04-29-add-redis-caching.md`).
4. After writing, print the absolute path so the user can find it.

If the user explicitly asks for the plan in a different location (e.g. `docs/plans/`, a GitHub issue), follow their request instead.

## Go builds with DuckDB use `-tags=duckdb_arrow`

When running `go build`, `go test`, `go run`, or `go install` in a project that depends on DuckDB:

- Detect DuckDB usage by checking `go.mod` (or `go.sum`) for `github.com/marcboeker/go-duckdb` or any other DuckDB binding.
- If present, add `-tags=duckdb_arrow` to the command. Examples:
  - `go build -tags=duckdb_arrow ./...`
  - `go test -tags=duckdb_arrow ./...`
  - `go run -tags=duckdb_arrow ./cmd/foo`
- If DuckDB is not used, do not add the tag.

When unsure, run `grep -l duckdb go.mod` first.

## Hasura migrations via the Hasura CLI

When asked to create, edit, or apply a Hasura migration:

### Standard workflow

Use the `hasura` CLI from the directory containing `config.yaml` (typically `hasura/` at the repo root):

```bash
# Create a new migration (writes up.sql + down.sql under migrations/<schema>/<timestamp>_<name>/)
hasura migrate create <descriptive_name> --database-name <db>

# Apply pending migrations to the configured endpoint
hasura migrate apply --database-name <db>

# Check status
hasura migrate status --database-name <db>

# Capture metadata changes after editing in the console
hasura metadata export
```

The endpoint and admin secret come from `config.yaml` + `.env` (or env vars `HASURA_GRAPHQL_ENDPOINT` / `HASURA_GRAPHQL_ADMIN_SECRET`).

### Working against a remote Hasura environment

If the Hasura instance is not reachable directly (e.g. running inside a Kubernetes cluster), you can port-forward to it before running migrations.

**Always ask for explicit user permission before opening a port-forward.** Port-forwards expose remote services to localhost and may have side effects. Confirm:

- Which environment (dev / staging / prod)
- Which namespace and service/pod
- Which local port

Once approved, the typical pattern is:

```bash
# In one terminal (or backgrounded with appropriate cleanup):
kubectl -n <namespace> port-forward svc/<hasura-service> <local-port>:<remote-port>

# Then run hasura commands pointing at localhost:
HASURA_GRAPHQL_ENDPOINT=http://localhost:<local-port> hasura migrate apply --database-name <db>
```

After migrations complete, terminate the port-forward.

**Never port-forward to production without explicit, per-session user approval** — even if approval was given for a previous session.
