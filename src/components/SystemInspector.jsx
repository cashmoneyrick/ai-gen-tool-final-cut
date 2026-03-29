import { useEffect } from 'react'
import MemoryPanel from './MemoryPanel'
import DocsPanel from './DocsPanel'
import SharedKnowledge from './SharedKnowledge'
import AppliedKnowledge from './AppliedKnowledge'
import KnowledgeOverrides from './KnowledgeOverrides'
import ProjectLessons from './ProjectLessons'
import PatternInsights from './PatternInsights'

/**
 * SystemInspector — right-side drawer for system-memory surfaces.
 * Contains all knowledge/memory/docs/lessons panels behind a single boundary.
 */
export default function SystemInspector({
  open,
  onClose,
  // System memory data + handlers (from useSystemMemory)
  data,
  handlers,
  memoryDraft,
  onClearDraft,
  // Applied knowledge (derived in App.jsx, passed through)
  relevantKnowledge,
  // Pattern insights (managed in App.jsx)
  onAnalyzePatterns,
  analyzingPatterns,
  patternInsights,
  onAcceptSuggestion,
  onDismissSuggestion,
}) {
  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  return (
    <>
      {open && <div className="inspector-backdrop" onClick={onClose} />}
      <aside className={`system-inspector ${open ? 'inspector-open' : ''}`}>
        <div className="inspector-header">
          <h3>System Inspector</h3>
          <button className="inspector-close-btn" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="inspector-body">
          <PatternInsights
            onAnalyze={onAnalyzePatterns}
            analyzing={analyzingPatterns}
            insights={patternInsights}
            onAccept={onAcceptSuggestion}
            onDismiss={onDismissSuggestion}
          />
          <MemoryPanel
            memories={data.memories}
            onAddMemory={handlers.addMemory}
            onUpdateMemory={handlers.updateMemory}
            onRemoveMemory={handlers.removeMemory}
            memoryDraft={memoryDraft}
            onClearDraft={onClearDraft}
            onShare={handlers.promoteMemoryToShared}
          />
          <DocsPanel
            docs={data.docs}
            onAddDoc={handlers.addDoc}
            onUpdateDoc={handlers.updateDoc}
            onRemoveDoc={handlers.removeDoc}
            onShare={handlers.promoteDocToShared}
          />
          <SharedKnowledge
            sharedMemories={data.sharedMemories}
            sharedDocs={data.sharedDocs}
            onToggleActivation={handlers.toggleSharedActivation}
            onUpdateSharedMemory={handlers.updateSharedMemory}
            onUpdateSharedDoc={handlers.updateSharedDoc}
            onRemoveSharedMemory={handlers.removeSharedMemory}
            onRemoveSharedDoc={handlers.removeSharedDoc}
          />
          <AppliedKnowledge entries={relevantKnowledge} />
          <KnowledgeOverrides
            overrides={data.knowledgeOverrides}
            onAdd={handlers.addOverride}
            onUpdate={handlers.updateOverride}
            onRemove={handlers.removeOverride}
          />
          <ProjectLessons
            lessons={data.projectLessons}
            onRemove={handlers.removeLesson}
          />
        </div>
      </aside>
    </>
  )
}
