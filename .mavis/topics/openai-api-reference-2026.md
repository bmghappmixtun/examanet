# OpenAI API Reference (learned 2026-07-31)

Source: `https://developers.openai.com/api/reference/overview` + `llms-full.txt`

## KEY CHANGE: Responses API is the new standard

OpenAI has 3 generations of generation endpoints:
1. POST /v1/completions — DEPRECATED
2. POST /v1/chat/completions — Supported indefinitely, but legacy for new projects
3. POST /v1/responses — NEW RECOMMENDED for all new projects (since 2025)

For Examanet: We use chat/completions for Technologie pipeline. Migrate to responses for:
- Simpler request shape
- Built-in tools (web search, file search, computer use, code interpreter, MCP)
- Server-side state management
- Reasoning state preserved across turns (5% better on TAUBench)
- Polymorphic output items

## Main Endpoints

### Responses API — POST /v1/responses
| Param | Type | Notes |
|---|---|---|
| model | string | e.g. gpt-5.5, gpt-4o-mini |
| input | string or array | Text or items |
| instructions | string | System instructions |
| text | object | Output config (replaces response_format) |
| tools | array | web_search, file_search, code_interpreter, computer_use, mcp + custom |
| tool_choice | string or object | auto, required, none, or specific function |
| parallel_tool_calls | bool | Default true |
| temperature | number 0-2 | Default 1 |
| max_output_tokens | integer | Cap on output |
| top_p | number | Nucleus sampling |
| frequency_penalty | number -2 to 2 | |
| presence_penalty | number -2 to 2 | |
| reasoning | object | { effort: low/medium/high } for reasoning models |
| metadata | object | Custom key-value tracking |
| stream | bool | SSE streaming |
| store | bool | Store server-side for previous_response_id chaining |
| background | bool | Run async, returns task |
| conversation | object | Group responses into a conversation |
| modalities | array | [text] or [text, audio] |
| prediction | object | Speculative decoding, lower latency |
| safety_identifier | string | User-level safety ID |
| prompt_cache_key | string | Manual cache key (forces same cache bucket) |
| service_tier | string | auto, default, flex, priority |
| verbosity | string | low, medium, high (new in 2026) |
| webhook | object | Webhook callback config |

Response methods:
- POST /v1/responses — Create
- GET /v1/responses/{id} — Retrieve
- DELETE /v1/responses/{id} — Delete
- POST /v1/responses/{id}/cancel — Cancel (only background: true)
- POST /v1/responses/{id}/compact — Compact (new 2026)
- GET /v1/responses/{id}/input_items — List input items
- GET /v1/responses/{id}/input_tokens — Count input tokens (cost estimation)

### Other Endpoints
- POST /v1/chat/completions — Legacy chat (use response_format)
- POST /v1/embeddings — Text to vector (RAG/search)
- POST /v1/images/generations, /v1/images/edits, /v1/images/variations
- POST /v1/audio/speech (TTS), /v1/audio/transcriptions (STT), /v1/audio/translations
- POST /v1/voices — Custom voice
- POST /v1/files, GET /v1/files — File management (batch, fine-tune)
- POST /v1/batches — Batch API (50% off, 24h)
- POST /v1/fine_tuning/jobs — Fine-tuning
- POST /v1/assistants/{id} — DEPRECATED sunset 2026-08-26 (migrate to Responses)

## Structured Outputs (critical for our extraction)

Chat Completions:
```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {"name": "...", "schema": {...}, "strict": true}
  }
}
```

Responses API:
```json
{
  "text": {
    "format": {
      "type": "json_schema",
      "name": "...",
      "schema": {...},
      "strict": true
    }
  }
}
```

- Strict mode = guaranteed schema adherence (no validation, no retries)
- Supported on gpt-4o-mini, gpt-4o-2024-08-06+, all GPT-5 models
- refusal field is programmatically detectable (safety refusals)
- Available on: Responses, Chat, Assistants, Fine-tuning, Batch

## Service Tiers (2026)

| Tier | Latency | Cost | Use case |
|---|---|---|---|
| auto | default | default | Default |
| default | standard | standard | Production |
| flex | slower (off-peak) | -50% | Background, retries, evals |
| priority | faster | +2-3x | Real-time user-facing |

## Auth

```
Authorization: Bearer $OPENAI_API_KEY
OpenAI-Organization: org_...  # optional
OpenAI-Project: proj_...  # optional (per-project keys)
```

## Error Codes

- 400 Bad Request
- 401 Invalid API key
- 403 Permission denied
- 404 Model or resource not found
- 429 Rate limited (RPM, TPM, or insufficient_quota)
- 500 Server error
- 503 Service unavailable

insufficient_quota silent failure (learned 2026-07-29): billing < $0 returns 429 with misleading message. Always log meta=... to capture real reason.

## Examanet-specific notes

1. Migrate to Responses API: better caching, tools, state, lower cost. Need to refactor openai SDK calls and test extraction pipelines.
2. Use prompt_cache_key for OCR content shared across multiple generation calls (regen_key_points.py, gen_general_subject.py). 90% input cost reduction.
3. Use Batch API for backfills (451-file Technologie, keyPoints regen). 50% off, 24h turnaround.
4. Use flex tier for non-urgent extraction. 50% off.
5. Use priority tier for user-facing chat or search ranking. Lower latency.
6. Use previous_response_id for multi-turn (interactive AI tutor agent).
7. verbosity: low for short extraction outputs (saves tokens).
8. prediction for known schemas (same JSON shape) — speculative decoding.
