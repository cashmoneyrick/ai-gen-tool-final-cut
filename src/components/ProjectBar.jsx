import { useState, useRef, useEffect } from 'react'

function ProjectTab({ project, isActive, onSwitch, onRename }) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(project.name)
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleDoubleClick = (e) => {
    e.stopPropagation()
    setEditValue(project.name)
    setEditing(true)
  }

  const handleCommit = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== project.name) {
      onRename(project.id, trimmed)
    }
    setEditing(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleCommit()
    if (e.key === 'Escape') setEditing(false)
  }

  return (
    <button
      className={`project-tab ${isActive ? 'project-tab-active' : ''}`}
      onClick={() => onSwitch(project.id)}
      title={isActive ? 'Double-click to rename' : project.name}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="project-tab-input"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="project-tab-name"
          onDoubleClick={handleDoubleClick}
        >
          {project.name}
        </span>
      )}
    </button>
  )
}

export default function ProjectBar({
  projects,
  activeProjectId,
  onSwitchProject,
  onCreateProject,
  onRenameProject,
}) {
  return (
    <div className="project-bar">
      <div className="project-bar-tabs">
        {projects.map((project) => (
          <ProjectTab
            key={project.id}
            project={project}
            isActive={project.id === activeProjectId}
            onSwitch={onSwitchProject}
            onRename={onRenameProject}
          />
        ))}
        <button
          className="project-bar-new"
          onClick={onCreateProject}
          title="Create new project"
        >
          + New
        </button>
      </div>
    </div>
  )
}
