import './OperatorConsole.css'
import LastRunReceipt from './sections/LastRunReceipt'
import LatestRunHero from './sections/LatestRunHero'
import FastFeedback from './sections/FastFeedback'
import RunNextAttempt from './sections/RunNextAttempt'
import RecentHistory from './sections/RecentHistory'
import ContextSnapshot from './sections/ContextSnapshot'

export default function OperatorConsole({
  onClose,
  outputs,
  winners,
  project,
  session,
  lockedElements,
  refs,
  iterationContext,
}) {
  const latestOutput = outputs?.[0] || null
  const hasOutputs = outputs && outputs.length > 0

  return (
    <div className="op-console">
      {/* Header */}
      <div className="op-console-header">
        <div className="op-console-title">Operator Console</div>
        <div className="op-console-badges">
          {project && (
            <span className="op-badge op-badge-model">{project.name}</span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            ← Back to Studio
          </button>
        </div>
      </div>

      {/* Last Run Receipt */}
      <LastRunReceipt output={latestOutput} />

      {/* Hero Section */}
      <section className="section">
        <LatestRunHero
          output={latestOutput}
          iterationContext={iterationContext}
        />
      </section>

      {/* Fast Feedback — still mock for actions, reads output.feedback for display */}
      {latestOutput && <FastFeedback output={latestOutput} />}

      {/* Split Layout: History on left, Context on right */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '20px',
        }}
      >
        {/* History */}
        <RecentHistory
          outputs={outputs || []}
          winners={winners || []}
          currentOutputId={latestOutput?.id}
        />

        {/* Context */}
        <section className="section" style={{ padding: '0' }}>
          <div className="section-title">Context</div>
          <div style={{ marginTop: '12px' }}>
            <ContextSnapshot
              project={project}
              session={session}
              lockedElements={lockedElements || []}
              refs={refs || []}
              iterationContext={iterationContext}
            />
          </div>
        </section>
      </div>

      {/* Run Next Attempt — handoff bridge */}
      <section className="section">
        <RunNextAttempt
          session={session}
          lockedElements={lockedElements}
          refs={refs}
          iterationContext={iterationContext}
          outputs={outputs}
          winners={winners}
        />
      </section>
    </div>
  )
}
