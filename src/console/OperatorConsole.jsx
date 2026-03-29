import './OperatorConsole.css'
import {
  MOCK_PROJECT,
  MOCK_SESSION,
  MOCK_LOCKED_ELEMENTS,
  MOCK_OUTPUTS,
  MOCK_WINNERS,
} from './mockData'
import LatestRunHero from './sections/LatestRunHero'
import FastFeedback from './sections/FastFeedback'
import NextAttempt from './sections/NextAttempt'
import RecentHistory from './sections/RecentHistory'
import ContextSnapshot from './sections/ContextSnapshot'

export default function OperatorConsole({ onClose }) {
  // Get latest output (first in array)
  const latestOutput = MOCK_OUTPUTS[0]

  return (
    <div className="op-console">
      {/* Header */}
      <div className="op-console-header">
        <div className="op-console-title">Operator Console</div>
        <div className="op-console-badges">
          <span className="op-badge op-badge-model">Mock Data</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            ← Back to Studio
          </button>
        </div>
      </div>

      {/* Hero Section */}
      <section className="section">
        <LatestRunHero output={latestOutput} />
      </section>

      {/* Fast Feedback */}
      <FastFeedback output={latestOutput} />

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
          outputs={MOCK_OUTPUTS}
          winners={MOCK_WINNERS}
          currentOutputId={latestOutput?.id}
        />

        {/* Context */}
        <section className="section" style={{ padding: '0' }}>
          <div className="section-title">Context</div>
          <div style={{ marginTop: '12px' }}>
            <ContextSnapshot
              project={MOCK_PROJECT}
              session={MOCK_SESSION}
              lockedElements={MOCK_LOCKED_ELEMENTS}
              output={latestOutput}
            />
          </div>
        </section>
      </div>

      {/* Next Attempt */}
      <section className="section">
        <NextAttempt
          session={MOCK_SESSION}
          lockedCount={MOCK_LOCKED_ELEMENTS.filter((el) => el.enabled).length}
        />
      </section>
    </div>
  )
}
