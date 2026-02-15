/**
 * the main websocket manager that handles all realtime stuff
 * this lives outside react so it doesn't get killed when components unmount
 *
 * had to rewrite this like 3 times to get it right lol
 * - gets all messages even if you're not in that specific room (for notifications)
 * - handles reconnection and fills in missed messages
 * - tracks who's online/offline properly
 * - keeps messages in order even when things get chaotic
 */

import { io, Socket } from 'socket.io-client'

type MessageCallback = (message: any) => void
type TypingCallback = (data: { userId: string; username: string; typing: boolean; conversationId: string; conversationType: 'dm' | 'group' }) => void
type ConnectionCallback = (status: 'connected' | 'connecting' | 'disconnected') => void
type ReconnectCallback = () => void
type SidebarMessageCallback = (data: { conversation_id: string; conversation_type: 'dm' | 'group'; last_message: string; last_message_at: string; sender_id: string }) => void
type SidebarReadCallback = (data: { conversation_id: string; conversation_type: 'dm' | 'group' }) => void
type GroupLeftCallback = (data: { group_id: string; user_id: string }) => void
type GroupMemberLeftCallback = (data: { group_id: string; user_id: string; username: string }) => void
type GroupInvitedCallback = (data: { group_id: string; group_name: string; group_icon_url?: string; invited_by: string; invited_by_id: string }) => void
type GroupMembersAddedCallback = (data: { group_id: string; new_members: { id: string; username: string }[]; invited_by: string; invited_by_id: string }) => void
type GroupUpdatedCallback = (data: { group_id: string; name?: string; icon_url?: string; updated_by: string; updated_by_id: string }) => void
type FriendRequestCallback = (data: { type: 'received' | 'accepted' | 'declined' | 'cancelled'; from_user_id: string; to_user_id: string; username?: string }) => void
type MessageEditedCallback = (data: { message_id: string; conversation_id: string; conversation_type: 'dm' | 'group'; content: string; edited_at: string }) => void
type MessageDeletedCallback = (data: { message_id: string; conversation_id: string; conversation_type: 'dm' | 'group' }) => void
type UserBlockCallback = (data: { type: 'blocked' | 'unblocked'; blocker_user_id: string; blocked_user_id: string }) => void
type ReactionCallback = (data: { message_id: string; conversation_id: string; conversation_type: 'dm' | 'group'; emoji: string; user_id: string; username: string; action: 'add' | 'remove' }) => void

class WebSocketManager {
  private socket: Socket | null = null
  private userId: string | null = null
  private token: string | null = null
  private currentRoom: string | null = null
  private messageCallbacks: Set<MessageCallback> = new Set()
  private typingCallbacks: Set<TypingCallback> = new Set()
  private connectionCallbacks: Set<ConnectionCallback> = new Set()
  private reconnectCallbacks: Set<ReconnectCallback> = new Set()
  private sidebarMessageCallbacks: Set<SidebarMessageCallback> = new Set()
  private sidebarReadCallbacks: Set<SidebarReadCallback> = new Set()
  private groupLeftCallbacks: Set<GroupLeftCallback> = new Set()
  private groupMemberLeftCallbacks: Set<GroupMemberLeftCallback> = new Set()
  private groupInvitedCallbacks: Set<GroupInvitedCallback> = new Set()
  private groupMembersAddedCallbacks: Set<GroupMembersAddedCallback> = new Set()
  private groupUpdatedCallbacks: Set<GroupUpdatedCallback> = new Set()
  private friendRequestCallbacks: Set<FriendRequestCallback> = new Set()
  private messageEditedCallbacks: Set<MessageEditedCallback> = new Set()
  private messageDeletedCallbacks: Set<MessageDeletedCallback> = new Set()
  private userBlockCallbacks: Set<UserBlockCallback> = new Set()
  private reactionCallbacks: Set<ReactionCallback> = new Set()
  private lastMessageId: string | null = null
  private isReconnecting: boolean = false

  async connect(userId: string, token: string): Promise<void> {
    // don't reconnect if we're already good
    if (this.socket && this.userId === userId && this.socket.connected) {
      console.log('[WSManager] Already connected')
      return
    }

    // save these so we can reconnect later if needed
    this.userId = userId
    this.token = token

    // cleanup old connection before starting new one
    if (this.socket) {
      console.log('[WSManager] Disconnecting old socket')
      this.socket.disconnect()
      this.socket = null
      this.currentRoom = null
    }

    console.log('[WSManager] Creating NEW socket')
    this.notifyConnectionStatus('connecting')

    const socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity // never give up on reconnecting
    })

    this.socket = socket

    // what happens when we connect/disconnect
    socket.on('connect', () => {
      console.log('[WSManager] Connected:', socket.id)
      this.notifyConnectionStatus('connected')

      // if we just reconnected after being offline, fill in any messages we missed
      if (this.isReconnecting) {
        console.log('[WSManager] Reconnected - triggering gap fill')
        this.notifyReconnect()
        this.isReconnecting = false
      }
    })

    socket.on('disconnect', (reason) => {
      console.log('[WSManager] Disconnected:', reason)
      this.notifyConnectionStatus('disconnected')
      this.isReconnecting = true
    })

    socket.on('connect_error', (error) => {
      console.error('[WSManager] Connection error:', error.message)
      this.notifyConnectionStatus('disconnected')
      this.isReconnecting = true
    })

    // super important: we receive ALL messages, not just from the current chat
    // this way notifications work even when you're in a different room
    socket.on('message:received', (msg) => {
      console.log('[WSManager] Message received:', msg.content, 'for room:', `${msg.conversation_type}:${msg.conversation_id}`, 'reply_to_id:', msg.reply_to_id)

      // remember the last message id so we can catch up after reconnecting
      if (msg.message_id) {
        this.lastMessageId = msg.message_id
      }

      // send it to everyone who's listening - they'll figure out if they care
      this.messageCallbacks.forEach(cb => cb(msg))
    })

    socket.on('message:persisted', (data) => {
      console.log('[WSManager] Message persisted:', data.client_id)
      this.messageCallbacks.forEach(cb => cb({ type: 'persisted', ...data }))
    })

    socket.on('message:failed', (data) => {
      console.error('[WSManager] Message failed:', data.error)
      this.messageCallbacks.forEach(cb => cb({ type: 'failed', ...data }))
    })

    // when someone starts/stops typing - includes which conversation it's in
    socket.on('typing:update', ({ conversation_id, conversation_type, user_id, username, typing }) => {
      this.typingCallbacks.forEach(cb => cb({
        userId: user_id,
        username,
        typing,
        conversationId: conversation_id,
        conversationType: conversation_type
      }))
    })

    // also need global typing events so the sidebar can show "X is typing..." even when you're elsewhere
    socket.on('typing:global', ({ conversation_id, conversation_type, user_id, username, typing }) => {
      this.typingCallbacks.forEach(cb => cb({
        userId: user_id,
        username,
        typing,
        conversationId: conversation_id,
        conversationType: conversation_type
      }))
    })

    // events specifically for updating the sidebar list
    socket.on('sidebar:message', (data) => {
      console.log('[WSManager] Sidebar message update:', data)
      this.sidebarMessageCallbacks.forEach(cb => cb(data))
    })

    socket.on('sidebar:read', (data) => {
      console.log('[WSManager] Sidebar read update:', data)
      this.sidebarReadCallbacks.forEach(cb => cb(data))
    })

    // all the group-related events
    socket.on('group:left', (data) => {
      console.log('[WSManager] Group left event:', data)
      this.groupLeftCallbacks.forEach(cb => cb(data))
    })

    socket.on('group:member_left', (data) => {
      console.log('[WSManager] Group member left event:', data)
      this.groupMemberLeftCallbacks.forEach(cb => cb(data))
    })

    socket.on('group:invited', (data) => {
      console.log('[WSManager] Group invited event:', data)
      this.groupInvitedCallbacks.forEach(cb => cb(data))
    })

    socket.on('group:members_added', (data) => {
      console.log('[WSManager] Group members added event:', data)
      this.groupMembersAddedCallbacks.forEach(cb => cb(data))
    })

    socket.on('group:updated', (data) => {
      console.log('[WSManager] Group updated event:', data)
      this.groupUpdatedCallbacks.forEach(cb => cb(data))
    })

    // when someone sends/accepts/declines a friend request
    socket.on('friend:request', (data) => {
      console.log('[WSManager] Friend request event:', data)
      this.friendRequestCallbacks.forEach(cb => cb(data))
    })

    // someone edited their message
    socket.on('message:edited', (data) => {
      console.log('[WSManager] Message edited event:', data)
      this.messageEditedCallbacks.forEach(cb => cb(data))
    })

    // someone deleted their message
    socket.on('message:deleted', (data) => {
      console.log('[WSManager] Message deleted event:', data)
      this.messageDeletedCallbacks.forEach(cb => cb(data))
    })

    // when you get blocked or unblocked by someone
    socket.on('user:blocked', (data: { type: 'blocked' | 'unblocked'; blocker_user_id: string; blocked_user_id: string }) => {
      console.log('[WSManager] User block event:', data)
      this.userBlockCallbacks.forEach(cb => cb(data))
    })

    // reaction added or removed on a message
    socket.on('reaction:updated', (data) => {
      console.log('[WSManager] Reaction event:', data)
      this.reactionCallbacks.forEach(cb => cb(data))
    })

    return new Promise((resolve) => {
      socket.once('connect', () => resolve())
    })
  }

  async reconnect(): Promise<void> {
    if (this.userId && this.token) {
      console.log('[WSManager] Manual reconnect triggered')
      await this.connect(this.userId, this.token)
    }
  }

  switchRoom(conversationId: string, conversationType: 'dm' | 'group'): void {
    if (!this.socket || !this.socket.connected) {
      console.warn('[WSManager] Cannot switch room, socket not connected')
      return
    }

    const newRoom = `${conversationType}:${conversationId}`

    // leave the old room first if we were in one
    if (this.currentRoom && this.currentRoom !== newRoom) {
      const [oldType, oldId] = this.currentRoom.split(':')
      console.log('[WSManager] Leaving room:', this.currentRoom)
      this.socket.emit('conversation:leave', {
        conversation_id: oldId,
        conversation_type: oldType as 'dm' | 'group'
      })
    }

    // now join the new one
    console.log('[WSManager] Joining room:', newRoom)
    this.socket.emit('conversation:join', {
      conversation_id: conversationId,
      conversation_type: conversationType
    })

    this.currentRoom = newRoom
  }

  leaveCurrentRoom(): void {
    if (!this.socket || !this.socket.connected || !this.currentRoom) {
      return
    }

    const [oldType, oldId] = this.currentRoom.split(':')
    console.log('[WSManager] Leaving current room:', this.currentRoom)
    this.socket.emit('conversation:leave', {
      conversation_id: oldId,
      conversation_type: oldType as 'dm' | 'group'
    })

    this.currentRoom = null
  }

  sendMessage(conversationId: string, conversationType: 'dm' | 'group', content: string, clientId: string, replyToId?: string, attachmentUrl?: string, mentions?: string[]): void {
    if (!this.socket || !this.socket.connected) {
      console.error('[WSManager] Cannot send message, socket not connected')
      return
    }

    console.log('[WSManager] Sending message:', clientId, 'reply_to_id:', replyToId, attachmentUrl ? '(with attachment)' : '', mentions?.length ? `(${mentions.length} mentions)` : '')
    this.socket.emit('message:send', {
      client_id: clientId,
      conversation_id: conversationId,
      conversation_type: conversationType,
      content: content.trim(),
      reply_to_id: replyToId || null,
      attachment_url: attachmentUrl || null,
      mentions: mentions || null,
      created_at: new Date().toISOString()
    })
  }

  sendTyping(conversationId: string, conversationType: 'dm' | 'group', isTyping: boolean): void {
    if (!this.socket || !this.socket.connected) return

    this.socket.emit(isTyping ? 'typing:start' : 'typing:stop', {
      conversation_id: conversationId,
      conversation_type: conversationType
    })
  }

  markAsRead(conversationId: string, conversationType: 'dm' | 'group'): void {
    if (!this.socket || !this.socket.connected) return

    console.log('[WSManager] Marking as read:', conversationType, conversationId)
    this.socket.emit('conversation:mark_read', {
      conversation_id: conversationId,
      conversation_type: conversationType
    })
  }

  onMessage(callback: MessageCallback): () => void {
    this.messageCallbacks.add(callback)
    return () => this.messageCallbacks.delete(callback)
  }

  onTyping(callback: TypingCallback): () => void {
    this.typingCallbacks.add(callback)
    return () => this.typingCallbacks.delete(callback)
  }

  onConnectionStatus(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.add(callback)
    return () => this.connectionCallbacks.delete(callback)
  }

  onReconnect(callback: ReconnectCallback): () => void {
    this.reconnectCallbacks.add(callback)
    return () => this.reconnectCallbacks.delete(callback)
  }

  onSidebarMessage(callback: SidebarMessageCallback): () => void {
    this.sidebarMessageCallbacks.add(callback)
    return () => this.sidebarMessageCallbacks.delete(callback)
  }

  onSidebarRead(callback: SidebarReadCallback): () => void {
    this.sidebarReadCallbacks.add(callback)
    return () => this.sidebarReadCallbacks.delete(callback)
  }

  onGroupLeft(callback: GroupLeftCallback): () => void {
    this.groupLeftCallbacks.add(callback)
    return () => this.groupLeftCallbacks.delete(callback)
  }

  onGroupMemberLeft(callback: GroupMemberLeftCallback): () => void {
    this.groupMemberLeftCallbacks.add(callback)
    return () => this.groupMemberLeftCallbacks.delete(callback)
  }

  onGroupInvited(callback: GroupInvitedCallback): () => void {
    this.groupInvitedCallbacks.add(callback)
    return () => this.groupInvitedCallbacks.delete(callback)
  }

  onGroupMembersAdded(callback: GroupMembersAddedCallback): () => void {
    this.groupMembersAddedCallbacks.add(callback)
    return () => this.groupMembersAddedCallbacks.delete(callback)
  }

  onGroupUpdated(callback: GroupUpdatedCallback): () => void {
    this.groupUpdatedCallbacks.add(callback)
    return () => this.groupUpdatedCallbacks.delete(callback)
  }

  onFriendRequest(callback: FriendRequestCallback): () => void {
    this.friendRequestCallbacks.add(callback)
    return () => this.friendRequestCallbacks.delete(callback)
  }

  onMessageEdited(callback: MessageEditedCallback): () => void {
    this.messageEditedCallbacks.add(callback)
    return () => this.messageEditedCallbacks.delete(callback)
  }

  onMessageDeleted(callback: MessageDeletedCallback): () => void {
    this.messageDeletedCallbacks.add(callback)
    return () => this.messageDeletedCallbacks.delete(callback)
  }

  onUserBlock(callback: UserBlockCallback): () => void {
    this.userBlockCallbacks.add(callback)
    return () => this.userBlockCallbacks.delete(callback)
  }

  onReaction(callback: ReactionCallback): () => void {
    this.reactionCallbacks.add(callback)
    return () => this.reactionCallbacks.delete(callback)
  }

  // Emit group leave event (called after leaving group via API)
  emitGroupLeft(groupId: string): void {
    if (!this.socket || !this.socket.connected) return

    console.log('[WSManager] Emitting group:leave for', groupId)
    this.socket.emit('group:leave', { group_id: groupId })
  }

  // Emit friend request event (called after sending/accepting/declining)
  emitFriendRequest(type: 'sent' | 'accepted' | 'declined' | 'cancelled', toUserId: string): void {
    if (!this.socket || !this.socket.connected) return

    console.log('[WSManager] Emitting friend:request_action', type, 'to', toUserId)
    this.socket.emit('friend:request_action', { type, to_user_id: toUserId })
  }

  // Emit group invite event (called after inviting users to group)
  emitGroupInvite(groupId: string, invitedUserIds: string[], groupName: string): void {
    if (!this.socket || !this.socket.connected) return

    console.log('[WSManager] Emitting group:invite for', groupId, 'users:', invitedUserIds)
    this.socket.emit('group:invite', { group_id: groupId, invited_user_ids: invitedUserIds, group_name: groupName })
  }

  // Emit group update event (called after changing group settings)
  emitGroupUpdate(groupId: string, name?: string, iconUrl?: string): void {
    if (!this.socket || !this.socket.connected) return

    console.log('[WSManager] Emitting group:update for', groupId)
    this.socket.emit('group:update', { group_id: groupId, name, icon_url: iconUrl })
  }

  // Emit message edit event
  emitMessageEdit(messageId: string, conversationId: string, conversationType: 'dm' | 'group', content: string): void {
    if (!this.socket || !this.socket.connected) return

    console.log('[WSManager] Emitting message:edit for', messageId)
    this.socket.emit('message:edit', { message_id: messageId, conversation_id: conversationId, conversation_type: conversationType, content })
  }

  // Emit message delete event
  emitMessageDelete(messageId: string, conversationId: string, conversationType: 'dm' | 'group'): void {
    if (!this.socket || !this.socket.connected) return

    console.log('[WSManager] Emitting message:delete for', messageId)
    this.socket.emit('message:delete', { message_id: messageId, conversation_id: conversationId, conversation_type: conversationType })
  }

  // Emit user block event (notifies the blocked user)
  emitUserBlock(blockedUserId: string): void {
    if (!this.socket || !this.socket.connected) return

    console.log('[WSManager] Emitting user:block for', blockedUserId)
    this.socket.emit('user:block', { blocked_user_id: blockedUserId })
  }

  // Emit reaction add
  emitReactionAdd(messageId: string, conversationId: string, conversationType: 'dm' | 'group', emoji: string): void {
    if (!this.socket || !this.socket.connected) return

    console.log('[WSManager] Emitting reaction:add for', messageId, emoji)
    this.socket.emit('reaction:add', { message_id: messageId, conversation_id: conversationId, conversation_type: conversationType, emoji })
  }

  // Emit reaction remove
  emitReactionRemove(messageId: string, conversationId: string, conversationType: 'dm' | 'group', emoji: string): void {
    if (!this.socket || !this.socket.connected) return

    console.log('[WSManager] Emitting reaction:remove for', messageId, emoji)
    this.socket.emit('reaction:remove', { message_id: messageId, conversation_id: conversationId, conversation_type: conversationType, emoji })
  }

  // Emit user unblock event
  emitUserUnblock(unblockedUserId: string): void {
    if (!this.socket || !this.socket.connected) return

    console.log('[WSManager] Emitting user:unblock for', unblockedUserId)
    this.socket.emit('user:unblock', { unblocked_user_id: unblockedUserId })
  }

  private notifyConnectionStatus(status: 'connected' | 'connecting' | 'disconnected'): void {
    this.connectionCallbacks.forEach(cb => cb(status))
  }

  private notifyReconnect(): void {
    this.reconnectCallbacks.forEach(cb => cb())
  }

  getCurrentRoom(): string | null {
    return this.currentRoom
  }

  getLastMessageId(): string | null {
    return this.lastMessageId
  }

  isConnected(): boolean {
    return this.socket?.connected || false
  }

  disconnect(): void {
    if (this.socket) {
      console.log('[WSManager] Manual disconnect')
      this.socket.disconnect()
      this.socket = null
      this.currentRoom = null
    }
  }
}

// Global singleton instance
export const wsManager = new WebSocketManager()
