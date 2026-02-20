import { create } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import { wsManager } from '@/lib/websocket-manager'

export interface Friend {
  id: string
  friend_id: string
  username: string
  tag: string
  display_name: string | null
  avatar_url: string | null
  status: 'online' | 'idle' | 'dnd' | 'offline'
  custom_status: string | null
}

interface FriendsState {
  friends: Friend[]
  loading: boolean
  fetchFriends: (userId: string) => Promise<void>
  updateFriendPresence: (friendId: string, status: 'online' | 'idle' | 'dnd' | 'offline', customStatus?: string | null) => void
  updateFriendProfile: (friendId: string, changes: { display_name?: string | null; avatar_url?: string | null }) => void
  subscribeToPresence: (userId: string) => void
  unsubscribeFromPresence: () => void
}

export const useFriendsStore = create<FriendsState>((set, get) => {
  const supabase = createClient()
  let presenceChannel: any = null
  let profileUpdateUnsub: (() => void) | null = null

  return {
    friends: [],
    loading: false,

    fetchFriends: async (userId: string) => {
      set({ loading: true })

      const { data, error } = await supabase.rpc('get_friends_with_presence', {
        p_user_id: userId
      })

      if (error) {
        console.error('[FriendsStore] Error fetching friends:', error)
        set({ loading: false })
        return
      }

      set({ friends: data || [], loading: false })
    },

    updateFriendPresence: (friendId: string, status: 'online' | 'idle' | 'dnd' | 'offline', customStatus?: string | null) => {
      set((state) => ({
        friends: state.friends.map((friend) =>
          friend.friend_id === friendId
            ? { ...friend, status, custom_status: customStatus !== undefined ? customStatus : friend.custom_status }
            : friend
        ),
      }))
    },

    updateFriendProfile: (friendId: string, changes: { display_name?: string | null; avatar_url?: string | null }) => {
      set((state) => ({
        friends: state.friends.map((friend) =>
          friend.friend_id === friendId
            ? { ...friend, ...changes }
            : friend
        ),
      }))
    },

    subscribeToPresence: (userId: string) => {
      // Unsubscribe from previous channel if exists
      if (presenceChannel) {
        presenceChannel.unsubscribe()
      }

      presenceChannel = supabase
        .channel('friends_presence')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_presence',
          },
          (payload) => {
            console.log('[FriendsStore] Presence update:', payload)

            const newData = payload.new as { user_id?: string; status?: string; custom_status?: string } | null

            // Check if this user is a friend
            const friendsList = get().friends
            const isFriend = friendsList.some(f => f.friend_id === newData?.user_id)

            if (isFriend && newData?.user_id && newData?.status) {
              get().updateFriendPresence(
                newData.user_id,
                newData.status as any,
                newData.custom_status || null
              )
            }
          }
        )
        .subscribe()

      // Subscribe to profile updates via WebSocket
      if (profileUpdateUnsub) profileUpdateUnsub()
      profileUpdateUnsub = wsManager.onProfileUpdate((data) => {
        const isFriend = get().friends.some(f => f.friend_id === data.user_id)
        if (isFriend) {
          console.log('[FriendsStore] Profile update for friend:', data.user_id)
          get().updateFriendProfile(data.user_id, {
            display_name: data.display_name,
            avatar_url: data.avatar_url,
          })
        }
      })
    },

    unsubscribeFromPresence: () => {
      if (presenceChannel) {
        presenceChannel.unsubscribe()
        presenceChannel = null
      }
      if (profileUpdateUnsub) {
        profileUpdateUnsub()
        profileUpdateUnsub = null
      }
    },
  }
})
