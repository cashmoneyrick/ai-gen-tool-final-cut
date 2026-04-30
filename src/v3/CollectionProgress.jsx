import { useMemo } from 'react'
import { normalizeFeedback } from '../reviewFeedback.js'

function VariationPlanProgress({ plan, outputs, winners }) {
  if (!plan || !plan.variants || plan.variants.length === 0) return null

  const winnerOutputIds = new Set(winners.map((winner) => winner.outputId || winner.id))
  const outputIdByVariationId = new Map(
    outputs
      .filter((output) => output.variationId)
      .map((output) => [output.variationId, output.id])
  )
  const variants = plan.variants.map((variant) => {
    const outputId = variant.outputId || outputIdByVariationId.get(variant.id) || null
    const status = outputId && winnerOutputIds.has(outputId) ? 'winner' : variant.status
    return { ...variant, outputId, status }
  })

  const total = plan.variants.length
  const generated = variants.filter((v) => v.status === 'generated' || v.status === 'winner').length
  const generating = variants.filter((v) => v.status === 'generating').length
  const winnerCount = variants.filter((v) => v.status === 'winner').length

  return (
    <div className="v3-cprog-vplan">
      <div className="v3-cprog-vplan-row">
        <span className="v3-cprog-title">Variation Plan</span>
        <span className="v3-cprog-counts">
          {generated} of {total} generated
          {winnerCount > 0 && ` · ${winnerCount} winner${winnerCount !== 1 ? 's' : ''}`}
          {generating > 0 && ` · ${generating} running`}
        </span>
      </div>
      <div className="v3-cprog-vplan-slots">
        {variants.map((variant) => (
          <div
            key={variant.id}
            className={`v3-cprog-vplan-slot v3-cprog-vplan-slot--${variant.status}`}
            title={`${variant.label}: ${variant.status}`}
          />
        ))}
      </div>
    </div>
  )
}

export default function CollectionProgress({ project, outputs, winners }) {
  const stats = useMemo(() => {
    const ratingCounts = [0, 0, 0, 0, 0] // index i = rating (i+1)
    let ratedCount = 0
    for (const output of outputs) {
      const r = normalizeFeedback(output.feedback)
      if (r !== null && r >= 1 && r <= 5) {
        ratingCounts[r - 1]++
        ratedCount++
      }
    }
    return { ratingCounts, ratedCount }
  }, [outputs])

  if (!project) return null

  const totalOutputs = outputs.length
  const totalWinners = winners.length
  const maxCount = Math.max(...stats.ratingCounts, 1)

  return (
    <div className="v3-cprog">
      <div className="v3-cprog-row">
        <span className="v3-cprog-title">Collection</span>
        <span className="v3-cprog-counts">
          {totalOutputs} outputs
          {totalWinners > 0 && ` · ${totalWinners} winner${totalWinners !== 1 ? 's' : ''}`}
          {stats.ratedCount > 0 && ` · ${stats.ratedCount} rated`}
        </span>
      </div>
      {stats.ratedCount > 0 && (
        <div className="v3-cprog-bars">
          {stats.ratingCounts.map((count, i) => (
            <div key={i} className="v3-cprog-bar-row">
              <span className="v3-cprog-bar-label">{i + 1}</span>
              <div className="v3-cprog-bar-track">
                <div
                  className="v3-cprog-bar-fill"
                  style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                  data-rating={i + 1}
                />
              </div>
              <span className="v3-cprog-bar-count">{count || ''}</span>
            </div>
          ))}
        </div>
      )}
      <VariationPlanProgress plan={project.variationPlan} outputs={outputs} winners={winners} />
    </div>
  )
}
