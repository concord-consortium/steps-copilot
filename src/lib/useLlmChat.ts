import { useEffect, useMemo, useRef, useState } from 'react';
import type { HarnessLog } from './types';
import type { InteractiveContext } from '../interactives/registry';
import { runChat, type ChatMessage, type ChatRole } from './llm';
import { PROBLEM_SYSTEM_PROMPT } from '../problem';

// Local conversation hook. Replaces usePerformChat: instead of POSTing every turn to the
// STEPS perform/message backend, it keeps the conversation in memory and calls OpenAI/
// Anthropic directly (src/lib/llm.ts). The system prompt is the hardcoded problem rubric +
// the active interactive's UI grounding + the log-handling rules below.

// Setting (tweakable): when true, the tutor's reply to a forwarded log turn renders as a
// normal full bubble; when false it collapses to a one-line "Student action response" row
// with an expand toggle. The log turn itself always stays collapsed as "Student action…".
const SHOW_LOG_MESSAGE_RESPONSE = true;

// TEMPORARY debug setting: when true, forward EVERY log to the tutor as raw JSON, bypassing
// the per-interactive allowlist — except any action containing "mouse" (move/down spam is
// always dropped). Set false to restore allowlist-only forwarding.
const FORWARD_ALL_LOGS = true;

// Folded into the system prompt so the tutor knows how to treat the forwarded log turns.
const LOG_HANDLING_INSTRUCTION = `IMPORTANT — during this session you will periodically receive
messages describing observed actions the student took in the interactive simulation, relayed
automatically (they are prefixed with "Observed simulation activity"). Those are NOT messages
typed by the student. Treat them as context to acknowledge and track silently. Do not grade
them, do not treat them as the student's plan or answer, and respond to them only briefly (or
not at all); wait for the student's own typed messages to drive the tutoring.`;

// Hidden first user turn that elicits the tutor's opening greeting (the interactive's UI
// grounding asks for an encouraging opener). Not shown to the student.
const KICKOFF = `The student has just opened the simulation alongside this chat and has not
said anything yet. Write your opening message: greet them and encourage them to start playing
with the simulation controls as they develop their plan.`;

export type TurnKind = 'normal' | 'log' | 'log-reply';

export interface ChatTurn {
  id: string;
  kind: TurnKind;
  sender: 'Student' | 'Tutor';
  /** Display text (full forwarded text for log turns; revealed when expanded). */
  text: string;
  pending?: boolean;
}

// A committed conversation entry. `display: false` entries (e.g. the kickoff) are sent to the
// model for context but never rendered.
interface CommittedTurn {
  id: string;
  role: ChatRole;
  kind: TurnKind;
  text: string;
  display: boolean;
}

interface Params {
  context: InteractiveContext;
}

export interface LlmChat {
  ready: boolean;
  error: string | null;
  turns: ChatTurn[];
  sendStudentMessage: (text: string) => Promise<void>;
  forwardLog: (log: HarnessLog) => void;
}

let idCounter = 0;
const nextId = () => `t-${Date.now()}-${idCounter++}`;

export function useLlmChat({ context }: Params): LlmChat {
  const [committed, setCommitted] = useState<CommittedTurn[]>([]);
  const committedRef = useRef<CommittedTurn[]>([]);
  const [pending, setPending] = useState<{ id: string; text: string }[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve once even under StrictMode's double-mount.
  const startedRef = useRef(false);
  const mountedRef = useRef(true);

  const system = useMemo(
    () => `${PROBLEM_SYSTEM_PROMPT}\n\n${context.metaPrompt}\n\n${LOG_HANDLING_INSTRUCTION}`,
    [context],
  );

  function commit(next: CommittedTurn[]) {
    committedRef.current = next;
    if (mountedRef.current) setCommitted(next);
  }

  // The conversation as the provider sees it (system prompt is passed separately).
  function apiMessages(): ChatMessage[] {
    return committedRef.current.map((t) => ({ role: t.role, content: t.text }));
  }

  // --- Serial send queue: one provider request in flight at a time -----------------
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  function enqueue(task: () => Promise<void>): Promise<void> {
    const run = queueRef.current.then(task, task);
    queueRef.current = run.catch(() => undefined); // keep the chain alive past failures
    return run;
  }

  // --- Log forwarding buffer -------------------------------------------------------
  const bufferRef = useRef<string[]>([]);
  const flushScheduledRef = useRef(false);
  const lastSentRef = useRef<Record<string, number>>({});

  useEffect(() => {
    mountedRef.current = true;
    if (!startedRef.current) {
      startedRef.current = true;
      void init();
    }
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    try {
      await enqueue(async () => {
        const reply = await runChat({ system, messages: [{ role: 'user', content: KICKOFF }] });
        commit([
          ...committedRef.current,
          { id: nextId(), role: 'user', kind: 'normal', text: KICKOFF, display: false },
          { id: nextId(), role: 'assistant', kind: 'normal', text: reply, display: true },
        ]);
      });
    } catch (e) {
      if (mountedRef.current) setError((e as Error).message);
    } finally {
      if (mountedRef.current) setReady(true);
    }
  }

  async function sendStudentMessage(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    const pendingId = nextId();
    setError(null);
    if (mountedRef.current) setPending((p) => [...p, { id: pendingId, text: trimmed }]);
    try {
      await enqueue(async () => {
        const messages = [...apiMessages(), { role: 'user' as ChatRole, content: trimmed }];
        const reply = await runChat({ system, messages });
        commit([
          ...committedRef.current,
          { id: nextId(), role: 'user', kind: 'normal', text: trimmed, display: true },
          { id: nextId(), role: 'assistant', kind: 'normal', text: reply, display: true },
        ]);
      });
      if (mountedRef.current) setPending((p) => p.filter((x) => x.id !== pendingId));
    } catch (e) {
      if (mountedRef.current) {
        setPending((p) => p.filter((x) => x.id !== pendingId));
        setError((e as Error).message);
      }
      throw e;
    }
  }

  // --- Forward an interactive log to the tutor -------------------------------------
  function flushBuffer() {
    flushScheduledRef.current = false;
    const lines = bufferRef.current;
    bufferRef.current = [];
    if (lines.length === 0) return;
    const framing =
      'Observed simulation activity (not a student message — acknowledge/track silently, ' +
      'do not treat as plan input):';
    const text = `${framing}\n${lines.map((l) => `- ${l}`).join('\n')}`;
    void enqueue(async () => {
      const messages = [...apiMessages(), { role: 'user' as ChatRole, content: text }];
      const reply = await runChat({ system, messages });
      commit([
        ...committedRef.current,
        { id: nextId(), role: 'user', kind: 'log', text, display: true },
        {
          id: nextId(),
          role: 'assistant',
          kind: SHOW_LOG_MESSAGE_RESPONSE ? 'normal' : 'log-reply',
          text: reply,
          display: true,
        },
      ]);
    }).catch((e) =>
      console.warn('[steps-copilot] log forward failed:', (e as Error).message),
    );
  }

  function forwardLog(log: HarnessLog) {
    let line: string;
    if (FORWARD_ALL_LOGS) {
      // Debug mode: forward everything as raw JSON, except mouse-move/-button spam.
      if ((log.action ?? '').toLowerCase().includes('mouse')) return;
      line = JSON.stringify(log);
    } else {
      const spec = context.logMessages.find((s) => s.action === log.action);
      if (!spec) return; // not allowlisted → drop (keeps the tutor's context clean)

      if (spec.debounceMs) {
        const now = Date.now();
        const last = lastSentRef.current[log.action] ?? 0;
        if (now - last < spec.debounceMs) return;
        lastSentRef.current[log.action] = now;
      }
      line = spec.summarize ? spec.summarize(log) : JSON.stringify(log);
    }

    bufferRef.current.push(line);
    // Coalesce logs that arrive in the same tick into one turn, then send.
    if (!flushScheduledRef.current) {
      flushScheduledRef.current = true;
      setTimeout(flushBuffer, 0);
    }
  }

  const turns = useMemo<ChatTurn[]>(() => {
    const base: ChatTurn[] = committed
      .filter((t) => t.display)
      .map((t) => ({
        id: t.id,
        kind: t.kind,
        sender: t.role === 'user' ? 'Student' : 'Tutor',
        text: t.text,
      }));
    const pendingTurns: ChatTurn[] = pending.map((p) => ({
      id: p.id,
      kind: 'normal',
      sender: 'Student',
      text: p.text,
      pending: true,
    }));
    return [...base, ...pendingTurns];
  }, [committed, pending]);

  return { ready, error, turns, sendStudentMessage, forwardLog };
}
