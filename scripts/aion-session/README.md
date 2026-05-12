# AionUI Session Manager

WebSocket client utilities for managing AionUI conversations programmatically.

Native copy adapted from `HuaqingAI/aion-session` (MIT) and extended with AionUi org workspace/project fields for the Msty-style session organization branch.

## Included Components

- `scripts/aion-session/session.py`: create, list, send to, and delete individual conversations
- `scripts/aion-session/batch_dispatch.py`: create or reuse multiple conversations and dispatch prompts in parallel
- `src/process/resources/skills/aionui-multi-session/`: self-contained Codex skill package for using the same workflow inside AionUI

## Installation

Install `websocket-client` in your Python environment, or run through `uv` with an inline dependency:

```bash
uv run --with websocket-client scripts/aion-session/session.py list
```

## Usage

### Create a conversation

```bash
# ACP type (built-in backends)
uv run --with websocket-client scripts/aion-session/session.py create --name "My Session" --backend codex --workspace "D:\my-project"
uv run --with websocket-client scripts/aion-session/session.py create --name "Project Session" --backend codex --workspace "D:\my-project" --org-workspace-id default --org-project-id general

# AIONRS type (custom model)
uv run --with websocket-client scripts/aion-session/session.py create --type aionrs --name "Custom Session" --model '{"id":"xxx","platform":"custom"}'
```

### List conversations

```bash
uv run --with websocket-client scripts/aion-session/session.py list
```

### Send a message

```bash
uv run --with websocket-client scripts/aion-session/session.py send --id 8f65f4b7 --message "Hello"
```

### Delete a conversation

```bash
uv run --with websocket-client scripts/aion-session/session.py delete --id 8f65f4b7
```

### Batch dispatch

```bash
uv run --with websocket-client scripts/aion-session/batch_dispatch.py --plan src/process/resources/skills/aionui-multi-session/assets/batch-plan.template.json --dry-run
uv run --with websocket-client scripts/aion-session/batch_dispatch.py --plan D:\work\parallel-plan.json --max-workers 4
```

## Options

### Global Options

- `--ws-url`: WebSocket URL, default `ws://localhost:25808/`
- `--timeout`: Timeout in seconds, default `30`
- `--session-token`: AionUI session JWT token
- `--csrf-token`: CSRF token

### Create Options

- `--name`: Conversation name, default `New Session`
- `--type`: Conversation type, `acp` or `aionrs`
- `--backend`: ACP backend, `claude`, `codex`, `gemini`, or `opencode`
- `--workspace`: Workspace path
- `--org-workspace-id`: optional org workspace id stored in `conversation.extra.workspace_id`
- `--org-project-id`: optional org project id stored in `conversation.extra.project_id`
- `--session-mode`: `default`, `bypassPermissions`, or `yolo`
- `--model`: Inline JSON for `aionrs`
- `--model-file`: Path to JSON file for `aionrs`

### Send Options

- `--id`: Conversation ID
- `--message`: Message content
- `--files-json`: Inline JSON array of files
- `--files-file`: Path to JSON file containing files

### Batch Plan

See `src/process/resources/skills/aionui-multi-session/references/plan-format.md` for the JSON schema used by `scripts/aion-session/batch_dispatch.py`.

## Output

All commands emit JSON to stdout. Errors are emitted to stderr as JSON with an `error` field.

## License

MIT
