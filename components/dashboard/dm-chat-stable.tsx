// Rock-solid stable version using Zustand + Global WebSocket Manager
"use client";

import { Profile } from "@/lib/types/database.types";
import { Send, Plus, Smile, Sticker, Image as ImageIcon, Settings, CornerUpRight, X, Paperclip, Users, Pencil, Star } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useChatStore } from "@/lib/stores/chat-store";
import { notificationSound } from "@/lib/utils/sounds";
import { type UserStatus } from "@/lib/actions/presence";
import { TypingIndicator } from "@/components/ui/typing-indicator";
import { MessageContextMenu } from "@/components/ui/message-context-menu";
import { ReplyIndicator } from "@/components/ui/reply-indicator";
import { ChatSkeleton } from "@/components/loading/chat-skeleton";
import { createClient } from "@/lib/supabase/client";
import { GroupSettingsModal } from "@/components/modals/group-settings-modal";
import { FileUploadModal } from "@/components/ui/file-upload-modal";
import { useFileUpload } from "@/lib/hooks/use-file-upload";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { EmojiPicker as FrimousseEmojiPicker, type Emoji } from 'frimousse';
import { GifPicker } from "@/components/ui/gif-picker";
import { StickerPicker } from "@/components/ui/sticker-picker";
import { getEmojiMessageStyle } from "@/lib/utils/emoji";
import { useBlockStore } from "@/lib/stores/block-store";
import { wsManager } from "@/lib/websocket-manager";
import { MentionAutocomplete, type MentionUser } from "@/components/ui/mention-autocomplete";
import { MessageContent, getMessageHighlightClass } from "@/components/ui/message-content";
import { getMentionQuery, insertMention, extractMentionTags } from "@/lib/utils/mentions";
import { GroupMembersSidebar } from "./group-members-sidebar";
import { UserProfileModal } from "@/components/modals/user-profile-modal";
import { MediaPreviewModal } from "@/components/ui/media-preview-modal";
import { useMediaFavorites } from "@/lib/hooks/use-media-favorites";

// Check if a media URL is from KLIPY (GIF/sticker) vs user-uploaded (Supabase Storage)
function isKlipyMedia(url: string): boolean {
  if (!url) return false;
  return !url.includes('supabase.co/storage');
}

// Swipeable message wrapper for mobile touch gestures
// Swipe right → reply, swipe left → edit (own messages only), long press → context menu
function SwipeableMessage({
  children,
  msg,
  isOwnMessage,
  onReply,
  onEdit,
  onLongPress,
  enabled
}: {
  children: React.ReactNode;
  msg: any;
  isOwnMessage: boolean;
  onReply: (msg: any) => void;
  onEdit: (msg: any) => void;
  onLongPress: (x: number, y: number, msg: any) => void;
  enabled: boolean;
}) {
  const [translateX, setTranslateX] = useState(0);
  const [isSnapping, setIsSnapping] = useState(false);
  const slideRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{
    startX: number;
    startY: number;
    longPressTimer: NodeJS.Timeout | null;
    swiping: boolean;
    moved: boolean;
    locked: boolean; // locked to vertical scroll
    currentX: number;
  }>({ startX: 0, startY: 0, longPressTimer: null, swiping: false, moved: false, locked: false, currentX: 0 });

  const SWIPE_THRESHOLD = 70;
  const LONG_PRESS_MS = 500;

  // Use non-passive touch listeners so we can preventDefault during swipe
  useEffect(() => {
    if (!enabled) return;
    const el = slideRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        longPressTimer: setTimeout(() => {
          if (!touchRef.current.moved) {
            navigator.vibrate?.(50);
            onLongPress(touch.clientX, touch.clientY, msg);
          }
        }, LONG_PRESS_MS),
        swiping: false,
        moved: false,
        locked: false,
        currentX: 0
      };
      setIsSnapping(false);
    };

    const onTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const deltaX = touch.clientX - touchRef.current.startX;
      const deltaY = touch.clientY - touchRef.current.startY;

      // If locked to vertical scroll, let the browser handle it
      if (touchRef.current.locked) return;

      // Determine direction on first significant move
      if (!touchRef.current.moved && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
        if (Math.abs(deltaY) > Math.abs(deltaX)) {
          // Vertical scroll — lock out swipe, let browser scroll
          touchRef.current.locked = true;
          if (touchRef.current.longPressTimer) {
            clearTimeout(touchRef.current.longPressTimer);
            touchRef.current.longPressTimer = null;
          }
          return;
        }
        // Horizontal swipe confirmed
        touchRef.current.moved = true;
        touchRef.current.swiping = true;
        if (touchRef.current.longPressTimer) {
          clearTimeout(touchRef.current.longPressTimer);
          touchRef.current.longPressTimer = null;
        }
      }

      if (touchRef.current.swiping) {
        // Prevent vertical scroll while swiping horizontally
        e.preventDefault();

        let dampedX: number;
        if (Math.abs(deltaX) < SWIPE_THRESHOLD) {
          dampedX = deltaX;
        } else {
          const overflow = Math.abs(deltaX) - SWIPE_THRESHOLD;
          dampedX = (SWIPE_THRESHOLD + overflow * 0.25) * Math.sign(deltaX);
        }
        if (deltaX < 0 && !isOwnMessage) {
          dampedX = dampedX * 0.12;
        }
        touchRef.current.currentX = dampedX;
        setTranslateX(dampedX);
      }
    };

    const onTouchEnd = () => {
      if (touchRef.current.longPressTimer) {
        clearTimeout(touchRef.current.longPressTimer);
        touchRef.current.longPressTimer = null;
      }

      if (touchRef.current.swiping) {
        const finalX = touchRef.current.currentX;
        if (finalX > SWIPE_THRESHOLD) {
          navigator.vibrate?.(30);
          onReply(msg);
        } else if (finalX < -SWIPE_THRESHOLD && isOwnMessage) {
          navigator.vibrate?.(30);
          onEdit(msg);
        }
      }

      setIsSnapping(true);
      setTranslateX(0);
      touchRef.current.swiping = false;
      touchRef.current.moved = false;
      touchRef.current.currentX = 0;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [enabled, msg, isOwnMessage, onReply, onEdit, onLongPress]);

  if (!enabled) return <div data-message-id={msg.id}>{children}</div>;

  const replyOpacity = Math.min(1, Math.max(0, (translateX - 15) / 55));
  const editOpacity = Math.min(1, Math.max(0, (-translateX - 15) / 55));

  return (
    <div className="relative overflow-hidden" data-message-id={msg.id}>
      {/* Reply icon - revealed when swiping right */}
      <div
        className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-500 transition-transform"
        style={{ opacity: replyOpacity, transform: `translateY(-50%) scale(${0.5 + replyOpacity * 0.5})` }}
      >
        <CornerUpRight className="w-4 h-4" />
      </div>
      {/* Edit icon - revealed when swiping left (own messages) */}
      {isOwnMessage && (
        <div
          className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-500 transition-transform"
          style={{ opacity: editOpacity, transform: `translateY(-50%) scale(${0.5 + editOpacity * 0.5})` }}
        >
          <Pencil className="w-3.5 h-3.5" />
        </div>
      )}
      {/* Sliding message content */}
      <div
        ref={slideRef}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isSnapping ? 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none'
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface DmChatProps {
  profile: Profile | null;
  recipientName: string;
  recipientTag: string;
  recipientAvatar: string;
  type?: 'dm' | 'group';
  groupChatId?: string;
  recipientUserId?: string;
  recipientTheme?: 'light' | 'dark';
  showMembersSidebar?: boolean;
  isMobile?: boolean;
}

export function DmChatStable({
  profile,
  recipientName,
  recipientTag,
  recipientAvatar,
  type = 'dm',
  groupChatId,
  recipientUserId,
  recipientTheme,
  showMembersSidebar = true,
  isMobile = false
}: DmChatProps) {
  const [message, setMessage] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [recipientStatus, setRecipientStatus] = useState<UserStatus>("offline");
  const [contextMenu, setContextMenu] = useState<any>(null);
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [editContent, setEditContent] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const lastTypingSentRef = useRef<number>(0);
  const supabase = createClient();
  const [conversationId, setConversationId] = useState<string>('')
  const [wsInitialized, setWsInitialized] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [groupIconUrl, setGroupIconUrl] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{ url: string; name: string } | null>(null);
  const [uploadingPaste, setUploadingPaste] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [selectedMemberProfile, setSelectedMemberProfile] = useState<string | null>(null);
  const [previewMedia, setPreviewMedia] = useState<string | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const [reactionPickerPos, setReactionPickerPos] = useState<{ x: number; y: number } | null>(null);
  const draftsRef = useRef<Map<string, string>>(new Map());
  const DEFAULT_QUICK_EMOJIS = ['😂', '💀', '😭', '🔥', '👍'];
  const [quickEmojis, setQuickEmojis] = useState<string[]>(DEFAULT_QUICK_EMOJIS);
  const [frequentEmojis, setFrequentEmojis] = useState<string[]>([]);
  const { uploadFile } = useFileUpload();

  // Media favorites (for star button on sent GIFs/stickers)
  const gifFavorites = useMediaFavorites(profile?.id, 'gif');
  const stickerFavorites = useMediaFavorites(profile?.id, 'sticker');
  // Track which picker a URL came from (survives within session)
  const mediaTypeMapRef = useRef<Map<string, 'gif' | 'sticker'>>(new Map());

  const isMediaFavorited = useCallback((url: string) =>
    gifFavorites.isFavorite(url) || stickerFavorites.isFavorite(url),
    [gifFavorites, stickerFavorites]
  );

  const toggleMediaFavorite = useCallback(async (url: string) => {
    // If already favorited, remove from whichever type it's in
    if (gifFavorites.isFavorite(url)) {
      await gifFavorites.removeFavorite(url);
      return;
    }
    if (stickerFavorites.isFavorite(url)) {
      await stickerFavorites.removeFavorite(url);
      return;
    }
    // Adding new — use tracked type from picker, fall back to 'gif'
    const type = mediaTypeMapRef.current.get(url) || 'gif';
    if (type === 'sticker') {
      await stickerFavorites.addFavorite(url, url);
    } else {
      await gifFavorites.addFavorite(url, url);
    }
  }, [gifFavorites, stickerFavorites]);

  // Memoized callback to prevent GroupMembersSidebar from remounting
  const handleViewProfile = useCallback((userId: string) => {
    setSelectedMemberProfile(userId);
  }, []);
  // delete confirmation modal state - gotta make sure people don't accidentally delete stuff
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<any>(null);

  // Mention state
  const [showMentionAutocomplete, setShowMentionAutocomplete] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [mentionableUsers, setMentionableUsers] = useState<MentionUser[]>([]);

  // Block state - check if there's a block between us and recipient (either direction)
  const [isRecipientBlocked, setIsRecipientBlocked] = useState(false);
  const [didIBlock, setDidIBlock] = useState(false); // true if I blocked them, false if they blocked me
  const [blockCheckLoading, setBlockCheckLoading] = useState(false);

  // Function to check block status from server (checks BOTH directions)
  const checkBlockStatus = useCallback(async () => {
    if (type !== 'dm' || !recipientUserId) {
      setIsRecipientBlocked(false);
      setDidIBlock(false);
      return;
    }

    setBlockCheckLoading(true);
    try {
      const { isUserBlocked, didIBlockUser } = await import('@/lib/actions/blocks');
      const [blocked, iBlockedThem] = await Promise.all([
        isUserBlocked(recipientUserId),
        didIBlockUser(recipientUserId)
      ]);
      console.log('[DmChat] Block check for', recipientUserId, '- blocked:', blocked, 'I blocked them:', iBlockedThem);
      setIsRecipientBlocked(blocked);
      setDidIBlock(iBlockedThem);
    } catch (error) {
      console.error('[DmChat] Error checking block status:', error);
      setIsRecipientBlocked(false);
      setDidIBlock(false);
    } finally {
      setBlockCheckLoading(false);
    }
  }, [type, recipientUserId]);

  // Unblock user handler
  const handleUnblock = useCallback(async () => {
    if (!recipientUserId) return;
    try {
      const { unblockUser } = await import('@/lib/actions/blocks');
      const result = await unblockUser(recipientUserId);
      if (result.success) {
        console.log('[DmChat] Successfully unblocked user');
        // Emit WebSocket event for instant sync
        wsManager.emitUserUnblock(recipientUserId);
        checkBlockStatus(); // Recheck status
      } else {
        console.error('[DmChat] Failed to unblock:', 'error' in result ? result.error : 'Unknown error');
      }
    } catch (error) {
      console.error('[DmChat] Error unblocking user:', error);
    }
  }, [recipientUserId, checkBlockStatus]);

  // Check block status on mount and when recipient changes
  useEffect(() => {
    checkBlockStatus();
  }, [checkBlockStatus]);

  // Listen for block events via WebSocket (when someone blocks/unblocks)
  useEffect(() => {
    const unsubscribe = wsManager.onUserBlock((data) => {
      console.log('[DmChat] User block event received:', data);
      // If the block/unblock involves us and the recipient, recheck status
      if (type === 'dm' && (data.blocker_user_id === recipientUserId || data.blocked_user_id === recipientUserId)) {
        checkBlockStatus();
      }
    });

    return unsubscribe;
  }, [type, recipientUserId, checkBlockStatus]);

  // Zustand store
  const {
    messages,
    loadingMessages,
    loadingOlderMessages,
    hasMoreMessages,
    typingUsers,
    connectionStatus,
    initializeWebSocket,
    switchConversation,
    loadOlderMessages,
    sendMessage: storeSendMessage,
    sendBlockedMessage: storeSendBlockedMessage,
    sendTyping: storeSendTyping,
    editMessage: storeEditMessage,
    deleteMessage: storeDeleteMessage,
    addReaction: storeAddReaction,
    removeReaction: storeRemoveReaction
  } = useChatStore()

  // Initialize WebSocket on mount
  useEffect(() => {
    const initWS = async () => {
      if (profile?.id && !wsInitialized) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          // pass the user profile so optimistic messages show the correct name and avatar
          await initializeWebSocket(profile.id, session.access_token, {
            username: profile.username,
            tag: profile.tag || '',
            display_name: profile.display_name,
            avatar_url: profile.avatar_url
          })
          setWsInitialized(true)
        }
      }
    }
    initWS()
  }, [profile?.id, wsInitialized, supabase, initializeWebSocket])

  // Fetch conversation ID
  useEffect(() => {
    const fetchConversationId = async () => {
      if (type === 'dm' && recipientUserId) {
        const { data: channelId } = await supabase.rpc('get_or_create_dm_channel', {
          other_user_id: recipientUserId
        })
        console.log('[DmChatStable] DM Channel ID:', channelId)
        if (channelId) {
          setConversationId(channelId)
        }
      } else if (type === 'group' && groupChatId) {
        setConversationId(groupChatId)
      }
    }
    fetchConversationId()
  }, [type, recipientUserId, groupChatId, supabase])

  // Switch conversation when ID changes
  useEffect(() => {
    if (conversationId && wsInitialized) {
      console.log('[DmChatStable] Switching to conversation:', conversationId)

      // Reset scroll tracking and save/restore drafts when switching conversations
      if (currentConversationRef.current !== conversationId) {
        // Save current draft before switching away
        if (currentConversationRef.current) {
          const currentDraft = message.trim() ? message : '';
          if (currentDraft) {
            draftsRef.current.set(currentConversationRef.current, currentDraft);
          } else {
            draftsRef.current.delete(currentConversationRef.current);
          }
        }
        // Restore draft for the new conversation
        setMessage(draftsRef.current.get(conversationId) || '');

        prevMessageCountRef.current = 0;
        hasScrolledToBottomRef.current = false;
        currentConversationRef.current = conversationId;
      }

      switchConversation(conversationId, type)
    }
  }, [conversationId, type, wsInitialized, switchConversation])

  // Fetch group icon (for groups)
  useEffect(() => {
    if (type === 'group' && groupChatId) {
      const fetchGroupIcon = async () => {
        const { data: groupData, error: groupError } = await supabase
          .from('group_chats')
          .select('icon_url')
          .eq('id', groupChatId)
          .single();

        if (!groupError && groupData) {
          setGroupIconUrl(groupData.icon_url || null);
        }
      };
      fetchGroupIcon();
    }
  }, [type, groupChatId, supabase]);

  // Load user's most-used reaction emojis for quick access
  useEffect(() => {
    if (!profile?.id) return;
    const loadQuickEmojis = async () => {
      const { data } = await supabase
        .from('message_reactions')
        .select('emoji')
        .eq('user_id', profile.id);
      if (data && data.length > 0) {
        // Count frequency of each emoji
        const counts: Record<string, number> = {};
        for (const row of data) {
          counts[row.emoji] = (counts[row.emoji] || 0) + 1;
        }
        const sorted = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .map(([emoji]) => emoji);

        // Top 5 for quick bar
        const top5 = sorted.slice(0, 5);
        if (top5.length >= 5) {
          setQuickEmojis(top5);
        } else {
          const remaining = DEFAULT_QUICK_EMOJIS.filter(e => !top5.includes(e));
          setQuickEmojis([...top5, ...remaining].slice(0, 5));
        }

        // Top 16 for "Frequently Used" section in emoji picker
        setFrequentEmojis(sorted.slice(0, 16));
      }
    };
    loadQuickEmojis();
  }, [profile?.id, supabase]);

  // Fetch recipient status (for DMs)
  useEffect(() => {
    if (type === 'dm' && recipientUserId) {
      const fetchStatus = async () => {
        const { data } = await supabase
          .from('user_presence')
          .select('status, custom_status')
          .eq('user_id', recipientUserId)
          .single()

        if (data) {
          setRecipientStatus(data.status as UserStatus)
        }
      }

      fetchStatus()

      const channel = supabase
        .channel(`presence:${recipientUserId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'user_presence',
          filter: `user_id=eq.${recipientUserId}`
        }, (payload) => {
          if (payload.new) {
            setRecipientStatus((payload.new as any).status)
          }
        })
        .subscribe()

      return () => {
        channel.unsubscribe()
      }
    }
  }, [type, recipientUserId, supabase])

  // Fetch mentionable users (for DM: just recipient + self, for group: all members)
  useEffect(() => {
    const fetchMentionableUsers = async () => {
      if (type === 'dm' && recipientUserId) {
        // For DMs: can mention recipient and self
        const { data: users } = await supabase
          .from('profiles')
          .select('id, username, tag, display_name, avatar_url')
          .in('id', [recipientUserId, profile?.id].filter(Boolean));

        if (users) {
          setMentionableUsers(users as MentionUser[]);
        }
      } else if (type === 'group' && groupChatId) {
        // For groups: fetch all members
        const { data: members } = await supabase.rpc('get_group_chat_members', {
          p_group_chat_id: groupChatId
        });

        if (members) {
          setMentionableUsers(members.map((m: any) => ({
            id: m.user_id,
            username: m.username,
            tag: m.tag,
            display_name: m.display_name,
            avatar_url: m.avatar_url
          })));
        }
      }
    };

    fetchMentionableUsers();
  }, [type, recipientUserId, groupChatId, profile?.id, supabase]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // keyboard shortcuts for quick actions
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only handle ArrowUp (with or without Ctrl)
      if (e.key !== 'ArrowUp') return;

      // Don't trigger if already editing or replying
      if (editingMessage || replyingTo) return;

      // Don't trigger if typing in the input field with content
      if (document.activeElement === inputRef.current && message.trim()) return;

      // Don't trigger if user is in another input/textarea
      const activeEl = document.activeElement;
      if (activeEl && activeEl !== inputRef.current) {
        const tagName = activeEl.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || (activeEl as HTMLElement).isContentEditable) {
          return;
        }
      }

      // Ctrl+ArrowUp (or Cmd+ArrowUp on Mac): Quick reply to last friend message
      if (e.ctrlKey || e.metaKey) {
        const friendMessages = messages.filter(m => m.user_id !== profile?.id);
        if (friendMessages.length > 0) {
          e.preventDefault();
          const lastFriendMessage = friendMessages[friendMessages.length - 1];
          // make sure the message is actually saved before allowing reply
          if (lastFriendMessage.status !== 'sending' && lastFriendMessage.status !== 'held' && lastFriendMessage.status !== 'blocked') {
            console.log('[DmChatStable] Ctrl+ArrowUp - replying to:', lastFriendMessage.id);
            setReplyingTo(lastFriendMessage);
            inputRef.current?.focus();
          }
        }
      }
      // Just ArrowUp: Edit your last message
      else {
        const myMessages = messages.filter(m => m.user_id === profile?.id);
        if (myMessages.length > 0) {
          e.preventDefault();
          const lastMessage = myMessages[myMessages.length - 1];
          console.log('[DmChatStable] Global ArrowUp - editing:', lastMessage.id);
          handleStartEdit(lastMessage);
        }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [messages, profile?.id, editingMessage, replyingTo, message]);

  // Track previous message count and scroll height for pagination
  const prevMessageCountRef = useRef(0);
  const scrollHeightBeforeLoadRef = useRef(0);
  const isRestoringScrollRef = useRef(false);
  const didTriggerLoadRef = useRef(false);
  const hasScrolledToBottomRef = useRef(false);
  const currentConversationRef = useRef<string>('');

  // Save scroll height BEFORE triggering load (called from handleScroll)
  const saveScrollHeightBeforeLoad = () => {
    if (messagesContainerRef.current) {
      scrollHeightBeforeLoadRef.current = messagesContainerRef.current.scrollHeight;
      didTriggerLoadRef.current = true;
      console.log('[DmChatStable] Saved scroll height before load:', scrollHeightBeforeLoadRef.current);
    }
  };

  // Handle scroll position when messages change
  useEffect(() => {
    if (messagesContainerRef.current && messages.length > 0) {
      const isInitialLoad = prevMessageCountRef.current === 0;
      const loadedOlderMessages = messages.length > prevMessageCountRef.current + 1;
      const isNewMessage = messages.length === prevMessageCountRef.current + 1;

      if (isInitialLoad && !hasScrolledToBottomRef.current) {
        // Scroll to bottom ONCE on initial load - use requestAnimationFrame for smooth scrolling
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
              hasScrolledToBottomRef.current = true;
            }
          });
        });
      } else if (isNewMessage) {
        // Only auto-scroll if user is near the bottom - don't interrupt reading older messages
        if (messagesContainerRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
          const isNearBottom = scrollHeight - scrollTop - clientHeight < 200;
          if (isNearBottom) {
            requestAnimationFrame(() => {
              if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
              }
            });
          } else {
            // User is scrolled up - show the scroll-to-bottom button
            setShowScrollButton(true);
          }
        }
      } else if (loadedOlderMessages && didTriggerLoadRef.current && scrollHeightBeforeLoadRef.current > 0) {
        // Maintain scroll position when older messages are loaded
        // Set flag to prevent immediate re-trigger
        isRestoringScrollRef.current = true;

        // Use requestAnimationFrame for more reliable timing
        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            const newScrollHeight = messagesContainerRef.current.scrollHeight;
            const addedHeight = newScrollHeight - scrollHeightBeforeLoadRef.current;

            // Set scroll to the added height so user sees same content they were viewing
            messagesContainerRef.current.scrollTop = addedHeight;

            console.log('[DmChatStable] Restored scroll position:', {
              oldHeight: scrollHeightBeforeLoadRef.current,
              newHeight: newScrollHeight,
              addedHeight,
              newScrollTop: addedHeight
            });

            // Reset flags after scroll is restored
            didTriggerLoadRef.current = false;
            scrollHeightBeforeLoadRef.current = 0;

            // Reset restoring flag after a short delay to allow scroll to settle
            setTimeout(() => {
              isRestoringScrollRef.current = false;
            }, 300);
          }
        });
      }

      prevMessageCountRef.current = messages.length;
    }
  }, [messages.length]);

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;

    // Don't trigger load while we're restoring scroll position
    if (isRestoringScrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // Show scroll button when scrolled up more than 200px
    setShowScrollButton(distanceFromBottom > 200);

    // Load older messages when scrolled near the top
    if (scrollTop < 50 && hasMoreMessages && !loadingOlderMessages) {
      console.log('[DmChatStable] Near top, loading older messages...')
      // CRITICAL: Save scroll height BEFORE loading so we can restore position after
      saveScrollHeightBeforeLoad();
      loadOlderMessages()
    }
  };

  const scrollToBottom = () => {
    if (!messagesContainerRef.current) return;
    messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    setShowScrollButton(false);
  };

  const scrollToBottomIfNearEnd = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 200;
    if (isNearBottom) {
      messagesContainerRef.current.scrollTop = scrollHeight;
    }
  };

  const scrollToMessage = (messageId: string) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Flash highlight
    el.style.transition = 'background-color 0.3s ease';
    el.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
    el.style.borderRadius = '8px';
    setTimeout(() => {
      el.style.backgroundColor = 'transparent';
      setTimeout(() => {
        el.style.transition = '';
        el.style.borderRadius = '';
      }, 300);
    }, 1500);
  };

  const handleTyping = (text: string) => {
    const isTyping = text.trim().length > 0;
    const now = Date.now();

    if (isTyping && now - lastTypingSentRef.current > 3000) {
      storeSendTyping(true);
      lastTypingSentRef.current = now;
    }

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      storeSendTyping(false);
    }, 5000);

    if (!isTyping) {
      storeSendTyping(false);
    }
  };

  const handleMessageChange = (newValue: string) => {
    setMessage(newValue);
    handleTyping(newValue);

    // Detect @ mentions
    const cursorPosition = inputRef.current?.selectionStart || newValue.length;
    const query = getMentionQuery(newValue, cursorPosition);

    if (query !== null) {
      setMentionQuery(query);
      setShowMentionAutocomplete(true);
      setMentionSelectedIndex(0);
    } else {
      setShowMentionAutocomplete(false);
      setMentionQuery("");
    }
  };

  // Handle mention selection
  const handleMentionSelect = (user: MentionUser) => {
    const cursorPosition = inputRef.current?.selectionStart || message.length;
    const { newText, newCursorPosition } = insertMention(message, cursorPosition, user.tag);

    setMessage(newText);
    setShowMentionAutocomplete(false);
    setMentionQuery("");

    // Restore focus and cursor position
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
      }
    }, 0);
  };

  const handleSendMessage = () => {
    if (!message.trim() && !pendingAttachment) return;

    // Extract mention tags from content and resolve to user IDs
    const mentionTags = extractMentionTags(message);
    const mentionedUserIds: string[] = [];

    mentionTags.forEach(tag => {
      const user = mentionableUsers.find(
        u => u.tag.toLowerCase() === tag.toLowerCase()
      );
      if (user && !mentionedUserIds.includes(user.id)) {
        mentionedUserIds.push(user.id);
      }
    });

    // If recipient is blocked, show message as blocked (not sent)
    if (isRecipientBlocked && type === 'dm') {
      const content = message.trim();
      setMessage("");
      storeSendTyping(false);

      // Add message with 'blocked' status - it won't be sent via WebSocket
      storeSendBlockedMessage(content, replyingTo?.id, pendingAttachment?.url);
      setReplyingTo(null);
      setPendingAttachment(null);
      return;
    }

    const content = message.trim();
    setMessage("");
    storeSendTyping(false);
    setShowEmojiPicker(false);

    // make sure we're replying to a real database ID, not a temporary client ID
    // the server will validate this too, but checking here prevents confusion
    const validReplyId = replyingTo?.id && replyingTo?.status !== 'sending' && replyingTo?.status !== 'held'
      ? replyingTo.id
      : undefined;

    storeSendMessage(
      content,
      validReplyId,
      pendingAttachment?.url,
      mentionedUserIds.length > 0 ? mentionedUserIds : undefined
    );
    setReplyingTo(null);
    setPendingAttachment(null);
  };

  const handleUploadComplete = (url: string, fileName: string) => {
    setPendingAttachment({ url, name: fileName });
    setShowUploadModal(false);
    inputRef.current?.focus();
  };

  const cancelAttachment = () => {
    setPendingAttachment(null);
  };

  // Handle paste for images
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || !profile?.id || !conversationId) return;

    for (const item of items) {
      if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        // Generate a name for the pasted media
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const extension = file.type.split('/')[1] || 'png';
        const prefix = item.type.startsWith('video/') ? 'pasted-video' : 'pasted-image';
        const fileName = `${prefix}-${timestamp}.${extension}`;

        // Create a new file with the generated name
        const namedFile = new File([file], fileName, { type: file.type });

        setUploadingPaste(true);
        try {
          const result = await uploadFile(namedFile, profile.id, type, conversationId);
          if (result) {
            setPendingAttachment({ url: result.url, name: result.name });
          }
        } catch (error) {
          console.error('[DmChatStable] Failed to upload pasted media:', error);
        } finally {
          setUploadingPaste(false);
        }
        break; // Only handle the first media
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle mention autocomplete navigation
    if (showMentionAutocomplete) {
      const filteredUsers = mentionableUsers.filter(user => {
        const searchQuery = mentionQuery.toLowerCase();
        const displayName = (user.display_name || user.username).toLowerCase();
        const tag = user.tag.toLowerCase();
        return displayName.includes(searchQuery) || tag.includes(searchQuery);
      });

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionSelectedIndex(prev =>
          prev < filteredUsers.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionSelectedIndex(prev =>
          prev > 0 ? prev - 1 : filteredUsers.length - 1
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filteredUsers[mentionSelectedIndex]) {
          handleMentionSelect(filteredUsers[mentionSelectedIndex]);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionAutocomplete(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (editingMessage) {
        handleSaveEdit();
      } else {
        handleSendMessage();
      }
    }

    // plain up arrow edits your last message - but skip if Ctrl is pressed (that's for replying)
    if (e.key === "ArrowUp" && !message.trim() && !editingMessage && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      console.log('[DmChatStable] ArrowUp pressed, looking for last own message');
      const myMessages = messages.filter(m => m.user_id === profile?.id);
      console.log('[DmChatStable] My messages count:', myMessages.length);
      if (myMessages.length > 0) {
        const lastMessage = myMessages[myMessages.length - 1];
        console.log('[DmChatStable] Starting edit for:', lastMessage.id);
        handleStartEdit(lastMessage);
      }
    }

    // Escape to cancel editing
    if (e.key === "Escape" && editingMessage) {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  // Edit handlers
  const handleStartEdit = (msg: any) => {
    console.log('[DmChatStable] handleStartEdit:', msg.id, msg.content);
    setEditingMessage(msg);
    setEditContent(msg.content);
    setReplyingTo(null);
    inputRef.current?.focus();
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setEditContent("");
  };

  const handleSaveEdit = () => {
    console.log('[DmChatStable] handleSaveEdit:', editingMessage?.id, editContent);
    if (!editingMessage || !editContent.trim()) return;
    if (editContent.trim() === editingMessage.content) {
      handleCancelEdit();
      return;
    }
    console.log('[DmChatStable] Calling storeEditMessage');
    storeEditMessage(editingMessage.id, editContent.trim());
    handleCancelEdit();
  };

  // Delete handler
  const handleDelete = () => {
    console.log('[DmChatStable] handleDelete, contextMenu:', contextMenu);
    if (contextMenu) {
      // don't delete right away - show a warning first to prevent accidents
      setMessageToDelete(contextMenu.message);
      setShowDeleteConfirm(true);
      setContextMenu(null);
    }
  };

  const confirmDelete = () => {
    if (messageToDelete) {
      console.log('[DmChatStable] Confirmed delete:', messageToDelete.id);
      storeDeleteMessage(messageToDelete.id);
      setShowDeleteConfirm(false);
      setMessageToDelete(null);
    }
  };

  const cancelDelete = () => {
    // user changed their mind - close the modal and keep the message
    setShowDeleteConfirm(false);
    setMessageToDelete(null);
  };

  // Edit from context menu
  const handleEditFromMenu = () => {
    if (contextMenu) {
      handleStartEdit(contextMenu.message);
      setContextMenu(null);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, msg: any) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      message: msg,
    });
  };

  const handleReply = () => {
    if (contextMenu) {
      const msg = contextMenu.message;
      // prevent replies to messages that haven't been saved to the database yet
      // otherwise we'd be trying to reference a message ID that doesn't exist
      if (msg.status === 'sending' || msg.status === 'held' || msg.status === 'blocked') {
        console.log('[DmChat] Cannot reply to unpersisted message');
        setContextMenu(null);
        return;
      }
      setReplyingTo(contextMenu.message);
      inputRef.current?.focus();
    }
  };

  const handleCopy = () => {
    if (contextMenu) {
      navigator.clipboard.writeText(contextMenu.message.content);
    }
  };

  const cancelReply = () => {
    setReplyingTo(null);
  };

  const groupMessagesByDate = () => {
    const groupsArray: { dateLabel: string; date: Date; msgs: any[] }[] = [];
    const groupsMap: { [key: string]: { dateLabel: string; date: Date; msgs: any[] } } = {};

    messages.forEach((msg) => {
      const date = new Date(msg.created_at);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let dateLabel: string;
      if (date.toDateString() === today.toDateString()) {
        dateLabel = "Today";
      } else if (date.toDateString() === yesterday.toDateString()) {
        dateLabel = "Yesterday";
      } else {
        dateLabel = date.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
      }

      if (!groupsMap[dateLabel]) {
        const group = { dateLabel, date, msgs: [] };
        groupsMap[dateLabel] = group;
        groupsArray.push(group);
      }
      groupsMap[dateLabel].msgs.push(msg);
    });

    groupsArray.sort((a, b) => a.date.getTime() - b.date.getTime());
    return groupsArray;
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const shouldGroupMessages = (msg1: any, msg2: any) => {
    // never group messages that have replies - they should always show their own avatar
    if (msg2.reply_to_id) return false;

    // different users never get grouped
    if (msg1.user_id !== msg2.user_id) return false;

    // same user within 5 minutes gets grouped
    const time1 = new Date(msg1.created_at).getTime();
    const time2 = new Date(msg2.created_at).getTime();
    const diffMinutes = Math.abs(time2 - time1) / (1000 * 60);
    return diffMinutes < 5;
  };

  const messageGroups = groupMessagesByDate();

  const getStatusColor = (status: UserStatus) => {
    switch (status) {
      case "online": return "#23a559";
      case "idle": return "#f0b232";
      case "dnd": return "#f23f43";
      case "offline": return "#80848e";
      default: return "#23a559";
    }
  };

  const typingUsernames = Array.from(typingUsers.values());
  const showTyping = typingUsernames.length > 0;

  // Scroll to bottom when typing indicator appears (if near bottom)
  useEffect(() => {
    if (!showTyping || !messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      requestAnimationFrame(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      });
    }
  }, [showTyping]);

  // Show skeleton loading - but only on initial load or when actually loading
  // Don't show skeleton if we already have messages (prevents flash during conversation switch)
  const shouldShowSkeleton = (!wsInitialized || !conversationId) || (loadingMessages && messages.length === 0);

  if (shouldShowSkeleton) {
    return <ChatSkeleton />
  }

  return (
    <div className="flex h-full bg-gradient-to-br from-gray-50 to-white">
      {/* Main Chat Area */}
      <div className="relative flex-1 h-full">
        {/* Top Navbar - Responsive */}
      <div className={`absolute top-0 left-0 right-0 h-14 px-3 sm:px-4 mt-2 mx-2 sm:mx-4 flex items-center backdrop-blur-lg rounded-xl border justify-between shadow-md hover:shadow-lg transition-shadow duration-200 z-10 ${
        recipientTheme === 'dark'
          ? 'bg-black/90 border-[#1f1f1f]'
          : 'bg-white/90 border-gray-200'
      }`}>
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="relative flex-shrink-0">
            <div className={`w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-sm ring-2 ${
              recipientTheme === 'dark' ? 'ring-black' : 'ring-white'
            }`}>
              {recipientAvatar ? (
                <img src={recipientAvatar} alt={recipientName} className="w-full h-full rounded-full object-cover" />
              ) : (
                <span className="text-white text-sm font-bold">
                  {recipientName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-bold truncate ${
                isRecipientBlocked ? 'text-red-600'
                  : recipientTheme === 'dark' ? 'text-white' : 'text-gray-900'
              }`}>{recipientName}</span>
              {isRecipientBlocked && (
                <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-md font-bold">Blocked</span>
              )}
            </div>
            {type === 'dm' && (
              <span className={`text-xs truncate ${recipientTheme === 'dark' ? 'text-neutral-400' : 'text-gray-500'}`}>@{recipientTag}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {connectionStatus !== 'connected' && (
            <div className="hidden sm:flex sm:items-center sm:gap-1.5 text-xs text-orange-600 font-semibold bg-orange-50 px-2 py-1 rounded-lg border border-orange-100">
              <div className="w-1.5 h-1.5 bg-orange-600 rounded-full animate-pulse"></div>
              {connectionStatus === 'connecting' ? 'Connecting...' : 'Reconnecting...'}
            </div>
          )}

          {type === 'group' && groupChatId && (
            <>
              <button
                onClick={() => setShowSettingsModal(true)}
                className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-all duration-200 flex-shrink-0 hover:scale-105 active:scale-95"
                title="Group Settings"
              >
                <Settings className="w-5 h-5 text-gray-600" />
              </button>
              <button
                onClick={() => {
                  console.log('[DmChatStable] Toggle members sidebar. Current:', showMembersSidebar)
                  window.dispatchEvent(new CustomEvent('toggleMembersSidebar'))
                }}
                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 flex-shrink-0 hover:scale-105 active:scale-95 ${
                  showMembersSidebar
                    ? 'bg-blue-50 border-2 border-blue-200 shadow-sm'
                    : 'hover:bg-gray-100 border-2 border-transparent'
                }`}
                title={showMembersSidebar ? "Hide members" : "Show members"}
              >
                <Users className={`w-5 h-5 transition-colors duration-200 ${showMembersSidebar ? 'text-blue-600' : 'text-gray-600'}`} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Messages - Responsive padding */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="absolute top-16 sm:top-0 bottom-24 sm:bottom-20 left-0 right-0 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent px-2 sm:px-4 flex flex-col"
      >
        {/* Loading older messages indicator */}
        {loadingOlderMessages && (
          <div className="flex items-center justify-center py-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
              <span>Loading older messages...</span>
            </div>
          </div>
        )}

        {/* "Beginning of conversation" indicator */}
        {!hasMoreMessages && messages.length > 0 && (
          <div className="flex items-center justify-center py-6 mb-4">
            <div className="px-4 py-1.5 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100 rounded-full text-xs font-semibold text-blue-600">
              Beginning of conversation
            </div>
          </div>
        )}

        {messageGroups.map((group) => (
          <div key={group.dateLabel} className="mb-6">
            <div className="flex items-center justify-center mb-5">
              <div className="px-4 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-bold text-gray-600 shadow-sm">
                {group.dateLabel}
              </div>
            </div>

            <div className="space-y-0">
              {group.msgs.map((msg, index) => {
                // System messages (only for groups) - render differently
                const isSystemMessage = msg.message_type && msg.message_type !== 'user_message';

                if (isSystemMessage) {
                  // Leave messages are red, others are blue
                  const isLeaveMessage = msg.message_type === 'system_leave';
                  const bgColor = isLeaveMessage ? 'bg-red-50/80' : 'bg-blue-50/80';
                  const borderColor = isLeaveMessage ? 'border-red-100' : 'border-blue-100';
                  const textColor = isLeaveMessage ? 'text-red-700' : 'text-blue-700';

                  return (
                    <div key={msg.id} className="flex items-center justify-center py-2">
                      <div className={`px-3 py-1.5 ${bgColor} border ${borderColor} rounded-lg text-xs font-medium ${textColor} max-w-md text-center`}>
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                // Regular user messages
                const displayName = msg.user.display_name || msg.user.username;
                const initials = displayName
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);

                // Find the previous non-system message for grouping
                let prevMsg = null;
                for (let i = index - 1; i >= 0; i--) {
                  const candidate = group.msgs[i];
                  if (!candidate.message_type || candidate.message_type === 'user_message') {
                    prevMsg = candidate;
                    break;
                  }
                }
                const showAvatar = !prevMsg || !shouldGroupMessages(prevMsg, msg);

                const repliedMessage = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null;

                const isOwnMsg = profile?.id === msg.user_id;
                const isSystemMsg = !!msg.message_type;
                const canInteract = msg.status !== 'sending' && msg.status !== 'held' && msg.status !== 'blocked';

                return (
                  <SwipeableMessage
                    key={msg.id}
                    msg={msg}
                    isOwnMessage={!!isOwnMsg}
                    enabled={isMobile && !isSystemMsg && canInteract}
                    onReply={(m) => {
                      setReplyingTo(m);
                      inputRef.current?.focus();
                    }}
                    onEdit={(m) => handleStartEdit(m)}
                    onLongPress={(x, y, m) => {
                      setContextMenu({ x, y, message: m });
                    }}
                  >
                  <div
                    className={`${showAvatar ? "pt-4" : ""} animate-fadeInSlide relative group/msg`}
                    onContextMenu={(e) => handleContextMenu(e, msg)}
                  >
                    {/* Hover action bar (desktop) */}
                    {canInteract && !isMobile && (
                      <div className="absolute -top-3 right-2 hidden group-hover/msg:flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg shadow-sm px-1 py-0.5 z-10">
                        {/* Quick emoji buttons */}
                        {quickEmojis.map((emoji) => {
                          const hasReacted = msg.reactions?.some((r: { emoji: string; users: { id: string }[] }) =>
                            r.emoji === emoji && r.users.some((u: { id: string }) => u.id === profile?.id)
                          );
                          return (
                            <button
                              key={emoji}
                              onClick={() => {
                                if (hasReacted) {
                                  storeRemoveReaction(msg.id, emoji);
                                } else {
                                  storeAddReaction(msg.id, emoji);
                                }
                              }}
                              className={`p-1 rounded hover:bg-gray-100 transition-colors text-sm leading-none ${hasReacted ? 'bg-blue-100' : ''}`}
                              title={emoji}
                            >
                              {emoji}
                            </button>
                          );
                        })}
                        <div className="w-px h-4 bg-gray-200 mx-0.5" />
                        <button
                          onClick={(e) => {
                            const rect = (e.target as HTMLElement).getBoundingClientRect();
                            setReactionPickerPos({ x: rect.left, y: rect.bottom + 4 });
                            setReactionPickerMessageId(msg.id);
                          }}
                          className="p-1 rounded hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
                          title="More reactions"
                        >
                          <Smile className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setReplyingTo(msg);
                            inputRef.current?.focus();
                          }}
                          className="p-1 rounded hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
                          title="Reply"
                        >
                          <CornerUpRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {/* Reply connector - Discord style */}
                    {repliedMessage && (
                      <div className="flex items-end mb-0.5 ml-5">
                        {/* Curved connector line */}
                        <div className="w-8 h-4 relative">
                          <div
                            className="absolute bottom-0 left-0 w-6 h-3 border-l-2 border-t-2 border-gray-300 rounded-tl-md"
                          />
                        </div>
                        {/* Replied message preview */}
                        <div
                          onClick={() => scrollToMessage(repliedMessage.id)}
                          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
                        >
                          {repliedMessage.user.avatar_url ? (
                            <img
                              src={repliedMessage.user.avatar_url}
                              alt=""
                              className="w-4 h-4 rounded-full"
                            />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center">
                              <span className="text-white text-[8px] font-semibold">
                                {(repliedMessage.user.display_name || repliedMessage.user.username).charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <span className="font-medium text-gray-600 hover:underline">
                            {repliedMessage.user.display_name || repliedMessage.user.username}
                          </span>
                          <span className="truncate max-w-[200px] text-gray-400">
                            {repliedMessage.content || 'Click to see attachment'}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-start gap-3 hover:bg-gray-100/60 px-2 -mx-2 py-0.5 rounded transition-colors">
                      {showAvatar && (
                        <div className="w-10 h-10 flex-shrink-0">
                          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                            {msg.user.avatar_url ? (
                              <img src={msg.user.avatar_url} alt={displayName} className="w-full h-full rounded-full object-cover" />
                            ) : (
                              <span className="text-white text-sm font-semibold">{initials}</span>
                            )}
                          </div>
                        </div>
                      )}

                      <div className={`flex-1 min-w-0 ${!showAvatar ? "ml-[52px]" : ""}`}>

                      {showAvatar && (
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-900">{displayName}</span>
                          <span className="text-[10px] text-gray-400">{formatTime(msg.created_at)}</span>
                          {msg.status === 'sending' && (
                            <span className="text-xs text-gray-400 italic">Sending...</span>
                          )}
                          {msg.status === 'held' && (
                            <span className="text-xs text-red-500 italic">Slow down...</span>
                          )}
                          {msg.status === 'blocked' && (
                            <span className="text-xs text-red-500">Blocked</span>
                          )}
                          {msg.status === 'failed' && (
                            <span className="text-xs text-red-500">Failed</span>
                          )}
                        </div>
                      )}
                      {/* Attachment preview */}
                      {msg.attachment_url && (
                        <div className="mb-2">
                          {msg.attachment_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                            <div className="relative inline-block group/media">
                              <button
                                onClick={() => setPreviewMedia(msg.attachment_url!)}
                                className="cursor-pointer focus:outline-none"
                              >
                                <img
                                  src={msg.attachment_url}
                                  alt="Attachment"
                                  className="max-w-xs max-h-64 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
                                  onLoad={scrollToBottomIfNearEnd}
                                />
                              </button>
                              {/* Star button for KLIPY media (GIFs/stickers) */}
                              {isKlipyMedia(msg.attachment_url) && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleMediaFavorite(msg.attachment_url!);
                                  }}
                                  className={`absolute top-2 right-2 p-1.5 rounded-full transition-all ${
                                    isMediaFavorited(msg.attachment_url)
                                      ? 'bg-yellow-400 text-white'
                                      : 'bg-black/40 text-white opacity-0 group-hover/media:opacity-100'
                                  }`}
                                  title={isMediaFavorited(msg.attachment_url) ? 'Remove from favorites' : 'Add to favorites'}
                                >
                                  <Star className={`w-4 h-4 ${isMediaFavorited(msg.attachment_url) ? 'fill-current' : ''}`} />
                                </button>
                              )}
                            </div>
                          ) : msg.attachment_url.match(/\.(mp4|webm|mov)$/i) ? (
                            <video
                              src={msg.attachment_url}
                              controls
                              preload="metadata"
                              className="max-w-xs max-h-72 rounded-lg border border-gray-200"
                              onLoadedData={scrollToBottomIfNearEnd}
                            />
                          ) : (
                            <a
                              href={msg.attachment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                              <Paperclip className="w-4 h-4 text-gray-500" />
                              <span className="text-sm text-gray-700">View attachment</span>
                            </a>
                          )}
                        </div>
                      )}
                      {msg.content && (() => {
                        const emojiStyle = getEmojiMessageStyle(msg.content);
                        const highlightClass = getMessageHighlightClass(msg.mentions, profile?.id);
                        return (
                          <div
                            className={`text-gray-900 break-words ${emojiStyle.className} px-1 py-0.5 ${
                              msg.status === 'sending' ? 'opacity-60' : ''
                            } ${msg.status === 'held' ? 'bg-red-50 opacity-70' : ''} ${msg.status === 'blocked' ? 'bg-red-50 opacity-70' : ''} ${msg.status === 'failed' ? 'bg-red-50' : ''} ${emojiStyle.isLargeEmoji ? 'py-1' : ''} ${highlightClass}`}
                          >
                            <MessageContent
                              content={msg.content}
                              mentions={msg.mentions}
                              currentUserId={profile?.id}
                            />
                            {msg.edited_at && (
                              <span className={`ml-1 text-xs text-gray-400 italic ${emojiStyle.isLargeEmoji ? 'align-middle' : ''}`}>(edited)</span>
                            )}
                          </div>
                        );
                      })()}

                      {/* Reaction pills */}
                      {msg.reactions && msg.reactions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1 px-1">
                          {msg.reactions.map((reaction: { emoji: string; users: { id: string; username: string }[] }) => {
                            const hasReacted = reaction.users.some((u: { id: string }) => u.id === profile?.id);
                            return (
                              <button
                                key={reaction.emoji}
                                onClick={() => {
                                  if (hasReacted) {
                                    storeRemoveReaction(msg.id, reaction.emoji);
                                  } else {
                                    storeAddReaction(msg.id, reaction.emoji);
                                  }
                                }}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                                  hasReacted
                                    ? 'bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200'
                                    : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'
                                }`}
                                title={reaction.users.map((u: { username: string }) => u.username).join(', ')}
                              >
                                <span className="text-sm">{reaction.emoji}</span>
                                <span className="font-medium">{reaction.users.length}</span>
                              </button>
                            );
                          })}
                          <button
                            onClick={(e) => {
                              const rect = (e.target as HTMLElement).getBoundingClientRect();
                              setReactionPickerPos({ x: rect.left, y: rect.top });
                              setReactionPickerMessageId(msg.id);
                            }}
                            className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 border border-gray-200 text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors text-xs"
                            title="Add reaction"
                          >
                            +
                          </button>
                        </div>
                      )}
                      </div>
                    </div>
                  </div>
                  </SwipeableMessage>
                );
              })}
            </div>
          </div>
        ))}

        {showTyping && (
          <div className="flex items-center gap-3 text-sm text-blue-600 mb-4 pl-2">
            <TypingIndicator size="md" className="text-blue-600" />
            <span className="italic font-medium">
              {typingUsernames.length === 1
                ? `${typingUsernames[0]} is typing`
                : `${typingUsernames.length} people are typing`}
            </span>
          </div>
        )}
      </div>

      {/* Jump to bottom button - Responsive */}
      {showScrollButton && (
        <>
          <div className="absolute bottom-28 sm:bottom-36 left-1/2 -translate-x-1/2 z-10">
            <button
              onClick={scrollToBottom}
              className="px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium rounded-full shadow-lg transition-all hover:scale-105"
            >
              Jump to Latest
            </button>
          </div>
        </>
      )}

      {/* Message Input - Mobile Responsive */}
      <div className="absolute bottom-0 left-0 right-0 px-2 sm:px-4 pb-2 sm:pb-4">
        {/* Editing indicator */}
        {editingMessage && (
          <div className="flex items-center gap-3 px-4 py-3 mb-2 bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-300 rounded-2xl shadow-sm">
            <span className="text-sm text-blue-700 font-bold">Editing message</span>
            <span className="text-sm text-blue-600 truncate flex-1">{editingMessage.content}</span>
            <button
              onClick={handleCancelEdit}
              className="text-blue-600 hover:text-blue-800 hover:bg-blue-200 p-1.5 rounded-lg transition-all duration-200"
              title="Cancel editing"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {replyingTo && !editingMessage && (
          <ReplyIndicator
            username={replyingTo.user.username}
            messagePreview={replyingTo.content}
            onCancel={cancelReply}
          />
        )}

        {/* Mention autocomplete */}
        {showMentionAutocomplete && (
          <MentionAutocomplete
            users={mentionableUsers}
            query={mentionQuery}
            selectedIndex={mentionSelectedIndex}
            onSelect={handleMentionSelect}
            onClose={() => setShowMentionAutocomplete(false)}
          />
        )}

        {/* Uploading pasted image indicator */}
        {uploadingPaste && (
          <div className="flex items-center gap-3 px-4 py-3 mb-2 bg-gradient-to-r from-yellow-50 to-yellow-100 border-2 border-yellow-300 rounded-2xl shadow-sm">
            <div className="w-5 h-5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-yellow-700 font-bold">Uploading pasted image...</span>
          </div>
        )}

        {/* Pending attachment indicator */}
        {pendingAttachment && !uploadingPaste && (
          <div className="flex items-center gap-3 px-4 py-3 mb-2 bg-gradient-to-r from-green-50 to-green-100 border-2 border-green-300 rounded-2xl shadow-sm">
            <Paperclip className="w-5 h-5 text-green-600" />
            <span className="text-sm text-green-700 font-bold truncate flex-1">{pendingAttachment.name}</span>
            <button
              onClick={cancelAttachment}
              className="text-green-600 hover:text-green-800 hover:bg-green-200 p-1.5 rounded-lg transition-all duration-200"
              title="Remove attachment"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Blocked user indicator */}
        {isRecipientBlocked && type === 'dm' && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 mb-2 bg-gradient-to-r from-red-50 to-red-100 border-2 border-red-300 rounded-2xl shadow-sm">
            <span className="text-sm text-red-700 font-bold">
              {didIBlock
                ? "You have blocked this user. Unblock to send messages."
                : "This user has blocked you. You cannot send messages."}
            </span>
            {didIBlock && (
              <button
                onClick={handleUnblock}
                className="px-4 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 rounded-xl transition-all duration-200 shadow-sm hover:scale-105"
              >
                Unblock
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Plus button - opens upload modal */}
          <button
            onClick={() => setShowUploadModal(true)}
            disabled={!!editingMessage || connectionStatus !== 'connected'}
            className="flex w-9 h-9 sm:w-11 sm:h-11 items-center justify-center rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 transition-all duration-200 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            title="Attach file"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" />
          </button>

          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={editingMessage ? editContent : message}
              onChange={(e) => editingMessage ? setEditContent(e.target.value) : handleMessageChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={editingMessage ? "Edit your message..." : (type === 'group' ? `Message ${recipientName}` : `Message @${recipientTag}`)}
              className={`w-full pl-4 sm:pl-5 text-black/80 pr-12 sm:pr-14 py-3 sm:py-3.5 bg-white border-2 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 transition-all duration-200 shadow-sm ${
                editingMessage
                  ? 'border-blue-300 focus:ring-blue-300/40 focus:border-blue-400'
                  : uploadingPaste
                    ? 'border-yellow-300 focus:ring-yellow-300/40 focus:border-yellow-400'
                    : 'border-gray-200 focus:ring-blue-500/30 focus:border-blue-500'
              }`}
              disabled={connectionStatus !== 'connected' || uploadingPaste || isRecipientBlocked}
            />

            <button
              onClick={editingMessage ? handleSaveEdit : handleSendMessage}
              disabled={editingMessage ? !editContent.trim() : ((!message.trim() && !pendingAttachment) || connectionStatus !== 'connected')}
              className={`absolute right-2 sm:right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:scale-105 ${
                editingMessage
                  ? 'bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
                  : pendingAttachment
                    ? 'bg-gradient-to-br from-green-500 to-green-600 hover:from-green-600 hover:to-green-700'
                    : 'bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
              }`}
              title={editingMessage ? "Save Edit" : pendingAttachment ? "Send with Attachment" : "Send Message"}
            >
              <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            </button>
          </div>

          {/* Action buttons - compact on mobile, full on sm+ */}
          <div className="flex items-center gap-0.5 sm:gap-1 relative">
            <button
              onClick={() => {
                setShowEmojiPicker(!showEmojiPicker);
                setShowGifPicker(false);
                setShowStickerPicker(false);
              }}
              className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors ${showEmojiPicker ? 'bg-gray-200' : ''}`}
              title="Emoji"
            >
              <Smile className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
            </button>
            <button
              onClick={() => {
                setShowStickerPicker(!showStickerPicker);
                setShowEmojiPicker(false);
                setShowGifPicker(false);
              }}
              className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors ${showStickerPicker ? 'bg-gray-200' : ''}`}
              title="Stickers"
            >
              <Sticker className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
            </button>
            <button
              onClick={() => {
                setShowGifPicker(!showGifPicker);
                setShowEmojiPicker(false);
                setShowStickerPicker(false);
              }}
              className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors ${showGifPicker ? 'bg-gray-200' : ''}`}
              title="GIFs"
            >
              <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
            </button>

            {/* Emoji Picker */}
            <EmojiPicker
              isOpen={showEmojiPicker}
              onClose={() => setShowEmojiPicker(false)}
              onEmojiSelect={(emoji) => {
                setMessage(prev => prev + emoji);
                inputRef.current?.focus();
              }}
              position="top"
              frequentEmojis={frequentEmojis}
            />

            {/* GIF Picker */}
            <GifPicker
              isOpen={showGifPicker}
              onClose={() => setShowGifPicker(false)}
              onGifSelect={(url) => {
                mediaTypeMapRef.current.set(url, 'gif');
                setPendingAttachment({ url, name: 'GIF' });
              }}
              userId={profile?.id}
              position="top"
            />

            {/* Sticker Picker */}
            <StickerPicker
              isOpen={showStickerPicker}
              onClose={() => setShowStickerPicker(false)}
              onStickerSelect={(url) => {
                mediaTypeMapRef.current.set(url, 'sticker');
                setPendingAttachment({ url, name: 'Sticker' });
              }}
              userId={profile?.id}
              position="top"
            />
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isOwnMessage={profile?.id === contextMenu.message.user_id}
          onClose={() => setContextMenu(null)}
          onReply={handleReply}
          onEdit={handleEditFromMenu}
          onDelete={handleDelete}
          onCopy={handleCopy}
          onMarkAsRead={() => {}}
          showFavoriteOption={
            !!(contextMenu.message.attachment_url &&
            contextMenu.message.attachment_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) &&
            isKlipyMedia(contextMenu.message.attachment_url))
          }
          isFavorited={
            contextMenu.message.attachment_url
              ? isMediaFavorited(contextMenu.message.attachment_url)
              : false
          }
          onToggleFavorite={() => {
            if (contextMenu.message.attachment_url) {
              toggleMediaFavorite(contextMenu.message.attachment_url);
            }
          }}
          onReact={() => {
            if (contextMenu) {
              const msg = contextMenu.message;
              setReactionPickerPos({ x: contextMenu.x, y: contextMenu.y });
              setReactionPickerMessageId(msg.id);
            }
          }}
          quickEmojis={quickEmojis}
          onQuickReact={(emoji: string) => {
            if (contextMenu) {
              const msg = contextMenu.message;
              const hasReacted = msg.reactions?.some((r: { emoji: string; users: { id: string }[] }) =>
                r.emoji === emoji && r.users.some((u: { id: string }) => u.id === profile?.id)
              );
              if (hasReacted) {
                storeRemoveReaction(msg.id, emoji);
              } else {
                storeAddReaction(msg.id, emoji);
              }
            }
          }}
          reactedEmojis={
            contextMenu.message.reactions
              ?.filter((r: { emoji: string; users: { id: string }[] }) =>
                r.users.some((u: { id: string }) => u.id === profile?.id)
              )
              .map((r: { emoji: string }) => r.emoji) || []
          }
        />
      )}

      {/* Group Settings Modal */}
      {showSettingsModal && type === 'group' && groupChatId && (
        <GroupSettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          groupId={groupChatId}
          groupName={recipientName}
          groupIconUrl={groupIconUrl}
          onUpdate={() => {
            // Refresh the group icon after update
            if (groupChatId) {
              supabase
                .from('group_chats')
                .select('icon_url')
                .eq('id', groupChatId)
                .single()
                .then(({ data }) => {
                  if (data) {
                    setGroupIconUrl(data.icon_url || null);
                  }
                });
            }
          }}
        />
      )}

      {/* File Upload Modal */}
      {showUploadModal && profile?.id && conversationId && (
        <FileUploadModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onUploadComplete={handleUploadComplete}
          userId={profile.id}
          conversationType={type}
          conversationId={conversationId}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={cancelDelete}>
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Delete Message</h3>
            </div>

            {/* body */}
            <div className="px-6 py-4">
              <p className="text-gray-700">
                Are you sure you want to delete this message? This action cannot be undone.
              </p>
              {messageToDelete?.content && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-sm text-gray-600 line-clamp-3">{messageToDelete.content}</p>
                </div>
              )}
            </div>

            {/* footer with buttons */}
            <div className="px-6 py-4 bg-gray-50 flex items-center justify-end gap-3">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Profile Modal */}
      {selectedMemberProfile && (
        <UserProfileModal
          userId={selectedMemberProfile}
          isOpen={!!selectedMemberProfile}
          onClose={() => setSelectedMemberProfile(null)}
          currentUserId={profile?.id}
        />
      )}

      {/* Media Preview Modal */}
      {previewMedia && (
        <MediaPreviewModal
          isOpen={!!previewMedia}
          onClose={() => setPreviewMedia(null)}
          mediaUrl={previewMedia}
          showFavoriteButton={isKlipyMedia(previewMedia)}
          isFavorited={isMediaFavorited(previewMedia)}
          onToggleFavorite={() => toggleMediaFavorite(previewMedia)}
        />
      )}

      {/* Reaction Emoji Picker (fixed positioned) */}
      {reactionPickerMessageId && reactionPickerPos && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => { setReactionPickerMessageId(null); setReactionPickerPos(null); }}
          />
          <div
            className="fixed z-50"
            style={{
              left: Math.min(reactionPickerPos.x, window.innerWidth - 336),
              top: reactionPickerPos.y > window.innerHeight / 2
                ? Math.max(8, reactionPickerPos.y - 420)
                : reactionPickerPos.y
            }}
          >
            <div className="bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
              <FrimousseEmojiPicker.Root
                onEmojiSelect={(emoji: Emoji) => {
                  storeAddReaction(reactionPickerMessageId!, emoji.emoji);
                  setReactionPickerMessageId(null);
                  setReactionPickerPos(null);
                }}
                className="flex flex-col w-[320px] h-[400px]"
              >
                <div className="p-2 border-b border-gray-100">
                  <FrimousseEmojiPicker.Search
                    placeholder="Search emoji..."
                    className="w-full px-3 py-2 text-sm bg-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-blue-600/30"
                  />
                </div>
                <FrimousseEmojiPicker.Viewport className="flex-1 overflow-y-auto">
                  {/* Frequently Used section */}
                  {frequentEmojis.length > 0 && (
                    <div className="px-1 py-1">
                      <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-white sticky top-0">
                        Frequently Used
                      </div>
                      <div className="flex flex-wrap">
                        {frequentEmojis.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => {
                              storeAddReaction(reactionPickerMessageId!, emoji);
                              setReactionPickerMessageId(null);
                              setReactionPickerPos(null);
                            }}
                            className="flex items-center justify-center w-8 h-8 text-2xl rounded-md cursor-pointer transition-colors hover:bg-gray-100"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <FrimousseEmojiPicker.Loading className="flex items-center justify-center h-full text-gray-400">
                    Loading...
                  </FrimousseEmojiPicker.Loading>
                  <FrimousseEmojiPicker.Empty className="flex items-center justify-center h-full text-gray-400">
                    No emoji found
                  </FrimousseEmojiPicker.Empty>
                  <FrimousseEmojiPicker.List
                    className="px-1 py-1 select-none"
                    components={{
                      CategoryHeader: ({ category, ...props }) => (
                        <div {...props} className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-white sticky top-0">
                          {category.label}
                        </div>
                      ),
                      Row: ({ children, ...props }) => (
                        <div {...props} className="flex">{children}</div>
                      ),
                      Emoji: ({ emoji, ...props }) => (
                        <button
                          {...props}
                          className={`flex items-center justify-center w-8 h-8 text-2xl rounded-md cursor-pointer transition-colors ${
                            emoji.isActive ? 'bg-gray-200' : 'hover:bg-gray-100'
                          }`}
                        >
                          {emoji.emoji}
                        </button>
                      ),
                    }}
                  />
                </FrimousseEmojiPicker.Viewport>
              </FrimousseEmojiPicker.Root>
            </div>
          </div>
        </>
      )}
      </div>

      {/* Members Sidebar - overlay on mobile, inline on desktop */}
      {type === 'group' && groupChatId && profile ? (
        <>
          {/* Mobile backdrop */}
          {isMobile && showMembersSidebar && (
            <div
              className="fixed inset-0 bg-black/40 z-30"
              onClick={() => window.dispatchEvent(new CustomEvent('toggleMembersSidebar'))}
            />
          )}
          <div className={
            isMobile
              ? `fixed inset-y-0 right-0 z-40 w-64 transition-transform duration-200 ${showMembersSidebar ? 'translate-x-0' : 'translate-x-full'}`
              : (showMembersSidebar ? 'block' : 'hidden')
          }>
            <GroupMembersSidebar
              groupChatId={groupChatId}
              currentUserId={profile.id}
              onViewProfile={handleViewProfile}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
