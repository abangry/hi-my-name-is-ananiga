'use client';

import { useEffect } from 'react';
import { useUnreadCount } from '@/lib/hooks/use-unread-count';

interface UnreadTitleUpdaterProps {
  userId: string;
  baseTitle?: string;
}

export function UnreadTitleUpdater({ userId, baseTitle = 'Chat App' }: UnreadTitleUpdaterProps) {
  const unreadCount = useUnreadCount(userId);

  useEffect(() => {
    if (unreadCount > 0) {
      const displayCount = unreadCount > 99 ? '99+' : unreadCount.toString();
      document.title = `(${displayCount}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
  }, [unreadCount, baseTitle]);

  return null;
}
