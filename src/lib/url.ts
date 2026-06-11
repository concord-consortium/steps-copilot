import { INTERACTIVES, type InteractiveContext } from '../interactives/registry';

export interface ResolvedInteractive {
  key: string;
  url: string;
  context: InteractiveContext;
}

// Default interactive when no `?interactive=` param is supplied (demo boots straight in).
const DEFAULT_INTERACTIVE_KEY = 'wildfire-explorer';

// Resolve the `interactive` query param against the registry. When the param is absent we
// fall back to DEFAULT_INTERACTIVE_KEY; when it is present but unknown we return null so App
// shows an error screen listing the available keys. Read once at load and held for the session.
export function resolveInteractive(
  search: string = window.location.search,
): ResolvedInteractive | null {
  const key = new URLSearchParams(search).get('interactive') ?? DEFAULT_INTERACTIVE_KEY;
  const entry = INTERACTIVES[key];
  if (!entry) return null;
  return { key, url: entry.url, context: entry.context };
}

export function availableInteractiveKeys(): string[] {
  return Object.keys(INTERACTIVES);
}
