import { useState } from 'react'
import LockedElements from './LockedElements'
import RefsArea from './RefsArea'
import PromptArea from './PromptArea'

export default function WorkArea({
  buckets, setBuckets,
  assembled, assembledDirty, onAssembledChange, onResync,
  refs, onAddRefs, onRemoveRef, onToggleRefSend,
  onGenerate, isGenerating,
  lockedElements, onAddLocked, onRemoveLocked, onToggleLocked,
  model, availableModels, onModelChange,
  batchSize, onBatchSizeChange,
}) {
  const [viewMode, setViewMode] = useState('tabs')
  const [activeTab, setActiveTab] = useState('prompt')

  const refsBadge = refs.length > 0 ? ` (${refs.length})` : ''

  const lockedProps = {
    lockedElements,
    onAdd: onAddLocked,
    onRemove: onRemoveLocked,
    onToggle: onToggleLocked,
  }

  const promptProps = {
    buckets,
    setBuckets,
    assembled,
    assembledDirty,
    onAssembledChange,
    onResync,
    refs,
    onGenerate,
    isGenerating,
    lockedElements,
    onAddLocked,
    model,
    availableModels,
    onModelChange,
    batchSize,
    onBatchSizeChange,
  }

  return (
    <section className="section">
      <div className="work-area-header">
        <div className="section-title" style={{ marginBottom: 0 }}>
          Work Area
        </div>
        <div className="toggle-bar">
          <button
            className={`btn ${viewMode === 'tabs' ? 'active' : ''}`}
            onClick={() => setViewMode('tabs')}
          >
            Tabs
          </button>
          <button
            className={`btn ${viewMode === 'split' ? 'active' : ''}`}
            onClick={() => setViewMode('split')}
          >
            Split
          </button>
        </div>
      </div>

      {viewMode === 'tabs' ? (
        <>
          <div className="tab-bar">
            <button
              className={activeTab === 'refs' ? 'active' : ''}
              onClick={() => setActiveTab('refs')}
            >
              Refs{refsBadge}
            </button>
            <button
              className={activeTab === 'prompt' ? 'active' : ''}
              onClick={() => setActiveTab('prompt')}
            >
              Prompt
            </button>
          </div>

          {activeTab === 'refs' && (
            <RefsArea refs={refs} onAddRefs={onAddRefs} onRemoveRef={onRemoveRef} onToggleRefSend={onToggleRefSend} isGenerating={isGenerating} />
          )}
          {activeTab === 'prompt' && (
            <>
              <LockedElements {...lockedProps} />
              <PromptArea {...promptProps} />
            </>
          )}
        </>
      ) : (
        <div className="split-layout">
          <RefsArea refs={refs} onAddRefs={onAddRefs} onRemoveRef={onRemoveRef} onToggleRefSend={onToggleRefSend} isGenerating={isGenerating} />
          <div>
            <LockedElements {...lockedProps} />
            <PromptArea {...promptProps} />
          </div>
        </div>
      )}
    </section>
  )
}
