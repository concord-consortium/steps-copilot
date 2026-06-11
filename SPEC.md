# STEPS Copilot — LARA Host Harness

A single-page app that acts as a **LARA host** for any Concord Consortium interactive
that speaks the [LARA Interactive API](https://github.com/concord-consortium/lara-interactive-api).
It embeds the interactive in an iframe (left 75% of the screen) and pairs it with a
STEPS-tutor sidebar (right 25%) — problem statement, a plan submission box, and a chat
with the STEPS LLM. As the interactive runs, the harness captures its **log messages**
and forwards them to the tutor so the LLM can "see" what the student is doing in the sim.

This document is a build spec. It assumes the sibling repos as reference implementations
(paths are relative to `/home/doug/projects`):

- `gates-hackathon/poc` — student STEPS app (Supabase auth, course/problem picker, chat).
- `gates-hackathon/poc-instructor` — instructor variant (alternate login copy).
- `activity-player` — the production LARA host; source of the iframe runtime code.
- `gates-hackathon/steps-tutor-be` — the STEPS backend (perform / message / plan endpoints).

---

## 1. Goals & non-goals

**Goals**

1. Log in as a STEPS student (reuse the `poc` Supabase auth + `apiFetch` token flow).
2. Select a course and problem (reuse `poc`'s picker logic; auto-select a sole course).
3. Host an arbitrary interactive (named by the `interactive` query param) in an iframe
   using the **same iframe-phone wiring** as `activity-player`'s `IframeRuntime`.
4. Show a tutor sidebar: problem statement, a **plan** text area + submit, and a **chat**
   with the STEPS LLM (both backed by the existing `steps-tutor-be` perform endpoints).
5. Forward interactive **log messages** to the LLM, shaped by a per-interactive
   **context object** baked into the harness.

**Non-goals (for the first cut)**

- No Firebase persistence of interactive state, no portal/LTI auth, no attachments,
  no PubSub/job manager, no Shutterbug snapshots, no plugins/text-decoration. These are
  all present in `activity-player`'s `IframeRuntime` but are **stubbed** here (see §6.3).
- No authoring of problems or interactives (that's `poc-instructor`'s job).
- No reflection/solution-grading flow beyond what the existing endpoints already give us.

---

## 2. Tech stack

Match `poc` exactly so code lifts cleanly:

- Vite + React 18 + TypeScript, `@supabase/supabase-js`.
- New dependency: `iframe-phone` (the LARA host transport). Optionally
  `@concord-consortium/lara-interactive-api` for message **types** only.
- Env vars (`.env`), same names as `poc`:
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`.

Test accounts (from `gates-hackathon/notes.md`): `dmartin+student@concord.org` /
`Gatespwd123` (student), `dmartin+instructor@concord.org` (instructor).

---

## 3. URL contract

The interactive to host is passed as a string in the `interactive` query param. The value
is a **key into the harness's interactive registry** (§5), not a raw URL — the registry maps
the key to a runnable URL plus its context object.

```
/?interactive=wildfire-explorer
```

Resolution order, mirroring `activity-player/src/lara-api.ts#getResourceUrl`:

1. Read `interactive` from the query string. If absent → show an error screen listing the
   available keys from the registry.
2. Look the key up in the registry (§5). The registry entry supplies `url` and `context`.
   If the key is unknown → error screen listing the available keys.
3. Registration is required (resolved in §12): a raw `^https?://` value is **not** accepted
   as an interactive in v1 — without a context object it forwards no useful logs. (May return
   later as a debug-only escape hatch.)

---

## 4. Screen flow & layout

State machine in `App.tsx`, lifted from `poc/src/App.tsx`:

```
loading → (no session) Login
        → (session, no course/problem) Picker
        → (course + problem chosen) Harness
```

### 4.1 Login

Lift `poc/src/components/Login.tsx` verbatim (or `poc-instructor`'s — same component,
different heading/subtitle copy). Heading: **"STEPS Copilot"**. On success, Supabase's
`onAuthStateChange` flips the view, exactly as in `poc`.

### 4.2 Course + problem selector

Lift the data logic from `poc/src/components/Picker.tsx`:

- `GET /courses?limit=100` → list of courses.
- `GET /problems/by-course/:courseId?limit=100` → problems for a course.

Behavioral change requested for this harness:

- **If there is exactly one course, auto-select it and do not render the course selector** —
  jump straight to its problem list. (With >1 course, show the existing accordion picker.)
- Selecting a problem transitions to the Harness with `{ courseId, problem }`.

The `interactive` query param is **independent of** problem selection — it's read once at
load and held for the whole session. (A problem and an interactive are paired by the
person who hands out the URL; the harness does not try to derive one from the other.)

### 4.3 Harness (main screen)

```
┌─────────────────────────────────────────────┬───────────────────────┐
│                                             │  Problem statement     │
│                                             │  (rendered HTML)       │
│                                             │                        │
│            INTERACTIVE  (iframe)            ├───────────────────────┤
│                 left 75%                    │  Plan                  │
│                                             │  [ textarea        ]   │
│                                             │  [ Submit plan     ]   │
│                                             ├───────────────────────┤
│                                             │  Chat with tutor       │
│                                             │  ┌──────────────────┐  │
│                                             │  │ messages…        │  │
│                                             │  └──────────────────┘  │
│                                             │  [ message ] [ Send ]  │
└─────────────────────────────────────────────┴───────────────────────┘
       left 75% (flex)                            right 25% sidebar
```

- Left pane: 75% width, full height, hosts the iframe (§6).
- Right pane: 25% width sidebar, three stacked sections (§7): **Problem statement**,
  **Plan**, **Chat**. The chat region flexes to fill remaining height and scrolls.
- A thin top bar with a Back button (return to picker), the problem title, and the
  interactive name. The **top-right shows a connected step timeline** of the perform
  lifecycle: a row of circle icons joined by connectors, with the current step highlighted.
  The first, current, and last steps show their full name; every other step is just a circle
  whose hover `title` is the step name. Step names use the full display labels (from
  `steps-tutor-fe` perform-screen / the `PerformStatus` enum), not the internal status ids.

---

## 5. Interactive registry & context object

Each interactive the harness can host is described by a **context object baked into the
code**. This is the heart of the harness: it tells the LLM what the interactive *is*,
what a student can *do* in it (via a **meta-prompt** sent silently as the first chat
message), and which **log messages** are meaningful and how to describe them when
forwarding to the tutor.

```ts
// src/interactives/registry.ts
export interface InteractiveContext {
  /** Human-readable name shown in the harness UI and sent to the LLM. */
  name: string;
  /** One-paragraph description of the interactive for the LLM. */
  description: string;
  /**
   * Meta-prompt — one free-form string (markdown/prose) that primes the tutor about
   * this interactive: what it is and the controls/actions a student can take in it.
   * It is sent **silently as the first chat message** when a perform starts (see §8.1)
   * and is NOT surfaced to the user in the chat transcript.
   * For Wildfire Explorer this is lifted from gates-hackathon/wildfire-explorer-ui.md.
   */
  metaPrompt: string;
  /**
   * Which log messages to forward, and how to turn each into a sentence for the LLM.
   * Logs not matched here are dropped (keeps the tutor's context clean).
   */
  logMessages: LogMessageSpec[];
}

export interface LogMessageSpec {
  /** Matches against the interactive's log `action` (see §6.2 for log shape). */
  action: string;
  /**
   * Turn a matched log into a short natural-language line for the tutor. Optional —
   * if omitted, the raw log JSON is forwarded as-is.
   */
  summarize?: (log: HarnessLog) => string;
  /** Optional throttle/dedupe hint (e.g. only forward the latest per N ms). */
  debounceMs?: number;
}

export const INTERACTIVES: Record<string, { url: string; context: InteractiveContext }> = {
  "wildfire-explorer": {
    url: "https://wildfire.concord.org/branch/master/index.html",
    context: wildfireExplorerContext,
  },
  // …more interactives
};
```

`wildfireExplorerContext` is authored from `gates-hackathon/wildfire-explorer-ui.md`,
which already enumerates the Setup wizard, bottom-bar controls (Spark, Fireline, Helitack,
Start/Stop…), and on-screen info. That document is the canonical source for the first
interactive's `metaPrompt`.

Its `logMessages` allowlist (v1) matches these confirmed `action` strings:
`SimulationStarted`, `SimulationStopped`, `SimulationEnded`, `SimulationRestarted`,
`SimulationReloaded`. **No `summarize` functions for v1** — matched logs are forwarded as
their **raw JSON** so we can see exactly what the model emits and tune summaries against a
live run. Extend the allowlist (and add `summarize` lines) as more actions are confirmed.

---

## 6. Iframe host (LARA runtime)

### 6.1 What to lift from `activity-player`

The reference is
`activity-player/src/components/activity-page/managed-interactive/iframe-runtime.tsx`.
Reuse its **iframe-phone wiring and the `initInteractive` handshake**, but trim it to the
minimum a harness needs. Keep:

- `phoneRef = new iframePhone.ParentEndpoint(iframeRef.current, initInteractive)`.
- The `<iframe>` element with the same attributes:
  `key={id-reloadCount}`, `src={url}`, `allow="geolocation; microphone; camera; bluetooth; clipboard-read; clipboard-write"`,
  `allowFullScreen`, `scrolling="no"`.
- The `initInteractive` message: post `initInteractive` with `mode: "runtime"`,
  `version: 1`, `authoredState`, `interactiveState`, `hostFeatures`, etc. Use the
  **anonymous / non-portal** branch (no `portalData`).
- The `height` listener (so the iframe can grow) — though here the iframe is sized to
  fill the 75% pane, so height-from-interactive can be ignored or clamped.
- The **`interactiveState` listener** — to keep the latest state in a ref so we can include
  a snapshot when the student submits a plan or sends a chat message (see §7/§8).
- The **`log` listener** — `addListener("log", (logData) => …)` — this is the key hook
  (§6.2).

Keep handler **stubs** (so interactives that call them don't hang) for the rest:
`supportedFeatures`, `getFirebaseJWT` (return an error response), `getInteractiveSnapshot`,
`getAttachmentUrl`, `showModal`/`closeModal`, linked-interactive listeners, pubsub
(`createChannel`/`publish`/`subscribe`/`unsubscribe`), `hint`, `navigation`,
`decoratedContentEvent`, `customMessage`. Most can be no-ops or minimal error replies.

### 6.2 Log message shape

The LARA `log` message payload, as the interactive sends it, is consumed by
`activity-player` (`managed-interactive.tsx#handleLog`) as:

```ts
{ action: string, value?: any, data?: Record<string, any> }
```

The harness normalizes each incoming log into:

```ts
interface HarnessLog {
  interactiveKey: string;     // e.g. "wildfire-explorer"
  action: string;             // logData.action
  value?: unknown;            // logData.value
  data?: Record<string, unknown>; // logData.data
  receivedAt: string;         // ISO timestamp, harness clock
}
```

### 6.3 Stubbed/omitted host features (vs. `activity-player`)

Explicitly **not** implemented in v1 (no-op or minimal error response): Firebase
(`firebase-db`, `getFirebaseJWT`, object storage, `watchAnswer` linked state), attachments,
Shutterbug snapshots, plugins / `decorateContent` / dynamic text, PubSub & Job managers,
report mode, accessibility font propagation, media library, teacher feedback. Document each
stub inline so it's clear what to restore if an interactive needs it.

---

## 7. Sidebar

The sidebar reuses STEPS-tutor data flows against `steps-tutor-be` (envelope-unwrapping
`apiFetch` from `poc/src/lib/api.ts`). On entering the Harness, resolve a **perform** for
`(courseId, problem)` exactly as `poc/src/components/Chat.tsx#init` does (resume
`problem.latestPerform`, else `POST /performs/:courseId/:problemId`, with the
already-exists recovery path).

### 7.1 Problem statement

- Use the `statement` (stored HTML) that **already ships inline on the
  `GET /problems/by-course/:courseId` list response** — the Picker already holds it, so the
  Harness reads `problem.statement` directly. (Verified against the live backend:
  `GET /problems/:id` returns **403 for student logins**, so the harness does **not** call it.)
  Render it as HTML (it may contain the platform's KaTeX spans — basic HTML rendering is
  acceptable for v1; math typesetting is a stretch goal).
- Read-only, scrolls within its section.

### 7.2 Plan

- A textarea + **Submit plan** button.
- Submit → `POST /performs/:performId/planning-submissions` with
  `{ submissionText: <textarea> }` (DTO: `CreatePlanningSubmissionDto`).
- Show success/error inline; keep the text after submit so the student can revise.
- (Optional) include a snapshot of current interactive state / recent logs as context in
  the submission text — decide during build; the simplest v1 just sends the typed text.

### 7.3 Chat

Lift `poc/src/components/Chat.tsx`'s message logic into the sidebar:

- Load history: `GET /performs/:performId/messages?sortOrder=ASC&limit=200`.
- Send: `POST /performs/:performId/messages` with `{ message }` (DTO: `CreateMessageDto`),
  optimistic student bubble, then refetch to pull the tutor reply with real ids and the
  updated perform `status`. Show `sequenceStep` (phase) on tutor bubbles.
- Auto-scroll on new messages; disable input when `status === "completed"`.

**Collapsed log turns (§8.2).** Messages whose text carries the interactive-log sentinel
prefix are not rendered as normal chat bubbles. Instead, render each as a **single-line,
collapsed** bubble with a toggle (▸ collapsed / ▾ expanded) control:

- The log turn (a `Student` message) → one-line bubble labelled **"Student action…"**.
  Expanding it reveals a `<div>` beneath the line showing the **full forwarded log text**
  (the summarized activity lines, minus the sentinel).
- The `Tutor` reply **immediately following** that log turn is gated by a tweakable setting
  (`SHOW_LOG_MESSAGE_RESPONSE`, **shown in full by default**): when on it renders as a normal
  full tutor bubble; when off it collapses to a one-line **"Student action response"** bubble
  with a toggle revealing the full response.
- Real student/tutor turns are unaffected and render as normal full bubbles. Identify log
  turns by the sentinel prefix and pair each with the first `Tutor` message that follows it;
  everything else is a normal turn.

---

## 8. Priming the tutor & forwarding interactive logs

### 8.1 Silent meta-prompt (first message)

On initial load, once the perform is resolved, the harness sends the active interactive's
`context.metaPrompt` (§5) as the **first chat message** via
`POST /performs/:performId/messages`, **before** the student types anything — but **only when
the chat has no existing messages**. This primes the tutor with what the interactive is and
what the student can do in it.

- It is sent **silently**: the harness does **not** render it as a bubble, and filters it
  out of the loaded history so it never appears in the transcript or the copied Markdown.
- Send it **only on a fresh perform**: guard on "history is empty" so resuming a
  `latestPerform` (which already has the meta-prompt as its first message) does not re-send
  it. Identify/skip it on load by the sentinel prefix. Also guarded against StrictMode's
  double-mount so it fires once.
- The tutor's reply to the meta-prompt is gated by a tweakable setting
  (`SHOW_META_PROMPT_RESPONSE`, **shown by default**): when shown it renders as a normal
  tutor bubble (a tutor opening for the student); when off it is suppressed so the student
  sees an empty chat ready for their first real message. The meta-prompt message itself is
  always hidden either way.
- The meta-prompt should also **instruct the tutor how to treat `⟦interactive-log⟧` turns**
  (§8.2): they are observed simulation activity to acknowledge/track silently, not student
  statements — do not advance the plan/phase on them. This sets the contract once, up front,
  so individual log turns only need the short reminder framing.

### 8.2 Forwarding interactive logs to the LLM

This is the novel behavior of the harness. When the `log` listener (§6.2) fires:

1. Normalize to `HarnessLog`.
2. Look up a matching `LogMessageSpec` in the active interactive's context (`action`
   match). If none, **drop** it.
3. Run `summarize(log)` to get a short natural-language line — or, if no `summarize` is
   defined, forward the raw log JSON as-is — applying any `debounceMs`.
4. Append the line to a running **activity feed** buffer.

Forwarding strategy: **B — proactive log turns (NO backend changes).** Each buffered batch
of activity lines is sent to the tutor as **its own chat turn**, immediately (debounced),
rather than folded into the student's next message. It rides on the existing
`POST /performs/:performId/messages` endpoint with the default `Student` sender — **no
backend change whatsoever**:

- The forwarded `message` is marked with a **sentinel prefix** (e.g. `⟦interactive-log⟧`),
  the same recognise-by-prefix trick the silent meta-prompt uses (§8.1), so the harness can
  identify log turns (and only those) when it re-loads history.
- **Frame the payload as observed activity, not a student statement.** After the sentinel,
  the message body explicitly tells the tutor that these are *observed simulation actions by
  the student in the interactive — not a question, plan, or answer* — so the tutor treats it
  as context to track rather than something to grade or respond to as plan content. e.g.:

  ```
  ⟦interactive-log⟧ Observed simulation activity (not a student message — acknowledge/track
  silently, do not treat as plan input or advance the activity on it):
  - Started the simulation. Wind 20 MPH from the NW.
  - Stopped the simulation.
  ```

- The backend has **no system/non-student channel** — `MessageSender` is only
  `Student`/`Tutor` and `createMessage` **always** invokes the LLM — so every forwarded log
  turn provokes a `Tutor` reply. We do **not** suppress that reply; we **collapse** it in the
  UI (see below). The reply may advance perform `status`/`sequenceStep` like any turn; the
  framing above is what keeps that churn minimal. This is accepted as a side effect of the
  no-backend-change constraint.
- **Forwarding does not stop when the perform is `completed`.** Even though the chat composer
  is disabled for the student at that point (§7.3), the harness keeps forwarding log turns —
  log forwarding is independent of the composer lockout.
- The buffer is cleared after each successful send.

Each `(log turn, its tutor reply)` pair is the unit the chat UI collapses (§7.3): the log
turn renders as a one-line **"Student action…"** bubble, and the tutor's direct reply to it
renders as a one-line **"Student action response"** bubble — each with an expand toggle that
reveals the full text in a `<div>` beneath the single line. Pair a reply to its log turn by
position: the first `Tutor` message after a sentinel-marked `Student` message is its response.

> Fallback (not used): **A — fold into the next chat turn**, prepending buffered lines to the
> student's outgoing `message`. Simpler but non-proactive (the tutor only sees activity when
> the student happens to type); B is chosen so the tutor reacts to sim activity on its own.

Optionally include a compact **interactive-state snapshot** (from the `interactiveState`
ref, §6.1) alongside the logs, since `initial-chat-info.md` establishes that a structured
JSON snapshot (`problem`, `phase`, `studentInputs`, `uiContext`…) is the tutor's preferred
state format. v1 may keep this minimal and lean on the log summaries.

### 8.3 Single serial send queue

The meta-prompt (§8.1), proactive log turns (§8.2), and the student's own chat messages
(§7.3) **all POST to the same `/performs/:performId/messages` endpoint and each provokes a
tutor reply**. Because log turns fire on the interactive's schedule, they can overlap a
message the student is sending. To keep ordering deterministic — and so the §7.3 pairing
("first `Tutor` after a sentinel `Student` is its response") always holds — route every
outgoing message through **one serial queue**:

- **One request in flight at a time.** Enqueue meta-prompt / log turns / student messages;
  the queue sends the next only after the previous POST resolves (reply received).
- This guarantees the backend sees a clean, single order and the local transcript can pair
  each turn with its reply by position without races.
- The student composer stays responsive — a typed message is enqueued (optimistic bubble)
  and sent as soon as any in-flight log turn completes; it does not block on the sim.
- If a send fails, surface it (per §7.3) and do not advance the queue past the failure in a
  way that corrupts pairing — drop the failed item's optimistic bubble and continue.

---

## 9. File layout

```
steps-copilot/
  index.html
  package.json            # poc's + iframe-phone
  vite.config.ts
  .env.example            # VITE_SUPABASE_URL / _ANON_KEY / VITE_API_BASE_URL
  src/
    main.tsx
    App.tsx               # loading → Login → Picker → Harness
    index.css
    lib/
      supabase.ts         # lifted from poc
      api.ts              # lifted from poc (apiFetch + envelope unwrap)
      types.ts            # lifted from poc (+ HarnessLog, context types)
      url.ts              # read `interactive` query param (cf. lara-api.ts)
    components/
      Login.tsx           # lifted from poc / poc-instructor
      Picker.tsx          # lifted from poc, + single-course auto-select
      Harness.tsx         # 75/25 split layout, owns perform resolution
      IframeRuntime.tsx   # trimmed from activity-player iframe-runtime.tsx
      Sidebar/
        ProblemStatement.tsx
        PlanForm.tsx
        Chat.tsx          # lifted from poc Chat logic + collapsed log-turn bubbles (§7.3)
        ActivityFeed.tsx  # optional raw/unfiltered log view; chat is the primary surface (§8)
    interactives/
      registry.ts         # INTERACTIVES map + context types
      wildfire-explorer.ts# context object from wildfire-explorer-ui.md
```

---

## 10. Backend endpoints used (steps-tutor-be)

All via `apiFetch` with the Supabase bearer token; responses are envelope-unwrapped.

| Purpose                  | Method & path                                      |
|--------------------------|----------------------------------------------------|
| List courses             | `GET /courses?limit=100`                           |
| Problems for a course    | `GET /problems/by-course/:courseId?limit=100` (incl. `statement`) |
| Start/resume perform     | `POST /performs/:courseId/:problemId`              |
| Load chat history        | `GET /performs/:performId/messages?sortOrder=ASC`  |
| Send chat message        | `POST /performs/:performId/messages`               |
| Submit plan              | `POST /performs/:performId/planning-submissions`   |

(`solution-submissions` and `finish` exist but are out of scope for v1.)

---

## 11. Build order (suggested)

1. Scaffold from `poc` (copy `supabase.ts`, `api.ts`, `types.ts`, `Login.tsx`); app boots
   to the picker. Add `iframe-phone`.
2. Picker with single-course auto-select. Read `interactive` query param; error screen for
   unknown/missing keys.
3. `Harness` layout (75/25) with the iframe pointed at the registry URL — get an
   interactive **rendering** (no LARA handshake yet).
4. Port the trimmed `IframeRuntime` (iframe-phone + `initInteractive` + `log` /
   `interactiveState` listeners; stub the rest). Confirm the interactive initializes.
5. Sidebar: perform resolution + problem statement + chat (lift from `poc` `Chat.tsx`).
6. Registry context for `wildfire-explorer` (from `wildfire-explorer-ui.md`); send its
   `metaPrompt` as the silent first message on a fresh perform, suppressed from the UI (§8.1).
7. Plan form → `planning-submissions`.
8. Log forwarding (strategy B: proactive, sentinel-marked log turns via the existing
   message endpoint) + collapsed **"Student action…"** / **"Student action response"** chat
   bubbles with expand toggles (§7.3 / §8.2).
9. Polish: error/loading states, back navigation, completed-perform lockout.

---

## 12. Open questions

- **Plan ↔ interactive coupling:** ~~should plan submission auto-attach the current
  interactive-state snapshot, or only the typed text?~~ **Resolved:** typed text only. Under
  strategy B the sim activity already reaches the tutor as its own perform turns (§8.2), so
  there is no need to bundle a snapshot into the graded plan body. Revisit only if planning
  feedback proves weak.
- **Log volume:** Wildfire Explorer may emit high-frequency logs (e.g. tick/anim).
  **Resolved:** rely on the `LogMessageSpec.action` allowlist + per-action `debounceMs` as the
  only throttle (no extra batch-flush layer for v1). The v1 wildfire allowlist is the five
  confirmed actions `SimulationStarted` / `SimulationStopped` / `SimulationEnded` /
  `SimulationRestarted` / `SimulationReloaded` (§5) — low-frequency, so turn spam is not a
  concern at launch. Extend + tune against a live run.
  Note: under strategy B each forwarded batch is its own LLM turn, so keep the allowlist tight.
- **Raw-URL interactives:** ~~support `interactive=https://…` with a default empty context
  (§3.3), or require every interactive to be registered?~~ **Resolved:** require registration.
  The harness's value is the context object (meta-prompt + `LogMessageSpec` allowlist); a raw
  URL with an empty context forwards nothing useful. The `^https?://` raw-URL path is dropped
  from v1 (keep only as a debug escape hatch if ever needed).
- **System messages:** ~~if/when the backend supports a non-student message channel~~
  **Resolved:** no backend changes are allowed, so log forwarding uses strategy B over the
  existing `Student` channel with a sentinel prefix; the tutor's forced reply is collapsed in
  the UI rather than suppressed (§8.2 / §7.3).
