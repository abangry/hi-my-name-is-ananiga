import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Verify the request is from the authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.id !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Set offline regardless of current status (online, idle, dnd all go offline
    // when the tab closes - user can restore their preferred status when they return)
    await supabase
      .from("user_presence")
      .update({
        status: "offline",
        last_seen: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating offline status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
