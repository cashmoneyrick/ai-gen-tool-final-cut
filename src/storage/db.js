/**
 * Shared storage client for Studio v1.
 * Replaces the IndexedDB wrapper with fetch calls to the server-side JSON storage API.
 * Same exported API surface — all callers (session.js, App.jsx, useSystemMemory.js) work unchanged.
 */

const API_BASE = '/api/store'

export async function put(storeName, record) {
  const res = await fetch(`${API_BASE}/${storeName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `put failed for ${storeName}`)
  }
}

export async function get(storeName, id) {
  const res = await fetch(`${API_BASE}/${storeName}/${encodeURIComponent(id)}`)
  if (res.status === 404) return null
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `get failed for ${storeName}`)
  }
  return res.json()
}

export async function getAll(storeName) {
  const res = await fetch(`${API_BASE}/${storeName}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `getAll failed for ${storeName}`)
  }
  return res.json()
}

export async function getAllByIndex(storeName, indexName, value) {
  const res = await fetch(
    `${API_BASE}/${storeName}/by/${indexName}/${encodeURIComponent(value)}`
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `getAllByIndex failed for ${storeName}`)
  }
  return res.json()
}

export async function del(storeName, id) {
  const res = await fetch(`${API_BASE}/${storeName}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `del failed for ${storeName}`)
  }
}

export async function clearStore(storeName) {
  const res = await fetch(`${API_BASE}/${storeName}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `clearStore failed for ${storeName}`)
  }
}

export async function putMany(storeName, records) {
  const res = await fetch(`${API_BASE}/${storeName}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(records),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `putMany failed for ${storeName}`)
  }
}
