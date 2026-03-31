import { useRef, useEffect, useMemo } from 'react'

// Rainbow palette — each entry is an RGB triplet string for use in rgba()
// Cycles through distinct, vibrant hues so every batch is unmistakable
const BATCH_COLORS = [
  '0, 122, 255',     // blue
  '255, 59, 48',     // red
  '52, 199, 89',     // green
  '255, 149, 0',     // orange
  '175, 82, 222',    // purple
  '0, 199, 190',     // teal
  '255, 45, 85',     // pink
  '90, 200, 250',    // cyan
  '255, 204, 0',     // yellow
  '88, 86, 214',     // indigo
  '255, 112, 67',    // deep orange
  '76, 217, 100',    // lime
]

export default function ThumbnailStrip({ outputs, currentIndex, onNavigate }) {
  const stripRef = useRef(null)
  const activeRef = useRef(null)

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [currentIndex])

  // Build batch groups with metadata
  const { batchGroups, globalIndexMap } = useMemo(() => {
    if (!outputs || outputs.length === 0) return { batchGroups: [], globalIndexMap: new Map() }

    const groups = []
    let current = { createdAt: outputs[0]?.createdAt, items: [] }

    for (const o of outputs) {
      if (o.createdAt === current.createdAt) {
        current.items.push(o)
      } else {
        groups.push(current)
        current = { createdAt: o.createdAt, items: [o] }
      }
    }
    groups.push(current)

    const total = groups.length
    const indexMap = new Map()
    let runningIdx = 0

    const enriched = groups.map((g, i) => {
      const startIdx = runningIdx
      for (const o of g.items) {
        indexMap.set(o.id, runningIdx)
        runningIdx++
      }
      return {
        ...g,
        startIdx,
        batchNum: total - i,
        isNewest: i === 0,
        age: i,
        color: BATCH_COLORS[i % BATCH_COLORS.length],
      }
    })

    return { batchGroups: enriched, globalIndexMap: indexMap }
  }, [outputs])

  if (!outputs || outputs.length === 0) return null

  // Opacity: newest=1, drops fast — older batches fade out aggressively
  const opacityForAge = (age) => {
    if (age === 0) return 1
    if (age === 1) return 0.7
    if (age === 2) return 0.5
    return Math.max(0.35, 1 - age * 0.2)
  }

  return (
    <div className="v3-thumbstrip" ref={stripRef}>
      {batchGroups.map((group, groupIdx) => (
        <span key={group.createdAt} style={{ display: 'contents' }}>
          {/* Separator bar before this group (not before the first group) */}
          {groupIdx > 0 && (
            <div
              className="v3-batch-sep"
              style={{ '--sep-color': group.color }}
            />
          )}

          {/* Batch region with color-coded background + opacity fade */}
          <div
            className={`v3-batch-region ${group.isNewest ? 'v3-batch-region--newest' : ''}`}
            style={{
              '--batch-color': group.color,
              opacity: opacityForAge(group.age),
            }}
          >
            {group.items.map((output) => {
              const globalIdx = globalIndexMap.get(output.id)
              return (
                <button
                  key={output.id}
                  ref={globalIdx === currentIndex ? activeRef : null}
                  className={`v3-thumb ${globalIdx === currentIndex ? 'v3-thumb-active' : ''} ${output.feedback === 'up' ? 'v3-thumb-up' : output.feedback === 'down' ? 'v3-thumb-down' : ''}`}
                  onClick={() => onNavigate(globalIdx)}
                >
                  {output.dataUrl ? (
                    <img src={output.dataUrl} alt="" draggable={false} />
                  ) : (
                    <div className="v3-thumb-placeholder" />
                  )}
                  {(output.notesKeep?.trim() || output.notesFix?.trim()) && (
                    <span className={`v3-thumb-badge ${output.notesKeep?.trim() && output.notesFix?.trim() ? 'v3-thumb-badge-mixed' : output.notesKeep?.trim() ? 'v3-thumb-badge-up' : 'v3-thumb-badge-down'}`}>
                      {output.notesKeep?.trim() && output.notesFix?.trim() ? '\u2215' : output.notesKeep?.trim() ? '\u2713' : '\u2717'}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </span>
      ))}
    </div>
  )
}
