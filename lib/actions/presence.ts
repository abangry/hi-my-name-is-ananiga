"use server";

import { createClient } from "@/lib/supabase/server";

export type UserStatus = "online" | "idle" | "dnd" | "offline";

export interface PresenceData {
  status: UserStatus;
  last_seen: string;
  updated_at: string;
}

// Update user presence status
export async function updateUserStatus(status: UserStatus, customStatus?: string | null) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const updateData: any = {
    status,
    last_seen: new Date().toISOString(),
  };

  if (customStatus !== undefined) {
    updateData.custom_status = customStatus;
  }

  const { error } = await supabase
    .from("user_presence")
    .upsert(
      {
        user_id: user.id,
        ...updateData,
      },
      {
        onConflict: "user_id",
      }
    );

  if (error) {
    console.error("Error updating user status:", error);
    return { success: false, error: "Failed to update status" };
  }

  return { success: true };
}

// Update only custom status
export async function updateCustomStatus(customStatus: string | null) {
  console.log('[updateCustomStatus] Called with:', customStatus);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error('[updateCustomStatus] Not authenticated');
    return { success: false, error: "Not authenticated" };
  }

  console.log('[updateCustomStatus] Updating for user:', user.id);

  // First, check if user_presence row exists
  const { data: existingPresence } = await supabase
    .from("user_presence")
    .select("*")
    .eq("user_id", user.id)
    .single();

  console.log('[updateCustomStatus] Existing presence:', existingPresence);

  if (!existingPresence) {
    // Create presence row first with online status
    console.log('[updateCustomStatus] Creating new presence row');
    const { error: insertError } = await supabase
      .from("user_presence")
      .insert({
        user_id: user.id,
        status: "online",
        custom_status: customStatus,
        last_seen: new Date().toISOString(),
      });

    if (insertError) {
      console.error("[updateCustomStatus] Error inserting presence:", insertError);
      return { success: false, error: "Failed to create presence" };
    }
  } else {
    // Update existing presence
    const { error } = await supabase
      .from("user_presence")
      .update({
        custom_status: customStatus,
      })
      .eq("user_id", user.id);

    if (error) {
      console.error("Error updating custom status:", error);
      return { success: false, error: "Failed to update custom status" };
    }
  }

  console.log('[updateCustomStatus] Success');
  return { success: true };
}

// Get user presence
export async function getUserPresence(userId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_presence")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) {
    console.error("Error fetching user presence:", error);
    return { success: false, error: "Failed to fetch presence", data: null };
  }

  return { success: true, data };
}

// Get current user's presence
export async function getCurrentUserPresence() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated", data: null };
  }

  return getUserPresence(user.id);
}

// Set user online
export async function setUserOnline() {
  return updateUserStatus("online");
}

// Set user offline
export async function setUserOffline() {
  return updateUserStatus("offline");
}

// Set user DND (Do Not Disturb)
export async function setUserDnd() {
  return updateUserStatus("dnd");
}

// Set user idle
export async function setUserIdle() {
  return updateUserStatus("idle");
}

// Update last seen timestamp
export async function updateLastSeen() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("user_presence")
    .update({
      last_seen: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    console.error("Error updating last seen:", error);
    return { success: false, error: "Failed to update last seen" };
  }

  return { success: true };
}
