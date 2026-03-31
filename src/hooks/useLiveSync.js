import { useEffect, useRef } from 'react'

/**
 * Hook that connects to the SSE live-sync endpoint and calls
 * onSync whenever a relevant data file changes on disk.
 *
 * Debounces rapid bursts (e.g. batch writes) into a single sync.
 */
export default function useLiveSync(onSync, enabled = true) {
  const onSyncRef = useRef(onSync)
  onSyncRef.current = onSync

  useEffect(() => {
    if (!enabled) return

    let es
    let debounceTimer = null
    let reconnectTimer = null
    const DEBOUNCE_MS = 500

    function connect() {
      es = new EventSource('/api/live-sync')

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          // Skip the initial connection message
          if (data.connected) return

          // Debounce — coalesce rapid file changes into one sync
          if (debounceTimer) clearTimeout(debounceTimer)
          debounceTimer = setTimeout(() => {
            onSyncRef.current?.()
          }, DEBOUNCE_MS)
        } catch {
          // Ignore parse errors
        }
      }

      es.onerror = () => {
        es.close()
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
}
