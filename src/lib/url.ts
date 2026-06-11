import { INTERACTIVES, type InteractiveContext } from '../interactives/registry';

export interface ResolvedInteractive {
  key: string;
  url: string;
  context: InteractiveContext;
}

// Resolve the `interactive` query param against the registry (SPEC §3). Returns the
// resolved entry, or null if the param is missing/unknown (App shows an error screen
// listing the available keys). Read once at load and held for the whole session.
export function resolveInteractive(
  search: string = window.location.search,
): ResolvedInteractive | null {
  const key = new URLSearchParams(search).get('interactive');
  if (!key) return null;
  const entry = INTERACTIVES[key];
  if (!entry) return null;
  return { key, url: entry.url, context: entry.context };
}

export function availableInteractiveKeys(): string[] {
  return Object.keys(INTERACTIVES);
}
