"use server";

import { createClient } from "@/lib/supabase/server";

export async function sendFriendRequest(toUserTag: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Find the user by tag
  const { data: targetUser, error: userError } = await supabase
    .from("profiles")
    .select("id, username, tag")
    .eq("tag", toUserTag)
    .single();

  if (userError || !targetUser) {
    return { success: false, error: "User not found" };
  }

  // Don't allow sending friend request to yourself
  if (targetUser.id === user.id) {
    return { success: false, error: "You can't add yourself as a friend" };
  }

  // Check if already friends
  const { data: existingFriendship } = await supabase
    .from("friendships")
    .select("id")
    .or(
      `and(user_id.eq.${user.id},friend_id.eq.${targetUser.id}),and(user_id.eq.${targetUser.id},friend_id.eq.${user.id})`
    )
    .single();

  if (existingFriendship) {
    return { success: false, error: "Already friends" };
  }

  // Check if friend request already exists
  const { data: existingRequest } = await supabase
    .from("friend_requests")
    .select("id, status")
    .or(
      `and(from_user_id.eq.${user.id},to_user_id.eq.${targetUser.id}),and(from_user_id.eq.${targetUser.id},to_user_id.eq.${user.id})`
    )
    .single();

  if (existingRequest) {
    if (existingRequest.status === "pending") {
      return { success: false, error: "Friend request already sent" };
    }
  }

  // Create friend request
  const { error: insertError } = await supabase
    .from("friend_requests")
    .insert({
      from_user_id: user.id,
      to_user_id: targetUser.id,
      status: "pending",
    });

  if (insertError) {
    console.error("Error creating friend request:", insertError);
    return { success: false, error: "Failed to send friend request" };
  }

  return { success: true, message: "Friend request sent!", toUserId: targetUser.id };
}

export async function acceptFriendRequest(requestId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // First get the request to know who sent it
  const { data: request } = await supabase
    .from("friend_requests")
    .select("from_user_id")
    .eq("id", requestId)
    .single();

  // Use the database function to accept the request
  const { error } = await supabase.rpc("accept_friend_request", {
    request_id: requestId,
  });

  if (error) {
    console.error("Error accepting friend request:", error);
    return { success: false, error: "Failed to accept friend request" };
  }

  return { success: true, message: "Friend request accepted!", fromUserId: request?.from_user_id };
}

export async function declineFriendRequest(requestId: string) {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // First get the request to know who sent it
  const { data: request } = await supabase
    .from("friend_requests")
    .select("from_user_id")
    .eq("id", requestId)
    .single();

  // Update request status to declined
  const { error } = await supabase
    .from("friend_requests")
    .update({ status: "declined" })
    .eq("id", requestId)
    .eq("to_user_id", user.id); // Only allow declining requests sent to you

  if (error) {
    console.error("Error declining friend request:", error);
    return { success: false, error: "Failed to decline friend request" };
  }

  return { success: true, message: "Friend request declined", fromUserId: request?.from_user_id };
}

export async function getPendingFriendRequests() {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated", data: [] };
  }

  // Get incoming requests (requests sent TO me)
  const { data: incomingRequests, error: incomingError } = await supabase
    .from("friend_requests")
    .select(`
      id,
      from_user_id,
      created_at,
      from_user:profiles!friend_requests_from_user_id_fkey(
        id,
        username,
        tag,
        display_name,
        avatar_url
      )
    `)
    .eq("to_user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  // Get outgoing requests (requests I sent)
  const { data: outgoingRequests, error: outgoingError } = await supabase
    .from("friend_requests")
    .select(`
      id,
      to_user_id,
      created_at,
      to_user:profiles!friend_requests_to_user_id_fkey(
        id,
        username,
        tag,
        display_name,
        avatar_url
      )
    `)
    .eq("from_user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (incomingError || outgoingError) {
    console.error("Error fetching friend requests:", incomingError || outgoingError);
    return { success: false, error: "Failed to fetch friend requests", data: [] };
  }

  // Format the data
  const incoming = (incomingRequests || []).map((req: any) => ({
    id: req.id,
    userId: req.from_user_id,
    username: req.from_user.username,
    tag: req.from_user.tag,
    displayName: req.from_user.display_name,
    avatarUrl: req.from_user.avatar_url,
    createdAt: req.created_at,
    incoming: true,
  }));

  const outgoing = (outgoingRequests || []).map((req: any) => ({
    id: req.id,
    userId: req.to_user_id,
    username: req.to_user.username,
    tag: req.to_user.tag,
    displayName: req.to_user.display_name,
    avatarUrl: req.to_user.avatar_url,
    createdAt: req.created_at,
    incoming: false,
  }));

  return {
    success: true,
    data: [...incoming, ...outgoing],
  };
}

export async function getFriends() {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated", data: [] };
  }

  // Use the database function to get friends
  const { data: friends, error } = await supabase.rpc("get_user_friends", {
    p_user_id: user.id,
  });

  if (error) {
    console.error("Error fetching friends:", error);
    return { success: false, error: "Failed to fetch friends", data: [] };
  }

  return {
    success: true,
    data: friends || [],
  };
}

export async function getFriendRequestHistory() {
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated", data: [] };
  }

  // Get all accepted and declined friend requests (incoming only)
  const { data: requests, error } = await supabase
    .from("friend_requests")
    .select(`
      id,
      from_user_id,
      status,
      updated_at,
      from_user:profiles!friend_requests_from_user_id_fkey(
        id,
        username,
        tag,
        display_name,
        avatar_url
      )
    `)
    .eq("to_user_id", user.id)
    .in("status", ["accepted", "declined"])
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error fetching friend request history:", error);
    return { success: false, error: "Failed to fetch history", data: [] };
  }

  // Format the data
  const formattedData = (requests || []).map((req: any) => ({
    id: req.id,
    userId: req.from_user_id,
    username: req.from_user.username,
    tag: req.from_user.tag,
    displayName: req.from_user.display_name,
    avatarUrl: req.from_user.avatar_url,
    status: req.status,
    updatedAt: req.updated_at,
  }));

  return {
    success: true,
    data: formattedData,
  };
}
