import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatTurn, LlmChat } from '../../lib/useLlmChat';

interface Props {
  chat: LlmChat;
}

// Sidebar chat. Compose/optimistic flow with rendering driven by the classified turns from
// useLlmChat — normal turns are bubbles; log turns and (optionally) their tutor replies
// collapse to one-line "Student action…" / "Student action response" rows with an expand
// toggle.
export function Chat({ chat }: Props) {
  const { turns, ready, error, sendStudentMessage } = chat;
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, ready]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSend(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || !ready) return;
    setSending(true);
    setInput('');
    try {
      await sendStudentMessage(text);
    } catch {
      setInput(text); // restore so the student can retry (error shown by the hook)
    } finally {
      setSending(false);
    }
  }

  // Refocus the composer once the send finishes and the input is re-enabled.
  useEffect(() => {
    if (ready && !sending) inputRef.current?.focus();
  }, [sending, ready]);

  return (
    <section className="sb-section sb-chat">
      <h3 className="sb-title">Chat with tutor</h3>

      <div className="messages" ref={listRef}>
        {!ready && <div className="muted center">Starting session…</div>}
        {ready && turns.length === 0 && (
          <div className="muted center">
            No messages yet. Say hello to your tutor below.
          </div>
        )}
        {turns.map((t) =>
          t.kind === 'normal' ? (
            <NormalBubble key={t.id} turn={t} />
          ) : (
            <CollapsedTurn
              key={t.id}
              turn={t}
              open={expanded.has(t.id)}
              onToggle={() => toggle(t.id)}
            />
          ),
        )}
      </div>

      {error && <div className="error chat-error">{error}</div>}

      <form className="composer" onSubmit={onSend}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message the tutor…"
          disabled={!ready || sending}
        />
        <button type="submit" disabled={!ready || sending || !input.trim()}>
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </section>
  );
}

function NormalBubble({ turn }: { turn: ChatTurn }) {
  return (
    <div className={`row ${turn.sender === 'Student' ? 'right' : 'left'}`}>
      <div className={`bubble ${turn.pending ? 'pending' : ''}`}>{turn.text}</div>
    </div>
  );
}

function CollapsedTurn({
  turn,
  open,
  onToggle,
}: {
  turn: ChatTurn;
  open: boolean;
  onToggle: () => void;
}) {
  const label = turn.kind === 'log' ? 'Student action…' : 'Student action response';
  return (
    <div className="row left">
      <div className="log-turn">
        <button className="log-toggle" onClick={onToggle} aria-expanded={open}>
          <span className="log-caret">{open ? '▾' : '▸'}</span>
          <span className="log-label">{label}</span>
        </button>
        {open && <div className="log-body">{turn.text}</div>}
      </div>
    </div>
  );
}
