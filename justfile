# Local model setup for M2 Mac mini (32GB+)
# Usage: `just <recipe>` — run `just` with no args to list recipes.

set shell := ["bash", "-cu"]

# MLX slots — one server process per model, each on its own port.
mlx_coder       := "mlx-community/Qwen2.5-Coder-14B-Instruct-4bit"
mlx_coder_port  := "8080"
mlx_chat        := "mlx-community/Qwen2.5-14B-Instruct-4bit"
mlx_chat_port   := "8081"

# Default context length for the Ollama -32k variants
ollama_ctx := "32768"

# List available recipes
default:
    @just --list

# ── Ollama ──────────────────────────────────────────────────────────────────

# Install Ollama via Homebrew
ollama-install:
    brew install ollama

# Start Ollama as a background service (survives reboots)
ollama-start:
    brew services start ollama

# Stop the Ollama background service
ollama-stop:
    brew services stop ollama

# Restart the Ollama service (pick up env var changes)
ollama-restart:
    brew services restart ollama

# Tail Ollama logs
ollama-logs:
    tail -f ~/.ollama/logs/server.log

# Pull the recommended base models for a 32GB M2 Mac mini
ollama-pull-recommended:
    ollama pull qwen2.5-coder:14b      # primary coding model (~9GB)
    ollama pull qwen2.5:14b            # general chat (~9GB)
    ollama pull llama3.1:8b            # fast fallback (~5GB)
    ollama pull qwen2.5-coder:7b       # quick coding tasks (~4.5GB)
    ollama pull nomic-embed-text       # embeddings

# Create a larger-context variant of an Ollama model via Modelfile.
# Produces `<model>-<ctx/1k>k` — e.g. qwen2.5-coder:14b → qwen2.5-coder:14b-32k
ollama-modelfile model ctx=ollama_ctx:
    #!/usr/bin/env bash
    set -euo pipefail
    ctx_k="$(( {{ctx}} / 1024 ))k"
    new_tag="{{model}}-${ctx_k}"
    tmp="$(mktemp)"
    trap 'rm -f "$tmp"' EXIT
    printf 'FROM {{model}}\nPARAMETER num_ctx {{ctx}}\n' > "$tmp"
    ollama create "$new_tag" -f "$tmp"
    echo "Created $new_tag"

# Create 32K-context variants of every recommended model. Matches the
# model IDs registered in agent/models.json under the `ollama` provider.
ollama-create-32k-variants:
    just ollama-modelfile qwen2.5-coder:14b
    just ollama-modelfile qwen2.5:14b
    just ollama-modelfile llama3.1:8b
    just ollama-modelfile qwen2.5-coder:7b

# List installed Ollama models
ollama-list:
    ollama list

# Smoke test: ping the OpenAI-compatible endpoint
ollama-test:
    curl -s http://localhost:11434/v1/models | jq '.data[].id'

# ── MLX-LM ──────────────────────────────────────────────────────────────────

# Install mlx-lm into a dedicated uv-managed venv at ~/.mlx-lm
mlx-install:
    command -v uv >/dev/null || brew install uv
    uv venv ~/.mlx-lm --python 3.11
    uv pip install --python ~/.mlx-lm/bin/python mlx-lm

# Start an MLX server in the foreground (ad-hoc model/port)
mlx-serve model port:
    ~/.mlx-lm/bin/mlx_lm.server --model {{model}} --port {{port}}

# Start an MLX server detached; log path is per-port so slots don't clobber.
mlx-serve-bg model port:
    mkdir -p ~/.mlx-lm/logs
    nohup ~/.mlx-lm/bin/mlx_lm.server --model {{model}} --port {{port}} \
        > ~/.mlx-lm/logs/server-{{port}}.log 2>&1 &
    @echo "MLX server started on port {{port}} — logs: ~/.mlx-lm/logs/server-{{port}}.log"

# Start the coder slot (default: Qwen2.5-Coder-14B-4bit on :8080)
mlx-coder-start:
    just mlx-serve-bg {{mlx_coder}} {{mlx_coder_port}}

# Start the chat slot (default: Qwen2.5-14B-Instruct-4bit on :8081)
mlx-chat-start:
    just mlx-serve-bg {{mlx_chat}} {{mlx_chat_port}}

# Start both named MLX slots
mlx-start-all: mlx-coder-start mlx-chat-start

# Stop a specific MLX slot by model substring match
mlx-stop-slot model:
    pkill -f "mlx_lm.server.*{{model}}" || true

# Stop the coder slot
mlx-coder-stop:
    just mlx-stop-slot {{mlx_coder}}

# Stop the chat slot
mlx-chat-stop:
    just mlx-stop-slot {{mlx_chat}}

# Stop every MLX server process
mlx-stop:
    pkill -f mlx_lm.server || true

# Tail logs for a given MLX port
mlx-logs port=mlx_coder_port:
    tail -f ~/.mlx-lm/logs/server-{{port}}.log

# Smoke test one port's OpenAI-compatible endpoint
mlx-test port=mlx_coder_port:
    curl -s http://localhost:{{port}}/v1/models | jq '.data[].id'

# ── Combined ────────────────────────────────────────────────────────────────

# Full first-time setup: install both runtimes, pull Ollama models,
# build 32K-context variants, and start both MLX slots in the background.
setup: ollama-install mlx-install ollama-start ollama-pull-recommended ollama-create-32k-variants mlx-start-all
    @echo "Done. Run 'just status' to verify all endpoints."

# Show status of every endpoint we care about
status:
    @echo "── Ollama (11434) ──"
    @curl -sf http://localhost:11434/api/tags >/dev/null \
        && echo "  running" || echo "  not running"
    @echo "── MLX coder ({{mlx_coder_port}}) ──"
    @curl -sf http://localhost:{{mlx_coder_port}}/v1/models >/dev/null \
        && echo "  running" || echo "  not running"
    @echo "── MLX chat ({{mlx_chat_port}}) ──"
    @curl -sf http://localhost:{{mlx_chat_port}}/v1/models >/dev/null \
        && echo "  running" || echo "  not running"
