/**
 * Starter knowledge entries — derived from seed_memory.json at build time.
 *
 * The seed_memory.json is the canonical source of truth.
 * This module normalizes it into a flat array of entries with a
 * consistent shape for retrieval and display.
 */

import seedData from './source/seed_memory.json'

// --- Tag mapping ---

/** Map seed applies_to strings to normalized system tags */
const SYSTEM_TAG_MAP = {
  'embroidered pouch packaging': 'packaging',
  'embroidered pouch scenes': 'packaging',
  'embroidered pouch concepts': 'packaging',
  'packaging branding': 'packaging',
  'packaging prompts': 'packaging',
  'scene easter eggs': 'packaging',
  'nail flatlays': 'flatlay',
  'catalog shots': 'flatlay',
  'flatlay generation': 'flatlay',
  'flatlays': 'flatlay',
  'flatlays generated from existing sets': 'flatlay',
  'reference-driven nail generation': 'nails',
  'reverse engineering': 'nails',
  'reverse engineering incomplete sources': 'nails',
  'reverse-engineered nails': 'nails',
  'lifestyle hand shots': 'nails',
  'on-hand lifestyle shots': 'nails',
  'iterative nail edits': 'nails',
  'product shots': 'nails',
  'nail prompts': 'nails',
  'cateye collection': 'cateye',
  'cateye single-nail product shots': 'cateye',
  'approved flatlays': 'flatlay',
  'approved product shots': 'nails',
  'composition-locked generations': '*',
  'consistency locking': '*',
  'iterative workflows': '*',
  'all image workflows': '*',
  'current image prompt writing': '*',
  'format conversion': '*',
  'real-life hand photos': 'nails',
  'review-style images': 'nails',
  'casual content': 'nails',
}

/** Map seed applies_to strings to normalized task types */
const TASK_TYPE_MAP = {
  'flatlays': 'generation',
  'iterative nail edits': 'correction',
  'consistency locking': 'continuity',
  'reference-driven nail generation': 'generation',
  'reverse engineering': 'conversion',
  'reverse engineering incomplete sources': 'conversion',
  'lifestyle hand shots': 'generation',
  'on-hand lifestyle shots': 'generation',
  'flatlay generation': 'conversion',
  'flatlays generated from existing sets': 'conversion',
  'catalog shots': 'generation',
  'nail flatlays': 'generation',
  'embroidered pouch packaging': 'generation',
  'embroidered pouch scenes': 'generation',
  'embroidered pouch concepts': 'generation',
  'packaging branding': 'generation',
  'packaging prompts': 'generation',
  'scene easter eggs': 'generation',
  'cateye collection': 'generation',
  'cateye single-nail product shots': 'generation',
  'approved flatlays': 'correction',
  'approved product shots': 'correction',
  'composition-locked generations': 'correction',
  'iterative workflows': 'correction',
  'all image workflows': '*',
  'current image prompt writing': '*',
  'format conversion': 'conversion',
  'product shots': 'generation',
  'nail prompts': 'generation',
  'reverse-engineered nails': 'conversion',
  'real-life hand photos': 'generation',
  'review-style images': 'generation',
  'casual content': 'generation',
}

function mapPriority(val) {
  if (val === 'high' || val === 'strong') return 3
  if (val === 'medium' || val === 'moderate') return 2
  return 1
}

function uniqueTags(appliesTo, tagMap) {
  const tags = new Set()
  for (const a of appliesTo) {
    const mapped = tagMap[a]
    if (mapped) tags.add(mapped)
  }
  return tags.size > 0 ? [...tags] : ['*']
}

// --- Cross-reference map for overlapping concepts ---

const RELATED_MAP = {
  // Source-of-truth promotion
  approved_output_becomes_source_of_truth: ['local_problem_local_fix', 'approved_output_promotion'],
  local_problem_local_fix: ['approved_output_becomes_source_of_truth', 'approved_output_promotion'],
  approved_output_promotion: ['approved_output_becomes_source_of_truth', 'local_problem_local_fix'],
  // Reference separation
  separate_reference_roles_explicitly: ['hard_source_plus_secondary_reference', 'reference_role_separation_prevents_blending'],
  hard_source_plus_secondary_reference: ['separate_reference_roles_explicitly', 'two_reference_generation'],
  reference_role_separation_prevents_blending: ['separate_reference_roles_explicitly', 'hard_source_plus_secondary_reference'],
  two_reference_generation: ['separate_reference_roles_explicitly', 'hard_source_plus_secondary_reference'],
  // Visible-only scope
  do_not_guess_unseen_nails: ['visible_only_scope_reduction', 'visible_only_blueprint_workflow'],
  visible_only_scope_reduction: ['do_not_guess_unseen_nails', 'visible_only_blueprint_workflow'],
  visible_only_blueprint_workflow: ['do_not_guess_unseen_nails', 'visible_only_scope_reduction'],
  // Packaging fragment
  packaging_world_fragment_not_badge: ['world_fragment_packaging_pattern', 'packaging_scene_too_complete_causes_emblem_drift'],
  world_fragment_packaging_pattern: ['packaging_world_fragment_not_badge', 'packaging_scene_too_complete_causes_emblem_drift'],
  packaging_scene_too_complete_causes_emblem_drift: ['packaging_world_fragment_not_badge', 'world_fragment_packaging_pattern'],
  // Embroidery texture
  embroidery_feasible_and_texture_dominant: ['embroidery_first_texture_pattern', 'smooth_surface_breaks_embroidery_realism'],
  embroidery_first_texture_pattern: ['embroidery_feasible_and_texture_dominant', 'embroidery_texture_correction'],
  smooth_surface_breaks_embroidery_realism: ['embroidery_feasible_and_texture_dominant', 'embroidery_first_texture_pattern'],
  // Cateye field
  filled_cateye_field_not_donut: ['filled_field_cateye_wording', 'wide_cat_eye_can_turn_into_donut'],
  filled_field_cateye_wording: ['filled_cateye_field_not_donut', 'wide_cat_eye_can_turn_into_donut'],
  wide_cat_eye_can_turn_into_donut: ['filled_cateye_field_not_donut', 'filled_field_cateye_wording'],
}

// --- Normalize each kind ---

function normalizeRules(rules) {
  return rules.map((r) => ({
    id: r.id,
    kind: 'rule',
    title: r.rule.length > 80 ? r.rule.slice(0, 77) + '...' : r.rule,
    body: r.rule + (r.notes ? '\n' + r.notes : ''),
    systemTags: uniqueTags(r.applies_to, SYSTEM_TAG_MAP),
    taskTypes: uniqueTags(r.applies_to, TASK_TYPE_MAP),
    priority: mapPriority(r.priority),
    triggerConditions: null,
    antiPatterns: null,
    sourceSection: '01_hard_rules',
    relatedIds: RELATED_MAP[r.id] || null,
  }))
}

function normalizePreferences(prefs) {
  return prefs.map((p) => ({
    id: p.id,
    kind: 'preference',
    title: p.preference.length > 80 ? p.preference.slice(0, 77) + '...' : p.preference,
    body: p.preference + (p.notes ? '\n' + p.notes : ''),
    systemTags: uniqueTags(p.applies_to, SYSTEM_TAG_MAP),
    taskTypes: uniqueTags(p.applies_to, TASK_TYPE_MAP),
    priority: mapPriority(p.strength),
    triggerConditions: null,
    antiPatterns: null,
    sourceSection: '02_preferences',
    relatedIds: RELATED_MAP[p.id] || null,
  }))
}

function normalizeWorkflows(workflows) {
  return workflows.map((w) => {
    // Derive trigger conditions from inputs and use_when
    const triggers = {}
    const inputsStr = w.inputs_needed.join(' ').toLowerCase()
    const useWhenStr = w.use_when.toLowerCase()
    if (inputsStr.includes('reference') || inputsStr.includes('design reference')) {
      triggers.hasReferences = true
    }
    if (inputsStr.includes('design reference') && inputsStr.includes('pose')) {
      triggers.minReferenceCount = 2
    }
    if (useWhenStr.includes('convert') || useWhenStr.includes('become') || useWhenStr.includes('translate')) {
      triggers.isConversion = true
    }
    if (useWhenStr.includes('fix') || useWhenStr.includes('correction') || useWhenStr.includes('mostly right')) {
      triggers.isCorrection = true
    }
    if (useWhenStr.includes('extend') || useWhenStr.includes('continuity') || useWhenStr.includes('after one month')) {
      triggers.isContinuity = true
    }

    // Derive system tags from name + use_when + inputs
    const combined = (w.name + ' ' + w.use_when + ' ' + inputsStr).toLowerCase()
    const sysTags = new Set()
    if (combined.includes('packaging') || combined.includes('pouch') || combined.includes('embroidered')) sysTags.add('packaging')
    if (combined.includes('flatlay') || combined.includes('flat lay')) sysTags.add('flatlay')
    if (combined.includes('cateye') || combined.includes('cat eye')) sysTags.add('cateye')
    if (combined.includes('nail') || combined.includes('reference') || combined.includes('hand shot') || combined.includes('hand-shot')) sysTags.add('nails')
    if (sysTags.size === 0) sysTags.add('*')

    // Derive task types
    const taskT = new Set()
    if (useWhenStr.includes('convert') || useWhenStr.includes('become') || useWhenStr.includes('translate')) taskT.add('conversion')
    if (useWhenStr.includes('fix') || useWhenStr.includes('mostly right') || useWhenStr.includes('correction')) taskT.add('correction')
    if (useWhenStr.includes('extend') || useWhenStr.includes('continuity') || useWhenStr.includes('after one month')) taskT.add('continuity')
    if (useWhenStr.includes('creat') || useWhenStr.includes('build') || useWhenStr.includes('restor')) taskT.add('generation')
    if (taskT.size === 0) taskT.add('generation')

    const stepsText = w.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')
    const failText = w.failure_modes.length > 0 ? '\nFailure modes: ' + w.failure_modes.join('; ') : ''
    const fixText = w.fixes.length > 0 ? '\nFixes: ' + w.fixes.join('; ') : ''

    return {
      id: w.id,
      kind: 'workflow',
      title: w.name,
      body: `Use when: ${w.use_when}\n${stepsText}${failText}${fixText}`,
      systemTags: [...sysTags],
      taskTypes: [...taskT],
      priority: 2,
      triggerConditions: Object.keys(triggers).length > 0 ? triggers : null,
      antiPatterns: w.failure_modes.length > 0 ? w.failure_modes : null,
      sourceSection: '03_workflows',
      relatedIds: RELATED_MAP[w.id] || null,
    }
  })
}

function normalizeLessons(lessons) {
  return lessons.map((l) => ({
    id: l.id,
    kind: 'lesson',
    title: l.lesson.length > 80 ? l.lesson.slice(0, 77) + '...' : l.lesson,
    body: l.lesson + '\nFailed: ' + l.failed_pattern + '\nBetter: ' + l.better_pattern,
    systemTags: deriveSystemTagsFromContext(l.context),
    taskTypes: deriveTaskTypesFromContext(l.context),
    priority: mapPriority(l.confidence),
    triggerConditions: deriveLessonTriggers(l),
    antiPatterns: [l.failed_pattern],
    sourceSection: '04_lessons_learned',
    relatedIds: RELATED_MAP[l.id] || null,
  }))
}

function normalizePatterns(patterns) {
  return patterns.map((p) => ({
    id: p.id,
    kind: 'pattern',
    title: p.pattern.length > 80 ? p.pattern.slice(0, 77) + '...' : p.pattern,
    body: p.pattern + '\nExample: ' + p.example_structure + (p.notes ? '\n' + p.notes : ''),
    systemTags: deriveSystemTagsFromContext(p.best_use_case),
    taskTypes: deriveTaskTypesFromContext(p.best_use_case),
    priority: 2,
    triggerConditions: derivePatternTriggers(p),
    antiPatterns: null,
    sourceSection: '05_patterns_to_reuse',
    relatedIds: RELATED_MAP[p.id] || null,
  }))
}

// --- Helpers for lessons/patterns context parsing ---

function deriveSystemTagsFromContext(contextStr) {
  const s = contextStr.toLowerCase()
  const tags = new Set()
  if (s.includes('packaging') || s.includes('pouch') || s.includes('embroidered') || s.includes('embroidery')) tags.add('packaging')
  if (s.includes('flatlay') || s.includes('flat lay') || s.includes('flat-lay')) tags.add('flatlay')
  if (s.includes('cateye') || s.includes('cat eye') || s.includes('birthstone')) tags.add('cateye')
  if (s.includes('nail') || s.includes('hand-shot') || s.includes('hand shot') || s.includes('reference') || s.includes('reverse')) tags.add('nails')
  if (s.includes('product shot') || s.includes('product image')) tags.add('nails')
  if (tags.size === 0) tags.add('*')
  return [...tags]
}

function deriveTaskTypesFromContext(contextStr) {
  const s = contextStr.toLowerCase()
  const types = new Set()
  if (s.includes('convert') || s.includes('translat') || s.includes('reverse')) types.add('conversion')
  if (s.includes('correction') || s.includes('fix') || s.includes('iterative') || s.includes('partial success')) types.add('correction')
  if (s.includes('continu') || s.includes('collection') || s.includes('monthly') || s.includes('series')) types.add('continuity')
  if (s.includes('generat') || s.includes('creat') || s.includes('build') || s.includes('refine')) types.add('generation')
  if (types.size === 0) types.add('*')
  return [...types]
}

function deriveLessonTriggers(lesson) {
  const ctx = (lesson.context + ' ' + lesson.better_pattern).toLowerCase()
  const triggers = {}
  if (ctx.includes('reference')) triggers.hasReferences = true
  if (ctx.includes('two-reference') || ctx.includes('two reference') || ctx.includes('design reference and')) triggers.minReferenceCount = 2
  if (ctx.includes('conversion') || ctx.includes('converting')) triggers.isConversion = true
  if (ctx.includes('correction') || ctx.includes('iterative')) triggers.isCorrection = true
  return Object.keys(triggers).length > 0 ? triggers : null
}

function derivePatternTriggers(pattern) {
  const ctx = (pattern.best_use_case + ' ' + pattern.example_structure).toLowerCase()
  const triggers = {}
  if (ctx.includes('reference')) triggers.hasReferences = true
  if (ctx.includes('two') && ctx.includes('reference')) triggers.minReferenceCount = 2
  if (ctx.includes('iterative') || ctx.includes('partial success') || ctx.includes('local correction')) triggers.isCorrection = true
  if (ctx.includes('incomplete')) triggers.isConversion = true
  return Object.keys(triggers).length > 0 ? triggers : null
}

// --- Build and export ---

export const STARTER_ENTRIES = [
  ...normalizeRules(seedData.hard_rules),
  ...normalizePreferences(seedData.preferences),
  ...normalizeWorkflows(seedData.workflows),
  ...normalizeLessons(seedData.lessons),
  ...normalizePatterns(seedData.patterns),
]

export const SYSTEMS = ['packaging', 'nails', 'cateye', 'flatlay']
export const TASK_TYPES = ['generation', 'conversion', 'correction', 'continuity']
export const ENTRY_KINDS = ['rule', 'preference', 'workflow', 'lesson', 'pattern']
