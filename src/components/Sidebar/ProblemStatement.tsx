import { useState } from 'react';

interface Props {
  statement: string | undefined;
}

// Problem statement section (SPEC §7.1). The statement HTML ships inline on the
// /problems/by-course list response (GET /problems/:id is 403 for students), so the Picker
// already has it — no extra fetch. Rendered as HTML (may contain platform KaTeX spans;
// basic HTML for v1). Read-only, scrolls within its section. Collapsible (default expanded):
// collapsing hides the body so the tabbed UI below grows to fill the space.
export function ProblemStatement({ statement }: Props) {
  const [expanded, setExpanded] = useState(true);
  const empty = !statement || statement.trim() === '';
  return (
    <section className="sb-section sb-statement">
      <div className="sb-statement-head">
        <h3 className="sb-title">Problem statement</h3>
        <button
          className="sb-collapse"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▾' : '▸'}
        </button>
      </div>
      {expanded && (
        <div className="sb-statement-body">
          {empty ? (
            <div className="muted">No statement provided.</div>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: statement! }} />
          )}
        </div>
      )}
    </section>
  );
}
