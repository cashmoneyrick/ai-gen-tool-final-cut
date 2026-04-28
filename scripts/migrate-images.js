#!/usr/bin/env node

/**
 * One-shot migration: extract base64 images from outputs.json into individual files.
 *
 * Before: outputs.json is ~241MB (each record has dataUrl with full base64 image)
 * After:  outputs.json is ~2MB (each record has imagePath pointing to data/images/{id}.{ext})
 *
 * Safe: creates backup before modifying, idempotent (skips already-migrated records).
 * Run:  node scripts/migrate-images.js
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const DATA_DIR = join(process.cwd(), 'data')
const IMAGES_DIR = join(DATA_DIR, 'images')
const OUTPUTS_FILE = join(DATA_DIR, 'outputs.json')
const BACKUP_FILE = join(DATA_DIR, 'outputs.backup.json')

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1048576).toFixed(1)}MB`
}

console.log('\n=== Image Migration ===\n')

// Check outputs.json exists
if (!existsSync(OUTPUTS_FILE)) {
  console.error('data/outputs.json not found. Run from project root.')
  process.exit(1)
}

const beforeSize = statSync(OUTPUTS_FILE).size
console.log(`outputs.json size before: ${formatSize(beforeSize)}`)

// Create backup
console.log(`Creating backup at data/outputs.backup.json...`)
copyFileSync(OUTPUTS_FILE, BACKUP_FILE)
console.log(`Backup created (${formatSize(beforeSize)})`)

// Ensure images directory
if (!existsSync(IMAGES_DIR)) {
  mkdirSync(IMAGES_DIR, { recursive: true })
}

// Read all outputs
console.log(`Reading outputs.json...`)
const outputs = JSON.parse(readFileSync(OUTPUTS_FILE, 'utf-8'))
console.log(`Found ${outputs.length} output records`)

// Migrate
let migrated = 0
let skipped = 0
let errors = 0

for (const output of outputs) {
  // Skip already-migrated
  if (output.imagePath && !output.dataUrl) {
    skipped++
    continue
  }

  // Skip outputs without dataUrl
  if (!output.dataUrl) {
    skipped++
    continue
  }

  // Extract base64 from data URL
  const match = output.dataUrl.match(/^data:(image\/(\w+));base64,(.+)$/)
  if (!match) {
    console.warn(`  [warn] Output ${output.id}: unrecognized dataUrl format, skipping`)
    errors++
    continue
  }

  const mimeType = match[1]
  const ext = match[2] === 'png' ? 'png' : 'jpg'
  const base64 = match[3]

  try {
    const filename = `${output.id}.${ext}`
    const filePath = join(IMAGES_DIR, filename)
    const tmp = join(IMAGES_DIR, `${output.id}.tmp.${randomUUID()}.${ext}`)

    // Write binary image file
    writeFileSync(tmp, Buffer.from(base64, 'base64'))
    renameSync(tmp, filePath)

    // Update record
    output.imagePath = `images/${filename}`
    delete output.dataUrl

    migrated++
    if (migrated % 50 === 0) console.log(`  Migrated ${migrated} images...`)
  } catch (err) {
    console.error(`  [error] Output ${output.id}: ${err.message}`)
    errors++
  }
}

// Write updated outputs.json
console.log(`\nWriting updated outputs.json...`)
const tmp = join(DATA_DIR, `outputs.tmp.${randomUUID()}.json`)
writeFileSync(tmp, JSON.stringify(outputs, null, 2), 'utf-8')
renameSync(tmp, OUTPUTS_FILE)

const afterSize = statSync(OUTPUTS_FILE).size

console.log(`\n=== Migration Complete ===`)
console.log(`  Migrated: ${migrated} images extracted to data/images/`)
console.log(`  Skipped:  ${skipped} (already migrated or no image)`)
console.log(`  Errors:   ${errors}`)
console.log(`  Before:   ${formatSize(beforeSize)}`)
console.log(`  After:    ${formatSize(afterSize)}`)
console.log(`  Saved:    ${formatSize(beforeSize - afterSize)}`)
console.log(`  Backup:   data/outputs.backup.json`)
console.log('')
