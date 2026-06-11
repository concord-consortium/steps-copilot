// Ephemeral local session store — saves completed chat transcripts to localStorage
// so the Sandpiper internal section can display and upload them without a prod DB.

import type { ChatTurn } from './usePerformChat';

export interface LocalSession {
  id: string;           // performId
  problemId: string;
  problemTitle: string;
  courseId: string;
  savedAt: string;
  performStatus: string;
  planText: string;
  turns: ChatTurn[];
  sandpiperRunId?: string;   // set after a successful Sandpiper upload
  sandpiperProjectId?: string;
}

const KEY = 'steps-copilot:sessions';

export function getSessions(): LocalSession[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as LocalSession[];
  } catch {
    return [];
  }
}

export function saveSession(session: LocalSession): void {
  const existing = getSessions().filter((s) => s.id !== session.id);
  localStorage.setItem(KEY, JSON.stringify([session, ...existing]));
}

export function updateSession(id: string, updates: Partial<LocalSession>): void {
  const sessions = getSessions().map((s) =>
    s.id === id ? { ...s, ...updates } : s,
  );
  localStorage.setItem(KEY, JSON.stringify(sessions));
}

export function getSession(id: string): LocalSession | undefined {
  return getSessions().find((s) => s.id === id);
}

// ── CSV formatting (Sandpiper upload format) ──────────────────────────────────
// Columns: session_id, sequence_id, speaker, content
// Multiple sessions can coexist in one file — Sandpiper groups by session_id.

function escapeCsvCell(value: string): string {
  // Quote any cell that contains comma, double-quote, or newline
  if (/[",\r\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

// Prefix added to system log entries in the CSV so annotators know to skip them.
// Mirrors the language already in the tutor meta-prompt (usePerformChat.ts).
const LOG_CSV_PREFIX =
  '[SYSTEM LOG - NOT a student message: observed simulation action relayed automatically. ' +
  'Do not grade or annotate. Treat as context only.] ⟦interactive-log⟧ ';

export function formatSessionsAsCSV(sessions: LocalSession[]): string {
  const header = 'session_id,sequence_id,speaker,content';
  const rows: string[] = [header];

  for (const session of sessions) {
    // Include normal turns AND log turns (debug/simulation events sent by the student client).
    // Exclude log-reply (tutor acknowledgements of logs) — they add noise without insight.
    const exportTurns = session.turns.filter(
      (t) => t.kind === 'normal' || t.kind === 'log',
    );

    // Slugify the problem title for a readable session_id
    const sessionId =
      session.problemTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 48) +
      '_' +
      session.id.slice(0, 8);

    exportTurns.forEach((turn, idx) => {
      // Log turns are always from the student client, but labelled distinctly in the content.
      const speaker = turn.sender === 'Student' ? 'Student' : 'Tutor';
      const seqId = `utterance_${idx + 1}`;
      const content =
        turn.kind === 'log'
          ? LOG_CSV_PREFIX + (turn.text ?? '')
          : (turn.text ?? '');
      rows.push(
        [
          escapeCsvCell(sessionId),
          escapeCsvCell(seqId),
          escapeCsvCell(speaker),
          escapeCsvCell(content),
        ].join(','),
      );
    });
  }

  return rows.join('\n');
}

export function formatSessionAsCSV(session: LocalSession): string {
  return formatSessionsAsCSV([session]);
}

// Download sessions as a CSV file to the user's Downloads folder.
export function downloadSessionsAsCSV(sessions: LocalSession[], filename = 'steps-copilot-sessions.csv'): void {
  const csv = formatSessionsAsCSV(sessions);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Try to upload a session to Sandpiper via direct API (requires CORS headers on
// sandpiperresearch.org and a valid session cookie from a prior login).
// Returns the uploaded file's info on success, throws on failure.
export async function uploadToSandpiper(
  session: LocalSession,
  sandpiperUrl: string,
  projectId: string,
): Promise<string> {
  const csv = formatSessionAsCSV(session);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const filename = (session.problemTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 48)) + '.csv';
  const file = new File([blob], filename, { type: 'text/csv' });

  const formData = new FormData();
  formData.append('files', file);

  const uploadRes = await fetch(`${sandpiperUrl}/projects/${projectId}/upload-files`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!uploadRes.ok) {
    const text = await uploadRes.text().catch(() => '');
    throw new Error(`Upload failed (${uploadRes.status})${text ? ': ' + text.slice(0, 120) : ''}`);
  }

  const uploadData = await uploadRes.json() as { success?: boolean };
  if (!uploadData?.success) throw new Error('Upload response did not indicate success');

  // After upload, redirect user to the files page so Sandpiper can convert & run
  return `${sandpiperUrl}/projects/${projectId}/files`;
}

// Open the Sandpiper upload page in a new tab so the user can upload the CSV
// that was downloaded. Returns the URL opened.
export function openSandpiperUploadPage(sandpiperUrl: string, projectId: string): string {
  const url = `${sandpiperUrl}/projects/${projectId}/upload-files`;
  window.open(url, 'sandpiper-upload');
  return url;
}

// Check if the user appears to be logged in to Sandpiper by trying a lightweight
// ping. Returns true if we get a non-401/403 response.
export async function checkSandpiperAuth(sandpiperUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${sandpiperUrl}/api/authentication`, {
      credentials: 'include',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    const data = await res.json() as { authentication?: { data?: unknown } };
    return !!data?.authentication?.data;
  } catch {
    return false;
  }
}
