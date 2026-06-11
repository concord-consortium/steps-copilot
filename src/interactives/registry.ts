import type { HarnessLog } from '../lib/types';
import { hurricaneExplorerContext } from './hurricane-explorer';
import { wildfireExplorerContext } from './wildfire-explorer';
import { codapContext } from './codap';

/** Turn a matched log into a short natural-language line for the tutor. */
export interface LogMessageSpec {
  /** Matches against the interactive's log `action` (SPEC §6.2). */
  action: string;
  /**
   * Turn a matched log into a short line for the tutor. Optional — if omitted, the
   * raw log JSON is forwarded as-is.
   */
  summarize?: (log: HarnessLog) => string;
  /** Optional throttle/dedupe hint (only forward the latest per N ms). */
  debounceMs?: number;
}

export interface InteractiveContext {
  /** Human-readable name shown in the harness UI and sent to the LLM. */
  name: string;
  /** One-paragraph description of the interactive for the LLM. */
  description: string;
  /**
   * Meta-prompt — free-form string sent silently as the first chat message when a
   * perform starts (SPEC §8.1). Not surfaced in the chat transcript.
   */
  metaPrompt: string;
  /** Which log messages to forward, and how to describe each (SPEC §8.2). */
  logMessages: LogMessageSpec[];
}

export const INTERACTIVES: Record<
  string,
  { url: string; context: InteractiveContext }
> = {
  'hurricane-explorer': {
    url: 'https://hurricane.concord.org/branch/master/index.html',
    context: hurricaneExplorerContext
  },
  'wildfire-explorer': {
    url: 'https://wildfire.concord.org/branch/master/index.html?preset=plainsTwoZone&terrainEditable=true',
    context: wildfireExplorerContext,
  },
  codap: {
    url: 'https://codap.concord.org/app/?v=3&interactiveApi#file=examples:Roller%20Coasters',
    context: codapContext,
  },
};

export type InteractiveKey = keyof typeof INTERACTIVES;
