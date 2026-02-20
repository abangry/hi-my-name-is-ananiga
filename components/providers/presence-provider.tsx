"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { updateUserStatus, getCurrentUserPresence } from "@/lib/actions/presence";

interface PresenceProviderProps {
  children: React.ReactNode;
}

export function PresenceProvider({ children }: PresenceProviderProps) {
  const supabase = createClient();

  useEffect(() => {
    let isComponentMounted = true;
    let heartbeatInterval: NodeJS.Timeout | null = null;

    const initializePresence = async () => {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !isComponentMounted) return;

        // Check current user's status preference
        const presenceResult = await getCurrentUserPresence();
        if (!presenceResult.success || !presenceResult.data) return;

        const currentStatus = presenceResult.data.status;

        if (currentStatus === "offline") {
          // Restore the last status the user explicitly had (dnd, idle, online)
          // Falls back to "online" if nothing was ever saved
          const preferred = (localStorage.getItem("preferredStatus") as "online" | "idle" | "dnd") || "online";
          await updateUserStatus(preferred);
        } else {
          // Save the current active status so we can restore it after reconnects
          localStorage.setItem("preferredStatus", currentStatus);
        }

        // Set up heartbeat to update last_seen every 30 seconds
        heartbeatInterval = setInterval(async () => {
          if (!isComponentMounted) return;

          // Update last_seen timestamp to show user is still active
          await supabase
            .from("user_presence")
            .update({ last_seen: new Date().toISOString() })
            .eq("user_id", user.id);
        }, 30000); // 30 seconds

        // Handle page visibility changes (tab switching)
        // DISABLED: Let users manually control their status instead of auto-changing
        // const handleVisibilityChange = async () => {
        //   // Auto idle/online logic removed to respect user's manual status choices
        // };

        // document.addEventListener("visibilitychange", handleVisibilityChange);

        // Handle page unload (tab close, navigation away)
        // IMPORTANT: beforeunload handlers must be synchronous - async functions
        // don't finish before the page closes, so we can't await anything here.
        const handleBeforeUnload = () => {
          // Send as Blob so Content-Type: application/json is set correctly
          const endpoint = window.location.origin + "/api/presence/offline";
          const blob = new Blob(
            [JSON.stringify({ userId: user.id })],
            { type: "application/json" }
          );
          navigator.sendBeacon(endpoint, blob);
        };

        window.addEventListener("beforeunload", handleBeforeUnload);

        // Cleanup
        return () => {
          isComponentMounted = false;
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          window.removeEventListener("beforeunload", handleBeforeUnload);
        };
      } catch (error) {
        console.error("Error initializing presence:", error);
      }
    };

    initializePresence();

    return () => {
      isComponentMounted = false;
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    };
  }, [supabase]);

  return <>{children}</>;
}
