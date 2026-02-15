'use client'

import { useEffect, useRef } from 'react'
import { useChatStore } from '@/lib/stores/chat-store'

const IDLE_THRESHOLD = 5 * 60 * 1000 // 5 minutes
const HEARTBEAT_INTERVAL = 30 * 1000 // 30 seconds

export function useTabFreezeDetection() {
  const lastActivityRef = useRef<number>(Date.now())
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null)
  const connectionStatus = useChatStore(state => state.connectionStatus)

  useEffect(() => {
    // Update activity timestamp on user interaction
    const updateActivity = () => {
      lastActivityRef.current = Date.now()
    }

    // Listen to user activity events
    window.addEventListener('mousemove', updateActivity)
    window.addEventListener('keydown', updateActivity)
    window.addEventListener('click', updateActivity)
    window.addEventListener('scroll', updateActivity)
    window.addEventListener('touchstart', updateActivity)

    // Heartbeat checker - runs every 30 seconds
    heartbeatRef.current = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityRef.current

      // If idle for more than threshold AND disconnected, force refresh
      if (timeSinceActivity > IDLE_THRESHOLD && connectionStatus === 'disconnected') {
        console.warn('[TabFreeze] Tab has been idle for', Math.round(timeSinceActivity / 1000 / 60), 'minutes and WebSocket is disconnected. Forcing refresh...')

        // Show user-friendly message before refresh
        const shouldRefresh = confirm(
          'Your connection was lost due to inactivity. The page needs to refresh to restore functionality. Click OK to refresh now.'
        )

        if (shouldRefresh) {
          window.location.reload()
        }
      }

      // If disconnected for more than 30 seconds (even while active), try to refresh
      if (connectionStatus === 'disconnected') {
        const checkReconnection = setTimeout(() => {
          if (useChatStore.getState().connectionStatus === 'disconnected') {
            console.warn('[TabFreeze] WebSocket disconnected for extended period. Forcing refresh...')
            window.location.reload()
          }
        }, 30000) // Wait 30 seconds before auto-refresh

        return () => clearTimeout(checkReconnection)
      }
    }, HEARTBEAT_INTERVAL)

    // Visibility change handler - detect when tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[TabFreeze] Tab became visible, checking connection...')

        // If we were disconnected while hidden, force refresh
        if (connectionStatus === 'disconnected') {
          console.warn('[TabFreeze] Reconnecting after tab was hidden...')
          window.location.reload()
        }

        // Update activity timestamp
        lastActivityRef.current = Date.now()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      // Cleanup
      window.removeEventListener('mousemove', updateActivity)
      window.removeEventListener('keydown', updateActivity)
      window.removeEventListener('click', updateActivity)
      window.removeEventListener('scroll', updateActivity)
      window.removeEventListener('touchstart', updateActivity)
      document.removeEventListener('visibilitychange', handleVisibilityChange)

      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
      }
    }
  }, [connectionStatus])
}
