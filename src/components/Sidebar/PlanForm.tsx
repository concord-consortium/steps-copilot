import { useState, type FormEvent } from 'react';
import { apiFetch } from '../../lib/api';

interface Props {
  performId: string | null;
  onPlanSubmitted?: (text: string) => void;
}

// Plan section (SPEC §7.2). Textarea + Submit → POST planning-submissions with the typed
// text only (the snapshot-coupling question resolved to typed-text-only, SPEC §12). Text is
// kept after submit so the student can revise.
export function PlanForm({ performId, onPlanSubmitted }: Props) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!performId || !text.trim() || submitting) return;
    setSubmitting(true);
    setResult(null);
    try {
      await apiFetch(`/performs/${performId}/planning-submissions`, {
        method: 'POST',
        body: { submissionText: text.trim() },
      });
      onPlanSubmitted?.(text.trim());
      setResult({ ok: true, msg: 'Plan submitted.' });
    } catch (e) {
      setResult({ ok: false, msg: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="sb-section sb-plan">
      <h3 className="sb-title">Plan</h3>
      <form onSubmit={onSubmit}>
        <textarea
          className="plan-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe your plan…"
          rows={3}
          disabled={!performId || submitting}
        />
        <div className="plan-row">
          <button type="submit" disabled={!performId || submitting || !text.trim()}>
            {submitting ? 'Submitting…' : 'Submit plan'}
          </button>
          {result && (
            <span className={result.ok ? 'plan-ok' : 'plan-err'}>{result.msg}</span>
          )}
        </div>
      </form>
    </section>
  );
}
