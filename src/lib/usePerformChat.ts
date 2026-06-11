import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from './api';
import type {
  HarnessLog,
  Message,
  Perform,
  Problem,
  SendMessageResponse,
} from './types';
import type { InteractiveContext } from '../interactives/registry';

// Sentinel prefixes let the harness recognise its own out-of-band turns on history reload
// (SPEC §8.1 / §8.2). They ride in the `message` text since the backend has no system channel.
const META_SENTINEL = '⟦meta-prompt⟧';
const LOG_SENTINEL = '⟦interactive-log⟧';

// Setting (tweakable): when true, the tutor's reply to the silent meta-prompt IS shown in the
// chat as a normal tutor bubble (the meta-prompt message itself stays hidden either way).
// Shown by default — we may tweak this (SPEC §8.1).
const SHOW_META_PROMPT_RESPONSE = true;

// Setting (tweakable): when true, the tutor's reply to a forwarded log turn is shown in full
// as a normal tutor bubble; when false it collapses to a one-line "Student action response"
// row with an expand toggle. Shown by default (SPEC §8.2). The log turn itself (the raw
// forwarded JSON) always stays collapsed as "Student action…".
const SHOW_LOG_MESSAGE_RESPONSE = true;

// TEMPORARY debug setting: when true, forward EVERY log message to the tutor as raw JSON,
// bypassing the per-interactive allowlist — except any log whose action contains "mouse"
// (mousemove/mousedown/… spam is always dropped). Set false to restore allowlist-only
// forwarding (SPEC §8.2).
const FORWARD_ALL_LOGS = true;

// Appended to every meta-prompt so the tutor knows how to treat the log turns (SPEC §8.1).
const LOG_HANDLING_INSTRUCTION = `IMPORTANT — during this session you will periodically receive
messages that begin with "${LOG_SENTINEL}". Those are NOT messages from the student: they are
observed actions the student took in the interactive simulation, relayed automatically. Treat
them as context to acknowledge and track silently. Do not grade them, do not treat them as the
student's plan or answer, and do not advance the activity/phase based on them. Respond to them
only briefly (or not at all); wait for the student's own typed messages to drive the tutoring.`;

export type TurnKind = 'normal' | 'log' | 'log-reply';

export interface ChatTurn {
  id: string;
  kind: TurnKind;
  sender: 'Student' | 'Tutor';
  /** Display text (sentinel stripped for log turns). */
  text: string;
  sequenceStep: string | null;
  pending?: boolean;
}

interface Params {
  courseId: string;
  problem: Problem;
  context: InteractiveContext;
}

export interface PerformChat {
  performId: string | null;
  status: string;
  ready: boolean;
  error: string | null;
  turns: ChatTurn[];
  sendStudentMessage: (text: string) => Promise<void>;
  forwardLog: (log: HarnessLog) => void;
}

// Classify the raw server messages into renderable turns (SPEC §7.3). Pairing is positional
// and reliable because the serial send queue (§8.3) guarantees each out-of-band turn is
// immediately followed by its tutor reply. The meta-prompt message is always hidden; its
// tutor reply is shown or hidden per SHOW_META_PROMPT_RESPONSE.
function classify(messages: Message[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let prev: TurnKind | 'meta' | 'none' = 'none';

  for (const m of messages) {
    const isStudent = m.sender === 'Student';
    let kind: TurnKind | 'meta';
    if (isStudent && m.message.startsWith(META_SENTINEL)) kind = 'meta';
    else if (isStudent && m.message.startsWith(LOG_SENTINEL)) kind = 'log';
    else if (!isStudent && prev === 'meta')
      // Tutor's reply to the meta-prompt: show it (as a normal bubble) or hide it.
      kind = SHOW_META_PROMPT_RESPONSE ? 'normal' : 'meta';
    else if (!isStudent && prev === 'log')
      // Tutor's reply to a log turn: show it in full (normal bubble) or collapse it.
      kind = SHOW_LOG_MESSAGE_RESPONSE ? 'normal' : 'log-reply';
    else kind = 'normal';

    prev = kind;
    if (kind === 'meta') continue; // the meta-prompt (and, if disabled, its reply) is hidden

    turns.push({
      id: m.id,
      kind,
      sender: m.sender,
      text:
        kind === 'log'
          ? m.message.slice(LOG_SENTINEL.length).trim()
          : m.message,
      sequenceStep: m.sequenceStep,
    });
  }
  return turns;
}

export function usePerformChat({
  courseId,
  problem,
  context,
}: Params): PerformChat {
  const [performId, setPerformId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>(problem.latestPerform?.status ?? '');
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<{ id: string; text: string }[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve once even under StrictMode's double-mount.
  const startedRef = useRef(false);
  const mountedRef = useRef(true);
  const performIdRef = useRef<string | null>(null);

  // --- Serial send queue (SPEC §8.3): one request in flight at a time -------------
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  function enqueue(task: () => Promise<void>): Promise<void> {
    const run = queueRef.current.then(task, task);
    queueRef.current = run.catch(() => undefined); // keep the chain alive past failures
    return run;
  }

  // --- Log forwarding buffer (SPEC §8.2) -----------------------------------------
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
      let pid = problem.latestPerform?.id ?? null;
      if (!pid) pid = await resolveNewPerform();
      if (!pid) throw new Error('Could not start a session for this problem.');
      if (!mountedRef.current) return;
      performIdRef.current = pid;
      setPerformId(pid);
      const loaded = await loadMessages(pid);
      // Send the silent meta-prompt only on a fresh perform — i.e. when the chat has no
      // existing messages. Resuming a perform that already has history does not re-send it
      // (SPEC §8.1).
      if (loaded.length === 0) void sendMetaPrompt(pid);
    } catch (e) {
      if (mountedRef.current) setError((e as Error).message);
    } finally {
      if (mountedRef.current) setReady(true);
    }
  }

  // Create a perform; recover its id if one already exists (stale latestPerform / race).
  async function resolveNewPerform(): Promise<string | null> {
    try {
      const created = await apiFetch<Perform>(
        `/performs/${courseId}/${problem.id}`,
        { method: 'POST', body: {} },
      );
      if (created?.id) {
        if (mountedRef.current) setStatus(created.status);
        return created.id;
      }
    } catch {
      // Fall through to recovery (e.g. "Perform already exists for this student").
    }
    const data = await apiFetch<Problem[]>(
      `/problems/by-course/${courseId}?limit=100`,
    );
    const fresh = data.find((p) => p.id === problem.id);
    if (fresh?.latestPerform && mountedRef.current) {
      setStatus(fresh.latestPerform.status);
    }
    return fresh?.latestPerform?.id ?? null;
  }

  async function loadMessages(pid: string): Promise<Message[]> {
    const data = await apiFetch<Message[]>(
      `/performs/${pid}/messages?sortOrder=ASC&limit=200`,
    );
    if (mountedRef.current) {
      setMessages(data);
      const last = data[data.length - 1];
      if (last?.performStatus) setStatus(last.performStatus);
    }
    return data;
  }

  // POST a message through the serial queue, then reload to pull persisted ids + tutor reply.
  function postThroughQueue(text: string): Promise<void> {
    return enqueue(async () => {
      const pid = performIdRef.current;
      if (!pid) return;
      const resp = await apiFetch<SendMessageResponse>(
        `/performs/${pid}/messages`,
        { method: 'POST', body: { message: text } },
      );
      if (mountedRef.current) setStatus(resp.status);
      await loadMessages(pid);
    });
  }

  function sendMetaPrompt(pid: string): Promise<void> {
    performIdRef.current = pid;
    const text = `${META_SENTINEL} ${context.metaPrompt}\n\n${LOG_HANDLING_INSTRUCTION}`;
    return postThroughQueue(text);
  }

  async function sendStudentMessage(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || !performIdRef.current) return;
    const pendingId = `pending-${Date.now()}-${pending.length}`;
    setError(null);
    setPending((p) => [...p, { id: pendingId, text: trimmed }]);
    try {
      await postThroughQueue(trimmed);
      if (mountedRef.current) {
        setPending((p) => p.filter((x) => x.id !== pendingId));
      }
    } catch (e) {
      if (mountedRef.current) {
        setPending((p) => p.filter((x) => x.id !== pendingId));
        setError((e as Error).message);
      }
      throw e;
    }
  }

  // --- Forward an interactive log to the tutor (SPEC §8.2) ------------------------
  function flushBuffer() {
    flushScheduledRef.current = false;
    const lines = bufferRef.current;
    bufferRef.current = [];
    if (lines.length === 0 || !performIdRef.current) return;
    const framing =
      'Observed simulation activity (not a student message — acknowledge/track ' +
      'silently, do not treat as plan input or advance the activity on it):';
    const text = `${LOG_SENTINEL} ${framing}\n${lines.map((l) => `- ${l}`).join('\n')}`;
    // Forwarding continues regardless of perform status (SPEC §8.2); a failed send for a
    // completed perform is non-fatal, so don't surface it on the student-facing error line.
    void postThroughQueue(text).catch((e) =>
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
    // Coalesce logs that arrive in the same tick into one turn, then send (no tunable
    // batch-flush interval — SPEC §12).
    if (!flushScheduledRef.current) {
      flushScheduledRef.current = true;
      setTimeout(flushBuffer, 0);
    }
  }

  const turns = useMemo<ChatTurn[]>(() => {
    const base = classify(messages);
    const pendingTurns: ChatTurn[] = pending.map((p) => ({
      id: p.id,
      kind: 'normal',
      sender: 'Student',
      text: p.text,
      sequenceStep: null,
      pending: true,
    }));
    return [...base, ...pendingTurns];
  }, [messages, pending]);

  return {
    performId,
    status,
    ready,
    error,
    turns,
    sendStudentMessage,
    forwardLog,
  };
}
