"use server";

import { createClient } from "@/lib/supabase/server";

export interface UpdateProfileData {
  display_name?: string;
  bio?: string;
  avatar_url?: string;
}

// Update user profile
export async function updateProfile(data: UpdateProfileData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Filter out undefined values
  const updateData: Partial<UpdateProfileData> = {};
  if (data.display_name !== undefined) updateData.display_name = data.display_name;
  if (data.bio !== undefined) updateData.bio = data.bio;
  if (data.avatar_url !== undefined) updateData.avatar_url = data.avatar_url;

  const { error } = await supabase
    .from("profiles")
    .update(updateData)
    .eq("id", user.id);

  if (error) {
    console.error("Error updating profile:", error);
    return { success: false, error: "Failed to update profile" };
  }

  return { success: true };
}

// Get user profile
export async function getProfile(userId?: string) {
  const supabase = await createClient();

  // If no userId provided, get current user's profile
  let targetUserId = userId;
  if (!targetUserId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: "Not authenticated", data: null };
    }
    targetUserId = user.id;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", targetUserId)
    .single();

  if (error) {
    console.error("Error fetching profile:", error);
    return { success: false, error: "Failed to fetch profile", data: null };
  }

  return { success: true, data };
}
