# OpenAI Agents SDK (learned 2026-07-31)

Source: `https://developers.openai.com/api/docs/guides/agents` + `https://openai.github.io/openai-agents-python/`

## 🎯 KEY CONCEPT: 5 primitives

The Agents SDK is a small set of primitives that compose into complex workflows:

1. **Agents** — LLMs with `instructions`, `tools`, optional typed outputs
2. **Tools** — 3 categories (see below)
3. **Handoffs** — transfer control between agents (delegation pattern)
4. **Guardrails** — input/output validation, can short-circuit on violations
5. **Sessions** — SQLite/SQLAlchemy/Conversations API for state persistence

Plus built-in: **Tracing** (observability), **Runner** (drives the loop).

## 🛠️ Tools (3 categories)

### 1. Hosted tools (OpenAI infrastructure)
- `WebSearchTool` — up-to-date info from the internet
- `FileSearchTool` — search uploaded files
- `CodeInterpreterTool` — run Python in a sandbox
- `ImageGenerationTool` — generate/edit images
- `HostedMCPTool` — connect to remote MCP servers

### 2. Built-in execution tools
- `ComputerTool` — control computer UI (Computer Use)
- `ShellTool` — run shell commands in hosted containers
- `LocalShellTool` — run shell locally
- `ApplyPatchTool` — apply code patches
- `Skills` — reusable versioned bundles in hosted shell envs

### 3. Function tools (your code)
- Python: `@function_tool` decorator
- TypeScript: similar decorator
- Tool guardrails apply ONLY to these (not hosted tools or handoffs)

### NEW: Tool search (gpt-5.4+ only)
- Dynamically load relevant tool definitions into model context
- Saves tokens for large tool catalogs
- Configured at API request level via `tool_choice`

### NEW: Programmatic Tool Calling
- Models compose and run JavaScript that orchestrates tool calls
- Useful for complex multi-step workflows

## 🔄 Handoffs

Handoffs are represented as **tools to the LLM** (the agent sees them like any other tool).

```python
from agents import handoff
agent2_handoff = handoff(
    agent=agent2,
    input_filter=my_filter,  # optional: modify context
)
```

- **Ownership transfer**: when one agent hands off, it loses control
- **Full history** is passed to the new agent (unless `input_filter` modifies it)
- **Input guardrails** apply only to the FIRST agent in the chain
- **Output guardrails** apply only to the agent that produces the FINAL output
- Use **tool guardrails** for checks around every function call

### Orchestration patterns
- **Handoffs** — peer-to-peer, ownership transfer (best for distinct roles)
- **Manager pattern** — coordinator delegates, never loses control
- **Agents as tools** — agent A calls agent B as a tool (sub-task)

## 🛡️ Guardrails

3 types:

| Type | When | Applies to |
|---|---|---|
| **Input guardrail** | Before first agent receives user input | First agent only |
| **Output guardrail** | After agent produces output | Agent that produced final output |
| **Tool guardrail** | Before/after every function tool call | Function tools only (not hosted, not handoffs) |

**Tripwires**: raise to halt execution immediately. **Skip**: bypass the call. **Replace**: substitute output.

```python
@input_guardrail
async def safety_check(ctx, agent, input):
    result = await Runner.run(checker_agent, input)
    return GuardrailFunctionOutput(
        output_info=result.final_output,
        tripwire_triggered=result.final_output.is_unsafe,
    )
```

## 📦 Sandbox agents (new 2026)

Run agents inside real isolated workspaces with:
- Manifest-defined files
- Sandbox client choice (Docker, E2B, Modal, etc.)
- Resumable sandbox sessions
- Mount external storage (S3, R2, etc.)
- Snapshot + restore

Use case: coding agents, document processing, repo exploration.

## 🎨 Agent Builder (DEPRECATED! ⚠️)

**Agent Builder will shut down on 2026-11-30**. Migrate to Agents SDK code-first.

- Visual canvas for multi-agent workflows (drag/drop nodes)
- Templates
- Preview runs
- Inline eval configuration
- Versioning

**Replacement stack**:
- **Agents SDK** — code-first agent orchestration
- **ChatKit** — embeddable chat UI for agents
- **Connector Registry** — central data/tool connection management
- **Evals features** — agent performance evaluation

## 🧠 Sessions & state

- **SQLite** — local dev, single-process
- **SQLAlchemy** — production DBs
- **Conversations API** — OpenAI-hosted, multi-turn persistence
- **Resume** — pause a run, resume later (with handoffs, tools, state)

## 💡 For Examanet — Agentic patterns we could use

### 1. AI tutor agent (user-facing, future)
- Single agent with: web search (no, just our content), file search (corpus), function tools (search our DB, fetch PDF excerpts)
- Multi-turn conversation
- Guardrails: prevent off-topic, prevent hallucination
- Triggers: /api/agent/chat endpoint

### 2. Bulk extraction orchestrator
- **OCR agent** → generalSubject agent → keyPoints agent
- Handoff between specialists (each agent owns its task)
- Tool guardrails: validate response schema before returning
- Tracing: see where each step costs tokens
- Replace our current `regen_key_points.py` standalone script

### 3. Quality control agent
- Reviews AI extractions before DB write
- Uses function tools to query DB
- Output guardrail: reject if confidence low
- Could be added to `/api/ai/extract` route

### 4. Search ranking agent
- Rerank search results using reasoning model
- Tool: function to call our `searchV2`
- Guardrails: ensure no PII leakage in results

## 📚 Resources
- Python SDK: `https://openai.github.io/openai-agents-python/`
- TS SDK: `https://openai.github.io/openai-agents-js/` (mirror)
- Examples: `https://github.com/openai/openai-agents-python/tree/main/examples`
