import { useMemo } from 'react'
import { normalizeFeedback } from '../reviewFeedback.js'

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
    <div className="v3-cp">
      <div className="v3-cp-row">
        <span className="v3-cp-title">Collection</span>
        <span className="v3-cp-counts">
          {totalOutputs} outputs
          {totalWinners > 0 && ` · ${totalWinners} winner${totalWinners !== 1 ? 's' : ''}`}
          {stats.ratedCount > 0 && ` · ${stats.ratedCount} rated`}
        </span>
      </div>
      {stats.ratedCount > 0 && (
        <div className="v3-cp-bars">
          {stats.ratingCounts.map((count, i) => (
            <div key={i} className="v3-cp-bar-row">
              <span className="v3-cp-bar-label">{i + 1}</span>
              <div className="v3-cp-bar-track">
                <div
                  className="v3-cp-bar-fill"
                  style={{ width: `${Math.round((count / maxCount) * 100)}%` }}
                  data-rating={i + 1}
                />
              </div>
              <span className="v3-cp-bar-count">{count || ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
