import { useMemo } from 'react'

export default function ProjectLessons({ lessons, onRemove }) {
  // Explicitly newest first — do not rely on incidental array order
  const sorted = useMemo(
    () => [...(lessons || [])].sort((a, b) => b.createdAt - a.createdAt),
    [lessons]
  )

  if (sorted.length === 0) {
    return (
      <section className="section">
        <div className="section-title">Lessons</div>
        <div className="project-lessons-empty">
          No lessons yet.
        </div>
      </section>
    )
  }

  return (
    <section className="section">
      <div className="section-title">
        Lessons
        <span className="project-lessons-count">{sorted.length}</span>
      </div>
      <div className="project-lessons-list">
        {sorted.map((lesson) => (
          <div className="project-lesson-row" key={lesson.id}>
            <span className={`project-lesson-signal project-lesson-signal-${lesson.signal}`}>
              {lesson.signal === 'up' ? '\ud83d\udc4d' : '\ud83d\udc4e'}
            </span>
            <span className="project-lesson-text">{lesson.text}</span>
            {lesson.sourcePlanRunId && (
              <span className="project-lesson-source">from plan run</span>
            )}
            <button
              className="btn btn-ghost btn-sm project-lesson-delete"
              onClick={() => onRemove(lesson.id)}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
