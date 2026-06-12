import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { resolveInteractive, availableInteractiveKeys } from './lib/url';
import { Login } from './components/Login';
import { Picker } from './components/Picker';
import { Harness } from './components/Harness';
import { SandpiperRunView } from './components/SandpiperRunView';
import type { Problem } from './lib/types';

type Selection = { courseId: string; problem: Problem };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [sandpiperRunId, setSandpiperRunId] = useState<string | null>(null);

  // The `interactive` query param is read once at load and held for the whole session.
  const interactive = useMemo(() => resolveInteractive(), []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoaded(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) setSelection(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  // Missing/unknown `interactive` key → config error screen (SPEC §3).
  if (!interactive) return <InteractiveError />;

  if (!loaded) return <div className="muted center fullscreen">Loading…</div>;
  if (!session) return <Login />;
  if (sandpiperRunId) {
    return <SandpiperRunView runId={sandpiperRunId} onBack={() => setSandpiperRunId(null)} />;
  }
  if (selection) {
    return (
      <Harness
        courseId={selection.courseId}
        problem={selection.problem}
        interactive={interactive}
        onBack={() => setSelection(null)}
      />
    );
  }
  return (
    <Picker
      onSignOut={signOut}
      onPick={(courseId, problem) => setSelection({ courseId, problem })}
      onViewSandpiperRun={(id) => setSandpiperRunId(id)}
    />
  );
}

function InteractiveError() {
  const keys = availableInteractiveKeys();
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>STEPS Copilot</h1>
        <p className="subtitle">
          Add an <code>?interactive=&lt;key&gt;</code> query parameter to choose which
          interactive to host.
        </p>
        <div>
          <strong>Available interactives:</strong>
          <ul>
            {keys.map((k) => (
              <li key={k}>
                <a href={`?interactive=${encodeURIComponent(k)}`}>{k}</a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
