interface Props {
  statement: string | undefined;
}

// Problem statement section (SPEC §7.1). The statement HTML ships inline on the
// /problems/by-course list response (GET /problems/:id is 403 for students), so the Picker
// already has it — no extra fetch. Rendered as HTML (may contain platform KaTeX spans;
// basic HTML for v1). Read-only, scrolls within its section.
export function ProblemStatement({ statement }: Props) {
  const empty = !statement || statement.trim() === '';
  return (
    <section className="sb-section sb-statement">
      <h3 className="sb-title">Problem statement</h3>
      <div className="sb-statement-body">
        {empty ? (
          <div className="muted">No statement provided.</div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: statement! }} />
        )}
      </div>
    </section>
  );
}
