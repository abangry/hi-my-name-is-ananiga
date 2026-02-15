'use server'

import { createClient } from '@/lib/supabase/server'

export async function blockUser(blockedUserId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { data, error } = await supabase.rpc('block_user', {
    p_blocked_user_id: blockedUserId
  })

  if (error) {
    console.error('Error blocking user:', error)
    return { success: false, error: error.message }
  }

  return data as { success: boolean; error?: string }
}

export async function unblockUser(blockedUserId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { data, error } = await supabase.rpc('unblock_user', {
    p_blocked_user_id: blockedUserId
  })

  if (error) {
    console.error('Error unblocking user:', error)
    return { success: false, error: error.message }
  }

  return data as { success: boolean }
}

export async function isUserBlocked(otherUserId: string): Promise<boolean> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return false
  }

  const { data, error } = await supabase.rpc('is_user_blocked', {
    p_other_user_id: otherUserId
  })

  if (error) {
    console.error('Error checking block status:', error)
    return false
  }

  return data as boolean
}

export async function didIBlockUser(otherUserId: string): Promise<boolean> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return false
  }

  const { data, error } = await supabase.rpc('did_i_block_user', {
    p_other_user_id: otherUserId
  })

  if (error) {
    console.error('Error checking block status:', error)
    return false
  }

  return data as boolean
}

export async function getBlockedUsers() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const { data, error } = await supabase.rpc('get_blocked_users')

  if (error) {
    console.error('Error getting blocked users:', error)
    return []
  }

  return data as Array<{
    blocked_user_id: string
    username: string
    tag: string
    avatar_url: string | null
    blocked_at: string
  }>
}

export async function muteConversation(
  conversationId: string,
  conversationType: 'dm' | 'group',
  durationMinutes: number | null // null for indefinite
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { data, error } = await supabase.rpc('mute_conversation', {
    p_conversation_id: conversationId,
    p_conversation_type: conversationType,
    p_duration_minutes: durationMinutes
  })

  if (error) {
    console.error('Error muting conversation:', error)
    return { success: false, error: error.message }
  }

  return data as { success: boolean; muted_until: string | null }
}

export async function unmuteConversation(
  conversationId: string,
  conversationType: 'dm' | 'group'
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { data, error } = await supabase.rpc('unmute_conversation', {
    p_conversation_id: conversationId,
    p_conversation_type: conversationType
  })

  if (error) {
    console.error('Error unmuting conversation:', error)
    return { success: false, error: error.message }
  }

  return data as { success: boolean }
}

export async function isConversationMuted(
  conversationId: string,
  conversationType: 'dm' | 'group'
): Promise<boolean> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return false
  }

  const { data, error } = await supabase.rpc('is_conversation_muted', {
    p_conversation_id: conversationId,
    p_conversation_type: conversationType
  })

  if (error) {
    console.error('Error checking mute status:', error)
    return false
  }

  return data as boolean
}

export async function getMutedConversations() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const { data, error } = await supabase.rpc('get_muted_conversations')

  if (error) {
    console.error('Error getting muted conversations:', error)
    return []
  }

  return data as Array<{
    conversation_id: string
    conversation_type: 'dm' | 'group'
    muted_until: string | null
  }>
}
