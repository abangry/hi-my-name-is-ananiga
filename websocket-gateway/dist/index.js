"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const PORT = process.env.PORT || 3001;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Create Supabase client (service role for DB writes)
const supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_KEY);
// Create HTTP server
const httpServer = (0, http_1.createServer)();
// Create Socket.io server with CORS
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: process.env.NODE_ENV === 'production'
            ? ['https://yourdomain.com']
            : ['http://localhost:3000'],
        credentials: true
    },
    transports: ['websocket', 'polling']
});
// JWT Authentication Middleware
io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        console.log('[Auth] No token provided');
        return next(new Error('Authentication token required'));
    }
    try {
        // Verify JWT with Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            console.log('[Auth] Invalid token:', error?.message);
            return next(new Error('Invalid authentication token'));
        }
        // Fetch user profile
        const { data: profile } = await supabase
            .from('profiles')
            .select('username, tag, display_name, avatar_url')
            .eq('id', user.id)
            .single();
        // Attach user data to socket
        socket.userId = user.id;
        socket.userEmail = user.email;
        socket.username = profile?.username || 'Unknown';
        socket.tag = profile?.tag || 'unknown';
        console.log(`[Auth] User authenticated: ${socket.username}#${socket.tag} (${socket.userId})`);
        next();
    }
    catch (error) {
        console.error('[Auth] Error:', error);
        next(new Error('Authentication failed'));
    }
});
// Track typing users: Map<'type:conversation_id', Map<user_id, timeout>>
const typingUsers = new Map();
// Track online users per conversation
const conversationUsers = new Map();
io.on('connection', (socket) => {
    console.log(`[Connection] ${socket.username}#${socket.tag} connected (${socket.id})`);
    // Join conversation room
    socket.on('conversation:join', ({ conversation_id, conversation_type }) => {
        const room = `${conversation_type}:${conversation_id}`;
        socket.join(room);
        // Track user in conversation
        if (!conversationUsers.has(room)) {
            conversationUsers.set(room, new Set());
        }
        conversationUsers.get(room).add(socket.userId);
        console.log(`[Room] ${socket.username} joined ${room}`);
        console.log(`[Room] ${room} now has ${conversationUsers.get(room).size} users`);
    });
    // Leave conversation room
    socket.on('conversation:leave', ({ conversation_id, conversation_type }) => {
        const room = `${conversation_type}:${conversation_id}`;
        socket.leave(room);
        // Remove from tracking
        conversationUsers.get(room)?.delete(socket.userId);
        // Stop typing indicator
        stopTyping(socket, room);
        console.log(`[Room] ${socket.username} left ${room}`);
    });
    // Handle message send
    socket.on('message:send', async (data) => {
        const { client_id, conversation_id, conversation_type, content, reply_to_id, attachment_url, mentions, created_at } = data;
        console.log(`[Message] ${socket.username} sending message to ${conversation_type}:${conversation_id}${attachment_url ? ' (with attachment)' : ''}${mentions?.length ? ` (${mentions.length} mentions)` : ''}`);
        const room = `${conversation_type}:${conversation_id}`;
        // Stop typing when sending
        stopTyping(socket, room);
        try {
            // BLOCK CHECK: For DMs, check if either user has blocked the other BEFORE broadcasting
            if (conversation_type === 'dm') {
                const { data: dmChannel } = await supabase
                    .from('direct_message_channels')
                    .select('user1_id, user2_id')
                    .eq('id', conversation_id)
                    .single();
                if (dmChannel) {
                    const otherUserId = dmChannel.user1_id === socket.userId ? dmChannel.user2_id : dmChannel.user1_id;
                    // Check if sender blocked recipient
                    const { data: senderBlockedRecipient } = await supabase
                        .from('blocked_users')
                        .select('id')
                        .eq('user_id', socket.userId)
                        .eq('blocked_user_id', otherUserId)
                        .limit(1);
                    // Check if recipient blocked sender
                    const { data: recipientBlockedSender } = await supabase
                        .from('blocked_users')
                        .select('id')
                        .eq('user_id', otherUserId)
                        .eq('blocked_user_id', socket.userId)
                        .limit(1);
                    const isBlocked = (senderBlockedRecipient && senderBlockedRecipient.length > 0) ||
                        (recipientBlockedSender && recipientBlockedSender.length > 0);
                    if (isBlocked) {
                        console.log(`[Message] Blocked: Block exists between ${socket.userId} and ${otherUserId}`);
                        socket.emit('message:failed', {
                            client_id,
                            error: 'Cannot send message - user is blocked'
                        });
                        return;
                    }
                }
            }
            // Fetch sender profile for broadcast
            const { data: profile } = await supabase
                .from('profiles')
                .select('id, username, tag, display_name, avatar_url')
                .eq('id', socket.userId)
                .single();
            // Broadcast to room immediately (optimistic)
            const broadcastMessage = {
                client_id,
                message_id: null, // Not persisted yet
                conversation_id,
                conversation_type,
                user_id: socket.userId,
                user: profile,
                content,
                reply_to_id: reply_to_id || null,
                attachment_url: attachment_url || null,
                mentions: mentions || null,
                created_at: created_at || new Date().toISOString(),
                edited_at: null
            };
            // Broadcast to everyone in room EXCEPT sender
            socket.to(room).emit('message:received', broadcastMessage);
            const roomSize = conversationUsers.get(room)?.size || 0;
            console.log(`[Message] Broadcasted to ${room} (${roomSize} users in room)`);
            // Persist to database asynchronously
            persistMessage(socket, client_id, conversation_id, conversation_type, content, reply_to_id, attachment_url, mentions);
        }
        catch (error) {
            console.error('[Message] Error:', error);
            socket.emit('message:failed', {
                client_id,
                error: 'Failed to send message'
            });
        }
    });
    // Handle typing start
    socket.on('typing:start', ({ conversation_id, conversation_type }) => {
        const room = `${conversation_type}:${conversation_id}`;
        const key = room;
        if (!typingUsers.has(key)) {
            typingUsers.set(key, new Map());
        }
        const roomTyping = typingUsers.get(key);
        // Clear existing timeout if any
        if (roomTyping.has(socket.userId)) {
            clearTimeout(roomTyping.get(socket.userId));
        }
        // Set new timeout (auto-stop after 5s)
        const timeout = setTimeout(() => {
            stopTyping(socket, room);
        }, 5000);
        roomTyping.set(socket.userId, timeout);
        const typingUpdate = {
            conversation_id,
            conversation_type,
            user_id: socket.userId,
            username: socket.username,
            typing: true
        };
        // Broadcast to others in room (for active chat view)
        socket.to(room).emit('typing:update', typingUpdate);
        // Also broadcast globally for sidebar indicators (excluding self)
        socket.broadcast.emit('typing:global', typingUpdate);
        console.log(`[Typing] ${socket.username} started typing in ${room}`);
    });
    // Handle typing stop
    socket.on('typing:stop', ({ conversation_id, conversation_type }) => {
        const room = `${conversation_type}:${conversation_id}`;
        stopTyping(socket, room);
    });
    // Handle mark as read
    socket.on('conversation:mark_read', async ({ conversation_id, conversation_type }) => {
        console.log(`[Mark Read] ${socket.username} marking ${conversation_type}:${conversation_id} as read`);
        try {
            // Call the NEW RPC functions with user_id parameter
            if (conversation_type === 'dm') {
                await supabase.rpc('mark_dm_messages_as_read', {
                    p_dm_channel_id: conversation_id,
                    p_user_id: socket.userId
                });
            }
            else if (conversation_type === 'group') {
                await supabase.rpc('mark_group_messages_as_read', {
                    p_group_chat_id: conversation_id,
                    p_user_id: socket.userId
                });
            }
            // Broadcast to all user's sockets (including other tabs/devices)
            io.to(`user:${socket.userId}`).emit('sidebar:read', {
                conversation_id,
                conversation_type
            });
            console.log(`[Mark Read] Marked as read in database for ${conversation_type}:${conversation_id}`);
        }
        catch (error) {
            console.error('[Mark Read] Error:', error);
        }
    });
    // Join user's personal room for cross-tab notifications
    socket.join(`user:${socket.userId}`);
    // Handle group leave - broadcast to self (all tabs) to remove from sidebar
    socket.on('group:leave', async ({ group_id }) => {
        console.log(`[Group] ${socket.username} left group ${group_id}`);
        // Get group members BEFORE broadcasting (the user is already removed from DB)
        const { data: members } = await supabase
            .from('group_chat_members')
            .select('user_id')
            .eq('group_chat_id', group_id);
        // Broadcast to all of user's connected clients (tabs/devices)
        io.to(`user:${socket.userId}`).emit('group:left', {
            group_id,
            user_id: socket.userId
        });
        // Broadcast to remaining group members (for member list + system message updates)
        members?.forEach(member => {
            io.to(`user:${member.user_id}`).emit('group:member_left', {
                group_id,
                user_id: socket.userId,
                username: socket.username
            });
        });
        // NOTE: The database trigger on_group_member_leave() already creates the system message
        // We just need to fetch and broadcast it to people currently in the room
        // Query the most recent system_leave message for this user and group
        const { data: systemMessage } = await supabase
            .from('group_chat_messages')
            .select('id, content, created_at, user_id, metadata')
            .eq('group_chat_id', group_id)
            .eq('user_id', socket.userId)
            .eq('message_type', 'system_leave')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        // Broadcast the database-created system message to room
        if (systemMessage) {
            io.to(`group:${group_id}`).emit('message:received', {
                client_id: `system_${Date.now()}`,
                message_id: systemMessage.id,
                conversation_id: group_id,
                conversation_type: 'group',
                user_id: socket.userId,
                user: { id: socket.userId, username: socket.username, tag: socket.tag, display_name: null, avatar_url: null },
                content: systemMessage.content,
                message_type: 'system_leave',
                metadata: systemMessage.metadata,
                created_at: systemMessage.created_at,
                edited_at: null
            });
        }
    });
    // Handle group member invite - broadcast to invited users and existing members
    socket.on('group:invite', async ({ group_id, invited_user_ids, group_name }) => {
        console.log(`[Group] ${socket.username} invited ${invited_user_ids.length} users to group ${group_id}`);
        // Get group info for the invited users
        const { data: groupData } = await supabase
            .from('group_chats')
            .select('id, name, icon_url, creator_id')
            .eq('id', group_id)
            .single();
        // Get existing members to notify them
        const { data: existingMembers } = await supabase
            .from('group_chat_members')
            .select('user_id')
            .eq('group_chat_id', group_id);
        // Get invited users' info for system messages
        const { data: invitedUsers } = await supabase
            .from('profiles')
            .select('id, username')
            .in('id', invited_user_ids);
        // Broadcast to invited users - they should see the group appear
        invited_user_ids.forEach((userId) => {
            io.to(`user:${userId}`).emit('group:invited', {
                group_id,
                group_name: groupData?.name || group_name,
                group_icon_url: groupData?.icon_url,
                invited_by: socket.username,
                invited_by_id: socket.userId
            });
        });
        // Broadcast to existing members that new people joined
        existingMembers?.forEach(member => {
            io.to(`user:${member.user_id}`).emit('group:members_added', {
                group_id,
                new_members: invitedUsers || [],
                invited_by: socket.username,
                invited_by_id: socket.userId
            });
        });
        // Persist and broadcast system messages to the group room for each invited user
        for (const invitedUser of invitedUsers || []) {
            const systemMessageContent = `${socket.username} invited ${invitedUser.username} to the group`;
            const systemMessageMetadata = { invited_user_id: invitedUser.id, invited_username: invitedUser.username };
            // Insert system message into database and get the actual timestamp
            const { data: messageData } = await supabase.rpc('insert_group_system_message', {
                p_group_chat_id: group_id,
                p_user_id: socket.userId,
                p_message_type: 'system_invite',
                p_content: systemMessageContent,
                p_metadata: systemMessageMetadata
            });
            // Broadcast to room with the persisted message ID and actual database timestamp
            io.to(`group:${group_id}`).emit('message:received', {
                client_id: `system_${Date.now()}_${invitedUser.id}`,
                message_id: messageData?.[0]?.message_id,
                conversation_id: group_id,
                conversation_type: 'group',
                user_id: socket.userId,
                user: { id: socket.userId, username: socket.username, tag: socket.tag, display_name: null, avatar_url: null },
                content: systemMessageContent,
                message_type: 'system_invite',
                metadata: systemMessageMetadata,
                created_at: messageData?.[0]?.created_at || new Date().toISOString(),
                edited_at: null
            });
        }
    });
    // Handle group settings update - broadcast to all members
    socket.on('group:update', async ({ group_id, name, icon_url }) => {
        console.log(`[Group] ${socket.username} updated group ${group_id} settings`);
        // Get all group members
        const { data: members } = await supabase
            .from('group_chat_members')
            .select('user_id')
            .eq('group_chat_id', group_id);
        // Broadcast to all members
        members?.forEach(member => {
            io.to(`user:${member.user_id}`).emit('group:updated', {
                group_id,
                name,
                icon_url,
                updated_by: socket.username,
                updated_by_id: socket.userId
            });
        });
        // Persist and broadcast system message if name changed
        if (name) {
            const systemMessageContent = `${socket.username} changed the group name to "${name}"`;
            const systemMessageMetadata = { new_name: name };
            // Insert system message into database and get the actual timestamp
            const { data: messageData } = await supabase.rpc('insert_group_system_message', {
                p_group_chat_id: group_id,
                p_user_id: socket.userId,
                p_message_type: 'system_update',
                p_content: systemMessageContent,
                p_metadata: systemMessageMetadata
            });
            // Broadcast to room with the persisted message ID and actual database timestamp
            io.to(`group:${group_id}`).emit('message:received', {
                client_id: `system_${Date.now()}`,
                message_id: messageData?.[0]?.message_id,
                conversation_id: group_id,
                conversation_type: 'group',
                user_id: socket.userId,
                user: { id: socket.userId, username: socket.username, tag: socket.tag, display_name: null, avatar_url: null },
                content: systemMessageContent,
                message_type: 'system_update',
                metadata: systemMessageMetadata,
                created_at: messageData?.[0]?.created_at || new Date().toISOString(),
                edited_at: null
            });
        }
        // Persist and broadcast system message if icon changed
        if (icon_url) {
            const systemMessageContent = `${socket.username} changed the group icon`;
            const systemMessageMetadata = { new_icon_url: icon_url };
            // Insert system message into database and get the actual timestamp
            const { data: messageData } = await supabase.rpc('insert_group_system_message', {
                p_group_chat_id: group_id,
                p_user_id: socket.userId,
                p_message_type: 'system_update',
                p_content: systemMessageContent,
                p_metadata: systemMessageMetadata
            });
            // Broadcast to room with the persisted message ID and actual database timestamp
            io.to(`group:${group_id}`).emit('message:received', {
                client_id: `system_${Date.now()}_icon`,
                message_id: messageData?.[0]?.message_id,
                conversation_id: group_id,
                conversation_type: 'group',
                user_id: socket.userId,
                user: { id: socket.userId, username: socket.username, tag: socket.tag, display_name: null, avatar_url: null },
                content: systemMessageContent,
                message_type: 'system_update',
                metadata: systemMessageMetadata,
                created_at: messageData?.[0]?.created_at || new Date().toISOString(),
                edited_at: null
            });
        }
    });
    // Handle message edit
    socket.on('message:edit', async ({ message_id, conversation_id, conversation_type, content }) => {
        console.log(`[Message] ${socket.username} editing message ${message_id} in ${conversation_type}:${conversation_id}`);
        try {
            const edited_at = new Date().toISOString();
            // Update in database
            if (conversation_type === 'dm') {
                const { error } = await supabase
                    .from('direct_messages')
                    .update({ content, edited_at })
                    .eq('id', message_id)
                    .eq('user_id', socket.userId); // Ensure user owns the message
                if (error)
                    throw error;
            }
            else if (conversation_type === 'group') {
                const { error } = await supabase
                    .from('group_chat_messages')
                    .update({ content, edited_at })
                    .eq('id', message_id)
                    .eq('user_id', socket.userId); // Ensure user owns the message
                if (error)
                    throw error;
            }
            // Get participants to broadcast to
            let participantIds = [];
            if (conversation_type === 'dm') {
                const { data: participants } = await supabase
                    .from('direct_message_participants')
                    .select('user_id')
                    .eq('dm_channel_id', conversation_id);
                participantIds = participants?.map(p => p.user_id) || [];
            }
            else if (conversation_type === 'group') {
                const { data: members } = await supabase
                    .from('group_chat_members')
                    .select('user_id')
                    .eq('group_chat_id', conversation_id);
                participantIds = members?.map(m => m.user_id) || [];
            }
            // Broadcast to all participants
            participantIds.forEach(userId => {
                io.to(`user:${userId}`).emit('message:edited', {
                    message_id,
                    conversation_id,
                    conversation_type,
                    content,
                    edited_at
                });
            });
            console.log(`[Message] Edit broadcasted to ${participantIds.length} participants`);
        }
        catch (error) {
            console.error('[Message] Edit error:', error);
        }
    });
    // Handle message delete
    socket.on('message:delete', async ({ message_id, conversation_id, conversation_type }) => {
        console.log(`[Message] ${socket.username} deleting message ${message_id} in ${conversation_type}:${conversation_id}`);
        try {
            // Soft delete in database (set deleted_at)
            if (conversation_type === 'dm') {
                const { error } = await supabase
                    .from('direct_messages')
                    .update({ deleted_at: new Date().toISOString() })
                    .eq('id', message_id)
                    .eq('user_id', socket.userId); // Ensure user owns the message
                if (error)
                    throw error;
            }
            else if (conversation_type === 'group') {
                const { error } = await supabase
                    .from('group_chat_messages')
                    .update({ deleted_at: new Date().toISOString() })
                    .eq('id', message_id)
                    .eq('user_id', socket.userId); // Ensure user owns the message
                if (error)
                    throw error;
            }
            // Get participants to broadcast to
            let participantIds = [];
            if (conversation_type === 'dm') {
                const { data: participants } = await supabase
                    .from('direct_message_participants')
                    .select('user_id')
                    .eq('dm_channel_id', conversation_id);
                participantIds = participants?.map(p => p.user_id) || [];
            }
            else if (conversation_type === 'group') {
                const { data: members } = await supabase
                    .from('group_chat_members')
                    .select('user_id')
                    .eq('group_chat_id', conversation_id);
                participantIds = members?.map(m => m.user_id) || [];
            }
            // Broadcast to all participants
            participantIds.forEach(userId => {
                io.to(`user:${userId}`).emit('message:deleted', {
                    message_id,
                    conversation_id,
                    conversation_type
                });
            });
            console.log(`[Message] Delete broadcasted to ${participantIds.length} participants`);
        }
        catch (error) {
            console.error('[Message] Delete error:', error);
        }
    });
    // Handle friend request actions - broadcast to recipient
    socket.on('friend:request_action', async ({ type, to_user_id }) => {
        console.log(`[Friend] ${socket.username} ${type} friend request to/from ${to_user_id}`);
        // Map action types to event types for the recipient
        let eventType;
        switch (type) {
            case 'sent':
                eventType = 'received';
                break;
            case 'accepted':
                eventType = 'accepted';
                break;
            case 'declined':
                eventType = 'declined';
                break;
            case 'cancelled':
                eventType = 'cancelled';
                break;
            default:
                return;
        }
        // Broadcast to recipient
        io.to(`user:${to_user_id}`).emit('friend:request', {
            type: eventType,
            from_user_id: socket.userId,
            to_user_id: to_user_id,
            username: socket.username
        });
        // Also broadcast to sender (for cross-tab sync)
        io.to(`user:${socket.userId}`).emit('friend:request', {
            type: type === 'sent' ? 'sent' : eventType,
            from_user_id: socket.userId,
            to_user_id: to_user_id,
            username: socket.username
        });
    });
    // Handle user block - broadcast to blocked user AND self (for cross-tab sync)
    socket.on('user:block', async ({ blocked_user_id }) => {
        console.log(`[Block] ${socket.username} blocked user ${blocked_user_id}`);
        // Broadcast to the blocked user so they know they've been blocked
        io.to(`user:${blocked_user_id}`).emit('user:blocked', {
            type: 'blocked',
            blocker_user_id: socket.userId,
            blocked_user_id: blocked_user_id
        });
        // Broadcast to self (all tabs) so UI updates
        io.to(`user:${socket.userId}`).emit('user:blocked', {
            type: 'blocked',
            blocker_user_id: socket.userId,
            blocked_user_id: blocked_user_id
        });
    });
    // Handle user unblock - broadcast to unblocked user AND self
    socket.on('user:unblock', async ({ unblocked_user_id }) => {
        console.log(`[Unblock] ${socket.username} unblocked user ${unblocked_user_id}`);
        // Broadcast to the unblocked user
        io.to(`user:${unblocked_user_id}`).emit('user:blocked', {
            type: 'unblocked',
            blocker_user_id: socket.userId,
            blocked_user_id: unblocked_user_id
        });
        // Broadcast to self (all tabs) so UI updates
        io.to(`user:${socket.userId}`).emit('user:blocked', {
            type: 'unblocked',
            blocker_user_id: socket.userId,
            blocked_user_id: unblocked_user_id
        });
    });
    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`[Disconnect] ${socket.username}#${socket.tag} disconnected`);
        // Clean up typing indicators
        typingUsers.forEach((roomTyping, room) => {
            if (roomTyping.has(socket.userId)) {
                stopTyping(socket, room);
            }
        });
        // Clean up conversation tracking
        conversationUsers.forEach((users, room) => {
            users.delete(socket.userId);
        });
    });
});
// Helper: Stop typing indicator
function stopTyping(socket, room) {
    const roomTyping = typingUsers.get(room);
    if (!roomTyping)
        return;
    const timeout = roomTyping.get(socket.userId);
    if (timeout) {
        clearTimeout(timeout);
        roomTyping.delete(socket.userId);
        // Extract conversation info from room
        const [conversation_type, conversation_id] = room.split(':');
        const stopUpdate = {
            conversation_id,
            conversation_type,
            user_id: socket.userId,
            username: socket.username,
            typing: false
        };
        // Broadcast stop to room
        socket.to(room).emit('typing:update', stopUpdate);
        // Also broadcast globally for sidebar
        socket.broadcast.emit('typing:global', stopUpdate);
        console.log(`[Typing] ${socket.username} stopped typing in ${room}`);
    }
}
// Helper: Persist message to database (async, non-blocking)
async function persistMessage(socket, client_id, conversation_id, conversation_type, content, reply_to_id, attachment_url, mentions) {
    try {
        let result;
        if (conversation_type === 'dm') {
            // Get the other user in the DM
            const { data: dmChannel } = await supabase
                .from('direct_message_channels')
                .select('user1_id, user2_id')
                .eq('id', conversation_id)
                .single();
            if (dmChannel) {
                const otherUserId = dmChannel.user1_id === socket.userId ? dmChannel.user2_id : dmChannel.user1_id;
                // Check if sender blocked recipient
                const { data: senderBlockedRecipient } = await supabase
                    .from('blocked_users')
                    .select('id')
                    .eq('user_id', socket.userId)
                    .eq('blocked_user_id', otherUserId)
                    .limit(1);
                // Check if recipient blocked sender
                const { data: recipientBlockedSender } = await supabase
                    .from('blocked_users')
                    .select('id')
                    .eq('user_id', otherUserId)
                    .eq('blocked_user_id', socket.userId)
                    .limit(1);
                const isBlocked = (senderBlockedRecipient && senderBlockedRecipient.length > 0) ||
                    (recipientBlockedSender && recipientBlockedSender.length > 0);
                if (isBlocked) {
                    console.log(`[DB] Message blocked: Block exists between ${socket.userId} and ${otherUserId}`);
                    socket.emit('message:failed', {
                        client_id,
                        error: 'Cannot send message - user is blocked'
                    });
                    return;
                }
            }
            // For DMs, we need the dm_channel_id
            // validate reply_to_id exists in direct_messages table if provided
            let validatedReplyToId = reply_to_id || null;
            if (reply_to_id) {
                const { data: replyMsg } = await supabase
                    .from('direct_messages')
                    .select('id')
                    .eq('id', reply_to_id)
                    .eq('dm_channel_id', conversation_id)
                    .single();
                if (!replyMsg) {
                    console.log(`[DB] Invalid reply_to_id ${reply_to_id} for DM ${conversation_id} - setting to null`);
                    validatedReplyToId = null;
                }
            }
            result = await supabase
                .from('direct_messages')
                .insert({
                id: client_id,
                dm_channel_id: conversation_id,
                user_id: socket.userId,
                content,
                reply_to_id: validatedReplyToId,
                attachment_url: attachment_url || null,
                mentions: mentions || []
            })
                .select('id, created_at')
                .single();
        }
        else if (conversation_type === 'group') {
            // validate reply_to_id exists in group_chat_messages table if provided
            let validatedReplyToId = reply_to_id || null;
            if (reply_to_id) {
                const { data: replyMsg } = await supabase
                    .from('group_chat_messages')
                    .select('id')
                    .eq('id', reply_to_id)
                    .eq('group_chat_id', conversation_id)
                    .single();
                if (!replyMsg) {
                    console.log(`[DB] Invalid reply_to_id ${reply_to_id} for group ${conversation_id} - setting to null`);
                    validatedReplyToId = null;
                }
            }
            result = await supabase
                .from('group_chat_messages')
                .insert({
                id: client_id,
                group_chat_id: conversation_id,
                user_id: socket.userId,
                content,
                reply_to_id: validatedReplyToId,
                attachment_url: attachment_url || null,
                mentions: mentions || []
            })
                .select('id, created_at')
                .single();
        }
        if (result?.error) {
            throw result.error;
        }
        if (!result?.data) {
            throw new Error('No data returned from insert');
        }
        // Send success ACK to sender
        socket.emit('message:persisted', {
            client_id,
            message_id: result.data.id,
            created_at: result.data.created_at
        });
        console.log(`[DB] Message persisted: ${result.data.id}${attachment_url ? ' (with attachment)' : ''}`);
        // Broadcast sidebar update to all participants (use content or attachment indicator)
        const sidebarContent = content || (attachment_url ? 'Sent an image' : '');
        await broadcastSidebarUpdate(conversation_id, conversation_type, sidebarContent, result.data.created_at, socket.userId);
    }
    catch (error) {
        console.error('[DB] Failed to persist message:', error);
        socket.emit('message:failed', {
            client_id,
            error: 'Failed to save message to database'
        });
    }
}
// Helper: Broadcast sidebar update to all conversation participants
async function broadcastSidebarUpdate(conversation_id, conversation_type, last_message, last_message_at, sender_id) {
    try {
        let participantIds = [];
        if (conversation_type === 'dm') {
            // Get both participants in the DM
            const { data: participants } = await supabase
                .from('direct_message_participants')
                .select('user_id')
                .eq('dm_channel_id', conversation_id);
            participantIds = participants?.map(p => p.user_id) || [];
        }
        else if (conversation_type === 'group') {
            // Get all group members
            const { data: members } = await supabase
                .from('group_chat_members')
                .select('user_id')
                .eq('group_chat_id', conversation_id);
            participantIds = members?.map(m => m.user_id) || [];
        }
        // Broadcast to all participants' user rooms
        participantIds.forEach(userId => {
            io.to(`user:${userId}`).emit('sidebar:message', {
                conversation_id,
                conversation_type,
                last_message,
                last_message_at,
                sender_id
            });
        });
        console.log(`[Sidebar] Broadcasted message update to ${participantIds.length} participants`);
    }
    catch (error) {
        console.error('[Sidebar] Failed to broadcast update:', error);
    }
}
// Start server
httpServer.listen(PORT, () => {
    console.log(`[Server] WebSocket gateway running on port ${PORT}`);
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`[Server] Supabase URL: ${SUPABASE_URL}`);
});
// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[Server] SIGTERM received, closing connections...');
    io.close(() => {
        console.log('[Server] All connections closed');
        process.exit(0);
    });
});
