import PlanSources, { PlanSourceDetail } from './PlanSources'

const BUCKET_LABELS = {
  subject: 'Subject',
  style: 'Style',
  lighting: 'Lighting',
  composition: 'Composition',
  technical: 'Technical Refinements',
}

function PlanSection({ title, items, className }) {
  if (!items || items.length === 0) return null
  return (
    <div className={`plan-section ${className || ''}`}>
      <span className="plan-section-label">{title}</span>
      <ul className="plan-section-list">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function PlanContextSummary({ ctx }) {
  if (!ctx) return null
  const parts = []
  if (ctx.projectName) parts.push(ctx.projectName)
  if (ctx.goal) parts.push('goal')
  if (ctx.hasApprovedPlan) parts.push('prior plan')
  if (ctx.outputsCount > 0) parts.push(`${ctx.outputsCount} outputs`)
  if (ctx.winnersCount > 0) {
    let w = `${ctx.winnersCount} winners`
    if (ctx.winnersWithFeedback > 0) w += ` (${ctx.winnersWithFeedback} with feedback)`
    parts.push(w)
  }
  if (ctx.lockedElementsCount > 0) parts.push(`${ctx.lockedElementsCount} locked`)
  if (ctx.refsCount > 0) parts.push(`${ctx.refsCount} refs`)
  if (ctx.memoriesCount > 0) {
    let mem = `${ctx.memoriesCount} memories`
    if (ctx.memoriesPinned > 0) mem += ` (${ctx.memoriesPinned} pinned)`
    parts.push(mem)
  }
  if (ctx.docsCount > 0) {
    let d = `${ctx.docsCount} docs`
    if (ctx.docsPinned > 0) d += ` (${ctx.docsPinned} pinned)`
    parts.push(d)
  }
  if (ctx.sharedMemoriesCount > 0) {
    let sm = `${ctx.sharedMemoriesCount} shared memories`
    if (ctx.sharedMemoriesPinned > 0) sm += ` (${ctx.sharedMemoriesPinned} pinned)`
    parts.push(sm)
  }
  if (ctx.sharedDocsCount > 0) {
    let sd = `${ctx.sharedDocsCount} shared docs`
    if (ctx.sharedDocsPinned > 0) sd += ` (${ctx.sharedDocsPinned} pinned)`
    parts.push(sd)
  }

  return (
    <div className="plan-context-summary">
      Planning context: {parts.join(' · ')}
    </div>
  )
}

function formatUsageNumber(value) {
  return value.toLocaleString()
}

function formatCostNumber(value) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

function PlanUsageMeta({ planMeta, className = '' }) {
  const promptTokens = Number.isFinite(planMeta?.tokenUsage?.prompt) ? planMeta.tokenUsage.prompt : null
  const outputTokens = Number.isFinite(planMeta?.tokenUsage?.output) ? planMeta.tokenUsage.output : null
  const totalTokens = Number.isFinite(planMeta?.tokenUsage?.total) ? planMeta.tokenUsage.total : null
  const estimatedCost = Number.isFinite(planMeta?.estimatedCost) ? planMeta.estimatedCost : null

  const items = []

  if (promptTokens !== null) items.push({ label: 'Prompt', value: formatUsageNumber(promptTokens) })
  if (outputTokens !== null) items.push({ label: 'Output', value: formatUsageNumber(outputTokens) })
  if (totalTokens !== null) items.push({ label: 'Total', value: formatUsageNumber(totalTokens) })
  if (estimatedCost !== null) {
    items.push({ label: 'Cost', value: formatCostNumber(estimatedCost) })
  } else if (items.length > 0) {
    items.push({ label: 'Cost', value: 'unavailable' })
  }

  if (items.length === 0) return null

  return (
    <div className={`plan-usage-meta ${className}`.trim()}>
      {items.map((item) => (
        <span className="plan-usage-chip" key={item.label}>
          <span className="plan-usage-label">{item.label}</span>
          <span className="plan-usage-value">{item.value}</span>
        </span>
      ))}
    </div>
  )
}

export default function SessionHeader({
  goal,
  onGoalChange,
  plan,
  planStatus,
  planError,
  onGeneratePlan,
  onApprovePlan,
  onDismissPlan,
  goalDirtyAfterApproval,
  onResetSession,
  onDismissGoalWarning,
  memories,
  docs,
  sharedMemories,
  sharedDocs,
  planExcludedKeys,
  onToggleExclude,
  onClearExcludes,
  planSourceSnapshot,
}) {
  return (
    <section className="section">
      <div className="section-title">Session Goal</div>
      <textarea
        className="session-goal-input"
        rows={3}
        placeholder="What do you want to accomplish in this session?"
        value={goal}
        onChange={(e) => onGoalChange(e.target.value)}
      />

      {/* Warning: goal edited after plan approval */}
      {goalDirtyAfterApproval && planStatus === 'approved' && (
        <div className="goal-dirty-warning">
          <span className="goal-dirty-warning-text">
            Goal changed since plan was approved. Start a new session or keep working?
          </span>
          <div className="goal-dirty-warning-actions">
            <button className="btn btn-sm btn-danger-outline" onClick={onResetSession}>
              Reset Session
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onDismissGoalWarning}>
              Keep Working
            </button>
          </div>
        </div>
      )}

      {/* Idle state */}
      {planStatus === 'idle' && (
        <div className="plan-area">
          <div className="section-title">AI Plan</div>
          {planError && (
            <div className="plan-error">{planError}</div>
          )}
          <div className="plan-placeholder">
            AI recommendations will appear here — what to change, what to preserve, what to try next.
          </div>
          <PlanSources
            memories={memories}
            docs={docs}
            sharedMemories={sharedMemories}
            sharedDocs={sharedDocs}
            excludedKeys={planExcludedKeys}
            onToggleExclude={onToggleExclude}
            onClearExcludes={onClearExcludes}
          />
          <button
            className="btn btn-secondary btn-sm"
            disabled={!goal.trim()}
            onClick={onGeneratePlan}
          >
            Generate Plan
          </button>
        </div>
      )}

      {/* Generating state */}
      {planStatus === 'generating' && (
        <div className="plan-area">
          <div className="section-title">AI Plan</div>
          <div className="plan-generating">
            <div className="gen-spinner" />
            <span>Generating plan...</span>
          </div>
        </div>
      )}

      {/* Generated — full plan display */}
      {planStatus === 'generated' && plan && (
        <div className="plan-area plan-area-generated">
          <div className="section-title">AI Plan</div>
          <div className="plan-summary">{plan.summary}</div>

          <PlanSection title="Preserve" items={plan.preserve} className="plan-preserve" />
          <PlanSection title="Push Further" items={plan.pushFurther} className="plan-push" />
          <PlanSection title="Change / Reconsider" items={plan.change} className="plan-change" />
          <PlanSection title="Risks / Tradeoffs" items={plan.risks} className="plan-risks" />

          {plan.approach && (
            <div className="plan-approach">
              <span className="plan-section-label">Approach</span>
              <p className="plan-approach-text">{plan.approach}</p>
            </div>
          )}

          <div className="plan-bucket-preview">
            {plan.buckets && Object.entries(plan.buckets).map(([key, value]) => (
              <div className="plan-bucket-item" key={key}>
                <span className="plan-bucket-label">{BUCKET_LABELS[key]}</span>
                <span className="plan-bucket-value">{value}</span>
              </div>
            ))}
          </div>

          <PlanSourceDetail snapshot={planSourceSnapshot} />
          <PlanContextSummary ctx={plan.contextUsed} />

          {plan.planMeta && (
            <div className="plan-meta">
              {plan.planMeta.model} · {(plan.planMeta.durationMs / 1000).toFixed(1)}s
            </div>
          )}
          <PlanUsageMeta planMeta={plan.planMeta} />

          <div className="plan-actions">
            <button className="btn btn-primary btn-sm" onClick={onApprovePlan}>
              Approve Plan
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onDismissPlan}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Approved — compact bar */}
      {planStatus === 'approved' && plan && (
        <div className="plan-approved-bar">
          <span className="plan-approved-label">Plan:</span>
          <div className="plan-approved-main">
            <span className="plan-approved-text">{plan.summary}</span>
            <PlanUsageMeta planMeta={plan.planMeta} className="plan-usage-meta-approved" />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onDismissPlan}>
            Reset
          </button>
        </div>
      )}
    </section>
  )
}
