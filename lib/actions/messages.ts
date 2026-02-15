"use server";

import { createClient } from "@/lib/supabase/server";

// Get or create a DM channel between two users
export async function getOrCreateDmChannel(friendTag: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated", data: null };
  }

  // Find the friend by tag
  const { data: friend, error: friendError } = await supabase
    .from("profiles")
    .select("id")
    .eq("tag", friendTag)
    .single();

  if (friendError || !friend) {
    return { success: false, error: "Friend not found", data: null };
  }

  // Check if they are friends (check both directions)
  const { data: friendship, error: friendshipError } = await supabase
    .from("friendships")
    .select("id")
    .or(`and(user_id.eq.${user.id},friend_id.eq.${friend.id}),and(user_id.eq.${friend.id},friend_id.eq.${user.id})`)
    .limit(1);

  console.log("Friendship check:", { userId: user.id, friendId: friend.id, friendship, friendshipError });

  if (!friendship || friendship.length === 0) {
    return { success: false, error: "You must be friends to message", data: null };
  }

  // Check if DM channel already exists
  const { data: existingChannel, error: existingChannelError } = await supabase
    .from("direct_message_participants")
    .select(`
      dm_channel_id,
      direct_message_channels!inner(id)
    `)
    .eq("user_id", user.id);

  console.log("Existing channels check:", { existingChannel, existingChannelError });

  if (existingChannel && existingChannel.length > 0) {
    // Check if any of these channels include the friend
    for (const participant of existingChannel) {
      const { data: otherParticipants } = await supabase
        .from("direct_message_participants")
        .select("user_id")
        .eq("dm_channel_id", participant.dm_channel_id);

      if (otherParticipants) {
        const participantIds = otherParticipants.map(p => p.user_id);
        console.log("Checking channel:", { channelId: participant.dm_channel_id, participantIds, friendId: friend.id });
        if (participantIds.includes(friend.id) && participantIds.length === 2) {
          // Found existing channel
          console.log("Found existing channel:", participant.dm_channel_id);
          return {
            success: true,
            data: { channelId: participant.dm_channel_id },
          };
        }
      }
    }
  }

  // Create new DM channel
  console.log("Creating new DM channel...");
  const { data: newChannel, error: channelError } = await supabase
    .from("direct_message_channels")
    .insert({})
    .select("id")
    .single();

  console.log("Channel creation result:", { newChannel, channelError });

  if (channelError || !newChannel) {
    console.error("Failed to create DM channel:", channelError);
    return { success: false, error: "Failed to create DM channel", data: null };
  }

  // Add both participants
  const { error: participantsError } = await supabase
    .from("direct_message_participants")
    .insert([
      { dm_channel_id: newChannel.id, user_id: user.id },
      { dm_channel_id: newChannel.id, user_id: friend.id },
    ]);

  if (participantsError) {
    return { success: false, error: "Failed to add participants", data: null };
  }

  return {
    success: true,
    data: { channelId: newChannel.id },
  };
}

// Send a direct message
export async function sendDirectMessage(channelId: string, content: string, replyToId?: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Verify user is participant in this channel
  const { data: participant } = await supabase
    .from("direct_message_participants")
    .select("id")
    .eq("dm_channel_id", channelId)
    .eq("user_id", user.id)
    .single();

  if (!participant) {
    return { success: false, error: "Not authorized to send messages in this channel" };
  }

  // Send message
  const { error } = await supabase
    .from("direct_messages")
    .insert({
      dm_channel_id: channelId,
      user_id: user.id,
      content: content.trim(),
      reply_to_id: replyToId || null,
    });

  if (error) {
    console.error("Error sending message:", error);
    return { success: false, error: "Failed to send message" };
  }

  return { success: true };
}

// Get messages for a DM channel
export async function getDirectMessages(channelId: string, limit = 50) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated", data: [] };
  }

  // Verify user is participant in this channel
  const { data: participant } = await supabase
    .from("direct_message_participants")
    .select("id")
    .eq("dm_channel_id", channelId)
    .eq("user_id", user.id)
    .single();

  if (!participant) {
    return { success: false, error: "Not authorized to view this channel", data: [] };
  }

  // Get messages (excluding soft-deleted ones)
  const { data: messages, error } = await supabase
    .from("direct_messages")
    .select(`
      id,
      content,
      created_at,
      edited_at,
      user_id,
      reply_to_id,
      user:profiles!direct_messages_user_id_fkey(
        id,
        username,
        tag,
        display_name,
        avatar_url
      )
    `)
    .eq("dm_channel_id", channelId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("Error fetching messages:", error);
    return { success: false, error: "Failed to fetch messages", data: [] };
  }

  return {
    success: true,
    data: messages || [],
  };
}

// Update typing status (stored in user_presence for simplicity)
export async function updateTypingStatus(channelId: string, isTyping: boolean) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false };
  }

  // We'll use a simple approach: broadcast typing status via Realtime
  // The actual implementation will be in the client with Realtime presence
  return { success: true };
}

// Mark all messages in a DM channel as read
export async function markDmMessagesAsRead(dmChannelId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Verify user is participant in this channel
  const { data: participant } = await supabase
    .from("direct_message_participants")
    .select("id")
    .eq("dm_channel_id", dmChannelId)
    .eq("user_id", user.id)
    .single();

  if (!participant) {
    return { success: false, error: "Not authorized" };
  }

  // Update read_at for all unread messages in this channel (messages not from the current user)
  // The get_user_friends function checks read_at IS NULL on direct_messages table
  const { error } = await supabase
    .from("direct_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("dm_channel_id", dmChannelId)
    .neq("user_id", user.id)
    .is("read_at", null)
    .is("deleted_at", null);

  if (error) {
    console.error("Error marking messages as read:", error);
    return { success: false, error: "Failed to mark messages as read" };
  }

  return { success: true };
}

// Mark all messages in a group chat as read
export async function markGroupMessagesAsRead(groupChatId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Call the SQL function to update last_read_at in group_chat_members
  const { error } = await supabase.rpc("mark_group_messages_as_read", {
    p_group_chat_id: groupChatId,
    p_user_id: user.id,
  });

  if (error) {
    console.error("Error marking group messages as read:", error);
    return { success: false, error: "Failed to mark messages as read" };
  }

  return { success: true };
}
