import { useState, type FormEvent } from 'react';
import { apiFetch } from '../../lib/api';
import planSuccessGif from '../../assets/plan-success.gif';

interface Props {
  performId: string | null;
}

// Plan section (SPEC §7.2). Textarea + Submit → POST planning-submissions with the typed
// text only (the snapshot-coupling question resolved to typed-text-only, SPEC §12). Text is
// kept after submit so the student can revise.
export function PlanForm({ performId }: Props) {
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
          {result && !result.ok && (
            <span className="plan-err">{result.msg}</span>
          )}
        </div>
      </form>
      {result?.ok && (
        <div className="plan-success">
          {[0, 1, 2].map((i) => (
            <div key={i} className="plan-success-item" style={{ animationDelay: `${i * 0.15}s` }}
              onAnimationEnd={i === 2 ? () => setResult(null) : undefined}>
              <img src={planSuccessGif} alt="" className="plan-success-gif" />
              <span className="plan-success-label">Great!</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
