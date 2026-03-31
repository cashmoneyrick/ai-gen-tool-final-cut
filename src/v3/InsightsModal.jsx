import { useState, useEffect, useCallback } from 'react'
import { computeInsights } from './insights/computeInsights.js'
import { formatCost } from './costUtils.js'
import './InsightsModal.css'

const TABS = [
  { id: 'health', label: 'Health' },
  { id: 'trends', label: 'Trends' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'projects', label: 'Projects' },
  { id: 'models', label: 'Models' },
  { id: 'costs', label: 'Costs' },
]

// --- Reusable sub-components ---

function StatCard({ value, label, sub, variant }) {
  const cls = variant ? `v3-stat-value v3-stat-value--${variant}` : 'v3-stat-value'
  return (
    <div className="v3-stat-card">
      <div className={cls}>{value ?? '--'}</div>
      <div className="v3-stat-label">{label}</div>
      {sub && <div className="v3-stat-sub">{sub}</div>}
    </div>
  )
}

function ProgressBar({ label, value, max = 100, variant }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const fillCls = variant ? `v3-progress-fill v3-progress-fill--${variant}` : 'v3-progress-fill'
  return (
    <div className="v3-progress-row">
      <span className="v3-progress-label">{label}</span>
      <div className="v3-progress-track">
        <div className={fillCls} style={{ width: `${pct}%` }} />
      </div>
      <span className="v3-progress-value">{value != null ? `${pct}%` : '--'}</span>
    </div>
  )
}

function RankedList({ header, items }) {
  if (!items || items.length === 0) return null
  return (
    <div className="v3-ranked-list">
      {header && <div className="v3-ranked-header">{header}</div>}
      {items.map((item, i) => (
        <div className="v3-ranked-item" key={i}>
          <span className="v3-ranked-text">{item.text}</span>
          <span className="v3-ranked-value">{item.value}</span>
        </div>
      ))}
    </div>
  )
}

// --- Section components ---

function HealthSection({ data }) {
  if (!data) return null
  return (
    <>
      <div className="v3-stat-grid">
        <StatCard value={data.totalImages} label="Total Images" />
        <StatCard value={data.totalWinners} label="Winners" variant="success" />
        <StatCard value={data.winRate != null ? `${data.winRate}%` : '--'} label="Win Rate" variant={data.winRate > 50 ? 'success' : data.winRate != null ? 'danger' : undefined} />
        <StatCard value={data.avgConvergence} label="Avg Attempts" sub="to first winner" />
      </div>
      <h4 className="v3-insights-section-title">System Utilization</h4>
      <ProgressBar label="Memory usage" value={data.memoryUtilization} variant={data.memoryUtilization > 50 ? 'success' : undefined} />
      <ProgressBar label="Carry-forward" value={data.carryForwardRate} variant={data.carryForwardRate > 50 ? 'success' : undefined} />
      <ProgressBar label="Active memories" value={data.activeMemories} max={data.totalMemories || 1} />
    </>
  )
}

function TrendsSection({ data }) {
  if (!data) return null
  const winDelta = data.earlyWinRate != null && data.recentWinRate != null ? data.recentWinRate - data.earlyWinRate : null
  const convDelta = data.earlyConvergence != null && data.recentConvergence != null ? data.earlyConvergence - data.recentConvergence : null

  return (
    <>
      <h4 className="v3-insights-section-title">Is the system getting better?</h4>
      <div className="v3-comparison">
        <div className="v3-comparison-card">
          <div className="v3-comparison-label">Early Win Rate</div>
          <div className="v3-comparison-value">{data.earlyWinRate != null ? `${data.earlyWinRate}%` : '--'}</div>
        </div>
        <div className="v3-comparison-card">
          <div className="v3-comparison-label">Recent Win Rate</div>
          <div className={`v3-comparison-value ${winDelta > 0 ? 'v3-trend-up' : winDelta < 0 ? 'v3-trend-down' : ''}`}>
            {data.recentWinRate != null ? `${data.recentWinRate}%` : '--'}
          </div>
          {winDelta != null && (
            <div className={`v3-comparison-delta ${winDelta > 0 ? 'v3-trend-up' : winDelta < 0 ? 'v3-trend-down' : 'v3-trend-neutral'}`}>
              {winDelta > 0 ? `+${winDelta}pp improvement` : winDelta < 0 ? `${winDelta}pp decline` : 'No change'}
            </div>
          )}
        </div>
      </div>

      <div className="v3-comparison">
        <div className="v3-comparison-card">
          <div className="v3-comparison-label">Early Convergence</div>
          <div className="v3-comparison-value">{data.earlyConvergence ?? '--'}</div>
          <div className="v3-comparison-delta v3-trend-neutral">attempts to winner</div>
        </div>
        <div className="v3-comparison-card">
          <div className="v3-comparison-label">Recent Convergence</div>
          <div className={`v3-comparison-value ${convDelta > 0 ? 'v3-trend-up' : convDelta < 0 ? 'v3-trend-down' : ''}`}>
            {data.recentConvergence ?? '--'}
          </div>
          {convDelta != null && (
            <div className={`v3-comparison-delta ${convDelta > 0 ? 'v3-trend-up' : convDelta < 0 ? 'v3-trend-down' : 'v3-trend-neutral'}`}>
              {convDelta > 0 ? `${convDelta} fewer attempts` : convDelta < 0 ? `${Math.abs(convDelta)} more attempts` : 'No change'}
            </div>
          )}
        </div>
      </div>

      <h4 className="v3-insights-section-title">Feedback Resolution</h4>
      {data.feedbackResolutionRate != null ? (
        <>
          <ProgressBar
            label="Fix requests resolved"
            value={data.feedbackResolutionRate}
            variant={data.feedbackResolutionRate > 50 ? 'success' : 'danger'}
          />
          <div className="v3-stat-sub" style={{ marginTop: -4, marginBottom: 8, paddingLeft: 130 }}>
            {data.fixResolved} of {data.fixTotal} fix requests led to improvement
          </div>
        </>
      ) : (
        <div className="v3-insights-empty">Not enough feedback data yet</div>
      )}
    </>
  )
}

function PatternsSection({ data }) {
  if (!data) return null
  return (
    <>
      <div className="v3-insights-columns">
        <div>
          <h4 className="v3-insights-section-title">Winning words</h4>
          <RankedList
            items={data.winningWords.map((w) => ({ text: w.word, value: `${w.count}/${w.total}` }))}
          />
          {data.winningWords.length === 0 && <div className="v3-insights-empty">Not enough data</div>}
        </div>
        <div>
          <h4 className="v3-insights-section-title">Rejected words</h4>
          <RankedList
            items={data.rejectedWords.map((w) => ({ text: w.word, value: `${w.count}/${w.total}` }))}
          />
          {data.rejectedWords.length === 0 && <div className="v3-insights-empty">Not enough data</div>}
        </div>
      </div>

      <div className="v3-insights-columns">
        <div>
          <h4 className="v3-insights-section-title">Top fix requests</h4>
          <RankedList
            items={data.topFixes.map((f) => ({ text: f.text, value: `${f.count}x` }))}
          />
          {data.topFixes.length === 0 && <div className="v3-insights-empty">No fix notes yet</div>}
        </div>
        <div>
          <h4 className="v3-insights-section-title">Top keep directives</h4>
          <RankedList
            items={data.topKeeps.map((k) => ({ text: k.text, value: `${k.count}x` }))}
          />
          {data.topKeeps.length === 0 && <div className="v3-insights-empty">No keep notes yet</div>}
        </div>
      </div>
    </>
  )
}

function ProjectsSection({ data }) {
  if (!data || data.length === 0) return <div className="v3-insights-empty">No projects with outputs yet</div>

  return (
    <div className="v3-ranked-list">
      <div className="v3-ranked-header" style={{ display: 'flex', gap: 16 }}>
        <span style={{ flex: 1 }}>Project</span>
        <span style={{ width: 60, textAlign: 'right' }}>Win Rate</span>
        <span style={{ width: 50, textAlign: 'right' }}>Images</span>
        <span style={{ width: 50, textAlign: 'right' }}>Winners</span>
        <span style={{ width: 60, textAlign: 'right' }}>Conv.</span>
        <span style={{ width: 60, textAlign: 'right' }}>Cost</span>
      </div>
      {data.map((p) => (
        <div className="v3-ranked-item" key={p.id} style={{ display: 'flex', gap: 16 }}>
          <span className="v3-ranked-text" style={{ flex: 1 }}>{p.name}</span>
          <span className="v3-ranked-value" style={{ width: 60, textAlign: 'right' }}>
            {p.winRate != null ? `${p.winRate}%` : '--'}
          </span>
          <span className="v3-ranked-value" style={{ width: 50, textAlign: 'right' }}>{p.totalOutputs}</span>
          <span className="v3-ranked-value" style={{ width: 50, textAlign: 'right' }}>{p.totalWinners}</span>
          <span className="v3-ranked-value" style={{ width: 60, textAlign: 'right' }}>{p.avgConvergence ?? '--'}</span>
          <span className="v3-ranked-value" style={{ width: 60, textAlign: 'right' }}>{formatCost(p.totalCost)}</span>
        </div>
      ))}
    </div>
  )
}

function ModelsSection({ data }) {
  if (!data || data.length === 0) return <div className="v3-insights-empty">No generation data yet</div>

  return (
    <div className="v3-stat-grid" style={{ gridTemplateColumns: `repeat(${Math.min(data.length, 3)}, 1fr)` }}>
      {data.map((m) => (
        <div key={m.model} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="v3-stat-card">
            <div className="v3-stat-value">{m.displayName}</div>
            <div className="v3-stat-label">{m.total} images</div>
          </div>
          <div className="v3-stat-card">
            <div className={`v3-stat-value ${m.winRate > 50 ? 'v3-stat-value--success' : ''}`}>
              {m.winRate != null ? `${m.winRate}%` : '--'}
            </div>
            <div className="v3-stat-label">Win Rate</div>
          </div>
          <div className="v3-stat-card">
            <div className="v3-stat-value">{formatCost(m.costPerWinner)}</div>
            <div className="v3-stat-label">Cost / Winner</div>
          </div>
          <div className="v3-stat-card">
            <div className="v3-stat-value">{m.avgDuration ? `${m.avgDuration}s` : '--'}</div>
            <div className="v3-stat-label">Avg Duration</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function CostsSection({ data }) {
  if (!data) return null

  const costDelta = data.earlyCost > 0 && data.recentCost > 0
    ? Math.round(((data.recentCost - data.earlyCost) / data.earlyCost) * 100)
    : null

  return (
    <>
      <div className="v3-stat-grid">
        <StatCard value={formatCost(data.totalSpend)} label="Total Spend" sub={`${data.costedCount} images`} />
        <StatCard value={formatCost(data.costPerWinner)} label="Cost / Winner" variant={data.costPerWinner != null ? 'accent' : undefined} />
        <StatCard value={formatCost(data.earlyCost)} label="Early Spend" sub="first half" />
        <StatCard value={formatCost(data.recentCost)} label="Recent Spend" sub="second half" />
      </div>

      {data.projectCosts.length > 0 && (
        <>
          <h4 className="v3-insights-section-title">Spend by project</h4>
          {data.projectCosts.slice(0, 10).map((p) => (
            <ProgressBar
              key={p.projectId}
              label={p.name}
              value={p.cost}
              max={data.projectCosts[0]?.cost || 1}
            />
          ))}
        </>
      )}
    </>
  )
}

// --- Main modal ---

export default function InsightsModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('health')
  const [insights, setInsights] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    computeInsights().then((data) => {
      setInsights(data)
      setLoading(false)
    }).catch((err) => {
      console.error('[insights] Failed to compute:', err)
      setLoading(false)
    })
  }, [])

  // Escape to close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const renderSection = useCallback(() => {
    if (loading) return <div className="v3-insights-loading">Computing insights...</div>
    if (!insights) return <div className="v3-insights-empty">Failed to load data</div>

    switch (activeTab) {
      case 'health': return <HealthSection data={insights.health} />
      case 'trends': return <TrendsSection data={insights.trends} />
      case 'patterns': return <PatternsSection data={insights.patterns} />
      case 'projects': return <ProjectsSection data={insights.projects} />
      case 'models': return <ModelsSection data={insights.models} />
      case 'costs': return <CostsSection data={insights.costs} />
      default: return null
    }
  }, [activeTab, insights, loading])

  return (
    <div className="v3-insights-backdrop" onClick={onClose}>
      <div className="v3-insights-modal" onClick={(e) => e.stopPropagation()}>
        <div className="v3-insights-header">
          <span className="v3-insights-title">System Insights</span>
          <button className="v3-insights-close" onClick={onClose}>&times;</button>
        </div>

        <div className="v3-insights-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`v3-insights-tab ${activeTab === tab.id ? 'v3-insights-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="v3-insights-content">
          {renderSection()}
        </div>
      </div>
    </div>
  )
}
