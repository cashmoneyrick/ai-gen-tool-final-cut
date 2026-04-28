import { useEffect, useRef, useState } from 'react'

/**
 * Hook that connects to the SSE live-sync endpoint and calls
 * onSync whenever a relevant data file changes on disk.
 *
 * Debounces rapid bursts (e.g. batch writes) into a single sync.
 */
export default function useLiveSync(onSync, enabled = true) {
  const onSyncRef = useRef(onSync)
  const [state, setState] = useState({
    connection: enabled ? 'connecting' : 'idle',
    lastStore: null,
    lastEventAt: null,
    lastSyncAt: null,
  })

  useEffect(() => {
    onSyncRef.current = onSync
  }, [onSync])

  useEffect(() => {
    if (!enabled) return

    let es
    let debounceTimer = null
    let reconnectTimer = null
    const DEBOUNCE_MS = 500
    let pendingEvent = null

    function connect() {
      setState((prev) => ({
        ...prev,
        connection: prev.lastSyncAt ? 'reconnecting' : 'connecting',
      }))
      es = new EventSource('/api/live-sync')

      es.onopen = () => {
        setState((prev) => ({
          ...prev,
          connection: 'live',
        }))
      }

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          // Skip the initial connection message
          if (data.connected) return

          pendingEvent = data
          setState((prev) => ({
            ...prev,
            connection: 'live',
            lastStore: data.store || prev.lastStore,
            lastEventAt: data.ts || Date.now(),
          }))

          // Debounce — coalesce rapid file changes into one sync
          if (debounceTimer) clearTimeout(debounceTimer)
          debounceTimer = setTimeout(async () => {
            try {
              await onSyncRef.current?.(pendingEvent)
              setState((prev) => ({
                ...prev,
                connection: 'live',
                lastStore: pendingEvent?.store || prev.lastStore,
                lastSyncAt: Date.now(),
              }))
            } catch {
              setState((prev) => ({
                ...prev,
                connection: 'error',
              }))
            }
          }, DEBOUNCE_MS)
        } catch {
          // Ignore parse errors
        }
      }

      es.onerror = () => {
        es.close()
        setState((prev) => ({
          ...prev,
          connection: 'reconnecting',
        }))
        // Reconnect after 3s
        reconnectTimer = setTimeout(connect, 3000)
      }
    }

    connect()

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      es?.close()
    }
  }, [enabled])

  return state
}
