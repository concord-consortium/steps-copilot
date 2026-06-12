import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { Course, CourseListItem, Problem } from '../lib/types';
import {
  getSessions,
  uploadToSandpiper,
  updateSession,
  downloadSessionsAsCSV,
  openSandpiperUploadPage,
  checkSandpiperAuth,
} from '../lib/localSessions';
import type { LocalSession } from '../lib/localSessions';

// Point at the live Sandpiper instance. Override via VITE_SANDPIPER_URL if needed.
const SANDPIPER_URL =
  (import.meta.env.VITE_SANDPIPER_URL as string | undefined) ??
  'https://sandpiperresearch.org';
const SANDPIPER_PROJECT =
  (import.meta.env.VITE_SANDPIPER_PROJECT_ID as string | undefined) ?? '';


interface Props {
  onSignOut: () => void;
  onPick: (courseId: string, problem: Problem) => void;
  onViewSandpiperRun: (runId: string) => void;
}

// Course + problem selector (SPEC §4.2), lifted from poc with one behavioral change: if
// there is exactly one course, auto-select it and skip the course accordion — jump straight
// to its problem list.
export function Picker({ onSignOut, onPick, onViewSandpiperRun }: Props) {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [openCourse, setOpenCourse] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, Problem[]>>({});
  const [loadingProblems, setLoadingProblems] = useState(false);

  useEffect(() => {
    apiFetch<CourseListItem[]>('/courses?limit=100')
      .then((data) => {
        const list = data.map((d) => d.course);
        setCourses(list);
        // Single-course auto-select: open it immediately and load its problems.
        if (list.length === 1) void openAndLoad(list[0].id);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openAndLoad(courseId: string) {
    setOpenCourse(courseId);
    if (!problems[courseId]) {
      setLoadingProblems(true);
      try {
        const data = await apiFetch<Problem[]>(
          `/problems/by-course/${courseId}?limit=100`,
        );
        setProblems((p) => ({ ...p, [courseId]: data }));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingProblems(false);
      }
    }
  }

  async function toggleCourse(courseId: string) {
    if (openCourse === courseId) {
      setOpenCourse(null);
      return;
    }
    await openAndLoad(courseId);
  }

  const singleCourse = courses?.length === 1;

  return (
    <div className="picker">
      <header className="bar">
        <strong>{singleCourse ? courses![0].name : 'Your courses'}</strong>
        <button className="link" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      <div className="picker-body">
        {error && <div className="error">{error}</div>}
        {!courses && !error && <div className="muted">Loading courses…</div>}
        {courses && courses.length === 0 && (
          <div className="muted">
            No courses found for this account. The harness requires a STUDENT login with at
            least one course and assigned problem.
          </div>
        )}

        {/* Single course: render its problems directly, no accordion. */}
        {singleCourse && (
          <ProblemList
            problems={problems[courses![0].id]}
            loading={loadingProblems}
            onPick={(p) => onPick(courses![0].id, p)}
          />
        )}

        {/* Internal section: Sandpiper past runs. */}
        <SandpiperSection onViewRun={onViewSandpiperRun} />

        {/* Multiple courses: the existing accordion picker. */}
        {courses &&
          courses.length > 1 &&
          courses.map((c) => (
            <div key={c.id} className="course">
              <button className="course-head" onClick={() => toggleCourse(c.id)}>
                <span>{openCourse === c.id ? '▾' : '▸'}</span> {c.name}
              </button>
              {openCourse === c.id && (
                <div className="problems">
                  <ProblemList
                    problems={problems[c.id]}
                    loading={loadingProblems}
                    onPick={(p) => onPick(c.id, p)}
                  />
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}


// Auth states for Sandpiper connection
type AuthState = 'unknown' | 'checking' | 'logged-in' | 'logged-out';

function SandpiperSection({ onViewRun }: { onViewRun: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [localSessions, setLocalSessions] = useState<LocalSession[]>([]);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadError, setUploadError] = useState<Record<string, string>>({});
  const [authState, setAuthState] = useState<AuthState>('unknown');
  // After download-and-open: show a "check results" nudge
  const [sentSession, setSentSession] = useState<string | null>(null);

  function refresh() {
    setLocalSessions(getSessions());
  }

  function toggle() {
    if (!open) {
      refresh();
      // Lazily check auth state when the section is first opened
      if (authState === 'unknown') void checkAuth();
    }
    setOpen((v) => !v);
  }

  async function checkAuth() {
    setAuthState('checking');
    const ok = await checkSandpiperAuth(SANDPIPER_URL);
    setAuthState(ok ? 'logged-in' : 'logged-out');
  }

  // Open Sandpiper login page in a popup; when it closes re-check auth
  function openLoginPopup() {
    const popup = window.open(
      `${SANDPIPER_URL}/signup`,
      'sandpiper-login',
      'width=700,height=750,left=200,top=80',
    );
    if (!popup) {
      window.open(`${SANDPIPER_URL}/signup`, '_blank');
      return;
    }
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        void checkAuth();
      }
    }, 800);
  }

  // "Send to Sandpiper": download CSV + open upload page in a new tab.
  // Works without CORS because the user uploads from within their own Sandpiper session.
  async function sendToSandpiper(session: LocalSession) {
    if (!SANDPIPER_PROJECT) {
      setUploadError((e) => ({ ...e, [session.id]: 'Set VITE_SANDPIPER_PROJECT_ID to upload.' }));
      return;
    }
    setUploading((u) => ({ ...u, [session.id]: true }));
    setUploadError((e) => ({ ...e, [session.id]: '' }));

    try {
      // First try the direct API (works if CORS is configured server-side)
      const uploadUrl = await uploadToSandpiper(session, SANDPIPER_URL, SANDPIPER_PROJECT);
      updateSession(session.id, { sandpiperRunId: uploadUrl, sandpiperProjectId: SANDPIPER_PROJECT });
      refresh();
      setSentSession(session.id);
    } catch {
      // Fallback: download CSV + open upload page
      const filename = session.problemTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) + '.csv';
      downloadSessionsAsCSV([session], filename);
      openSandpiperUploadPage(SANDPIPER_URL, SANDPIPER_PROJECT);
      setSentSession(session.id);
      setUploadError((e) => ({
        ...e,
        [session.id]: '📥 CSV downloaded — upload it in the Sandpiper tab that just opened.',
      }));
    } finally {
      setUploading((u) => ({ ...u, [session.id]: false }));
    }
  }

  const authBadge =
    authState === 'logged-in' ? (
      <span className="sp-tag sp-tag-done" style={{ marginLeft: 8 }}>● connected</span>
    ) : authState === 'logged-out' ? (
      <span className="sp-tag sp-tag-err" style={{ marginLeft: 8 }}>● not logged in</span>
    ) : null;

  return (
    <div className="sp-section">
      <button className="sp-header" onClick={toggle}>
        <span className="sp-lock">🔒</span>
        <span>
          Internal — Sandpiper
          {localSessions.length > 0 && open && (
            <span className="sp-tag sp-tag-muted" style={{ marginLeft: 8 }}>
              {localSessions.length} saved
            </span>
          )}
          {authBadge}
        </span>
        <span className="sp-caret">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="sp-body">
          {/* Auth row */}
          {authState === 'logged-out' && (
            <div className="sp-auth-row">
              <span className="muted" style={{ fontSize: 12 }}>
                Not connected to Sandpiper.
              </span>
              <button className="sp-upload-btn" onClick={openLoginPopup}>
                Log in with GitHub ↗
              </button>
            </div>
          )}
          {authState === 'checking' && (
            <div className="muted sp-row" style={{ fontSize: 12 }}>Checking Sandpiper login…</div>
          )}

          {localSessions.length === 0 && (
            <div className="muted sp-row">
              No sessions saved yet — submit a plan to capture a chat.
            </div>
          )}

          {localSessions.length > 0 && (
            <ul className="sp-runs">
              {localSessions.map((s) => {
                const uploaded = !!s.sandpiperRunId;
                const busy = uploading[s.id];
                const err = uploadError[s.id];
                const msgCount = s.turns.filter((t) => t.kind === 'normal').length;
                const wasSent = sentSession === s.id;
                return (
                  <li key={s.id} className="sp-run" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                    <div className="sp-run-info">
                      <span className="sp-run-name">{s.problemTitle}</span>
                      <span className="sp-tag sp-tag-muted">{msgCount} msgs</span>
                      {uploaded
                        ? <span className="sp-tag sp-tag-done">Uploaded</span>
                        : <span className="sp-tag sp-tag-muted">Local</span>
                      }
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="muted" style={{ fontSize: 11, flex: 1 }}>
                        {new Date(s.savedAt).toLocaleString()}
                      </span>
                      <button className="sp-link sp-link-btn" onClick={() => onViewRun(s.id)}>
                        View →
                      </button>
                      {!uploaded && (
                        <button
                          className="sp-upload-btn"
                          disabled={busy}
                          onClick={() => void sendToSandpiper(s)}
                        >
                          {busy ? 'Sending…' : '↑ Send to Sandpiper'}
                        </button>
                      )}
                      {uploaded && (
                        <a
                          className="sp-link"
                          href={`${SANDPIPER_URL}/projects/${SANDPIPER_PROJECT}/files`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View in Sandpiper ↗
                        </a>
                      )}
                      {wasSent && !uploaded && (
                        <a
                          className="sp-link"
                          href={`${SANDPIPER_URL}/projects/${SANDPIPER_PROJECT}/files`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Check results ↗
                        </a>
                      )}
                    </div>
                    {err && (
                      <div
                        className="sp-err-row"
                        style={{ fontSize: 11, color: err.startsWith('📥') ? 'var(--c-muted)' : undefined }}
                      >
                        {err}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="sp-footer">
            <a href={SANDPIPER_URL} target="_blank" rel="noreferrer" className="sp-link">
              Open Sandpiper ↗
            </a>
            {localSessions.length > 1 && (
              <button
                className="sp-link sp-link-btn"
                style={{ marginLeft: 12 }}
                onClick={() => {
                  downloadSessionsAsCSV(localSessions, 'steps-copilot-all-sessions.csv');
                  openSandpiperUploadPage(SANDPIPER_URL, SANDPIPER_PROJECT);
                }}
              >
                ↓ Export all as CSV
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProblemList({
  problems,
  loading,
  onPick,
}: {
  problems: Problem[] | undefined;
  loading: boolean;
  onPick: (problem: Problem) => void;
}) {
  if (!problems) {
    return loading ? <div className="muted">Loading problems…</div> : null;
  }
  if (problems.length === 0) {
    return <div className="muted">No problems assigned.</div>;
  }
  return (
    <>
      {problems.map((p) => (
        <button key={p.id} className="problem" onClick={() => onPick(p)}>
          <span>{p.title}</span>
          {p.latestPerform && <span className="tag">{p.latestPerform.status}</span>}
        </button>
      ))}
    </>
  );
}
