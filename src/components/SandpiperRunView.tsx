import { useState } from 'react';
import { MOCK_SANDPIPER_RUNS, CONCEPTS } from '../lib/sandpiperMocks';
import type { MockSession } from '../lib/sandpiperMocks';
import { getSession } from '../lib/localSessions';
import type { LocalSession } from '../lib/localSessions';

interface Props {
  runId: string;
  onBack: () => void;
}

const SCORE_COLOR: Record<string, string> = {
  Strong: 'sp-tag sp-tag-done',
  Developing: 'sp-tag sp-tag-running',
  Beginning: 'sp-tag sp-tag-err',
};

const STATUS_COLOR: Record<string, string> = {
  DONE: 'sp-tag sp-tag-done',
  RUNNING: 'sp-tag sp-tag-running',
  ERRORED: 'sp-tag sp-tag-err',
  NOT_STARTED: 'sp-tag sp-tag-muted',
};

const STATUS_LABEL: Record<string, string> = {
  DONE: 'Annotated',
  RUNNING: 'In progress',
  ERRORED: 'Error',
  NOT_STARTED: 'Pending',
};

export function SandpiperRunView({ runId, onBack }: Props) {
  const localSession = getSession(runId);
  if (localSession) return <LocalSessionView session={localSession} onBack={onBack} />;

  const run = MOCK_SANDPIPER_RUNS.find((r) => r._id === runId);
  const [selected, setSelected] = useState<MockSession | null>(null);

  if (!run) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <p>Run not found.</p>
          <button className="link" onClick={onBack}>← Back</button>
        </div>
      </div>
    );
  }

  const done = run.sessions.filter((s) => s.status === 'DONE').length;
  const total = run.sessions.length;

  // Kappa-style agreement score (fake but plausible for complete runs)
  const kappa = run.isComplete ? '0.74' : null;

  // Concept coverage across annotated sessions
  const conceptCoverage = CONCEPTS.map((c) => {
    const annotated = run.sessions.filter((s) => s.annotations.length > 0);
    const present = annotated.filter((s) => s.annotations.find((a) => a.concept === c && a.present));
    return { concept: c, pct: annotated.length ? Math.round((present.length / annotated.length) * 100) : 0 };
  });

  return (
    <div className="sp-run-view">
      {/* Top bar */}
      <header className="bar">
        <button className="link" onClick={selected ? () => setSelected(null) : onBack}>
          ← {selected ? 'All sessions' : 'Back'}
        </button>
        <div className="sp-run-view-title">
          <span className="sp-lock">🔒</span>
          <strong>{run.name}</strong>
        </div>
        <span className={`tag ${run.isComplete ? 'sp-tag-done' : run.isRunning ? 'sp-tag-running' : 'sp-tag-muted'}`}>
          {run.isComplete ? 'Complete' : run.isRunning ? 'Running' : 'Pending'}
        </span>
      </header>

      <div className="sp-run-view-body">
        {!selected ? (
          <>
            {/* Overview row */}
            <div className="sp-overview-row">
              <div className="sp-stat">
                <span className="sp-stat-val">{done}/{total}</span>
                <span className="sp-stat-label">Sessions annotated</span>
              </div>
              {kappa && (
                <div className="sp-stat">
                  <span className="sp-stat-val">{kappa}</span>
                  <span className="sp-stat-label">Cohen's κ (inter-rater)</span>
                </div>
              )}
              <div className="sp-stat">
                <span className="sp-stat-val">
                  {run.sessions.filter((s) => s.overallScore === 'Strong').length}
                </span>
                <span className="sp-stat-label">Strong plans</span>
              </div>
              <div className="sp-stat">
                <span className="sp-stat-val">
                  {run.sessions.filter((s) => s.overallScore === 'Beginning').length}
                </span>
                <span className="sp-stat-label">Need support</span>
              </div>
            </div>

            {/* Concept coverage bar chart */}
            {done > 0 && (
              <div className="sp-coverage">
                <h3 className="sp-section-title">Crosscutting concept coverage</h3>
                <div className="sp-bars">
                  {conceptCoverage.map(({ concept, pct }) => (
                    <div key={concept} className="sp-bar-row">
                      <span className="sp-bar-label">{concept}</span>
                      <div className="sp-bar-track">
                        <div className="sp-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="sp-bar-pct">{pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Session list */}
            <div className="sp-sessions">
              <h3 className="sp-section-title">Sessions</h3>
              <ul className="sp-runs">
                {run.sessions.map((s) => (
                  <li
                    key={s.sessionId}
                    className={`sp-run sp-run-clickable`}
                    onClick={() => s.status !== 'NOT_STARTED' && s.planText && setSelected(s)}
                  >
                    <div className="sp-run-info">
                      <span className="sp-run-name">{s.studentName}</span>
                      <span className="sp-tag sp-tag-muted" style={{ fontWeight: 400 }}>{s.problem}</span>
                      {s.status === 'DONE' && (
                        <span className={SCORE_COLOR[s.overallScore]}>{s.overallScore}</span>
                      )}
                    </div>
                    <span className={STATUS_COLOR[s.status]}>{STATUS_LABEL[s.status]}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <SessionDetail session={selected} />
        )}
      </div>
    </div>
  );
}

function SessionDetail({ session }: { session: MockSession }) {
  return (
    <div className="sp-session-detail">
      <div className="sp-detail-header">
        <div>
          <h2 className="sp-detail-name">{session.studentName}</h2>
          <span className="muted" style={{ fontSize: 13 }}>{session.problem}</span>
        </div>
        <span className={SCORE_COLOR[session.overallScore]}>{session.overallScore}</span>
      </div>

      <div className="sp-detail-block">
        <h3 className="sp-section-title">Student plan</h3>
        <blockquote className="sp-plan-quote">{session.planText}</blockquote>
      </div>

      <div className="sp-detail-block">
        <h3 className="sp-section-title">Sandpiper summary</h3>
        <p className="sp-summary">{session.summary}</p>
      </div>

      <div className="sp-detail-block">
        <h3 className="sp-section-title">Crosscutting concept annotations</h3>
        <ul className="sp-annotations">
          {CONCEPTS.map((c) => {
            const ann = session.annotations.find((a) => a.concept === c);
            const present = ann?.present ?? false;
            return (
              <li key={c} className={`sp-annotation ${present ? 'sp-ann-yes' : 'sp-ann-no'}`}>
                <span className="sp-ann-icon">{present ? '✓' : '–'}</span>
                <div className="sp-ann-body">
                  <span className="sp-ann-concept">{c}</span>
                  {present && ann?.evidence && (
                    <span className="sp-ann-evidence">{ann.evidence}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ── Real local session view ────────────────────────────────────────────────────

function LocalSessionView({ session, onBack }: { session: LocalSession; onBack: () => void }) {
  const normalTurns = session.turns.filter((t) => t.kind === 'normal');
  const studentTurns = normalTurns.filter((t) => t.sender === 'Student');
  const tutorTurns = normalTurns.filter((t) => t.sender === 'Tutor');

  return (
    <div className="sp-run-view">
      <header className="bar">
        <button className="link" onClick={onBack}>← Back</button>
        <div className="sp-run-view-title">
          <span className="sp-lock">🔒</span>
          <strong>{session.problemTitle}</strong>
        </div>
        <span className="tag">{session.performStatus.replace(/_/g, ' ')}</span>
      </header>

      <div className="sp-run-view-body">
        {/* Stats */}
        <div className="sp-overview-row">
          <div className="sp-stat">
            <span className="sp-stat-val">{studentTurns.length}</span>
            <span className="sp-stat-label">Student messages</span>
          </div>
          <div className="sp-stat">
            <span className="sp-stat-val">{tutorTurns.length}</span>
            <span className="sp-stat-label">Tutor responses</span>
          </div>
          <div className="sp-stat">
            <span className="sp-stat-val">{new Date(session.savedAt).toLocaleDateString()}</span>
            <span className="sp-stat-label">Saved</span>
          </div>
        </div>

        {/* Plan */}
        {session.planText && (
          <div className="sp-detail-block">
            <h3 className="sp-section-title">Submitted plan</h3>
            <blockquote className="sp-plan-quote">{session.planText}</blockquote>
          </div>
        )}

        {/* Full transcript */}
        <div className="sp-detail-block">
          <h3 className="sp-section-title">Chat transcript</h3>
          <div className="sp-transcript">
            {normalTurns.map((t) => (
              <div key={t.id} className={`sp-turn sp-turn-${t.sender === 'Student' ? 'student' : 'tutor'}`}>
                <span className="sp-turn-role">{t.sender === 'Student' ? 'Student' : 'Tutor'}</span>
                <span className="sp-turn-text">{t.text}</span>
              </div>
            ))}
            {normalTurns.length === 0 && (
              <div className="muted" style={{ fontSize: 13 }}>No messages in this session.</div>
            )}
          </div>
        </div>

        {session.sandpiperRunId && (
          <div className="sp-detail-block">
            <h3 className="sp-section-title">Sandpiper</h3>
            <p className="sp-summary">
              Uploaded as run <code>{session.sandpiperRunId}</code>.{' '}
              <a
                href={`https://sandpiperresearch.org/projects/${session.sandpiperProjectId}/runs/${session.sandpiperRunId}`}
                target="_blank"
                rel="noreferrer"
                className="sp-link"
              >
                View evaluation ↗
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
