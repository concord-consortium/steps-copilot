import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import type { Course, CourseListItem, Problem } from '../lib/types';

interface Props {
  onSignOut: () => void;
  onPick: (courseId: string, problem: Problem) => void;
}

// Course + problem selector (SPEC §4.2), lifted from poc with one behavioral change: if
// there is exactly one course, auto-select it and skip the course accordion — jump straight
// to its problem list.
export function Picker({ onSignOut, onPick }: Props) {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [openCourse, setOpenCourse] = useState<string | null>(null);
  const [problems, setProblems] = useState<Record<string, Problem[]>>({});
  const [loadingProblems, setLoadingProblems] = useState(false);

  useEffect(() => {
    apiFetch<CourseListItem[]>('/courses?limit=100')
      .then((data) => {
        const list = data.map((d) => d.course);
        setCourses(list);
        // Single-course auto-select: open it immediately and load its problems.
        if (list.length === 1) void openAndLoad(list[0].id);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openAndLoad(courseId: string) {
    setOpenCourse(courseId);
    if (!problems[courseId]) {
      setLoadingProblems(true);
      try {
        const data = await apiFetch<Problem[]>(
          `/problems/by-course/${courseId}?limit=100`,
        );
        setProblems((p) => ({ ...p, [courseId]: data }));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoadingProblems(false);
      }
    }
  }

  async function toggleCourse(courseId: string) {
    if (openCourse === courseId) {
      setOpenCourse(null);
      return;
    }
    await openAndLoad(courseId);
  }

  const singleCourse = courses?.length === 1;

  return (
    <div className="picker">
      <header className="bar">
        <strong>{singleCourse ? courses![0].name : 'Your courses'}</strong>
        <button className="link" onClick={onSignOut}>
          Sign out
        </button>
      </header>

      <div className="picker-body">
        {error && <div className="error">{error}</div>}
        {!courses && !error && <div className="muted">Loading courses…</div>}
        {courses && courses.length === 0 && (
          <div className="muted">
            No courses found for this account. The harness requires a STUDENT login with at
            least one course and assigned problem.
          </div>
        )}

        {/* Single course: render its problems directly, no accordion. */}
        {singleCourse && (
          <ProblemList
            problems={problems[courses![0].id]}
            loading={loadingProblems}
            onPick={(p) => onPick(courses![0].id, p)}
          />
        )}

        {/* Multiple courses: the existing accordion picker. */}
        {courses &&
          courses.length > 1 &&
          courses.map((c) => (
            <div key={c.id} className="course">
              <button className="course-head" onClick={() => toggleCourse(c.id)}>
                <span>{openCourse === c.id ? '▾' : '▸'}</span> {c.name}
              </button>
              {openCourse === c.id && (
                <div className="problems">
                  <ProblemList
                    problems={problems[c.id]}
                    loading={loadingProblems}
                    onPick={(p) => onPick(c.id, p)}
                  />
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

function ProblemList({
  problems,
  loading,
  onPick,
}: {
  problems: Problem[] | undefined;
  loading: boolean;
  onPick: (problem: Problem) => void;
}) {
  if (!problems) {
    return loading ? <div className="muted">Loading problems…</div> : null;
  }
  if (problems.length === 0) {
    return <div className="muted">No problems assigned.</div>;
  }
  return (
    <>
      {problems.map((p) => (
        <button key={p.id} className="problem" onClick={() => onPick(p)}>
          <span>{p.title}</span>
          {p.latestPerform && <span className="tag">{p.latestPerform.status}</span>}
        </button>
      ))}
    </>
  );
}
