import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// Direct browser-side LLM adapter. Replaces the STEPS perform/message backend: instead of
// POSTing turns to steps-tutor-be, the harness keeps the conversation locally and calls
// OpenAI or Anthropic directly from the client. Provider is switchable via VITE_LLM_PROVIDER
// (default "anthropic").
//
// NOTE: this runs in the browser with the API key bundled into the client (dangerouslyAllow-
// Browser). That exposes the key, so this is intended for a local/internal demo only — not a
// production deployment.

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type LlmProvider = 'anthropic' | 'openai';

// import.meta.env is typed loosely here so arbitrary VITE_ vars resolve without vite/client.
const env = import.meta.env as Record<string, string | undefined>;

export const LLM_PROVIDER: LlmProvider =
  (env.VITE_LLM_PROVIDER?.toLowerCase() as LlmProvider) || 'anthropic';

const ANTHROPIC_MODEL = env.VITE_ANTHROPIC_MODEL || 'claude-opus-4-5';
const OPENAI_MODEL = env.VITE_OPENAI_MODEL || 'gpt-5.5';

const MAX_TOKENS = 1024;

// Human-readable label for the active provider/model (shown in the harness header).
export const LLM_LABEL =
  LLM_PROVIDER === 'openai' ? `OpenAI · ${OPENAI_MODEL}` : `Anthropic · ${ANTHROPIC_MODEL}`;

let anthropic: Anthropic | null = null;
let openai: OpenAI | null = null;

function getAnthropic(): Anthropic {
  if (!anthropic) {
    const apiKey = env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Missing VITE_ANTHROPIC_API_KEY in the environment (.env).');
    }
    anthropic = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  }
  return anthropic;
}

function getOpenAI(): OpenAI {
  if (!openai) {
    const apiKey = env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing VITE_OPENAI_API_KEY in the environment (.env).');
    }
    openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  }
  return openai;
}

export interface RunChatParams {
  /** System prompt (problem rubric + interactive UI grounding + log-handling rules). */
  system: string;
  /** Ordered conversation turns (no system role — that's passed separately). */
  messages: ChatMessage[];
}

// Send the conversation to the active provider and return the assistant's reply text.
export async function runChat({ system, messages }: RunChatParams): Promise<string> {
  if (LLM_PROVIDER === 'openai') {
    return runOpenAI(system, messages);
  }
  return runAnthropic(system, messages);
}

async function runAnthropic(system: string, messages: ChatMessage[]): Promise<string> {
  const client = getAnthropic();
  const resp = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });
  // Concatenate any text blocks in the response content.
  return resp.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('')
    .trim();
}

async function runOpenAI(system: string, messages: ChatMessage[]): Promise<string> {
  const client = getOpenAI();
  const resp = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: system },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });
  return resp.choices[0]?.message?.content?.trim() ?? '';
}
