# STEPS Copilot

A single-page app that hosts a Concord Consortium interactive (e.g. **Wildfire
Explorer**) in an iframe and pairs it with an AI tutor sidebar. As the student
works in the simulation, the harness captures the interactive's log messages and
feeds them to the tutor so it can "see" what the student is doing.

This branch (`anthropic-be`) talks **directly to OpenAI or Anthropic** from the
browser and drives the tutor from a hardcoded problem prompt — there is no STEPS
backend, login, or course/problem picker. It boots straight into the harness.

## How it works

```
App.tsx ──> resolveInteractive(?interactive=, default "wildfire-explorer")
        └─> Harness
              ├─ IframeRuntime (the interactive)  ──log events──┐
              ├─ useLlmChat  ──messages[]──> llm.ts ──> Anthropic / OpenAI
              └─ Chat (sidebar)                                  │
                                                                 v
                                            forwarded as "observed activity" turns
```

- **`src/lib/llm.ts`** — provider adapter. `runChat({ system, messages })` switches
  on `VITE_LLM_PROVIDER` and calls Anthropic (`messages.create`) or OpenAI
  (`chat.completions.create`) in the browser via `dangerouslyAllowBrowser`.
- **`src/lib/useLlmChat.ts`** — keeps the conversation in memory and calls the
  provider each turn through a serial send queue. Seeds an opening tutor message,
  forwards interactive logs as observed-activity turns, and classifies turns for
  the collapsed-log chat UI.
- **`src/problem.ts`** — the hardcoded "problem": the tutor/evaluator system prompt.
- **`src/interactives/wildfire-explorer.ts`** — the interactive's UI grounding
  (meta-prompt) and the log-message allowlist.

The system prompt sent to the model is: the problem rubric + the interactive's UI
grounding + log-handling rules.

## Setup

Requires Node 18+.

```bash
npm install
cp .env.example .env   # then fill in your key
npm run dev
```

Open the dev server URL. The harness defaults to `wildfire-explorer`; host a
different registered interactive with `?interactive=<key>`.

## Configuration (`.env`)

| Variable | Purpose | Default |
|---|---|---|
| `VITE_LLM_PROVIDER` | `anthropic` or `openai` | `anthropic` |
| `VITE_ANTHROPIC_API_KEY` | Anthropic API key | — |
| `VITE_ANTHROPIC_MODEL` | Anthropic model id | `claude-opus-4-5` |
| `VITE_OPENAI_API_KEY` | OpenAI API key | — |
| `VITE_OPENAI_MODEL` | OpenAI model id | `gpt-5.5` |

To switch providers, set `VITE_LLM_PROVIDER` and provide the matching key.

## Security

This is a **browser-direct** integration: the selected provider's API key is
bundled into the client at build time. That is fine for local/internal demos, but
**do not deploy this publicly with a real key** — anyone could read it from the
shipped bundle. `.env` is gitignored so keys are never committed; rotate any key
that has been shared. For production, put the provider call behind a small backend
proxy that holds the key server-side.

## Adding an interactive

Register it in `src/interactives/registry.ts` with a runnable `url` and a context
object (name, description, meta-prompt, and a `logMessages` allowlist), then load
it with `?interactive=<key>`.
