import { useMemo } from 'react';
import { resolveInteractive, availableInteractiveKeys } from './lib/url';
import { Harness } from './components/Harness';

// STEPS auth + course/problem picker have been removed: the harness now talks directly to
// OpenAI/Anthropic and drives the tutor from a hardcoded problem (src/problem.ts), so it boots
// straight into the Harness for the resolved interactive (defaults to wildfire-explorer).
export default function App() {
  const interactive = useMemo(() => resolveInteractive(), []);

  // Present-but-unknown `interactive` key → config error screen.
  if (!interactive) return <InteractiveError />;

  return <Harness interactive={interactive} />;
}

function InteractiveError() {
  const keys = availableInteractiveKeys();
  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>STEPS Copilot</h1>
        <p className="subtitle">
          That <code>?interactive=&lt;key&gt;</code> is not registered. Choose one below.
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
