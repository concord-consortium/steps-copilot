// Mock Sandpiper run + evaluation data used for the internal instructor view.
// Mirrors the shape Sandpiper returns from its run/evaluation endpoints.

export interface SandpiperRun {
  _id: string;
  name: string;
  isRunning: boolean;
  isComplete: boolean;
  hasErrored: boolean;
  createdAt: string;
  sessions: MockSession[];
}

export interface MockSession {
  sessionId: string;
  studentName: string;
  problem: string;
  status: 'DONE' | 'RUNNING' | 'ERRORED' | 'NOT_STARTED';
  planText: string;
  annotations: ConceptAnnotation[];
  overallScore: 'Strong' | 'Developing' | 'Beginning';
  summary: string;
}

export interface ConceptAnnotation {
  concept: string;
  present: boolean;
  evidence: string;
}

const CONCEPTS = [
  'Patterns',
  'Cause & Effect',
  'Systems & System Models',
  'Stability & Change',
  'Scale, Proportion & Quantity',
];

// ── Run 1: Week 3 Planning, complete ──────────────────────────────────────────
const run1Sessions: MockSession[] = [
  {
    sessionId: 's-101', studentName: 'Amir T.', problem: 'Wildfire Explorer — Week 3',
    status: 'DONE', overallScore: 'Strong',
    planText: 'I will set up two zones with different vegetation types and drought levels, then compare how fast the fire spreads in each zone using the graph.',
    summary: 'Student clearly articulates a controlled experiment comparing vegetation type. Explicitly mentions using the graph as evidence tool. Demonstrates strong cause-and-effect framing.',
    annotations: [
      { concept: 'Cause & Effect', present: true, evidence: 'Explicitly links drought level to fire spread rate.' },
      { concept: 'Patterns', present: true, evidence: 'Plans to compare graph lines across zones to find trends.' },
      { concept: 'Systems & System Models', present: true, evidence: 'Treats the simulation as a model of a real-world fire system.' },
      { concept: 'Stability & Change', present: false, evidence: '' },
      { concept: 'Scale, Proportion & Quantity', present: false, evidence: '' },
    ],
  },
  {
    sessionId: 's-102', studentName: 'Bella R.', problem: 'Wildfire Explorer — Week 3',
    status: 'DONE', overallScore: 'Developing',
    planText: 'I want to see what happens when I put the fire in different places and change the wind.',
    summary: 'Student shows curiosity but plan lacks specificity. No mention of controlling variables or using graph for evidence. Implicit cause-and-effect reasoning present.',
    annotations: [
      { concept: 'Cause & Effect', present: true, evidence: 'Implicitly linking wind direction to fire behavior.' },
      { concept: 'Patterns', present: false, evidence: '' },
      { concept: 'Systems & System Models', present: false, evidence: '' },
      { concept: 'Stability & Change', present: false, evidence: '' },
      { concept: 'Scale, Proportion & Quantity', present: false, evidence: '' },
    ],
  },
  {
    sessionId: 's-103', studentName: 'Carlos M.', problem: 'Wildfire Explorer — Week 3',
    status: 'DONE', overallScore: 'Strong',
    planText: "My plan is to test three zones — grass, shrub, and forest — each with medium drought. I'll keep wind the same to make it fair. Then I'll use the acres burned graph to see which burns fastest.",
    summary: 'Excellent control-of-variables reasoning. Student explicitly names the one-variable-at-a-time principle. Uses quantitative framing (acres burned). High alignment with crosscutting concepts.',
    annotations: [
      { concept: 'Cause & Effect', present: true, evidence: 'Plans to isolate vegetation as the causal variable.' },
      { concept: 'Patterns', present: true, evidence: 'Will use graph to identify which zone burns fastest — trend analysis.' },
      { concept: 'Systems & System Models', present: true, evidence: 'Understands simulation as a controlled model environment.' },
      { concept: 'Stability & Change', present: false, evidence: '' },
      { concept: 'Scale, Proportion & Quantity', present: true, evidence: 'References acres burned as a quantitative measure.' },
    ],
  },
  {
    sessionId: 's-104', studentName: 'Diana L.', problem: 'Wildfire Explorer — Week 3',
    status: 'DONE', overallScore: 'Beginning',
    planText: 'I will run the simulation and see what the fire does.',
    summary: 'Plan is too vague to evaluate. No variables identified, no measurement strategy, no comparison framing. Student may need scaffolding on what "investigating" means.',
    annotations: [
      { concept: 'Cause & Effect', present: false, evidence: '' },
      { concept: 'Patterns', present: false, evidence: '' },
      { concept: 'Systems & System Models', present: false, evidence: '' },
      { concept: 'Stability & Change', present: false, evidence: '' },
      { concept: 'Scale, Proportion & Quantity', present: false, evidence: '' },
    ],
  },
];

// ── Run 2: Week 3 Verification run (same sessions, second annotator) ──────────
const run2Sessions: MockSession[] = run1Sessions.map((s) => ({
  ...s,
  sessionId: s.sessionId + '-v',
  annotations: s.annotations.map((a) => ({
    ...a,
    // Slight disagreement on a few items to make kappa realistic
    present: Math.random() > 0.15 ? a.present : !a.present,
  })),
}));

// ── Run 3: Week 4 Planning, still running ─────────────────────────────────────
const run3Sessions: MockSession[] = [
  {
    sessionId: 's-201', studentName: 'Ethan K.', problem: 'Wildfire Explorer — Week 4',
    status: 'DONE', overallScore: 'Developing',
    planText: 'I want to use the fireline tool to protect the town and see if drought makes it harder.',
    summary: 'Student introduces a containment variable (fireline). Implicit causal reasoning about drought difficulty. Good start for Week 4 containment focus.',
    annotations: [
      { concept: 'Cause & Effect', present: true, evidence: 'Links drought level to difficulty of containment.' },
      { concept: 'Patterns', present: false, evidence: '' },
      { concept: 'Systems & System Models', present: true, evidence: 'Frames fireline as an intervention in the fire system.' },
      { concept: 'Stability & Change', present: true, evidence: 'Implicitly asking what keeps the town stable under fire threat.' },
      { concept: 'Scale, Proportion & Quantity', present: false, evidence: '' },
    ],
  },
  {
    sessionId: 's-202', studentName: 'Fatima A.', problem: 'Wildfire Explorer — Week 4',
    status: 'RUNNING', overallScore: 'Developing',
    planText: 'Still working on my plan…',
    summary: 'Session in progress.',
    annotations: [],
  },
  {
    sessionId: 's-203', studentName: 'George P.', problem: 'Wildfire Explorer — Week 4',
    status: 'DONE', overallScore: 'Strong',
    planText: "I'll compare using fireline vs. helitack in the same scenario — same wind, same drought — to measure which saves more acres. I'll use the graph to track total burned area.",
    summary: 'Strong experimental design comparing two intervention tools. Quantitative framing. Good control-of-variables reasoning for Week 4.',
    annotations: [
      { concept: 'Cause & Effect', present: true, evidence: 'Comparing fireline vs helitack as causal agents.' },
      { concept: 'Patterns', present: true, evidence: 'Using graph to track and compare burned area trends.' },
      { concept: 'Systems & System Models', present: true, evidence: 'Understands interventions change system behavior.' },
      { concept: 'Stability & Change', present: true, evidence: '"Saves more acres" is explicitly about stabilizing the landscape.' },
      { concept: 'Scale, Proportion & Quantity', present: true, evidence: 'Measures intervention effectiveness by acres.' },
    ],
  },
];

// ── Run 4: Air Pollution pilot, not started ───────────────────────────────────
const run4Sessions: MockSession[] = [
  { sessionId: 's-301', studentName: 'Hannah W.', problem: 'Air Pollution Sim', status: 'NOT_STARTED', overallScore: 'Developing', planText: '', summary: '', annotations: [] },
  { sessionId: 's-302', studentName: 'Ivan C.',   problem: 'Air Pollution Sim', status: 'NOT_STARTED', overallScore: 'Developing', planText: '', summary: '', annotations: [] },
  { sessionId: 's-303', studentName: 'Jade S.',   problem: 'Air Pollution Sim', status: 'NOT_STARTED', overallScore: 'Developing', planText: '', summary: '', annotations: [] },
];

export const MOCK_SANDPIPER_RUNS: SandpiperRun[] = [
  {
    _id: 'run-001',
    name: 'Wildfire Explorer — Week 3 Planning (n=24)',
    isRunning: false, isComplete: true, hasErrored: false,
    createdAt: '2026-06-08T14:22:00Z',
    sessions: run1Sessions,
  },
  {
    _id: 'run-002',
    name: 'Wildfire Explorer — Week 3 Planning (verification)',
    isRunning: false, isComplete: true, hasErrored: false,
    createdAt: '2026-06-08T15:05:00Z',
    sessions: run2Sessions,
  },
  {
    _id: 'run-003',
    name: 'Wildfire Explorer — Week 4 Planning (n=19)',
    isRunning: true, isComplete: false, hasErrored: false,
    createdAt: '2026-06-10T09:41:00Z',
    sessions: run3Sessions,
  },
  {
    _id: 'run-004',
    name: 'Air Pollution — Pilot (n=8)',
    isRunning: false, isComplete: false, hasErrored: false,
    createdAt: '2026-06-11T08:00:00Z',
    sessions: run4Sessions,
  },
];

export { CONCEPTS };
