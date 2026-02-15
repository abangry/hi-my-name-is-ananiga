'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useUnreadCount(userId: string | null) {
  const [unreadCount, setUnreadCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    if (!userId) return;

    const fetchUnreadCount = async () => {
      const { data, error } = await supabase.rpc('get_total_unread_count', {
        p_user_id: userId,
      });

      if (!error && data !== null) {
        setUnreadCount(data);
      }
    };

    fetchUnreadCount();

    // Subscribe to direct_messages changes to update unread count in real-time
    const channel = supabase
      .channel('unread_count_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'direct_messages',
        },
        () => {
          // Refetch unread count when any DM changes
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId, supabase]);

  return unreadCount;
}
