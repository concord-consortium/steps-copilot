import { supabase } from './supabase';

const BASE = import.meta.env.VITE_API_BASE_URL;

type Opts = { method?: string; body?: unknown };

// Authenticated fetch against the STEPS Tutor backend (lifted from poc). Pulls the
// current Supabase session and sends `Authorization: Bearer <access_token>`, then
// unwraps the backend's global `{ data, status, success }` envelope.
export async function apiFetch<T>(path: string, opts: Opts = {}): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(BASE + path, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = Array.isArray(err.message) ? err.message.join('; ') : err.message;
    throw new Error(msg ?? `${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (body && typeof body === 'object' && 'data' in body && 'success' in body) {
    return body.data as T;
  }
  return body as T;
}
