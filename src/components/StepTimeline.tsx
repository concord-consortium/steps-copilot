// The perform lifecycle as an ordered list of steps, with full display names taken from
// steps-tutor-fe (perform-screen.tsx step/sub-step labels + the PerformStatus enum). The
// internal status id (e.g. "developing_plan") maps to a human name shown in the timeline.
const STEPS: { id: string; name: string }[] = [
  { id: 'developing_plan', name: 'Create plan' },
  { id: 'submitting_plan', name: 'Submit plan' },
  { id: 'preparing_solution', name: 'Prepare solution' },
  { id: 'reviewing_solution', name: 'Review solution' },
  { id: 'solution_reviewed', name: 'Solution reviewed' },
  { id: 'solution_finalized', name: 'Submit final solution' },
  { id: 'performing_reflection', name: 'Reflect on solution' },
  { id: 'reflection_completed', name: 'Reflection completed' },
  { id: 'completed', name: 'Completed' },
];

interface Props {
  /** Current perform status id (e.g. "developing_plan"). */
  currentStatus: string;
}

// A connected timeline of circle icons around the current step (SPEC §4.3 top bar). The first,
// current, and last steps show their full name; every other step is just a circle whose
// `title` tooltip is the step name.
export function StepTimeline({ currentStatus }: Props) {
  const current = STEPS.findIndex((s) => s.id === currentStatus);
  const last = STEPS.length - 1;

  return (
    <div className="steps-timeline" role="list" aria-label="Progress">
      {STEPS.map((step, i) => {
        const state = current < 0 ? 'pending' : i < current ? 'done' : i === current ? 'active' : 'pending';
        const showLabel = i === 0 || i === current || i === last;
        return (
          <div key={step.id} className="st-node" role="listitem">
            {i > 0 && <span className={`st-line ${current >= 0 && i <= current ? 'st-line-done' : ''}`} />}
            <span className={`st-step st-${state}`} title={step.name}>
              <span className="st-dot" aria-hidden="true" />
              {showLabel && <span className="st-label">{step.name}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
