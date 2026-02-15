import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get unread DM counts
    const { data: dmUnread, error: dmError } = await supabase.rpc(
      'get_unread_dm_counts',
      { user_id_param: user.id }
    )

    if (dmError) {
      console.error('[API] Error fetching DM unread:', dmError)
    }

    // Get unread group chat counts
    const { data: groupUnread, error: groupError } = await supabase.rpc(
      'get_unread_group_counts',
      { user_id_param: user.id }
    )

    if (groupError) {
      console.error('[API] Error fetching group unread:', groupError)
    }

    // Format response
    const unreadCounts = [
      ...(dmUnread || []).map((item: any) => ({
        conversationId: item.dm_channel_id,
        conversationType: 'dm' as const,
        count: item.unread_count,
        lastMessageAt: item.last_message_at
      })),
      ...(groupUnread || []).map((item: any) => ({
        conversationId: item.group_chat_id,
        conversationType: 'group' as const,
        count: item.unread_count,
        lastMessageAt: item.last_message_at
      }))
    ]

    return NextResponse.json({ unreadCounts })
  } catch (error) {
    console.error('[API] Unread counts error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
