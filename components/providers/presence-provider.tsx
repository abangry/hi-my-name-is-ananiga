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

        // If user was offline, set them online
        // If user had a different status (dnd, idle), keep it
        if (currentStatus === "offline") {
          await updateUserStatus("online");
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
        const handleBeforeUnload = async () => {
          // Only set offline if user was online
          // Keep dnd, idle, and already-offline statuses as-is
          const presenceResult = await getCurrentUserPresence();
          if (presenceResult.success && presenceResult.data) {
            const currentStatus = presenceResult.data.status;
            if (currentStatus === "online") {
              // Use sendBeacon for reliable last-moment update
              const endpoint = window.location.origin + "/api/presence/offline";
              navigator.sendBeacon(endpoint, JSON.stringify({ userId: user.id }));

              // Also try regular update as fallback
              await updateUserStatus("offline");
            }
          }
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
