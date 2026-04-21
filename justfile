# Local model setup for M2 Mac mini (32GB+)
# Usage: `just <recipe>` — run `just` with no args to list recipes.

set shell := ["bash", "-cu"]

# Default MLX model and port
mlx_model := "mlx-community/Qwen2.5-Coder-14B-Instruct-4bit"
mlx_port  := "8080"

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

# Tail Ollama logs
ollama-logs:
    tail -f ~/.ollama/logs/server.log

# Pull the recommended model set for a 32GB M2 Mac mini
ollama-pull-recommended:
    ollama pull qwen2.5-coder:14b      # primary coding model (~9GB)
    ollama pull qwen2.5:14b            # general chat (~9GB)
    ollama pull llama3.1:8b            # fast fallback (~5GB)
    ollama pull qwen2.5-coder:7b       # quick coding tasks (~4.5GB)
    ollama pull nomic-embed-text       # embeddings

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

# Start the MLX server with the default model (foreground)
mlx-serve model=mlx_model port=mlx_port:
    ~/.mlx-lm/bin/mlx_lm.server --model {{model}} --port {{port}}

# Start the MLX server detached via nohup; logs to ~/.mlx-lm/server.log
mlx-serve-bg model=mlx_model port=mlx_port:
    nohup ~/.mlx-lm/bin/mlx_lm.server --model {{model}} --port {{port}} \
        > ~/.mlx-lm/server.log 2>&1 &
    @echo "MLX server started on port {{port}} — logs: ~/.mlx-lm/server.log"

# Stop any background MLX server
mlx-stop:
    pkill -f mlx_lm.server || true

# Tail MLX server logs
mlx-logs:
    tail -f ~/.mlx-lm/server.log

# Smoke test: ping the OpenAI-compatible endpoint
mlx-test port=mlx_port:
    curl -s http://localhost:{{port}}/v1/models | jq '.data[].id'

# ── Combined ────────────────────────────────────────────────────────────────

# Full first-time setup: install both runtimes + pull Ollama models
setup: ollama-install mlx-install ollama-start ollama-pull-recommended
    @echo "Done. Start MLX with: just mlx-serve-bg"

# Show status of both runtimes
status:
    @echo "── Ollama ──"
    @curl -sf http://localhost:11434/api/tags >/dev/null \
        && echo "  running" || echo "  not running"
    @echo "── MLX (port {{mlx_port}}) ──"
    @curl -sf http://localhost:{{mlx_port}}/v1/models >/dev/null \
        && echo "  running" || echo "  not running"
