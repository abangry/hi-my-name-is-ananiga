'use server';

import { createClient } from '@/lib/supabase/server';

export async function sendGroupChatMessage(
  groupChatId: string,
  content: string,
  replyToId?: string
) {
  const supabase = await createClient();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    if (!content.trim()) {
      return { success: false, error: 'Message cannot be empty' };
    }

    const { error } = await supabase.from('group_chat_messages').insert({
      group_chat_id: groupChatId,
      user_id: user.id,
      content: content.trim(),
      reply_to_id: replyToId || null,
    });

    if (error) {
      console.error('Error sending group chat message:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in sendGroupChatMessage:', error);
    return { success: false, error: error.message || 'Failed to send message' };
  }
}

export async function deleteGroupChatMessage(messageId: string) {
  const supabase = await createClient();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { error } = await supabase
      .from('group_chat_messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting group chat message:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error in deleteGroupChatMessage:', error);
    return { success: false, error: error.message || 'Failed to delete message' };
  }
}

export async function leaveGroup(groupChatId: string) {
  const supabase = await createClient();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    console.log('[leaveGroup] User', user.id, 'leaving group', groupChatId);

    // Remove user from group_chat_members table
    const { error } = await supabase
      .from('group_chat_members')
      .delete()
      .eq('group_chat_id', groupChatId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error leaving group:', error);
      return { success: false, error: error.message };
    }

    console.log('[leaveGroup] Successfully left group');
    return { success: true };
  } catch (error: any) {
    console.error('Error in leaveGroup:', error);
    return { success: false, error: error.message || 'Failed to leave group' };
  }
}

export async function inviteToGroup(groupChatId: string, userIds: string[]) {
  const supabase = await createClient();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    if (userIds.length === 0) {
      return { success: false, error: 'No users to invite' };
    }

    console.log('[inviteToGroup] Inviting users to group:', groupChatId, userIds);

    // Check if current user is a member of the group
    const { data: memberCheck, error: memberCheckError } = await supabase
      .from('group_chat_members')
      .select('id')
      .eq('group_chat_id', groupChatId)
      .eq('user_id', user.id)
      .single();

    if (memberCheckError || !memberCheck) {
      return { success: false, error: 'You are not a member of this group' };
    }

    // Add all users to the group instantly
    const membersToAdd = userIds.map((userId) => ({
      group_chat_id: groupChatId,
      user_id: userId,
      joined_at: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from('group_chat_members')
      .insert(membersToAdd);

    if (insertError) {
      console.error('Error inviting users to group:', insertError);
      return { success: false, error: insertError.message };
    }

    console.log('[inviteToGroup] Successfully invited users');
    return { success: true };
  } catch (error: any) {
    console.error('Error in inviteToGroup:', error);
    return { success: false, error: error.message || 'Failed to invite users' };
  }
}
