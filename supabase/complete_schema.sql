
-- ============================================================================
-- PART 1: EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- PART 2: TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PROFILES TABLE
-- Extends Supabase auth.users with profile information
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  bio TEXT,
  tag TEXT UNIQUE NOT NULL,
  profile_completed BOOLEAN DEFAULT FALSE,
  custom_status TEXT,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'idle', 'dnd', 'offline')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  CONSTRAINT custom_status_length CHECK (length(custom_status) <= 128),
  CONSTRAINT tag_format CHECK (tag ~ '^[a-zA-Z0-9_#-]+$')
);

-- Indexes for profiles
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_tag ON profiles(tag);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles(created_at);

COMMENT ON TABLE profiles IS 'User profiles extending Supabase auth.users';
COMMENT ON COLUMN profiles.tag IS 'Unique user tag/handle for mentions and user lookup (e.g., user#1234)';
COMMENT ON COLUMN profiles.profile_completed IS 'Whether user has completed onboarding (set tag and display name)';
COMMENT ON COLUMN profiles.banner_url IS 'URL to user banner image';
COMMENT ON COLUMN profiles.bio IS 'User biography/about me section';
COMMENT ON COLUMN profiles.custom_status IS 'User custom status text displayed below their name';

-- ----------------------------------------------------------------------------
-- SERVERS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon_url TEXT,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_servers_owner_id ON servers(owner_id);
CREATE INDEX IF NOT EXISTS idx_servers_created_at ON servers(created_at);

COMMENT ON TABLE servers IS 'Discord-like servers (guilds)';

-- ----------------------------------------------------------------------------
-- SERVER MEMBERS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS server_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  nickname TEXT,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(server_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_server_members_server_id ON server_members(server_id);
CREATE INDEX IF NOT EXISTS idx_server_members_user_id ON server_members(user_id);
CREATE INDEX IF NOT EXISTS idx_server_members_joined_at ON server_members(joined_at);

COMMENT ON TABLE server_members IS 'Junction table for server membership';

-- ----------------------------------------------------------------------------
-- CHANNEL CATEGORIES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channel_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_channel_categories_server_position ON channel_categories(server_id, position);

COMMENT ON TABLE channel_categories IS 'Optional channel groupings';

-- ----------------------------------------------------------------------------
-- CHANNELS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT DEFAULT 'text' CHECK (type IN ('text', 'voice', 'announcement')),
  position INTEGER DEFAULT 0 NOT NULL,
  category_id UUID REFERENCES channel_categories(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_channels_server_position ON channels(server_id, position);
CREATE INDEX IF NOT EXISTS idx_channels_category_id ON channels(category_id);

COMMENT ON TABLE channels IS 'Text/voice channels within servers';

-- ----------------------------------------------------------------------------
-- MESSAGES TABLE (Server channels)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  attachment_url TEXT,
  reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  edited_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to_id);

COMMENT ON TABLE messages IS 'Messages sent in channels';

-- ----------------------------------------------------------------------------
-- DIRECT MESSAGE CHANNELS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS direct_message_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

COMMENT ON TABLE direct_message_channels IS 'Private 1-on-1 conversation channels';

-- ----------------------------------------------------------------------------
-- DIRECT MESSAGE PARTICIPANTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS direct_message_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dm_channel_id UUID NOT NULL REFERENCES direct_message_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE(dm_channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_participants_channel ON direct_message_participants(dm_channel_id);
CREATE INDEX IF NOT EXISTS idx_dm_participants_user ON direct_message_participants(user_id);

COMMENT ON TABLE direct_message_participants IS 'Users participating in DM channels';

-- ----------------------------------------------------------------------------
-- DIRECT MESSAGES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dm_channel_id UUID NOT NULL REFERENCES direct_message_channels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  attachment_url TEXT,
  reply_to_id UUID REFERENCES direct_messages(id) ON DELETE SET NULL,
  edited_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  mentions UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_channel_created ON direct_messages(dm_channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_user_id ON direct_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_reply_to ON direct_messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_direct_messages_read_at ON direct_messages(dm_channel_id, read_at);
CREATE INDEX IF NOT EXISTS idx_direct_messages_deleted_at ON direct_messages(deleted_at);
CREATE INDEX IF NOT EXISTS idx_direct_messages_mentions ON direct_messages USING GIN(mentions);

COMMENT ON TABLE direct_messages IS 'Messages in DM channels';
COMMENT ON COLUMN direct_messages.reply_to_id IS 'Reference to the message being replied to';
COMMENT ON COLUMN direct_messages.deleted_at IS 'Timestamp when message was soft-deleted, NULL if not deleted';
COMMENT ON COLUMN direct_messages.mentions IS 'Array of user IDs mentioned in this message';

-- ----------------------------------------------------------------------------
-- DIRECT MESSAGE READ RECEIPTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS direct_message_read_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_read_receipts_message ON direct_message_read_receipts(message_id);
CREATE INDEX IF NOT EXISTS idx_dm_read_receipts_user ON direct_message_read_receipts(user_id);

COMMENT ON TABLE direct_message_read_receipts IS 'Tracks which messages have been read by which users';

-- ----------------------------------------------------------------------------
-- USER PRESENCE TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_presence (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'idle', 'dnd', 'offline')),
  custom_status TEXT,
  typing_in_dm_with UUID REFERENCES profiles(id) ON DELETE SET NULL,
  typing_in_group_chat_id UUID, -- Reference added after group_chats table
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_presence_status ON user_presence(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_user_presence_typing ON user_presence(typing_in_dm_with) WHERE typing_in_dm_with IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_presence_custom_status ON user_presence(custom_status) WHERE custom_status IS NOT NULL;

-- Set replica identity for realtime
ALTER TABLE user_presence REPLICA IDENTITY FULL;

COMMENT ON TABLE user_presence IS 'Real-time user online/offline status with realtime enabled';

-- ----------------------------------------------------------------------------
-- FRIENDSHIPS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  CHECK (user_id < friend_id),
  UNIQUE(user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships(friend_id);

COMMENT ON TABLE friendships IS 'Accepted friend relationships between users';

-- ----------------------------------------------------------------------------
-- FRIEND REQUESTS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  CHECK (from_user_id != to_user_id),
  UNIQUE(from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_from_user ON friend_requests(from_user_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_to_user ON friend_requests(to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_status ON friend_requests(status, created_at DESC);

COMMENT ON TABLE friend_requests IS 'Pending, accepted, or declined friend requests';

-- ----------------------------------------------------------------------------
-- GROUP CHATS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  icon_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_chats_creator ON group_chats(creator_id);

COMMENT ON TABLE group_chats IS 'Group chat channels';

-- Add foreign key to user_presence now that group_chats exists
ALTER TABLE user_presence
DROP CONSTRAINT IF EXISTS user_presence_typing_in_group_chat_id_fkey;

ALTER TABLE user_presence
ADD CONSTRAINT user_presence_typing_in_group_chat_id_fkey
FOREIGN KEY (typing_in_group_chat_id) REFERENCES group_chats(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- GROUP CHAT MEMBERS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_chat_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_chat_id UUID NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  is_owner BOOLEAN DEFAULT FALSE NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_chat_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_chat_members_group ON group_chat_members(group_chat_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_members_user ON group_chat_members(user_id);

COMMENT ON TABLE group_chat_members IS 'Members of group chats with their roles';
COMMENT ON COLUMN group_chat_members.is_owner IS 'TRUE if this member is the group creator/owner';
COMMENT ON COLUMN group_chat_members.last_read_at IS 'Timestamp of when user last read messages in this group';

-- ----------------------------------------------------------------------------
-- GROUP CHAT MESSAGES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_chat_id UUID NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  attachment_url TEXT,
  reply_to_id UUID REFERENCES group_chat_messages(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL DEFAULT 'user_message' CHECK (message_type IN ('user_message', 'system_join', 'system_leave', 'system_invite', 'system_update')),
  metadata JSONB DEFAULT NULL,
  mentions UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_group_chat_messages_group ON group_chat_messages(group_chat_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_messages_user ON group_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_messages_reply ON group_chat_messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_group_chat_messages_created ON group_chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_chat_messages_mentions ON group_chat_messages USING GIN(mentions);

COMMENT ON TABLE group_chat_messages IS 'Messages sent in group chats';
COMMENT ON COLUMN group_chat_messages.reply_to_id IS 'Reference to the message being replied to';
COMMENT ON COLUMN group_chat_messages.attachment_url IS 'URL to attached file/image in chat-attachments bucket';
COMMENT ON COLUMN group_chat_messages.mentions IS 'Array of user IDs mentioned in this message';

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('friend_request', 'group_chat_invite', 'group_chat_created')),
  from_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  group_chat_id UUID REFERENCES group_chats(id) ON DELETE CASCADE,
  friend_request_id UUID REFERENCES friend_requests(id) ON DELETE CASCADE,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

COMMENT ON TABLE notifications IS 'Universal notifications table for friend requests, group chats, etc.';
COMMENT ON COLUMN notifications.type IS 'Type of notification: friend_request, group_chat_invite, group_chat_created';

-- ----------------------------------------------------------------------------
-- MEDIA FAVORITES TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  preview_url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('gif', 'sticker')),
  title TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, media_url)
);

CREATE INDEX IF NOT EXISTS idx_media_favorites_user ON media_favorites(user_id, media_type, created_at DESC);

-- ----------------------------------------------------------------------------
-- BLOCKED USERS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  CHECK (user_id != blocked_user_id),
  UNIQUE(user_id, blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_user_id ON blocked_users(user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_user_id ON blocked_users(blocked_user_id);

-- ----------------------------------------------------------------------------
-- MUTED CONVERSATIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS muted_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  conversation_type TEXT NOT NULL CHECK (conversation_type IN ('dm', 'group')),
  muted_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, conversation_id, conversation_type)
);

CREATE INDEX IF NOT EXISTS idx_muted_conversations_user_id ON muted_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_muted_conversations_lookup ON muted_conversations(user_id, conversation_id, conversation_type);

-- ----------------------------------------------------------------------------
-- MESSAGE REACTIONS TABLE
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('dm', 'group')),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id, message_type);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user ON message_reactions(user_id);

COMMENT ON TABLE message_reactions IS 'Emoji reactions on messages (DM and group chat)';
COMMENT ON COLUMN message_reactions.message_type IS 'Whether the message is in direct_messages (dm) or group_chat_messages (group)';

-- ============================================================================
-- PART 3: FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Function to update updated_at timestamp
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Function to generate a unique tag for a username
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_unique_tag(base_username TEXT)
RETURNS TEXT AS $$
DECLARE
  random_tag TEXT;
  new_tag TEXT;
  tag_exists BOOLEAN;
BEGIN
  LOOP
    random_tag := LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
    new_tag := base_username || '#' || random_tag;
    SELECT EXISTS(SELECT 1 FROM profiles WHERE tag = new_tag) INTO tag_exists;
    IF NOT tag_exists THEN
      RETURN new_tag;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_unique_tag IS 'Generates a unique username#1234 style tag';

-- ----------------------------------------------------------------------------
-- Function to automatically create profile on user signup
-- IMPORTANT: Uses SET search_path to ensure auth admin can find public schema tables
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_username TEXT;
  v_tag TEXT;
  v_base_username TEXT;
  username_exists BOOLEAN;
  counter INTEGER := 0;
BEGIN
  -- Get username from metadata or generate from email
  v_base_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1),
    'user'
  );

  -- Ensure unique username by appending numbers if needed
  v_username := v_base_username;
  LOOP
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE username = v_username) INTO username_exists;
    IF NOT username_exists THEN
      EXIT;
    END IF;
    counter := counter + 1;
    v_username := v_base_username || counter;
  END LOOP;

  -- Generate unique tag
  v_tag := public.generate_unique_tag(v_username);

  -- Insert profile
  INSERT INTO public.profiles (id, username, tag, profile_completed)
  VALUES (
    NEW.id,
    v_username,
    v_tag,
    FALSE
  );

  -- Insert presence
  INSERT INTO public.user_presence (user_id, status, last_seen)
  VALUES (NEW.id, 'offline', NOW());

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- Function to automatically add server owner as member
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_owner_as_member()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.server_members (server_id, user_id)
  VALUES (NEW.id, NEW.owner_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- Function to check if user is in a DM channel (security definer)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_dm_participant(channel_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM direct_message_participants
    WHERE dm_channel_id = channel_id
      AND direct_message_participants.user_id = user_id
  );
$$;

-- ----------------------------------------------------------------------------
-- Function to get user's DM channel IDs (security definer)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_dm_channels(user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT dm_channel_id FROM direct_message_participants
  WHERE direct_message_participants.user_id = user_id;
$$;

-- ----------------------------------------------------------------------------
-- Function to find existing DM channel between two users
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_dm_channel_id(user_id_1 UUID, user_id_2 UUID)
RETURNS UUID AS $$
DECLARE
  channel_id UUID;
BEGIN
  SELECT dm_channel_id INTO channel_id
  FROM direct_message_participants
  WHERE user_id = user_id_1
    AND dm_channel_id IN (
      SELECT dm_channel_id
      FROM direct_message_participants
      WHERE user_id = user_id_2
    )
  LIMIT 1;

  RETURN channel_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_dm_channel_id IS 'Finds existing DM channel ID between two users';

-- ----------------------------------------------------------------------------
-- Function to create or get DM channel between two users
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_or_create_dm_channel(other_user_id UUID)
RETURNS UUID AS $$
DECLARE
  current_user_id UUID;
  existing_channel_id UUID;
  new_channel_id UUID;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF current_user_id = other_user_id THEN
    RAISE EXCEPTION 'Cannot create DM channel with yourself';
  END IF;

  existing_channel_id := get_dm_channel_id(current_user_id, other_user_id);

  IF existing_channel_id IS NOT NULL THEN
    RETURN existing_channel_id;
  END IF;

  INSERT INTO direct_message_channels DEFAULT VALUES
  RETURNING id INTO new_channel_id;

  INSERT INTO direct_message_participants (dm_channel_id, user_id)
  VALUES
    (new_channel_id, current_user_id),
    (new_channel_id, other_user_id);

  RETURN new_channel_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_or_create_dm_channel IS 'Gets existing DM channel or creates new one between current user and specified user';

-- ----------------------------------------------------------------------------
-- Function to accept friend request
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_friend_request(request_id UUID)
RETURNS VOID AS $$
DECLARE
  req RECORD;
BEGIN
  SELECT from_user_id, to_user_id INTO req
  FROM friend_requests
  WHERE id = request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found or already processed';
  END IF;

  UPDATE friend_requests
  SET status = 'accepted', updated_at = NOW()
  WHERE id = request_id;

  INSERT INTO friendships (user_id, friend_id)
  VALUES (
    LEAST(req.from_user_id, req.to_user_id),
    GREATEST(req.from_user_id, req.to_user_id)
  )
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION accept_friend_request IS 'Accepts a friend request and creates friendship';

-- ----------------------------------------------------------------------------
-- Function to get user's friends with full info
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_user_friends(p_user_id UUID)
RETURNS TABLE (
  friend_id UUID,
  username TEXT,
  tag TEXT,
  display_name TEXT,
  avatar_url TEXT,
  status TEXT,
  custom_status TEXT,
  dm_channel_id UUID,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_from_user_id UUID,
  unread_count BIGINT,
  is_typing BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN f.user_id = p_user_id THEN f.friend_id
      ELSE f.user_id
    END as friend_id,
    p.username,
    p.tag,
    p.display_name,
    p.avatar_url,
    COALESCE(up.status, 'offline') as status,
    p.custom_status,
    dmc.id as dm_channel_id,
    last_msg.content as last_message,
    last_msg.created_at as last_message_at,
    last_msg.user_id as last_message_from_user_id,
    COALESCE(unread.count, 0)::BIGINT as unread_count,
    COALESCE(up.typing_in_dm_with = p_user_id, false) as is_typing
  FROM friendships f
  JOIN profiles p ON (
    CASE
      WHEN f.user_id = p_user_id THEN p.id = f.friend_id
      ELSE p.id = f.user_id
    END
  )
  LEFT JOIN user_presence up ON up.user_id = p.id
  LEFT JOIN LATERAL (
    SELECT dmc_inner.id
    FROM direct_message_channels dmc_inner
    JOIN direct_message_participants dmp1 ON dmp1.dm_channel_id = dmc_inner.id AND dmp1.user_id = p_user_id
    JOIN direct_message_participants dmp2 ON dmp2.dm_channel_id = dmc_inner.id AND dmp2.user_id = p.id
    LIMIT 1
  ) dmc ON true
  LEFT JOIN LATERAL (
    SELECT dm.content, dm.created_at, dm.user_id
    FROM direct_messages dm
    WHERE dm.dm_channel_id = dmc.id
    ORDER BY dm.created_at DESC
    LIMIT 1
  ) last_msg ON dmc.id IS NOT NULL
  LEFT JOIN LATERAL (
    SELECT COUNT(*) as count
    FROM direct_messages dm
    WHERE dm.dm_channel_id = dmc.id
      AND dm.user_id = p.id
      AND dm.read_at IS NULL
  ) unread ON dmc.id IS NOT NULL
  WHERE f.user_id = p_user_id OR f.friend_id = p_user_id
  ORDER BY
    CASE
      WHEN last_msg.created_at IS NOT NULL THEN last_msg.created_at
      ELSE f.created_at
    END DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_user_friends IS 'Get user friends with DM channel ID, last message, unread count, and typing status';

-- ----------------------------------------------------------------------------
-- Function to get friends with presence (simpler version)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_friends_with_presence(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  friend_id UUID,
  username TEXT,
  tag TEXT,
  display_name TEXT,
  avatar_url TEXT,
  status TEXT,
  custom_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    CASE
      WHEN f.user_id = p_user_id THEN f.friend_id
      ELSE f.user_id
    END AS friend_id,
    p.username,
    p.tag,
    p.display_name,
    p.avatar_url,
    COALESCE(up.status::TEXT, 'offline') AS status,
    COALESCE(up.custom_status, NULL) AS custom_status
  FROM friendships f
  INNER JOIN profiles p ON (
    CASE
      WHEN f.user_id = p_user_id THEN p.id = f.friend_id
      ELSE p.id = f.user_id
    END
  )
  LEFT JOIN user_presence up ON up.user_id = p.id
  WHERE f.user_id = p_user_id OR f.friend_id = p_user_id
  ORDER BY
    CASE up.status::TEXT
      WHEN 'online' THEN 1
      WHEN 'idle' THEN 2
      WHEN 'dnd' THEN 3
      ELSE 4
    END,
    p.username;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Typing status functions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_typing_status(p_typing_to_user_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_presence (user_id, typing_in_dm_with, status, last_seen, updated_at)
  VALUES (auth.uid(), p_typing_to_user_id, 'online', NOW(), NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET typing_in_dm_with = p_typing_to_user_id,
      updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION clear_typing_status()
RETURNS VOID AS $$
BEGIN
  UPDATE user_presence
  SET typing_in_dm_with = NULL,
      updated_at = NOW()
  WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_typing_status IS 'Sets the current user as typing to a specific user';
COMMENT ON FUNCTION clear_typing_status IS 'Clears the current user typing status';

-- ----------------------------------------------------------------------------
-- DM read status functions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_dm_as_read(p_message_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE direct_messages
  SET read_at = NOW()
  WHERE id = p_message_id
    AND read_at IS NULL
    AND user_id != auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION mark_dm_channel_as_read(p_dm_channel_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE direct_messages
  SET read_at = NOW()
  WHERE dm_channel_id = p_dm_channel_id
    AND read_at IS NULL
    AND user_id != auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_total_unread_count(p_user_id UUID)
RETURNS BIGINT AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM direct_messages dm
    JOIN direct_message_channels dmc ON dm.dm_channel_id = dmc.id
    JOIN direct_message_participants dmp ON dmp.dm_channel_id = dmc.id AND dmp.user_id = p_user_id
    WHERE dm.user_id != p_user_id
      AND dm.read_at IS NULL
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mark_dm_as_read IS 'Marks a specific DM as read';
COMMENT ON FUNCTION mark_dm_channel_as_read IS 'Marks all unread DMs in a channel as read';
COMMENT ON FUNCTION get_total_unread_count IS 'Get total count of unread DMs for a user';

-- ----------------------------------------------------------------------------
-- DM read receipts functions (new system)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_dm_unread_count(
  p_dm_channel_id UUID,
  p_user_id UUID
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM direct_messages dm
  WHERE dm.dm_channel_id = p_dm_channel_id
    AND dm.user_id != p_user_id
    AND NOT EXISTS (
      SELECT 1
      FROM direct_message_read_receipts rr
      WHERE rr.message_id = dm.id
        AND rr.user_id = p_user_id
    );

  RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION mark_dm_messages_as_read(
  p_dm_channel_id UUID,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO direct_message_read_receipts (message_id, user_id, read_at)
  SELECT dm.id, p_user_id, NOW()
  FROM direct_messages dm
  WHERE dm.dm_channel_id = p_dm_channel_id
    AND dm.user_id != p_user_id
    AND NOT EXISTS (
      SELECT 1
      FROM direct_message_read_receipts rr
      WHERE rr.message_id = dm.id
        AND rr.user_id = p_user_id
    )
  ON CONFLICT (message_id, user_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION get_dm_unread_count IS 'Returns count of unread messages in a DM channel for a user';
COMMENT ON FUNCTION mark_dm_messages_as_read IS 'Marks all messages in a DM channel as read for a user';

-- ----------------------------------------------------------------------------
-- Group chat functions
-- ----------------------------------------------------------------------------

-- Function to automatically set is_owner when adding members
CREATE OR REPLACE FUNCTION set_group_member_is_owner()
RETURNS TRIGGER AS $$
DECLARE
  v_creator_id UUID;
BEGIN
  SELECT creator_id INTO v_creator_id
  FROM group_chats
  WHERE id = NEW.group_chat_id;

  IF NEW.user_id = v_creator_id THEN
    NEW.is_owner = TRUE;
  ELSE
    NEW.is_owner = FALSE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_group_chat(
  p_name TEXT,
  p_creator_id UUID,
  p_member_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group_id UUID;
  v_member_id UUID;
BEGIN
  INSERT INTO group_chats (name, creator_id)
  VALUES (p_name, p_creator_id)
  RETURNING id INTO v_group_id;

  INSERT INTO group_chat_members (group_chat_id, user_id, role)
  VALUES (v_group_id, p_creator_id, 'admin');

  FOREACH v_member_id IN ARRAY p_member_ids
  LOOP
    IF v_member_id != p_creator_id THEN
      INSERT INTO group_chat_members (group_chat_id, user_id, role)
      VALUES (v_group_id, v_member_id, 'member')
      ON CONFLICT (group_chat_id, user_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_group_id;
END;
$$;

CREATE OR REPLACE FUNCTION get_user_group_chats(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  icon_url TEXT,
  creator_id UUID,
  member_count BIGINT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_user_id UUID,
  unread_count BIGINT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    gc.id,
    gc.name,
    gc.icon_url,
    gc.creator_id,
    (SELECT COUNT(*) FROM group_chat_members WHERE group_chat_id = gc.id) as member_count,
    last_msg.content as last_message,
    last_msg.created_at as last_message_at,
    last_msg.user_id as last_message_user_id,
    COALESCE(
      (SELECT COUNT(*)
       FROM group_chat_messages gcm
       WHERE gcm.group_chat_id = gc.id
         AND gcm.created_at > COALESCE(gcm_member.last_read_at, '1970-01-01'::timestamptz)
         AND gcm.user_id != p_user_id
         AND gcm.deleted_at IS NULL),
      0
    ) as unread_count,
    gc.created_at
  FROM group_chats gc
  INNER JOIN group_chat_members gcm_member
    ON gcm_member.group_chat_id = gc.id
    AND gcm_member.user_id = p_user_id
  LEFT JOIN LATERAL (
    SELECT gcm.content, gcm.created_at, gcm.user_id
    FROM group_chat_messages gcm
    WHERE gcm.group_chat_id = gc.id
      AND gcm.deleted_at IS NULL
    ORDER BY gcm.created_at DESC
    LIMIT 1
  ) last_msg ON true
  ORDER BY COALESCE(last_msg.created_at, gc.created_at) DESC;
END;
$$;

CREATE OR REPLACE FUNCTION get_group_chat_members(p_group_chat_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  username TEXT,
  tag TEXT,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT,
  status TEXT,
  is_typing BOOLEAN,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    gcm.id,
    p.id as user_id,
    p.username,
    p.tag,
    p.display_name,
    p.avatar_url,
    gcm.role,
    COALESCE(up.status, 'offline') as status,
    CASE
      WHEN up.typing_in_group_chat_id = p_group_chat_id THEN true
      ELSE false
    END as is_typing,
    gcm.joined_at
  FROM group_chat_members gcm
  INNER JOIN profiles p ON p.id = gcm.user_id
  LEFT JOIN user_presence up ON up.user_id = p.id
  WHERE gcm.group_chat_id = p_group_chat_id
  ORDER BY
    CASE up.status
      WHEN 'online' THEN 1
      WHEN 'away' THEN 2
      WHEN 'dnd' THEN 3
      ELSE 4
    END,
    p.display_name, p.username;
END;
$$;

CREATE OR REPLACE FUNCTION mark_group_chat_as_read(p_group_chat_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE group_chat_members
  SET last_read_at = NOW()
  WHERE group_chat_id = p_group_chat_id
    AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION set_group_chat_typing_status(p_group_chat_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_presence (user_id, status, typing_in_group_chat_id, last_seen)
  VALUES (auth.uid(), 'online', p_group_chat_id, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    typing_in_group_chat_id = p_group_chat_id,
    last_seen = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION clear_group_chat_typing_status()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE user_presence
  SET typing_in_group_chat_id = NULL
  WHERE user_id = auth.uid();
END;
$$;

-- Group unread count functions
CREATE OR REPLACE FUNCTION get_group_unread_count(
  p_group_chat_id UUID,
  p_user_id UUID
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count BIGINT;
  v_last_read_at TIMESTAMPTZ;
BEGIN
  SELECT gcm.last_read_at
  INTO v_last_read_at
  FROM group_chat_members gcm
  WHERE gcm.group_chat_id = p_group_chat_id
    AND gcm.user_id = p_user_id;

  SELECT COUNT(*)
  INTO v_count
  FROM group_chat_messages gcm
  WHERE gcm.group_chat_id = p_group_chat_id
    AND gcm.user_id != p_user_id
    AND gcm.deleted_at IS NULL
    AND gcm.created_at > COALESCE(v_last_read_at, '1970-01-01'::timestamptz);

  RETURN COALESCE(v_count, 0);
END;
$$;

CREATE OR REPLACE FUNCTION mark_group_messages_as_read(
  p_group_chat_id UUID,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE group_chat_members
  SET last_read_at = NOW()
  WHERE group_chat_id = p_group_chat_id
    AND user_id = p_user_id;
END;
$$;

COMMENT ON FUNCTION get_group_unread_count IS 'Returns count of unread messages in a group chat for a user';
COMMENT ON FUNCTION mark_group_messages_as_read IS 'Updates last_read_at for a user in a group chat';

-- ----------------------------------------------------------------------------
-- Get all unread counts function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_all_unread_counts(p_user_id UUID)
RETURNS TABLE (
  conversation_id UUID,
  conversation_type TEXT,
  unread_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dmc.id as conversation_id,
    'dm'::TEXT as conversation_type,
    get_dm_unread_count(dmc.id, p_user_id) as unread_count
  FROM direct_message_channels dmc
  INNER JOIN direct_message_participants dmp
    ON dmp.dm_channel_id = dmc.id
    AND dmp.user_id = p_user_id
  WHERE get_dm_unread_count(dmc.id, p_user_id) > 0;

  RETURN QUERY
  SELECT
    gc.id as conversation_id,
    'group'::TEXT as conversation_type,
    get_group_unread_count(gc.id, p_user_id) as unread_count
  FROM group_chats gc
  INNER JOIN group_chat_members gcm
    ON gcm.group_chat_id = gc.id
    AND gcm.user_id = p_user_id
  WHERE get_group_unread_count(gc.id, p_user_id) > 0;
END;
$$;

COMMENT ON FUNCTION get_all_unread_counts IS 'Returns all conversations with unread messages for a user';

-- ----------------------------------------------------------------------------
-- Notification functions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION notify_group_chat_members()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO notifications (user_id, type, from_user_id, group_chat_id)
    SELECT
      gcm.user_id,
      'group_chat_created',
      NEW.creator_id,
      NEW.id
    FROM group_chat_members gcm
    WHERE gcm.group_chat_id = NEW.id
      AND gcm.user_id != NEW.creator_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION get_user_notifications(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  type TEXT,
  from_user_id UUID,
  from_username TEXT,
  from_tag TEXT,
  from_display_name TEXT,
  from_avatar_url TEXT,
  group_chat_id UUID,
  group_chat_name TEXT,
  read BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.type,
    n.from_user_id,
    p.username as from_username,
    p.tag as from_tag,
    p.display_name as from_display_name,
    p.avatar_url as from_avatar_url,
    n.group_chat_id,
    gc.name as group_chat_name,
    n.read,
    n.created_at
  FROM notifications n
  LEFT JOIN profiles p ON p.id = n.from_user_id
  LEFT JOIN group_chats gc ON gc.id = n.group_chat_id
  WHERE n.user_id = p_user_id
  ORDER BY n.created_at DESC
  LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION mark_notification_as_read(p_notification_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE notifications
  SET read = true
  WHERE id = p_notification_id
    AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM notifications
    WHERE user_id = p_user_id
      AND read = false
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- System message functions
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS insert_group_system_message(UUID, UUID, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION insert_group_system_message(
  p_group_chat_id UUID,
  p_user_id UUID,
  p_message_type TEXT,
  p_content TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS TABLE (message_id UUID, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO group_chat_messages (
    group_chat_id,
    user_id,
    content,
    message_type,
    metadata
  ) VALUES (
    p_group_chat_id,
    p_user_id,
    p_content,
    p_message_type,
    p_metadata
  )
  RETURNING id, group_chat_messages.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION on_group_member_leave()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_username TEXT;
  v_remaining_members INTEGER;
BEGIN
  SELECT username INTO v_username
  FROM profiles
  WHERE id = OLD.user_id;

  PERFORM insert_group_system_message(
    OLD.group_chat_id,
    OLD.user_id,
    'system_leave',
    v_username || ' left the group',
    jsonb_build_object('left_user_id', OLD.user_id, 'left_username', v_username)
  );

  -- Check if there are any members left in the group
  SELECT COUNT(*) INTO v_remaining_members
  FROM group_chat_members
  WHERE group_chat_id = OLD.group_chat_id;

  -- If no members remain, delete the group
  IF v_remaining_members = 0 THEN
    DELETE FROM group_chats WHERE id = OLD.group_chat_id;
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION on_group_member_join()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_username TEXT;
  v_is_creator BOOLEAN;
BEGIN
  SELECT username INTO v_username
  FROM profiles
  WHERE id = NEW.user_id;

  SELECT EXISTS(
    SELECT 1 FROM group_chats
    WHERE id = NEW.group_chat_id AND creator_id = NEW.user_id
  ) INTO v_is_creator;

  IF v_is_creator THEN
    RETURN NEW;
  END IF;

  PERFORM insert_group_system_message(
    NEW.group_chat_id,
    NEW.user_id,
    'system_join',
    v_username || ' joined the group',
    jsonb_build_object('joined_user_id', NEW.user_id, 'joined_username', v_username)
  );

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_group_system_message TO authenticated;

-- ----------------------------------------------------------------------------
-- Block/Mute functions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION block_user(p_blocked_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id = p_blocked_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot block yourself');
  END IF;

  INSERT INTO blocked_users (user_id, blocked_user_id)
  VALUES (v_user_id, p_blocked_user_id)
  ON CONFLICT (user_id, blocked_user_id) DO NOTHING;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION unblock_user(p_blocked_user_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  DELETE FROM blocked_users
  WHERE user_id = v_user_id AND blocked_user_id = p_blocked_user_id;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_user_blocked(p_other_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM blocked_users
    WHERE (user_id = v_user_id AND blocked_user_id = p_other_user_id)
       OR (user_id = p_other_user_id AND blocked_user_id = v_user_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION did_i_block_user(p_other_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM blocked_users
    WHERE user_id = auth.uid() AND blocked_user_id = p_other_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_blocked_users()
RETURNS TABLE (
  blocked_user_id UUID,
  username TEXT,
  tag TEXT,
  avatar_url TEXT,
  blocked_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.blocked_user_id,
    p.username,
    p.tag,
    p.avatar_url,
    b.created_at as blocked_at
  FROM blocked_users b
  JOIN profiles p ON p.id = b.blocked_user_id
  WHERE b.user_id = auth.uid()
  ORDER BY b.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION mute_conversation(
  p_conversation_id UUID,
  p_conversation_type TEXT,
  p_duration_minutes INTEGER
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_muted_until TIMESTAMP WITH TIME ZONE;
BEGIN
  IF p_duration_minutes IS NULL OR p_duration_minutes < 0 THEN
    v_muted_until := NULL;
  ELSE
    v_muted_until := NOW() + (p_duration_minutes || ' minutes')::INTERVAL;
  END IF;

  INSERT INTO muted_conversations (user_id, conversation_id, conversation_type, muted_until)
  VALUES (v_user_id, p_conversation_id, p_conversation_type, v_muted_until)
  ON CONFLICT (user_id, conversation_id, conversation_type)
  DO UPDATE SET muted_until = v_muted_until;

  RETURN json_build_object('success', true, 'muted_until', v_muted_until);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION unmute_conversation(
  p_conversation_id UUID,
  p_conversation_type TEXT
)
RETURNS JSON AS $$
BEGIN
  DELETE FROM muted_conversations
  WHERE user_id = auth.uid()
    AND conversation_id = p_conversation_id
    AND conversation_type = p_conversation_type;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_conversation_muted(
  p_conversation_id UUID,
  p_conversation_type TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_mute RECORD;
BEGIN
  SELECT * INTO v_mute
  FROM muted_conversations
  WHERE user_id = auth.uid()
    AND conversation_id = p_conversation_id
    AND conversation_type = p_conversation_type;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_mute.muted_until IS NOT NULL AND v_mute.muted_until < NOW() THEN
    DELETE FROM muted_conversations WHERE id = v_mute.id;
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_muted_conversations()
RETURNS TABLE (
  conversation_id UUID,
  conversation_type TEXT,
  muted_until TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  DELETE FROM muted_conversations
  WHERE user_id = auth.uid()
    AND muted_conversations.muted_until IS NOT NULL
    AND muted_conversations.muted_until < NOW();

  RETURN QUERY
  SELECT m.conversation_id, m.conversation_type, m.muted_until
  FROM muted_conversations m
  WHERE m.user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- Auto-unblock trigger functions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_unblock_on_friend_request()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending' OR NEW.status = 'accepted' THEN
    DELETE FROM blocked_users
    WHERE (user_id = NEW.from_user_id AND blocked_user_id = NEW.to_user_id)
       OR (user_id = NEW.to_user_id AND blocked_user_id = NEW.from_user_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION auto_unblock_on_friendship()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM blocked_users
  WHERE (user_id = NEW.user_id AND blocked_user_id = NEW.friend_id)
     OR (user_id = NEW.friend_id AND blocked_user_id = NEW.user_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 4: VIEWS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- View for user's DM channels with participant info
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW user_dm_channels AS
SELECT DISTINCT ON (dmc.id)
  dmc.id AS dm_channel_id,
  dmc.created_at,
  other_user.id AS other_user_id,
  other_user.username AS other_username,
  other_user.display_name AS other_display_name,
  other_user.avatar_url AS other_avatar_url,
  other_user.status AS other_user_status,
  (
    SELECT content
    FROM direct_messages
    WHERE dm_channel_id = dmc.id
    ORDER BY created_at DESC
    LIMIT 1
  ) AS last_message_content,
  (
    SELECT created_at
    FROM direct_messages
    WHERE dm_channel_id = dmc.id
    ORDER BY created_at DESC
    LIMIT 1
  ) AS last_message_at
FROM direct_message_channels dmc
JOIN direct_message_participants dmp_current
  ON dmp_current.dm_channel_id = dmc.id
  AND dmp_current.user_id = auth.uid()
JOIN direct_message_participants dmp_other
  ON dmp_other.dm_channel_id = dmc.id
  AND dmp_other.user_id != auth.uid()
JOIN profiles other_user
  ON other_user.id = dmp_other.user_id
ORDER BY dmc.id, last_message_at DESC NULLS LAST;

-- ----------------------------------------------------------------------------
-- View for user's servers with info
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW user_servers_with_info AS
SELECT
  s.id AS server_id,
  s.name AS server_name,
  s.icon_url AS server_icon,
  s.owner_id,
  sm.joined_at,
  sm.nickname,
  (SELECT COUNT(*) FROM channels WHERE server_id = s.id)::INTEGER AS channel_count,
  (SELECT COUNT(*) FROM server_members WHERE server_id = s.id)::INTEGER AS member_count
FROM servers s
JOIN server_members sm ON sm.server_id = s.id
WHERE sm.user_id = auth.uid()
ORDER BY sm.joined_at DESC;

-- Grant access to views
GRANT SELECT ON user_dm_channels TO authenticated;
GRANT SELECT ON user_servers_with_info TO authenticated;

COMMENT ON VIEW user_dm_channels IS 'Convenient view of current user DM channels with participant info and last message';
COMMENT ON VIEW user_servers_with_info IS 'View of user servers with metadata like channel count and member count';

-- ============================================================================
-- PART 5: TRIGGERS
-- ============================================================================

-- Drop existing triggers first
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
DROP TRIGGER IF EXISTS update_servers_updated_at ON servers;
DROP TRIGGER IF EXISTS update_channels_updated_at ON channels;
DROP TRIGGER IF EXISTS update_user_presence_updated_at ON user_presence;
DROP TRIGGER IF EXISTS update_friend_requests_updated_at ON friend_requests;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_server_created ON servers;
DROP TRIGGER IF EXISTS trigger_notify_group_chat_members ON group_chats;
DROP TRIGGER IF EXISTS trigger_group_member_leave ON group_chat_members;
DROP TRIGGER IF EXISTS trigger_group_member_join ON group_chat_members;
DROP TRIGGER IF EXISTS trigger_set_group_member_is_owner ON group_chat_members;
DROP TRIGGER IF EXISTS trigger_auto_unblock_on_friend_request ON friend_requests;
DROP TRIGGER IF EXISTS trigger_auto_unblock_on_friendship ON friendships;

-- Create triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_servers_updated_at BEFORE UPDATE ON servers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_presence_updated_at BEFORE UPDATE ON user_presence
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_friend_requests_updated_at
  BEFORE UPDATE ON friend_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_server_created
  AFTER INSERT ON servers
  FOR EACH ROW EXECUTE FUNCTION public.add_owner_as_member();

CREATE TRIGGER trigger_notify_group_chat_members
  AFTER INSERT ON group_chats
  FOR EACH ROW
  EXECUTE FUNCTION notify_group_chat_members();

CREATE TRIGGER trigger_group_member_leave
  AFTER DELETE ON group_chat_members
  FOR EACH ROW
  EXECUTE FUNCTION on_group_member_leave();

CREATE TRIGGER trigger_set_group_member_is_owner
  BEFORE INSERT ON group_chat_members
  FOR EACH ROW
  EXECUTE FUNCTION set_group_member_is_owner();

CREATE TRIGGER trigger_group_member_join
  AFTER INSERT ON group_chat_members
  FOR EACH ROW
  EXECUTE FUNCTION on_group_member_join();

CREATE TRIGGER trigger_auto_unblock_on_friend_request
  AFTER INSERT OR UPDATE ON friend_requests
  FOR EACH ROW
  EXECUTE FUNCTION auto_unblock_on_friend_request();

CREATE TRIGGER trigger_auto_unblock_on_friendship
  AFTER INSERT ON friendships
  FOR EACH ROW
  EXECUTE FUNCTION auto_unblock_on_friendship();

-- ============================================================================
-- PART 6: ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- First disable RLS on social tables (works for both fresh and existing databases)
ALTER TABLE IF EXISTS friendships DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS friend_requests DISABLE ROW LEVEL SECURITY;

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_message_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_message_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_message_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE muted_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- NOTE: RLS disabled on social features to allow authenticated users to interact freely
-- friendships and friend_requests should be accessible to all authenticated users
-- ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;

-- NOTE: Group chat tables have RLS disabled for testing (see migration 20260109000010)
-- Re-enable when ready for production:
-- ALTER TABLE group_chats ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE group_chat_members ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE group_chat_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view servers they are members of" ON servers;
DROP POLICY IF EXISTS "Users can create servers" ON servers;
DROP POLICY IF EXISTS "Server owners can update their servers" ON servers;
DROP POLICY IF EXISTS "Server owners can delete their servers" ON servers;
DROP POLICY IF EXISTS "Users can view server members" ON server_members;
DROP POLICY IF EXISTS "Users can join servers" ON server_members;
DROP POLICY IF EXISTS "Users can leave servers" ON server_members;
DROP POLICY IF EXISTS "Server owners can remove members" ON server_members;
DROP POLICY IF EXISTS "Users can view channel categories" ON channel_categories;
DROP POLICY IF EXISTS "Server owners can insert categories" ON channel_categories;
DROP POLICY IF EXISTS "Server owners can update categories" ON channel_categories;
DROP POLICY IF EXISTS "Server owners can delete categories" ON channel_categories;
DROP POLICY IF EXISTS "Users can view channels in their servers" ON channels;
DROP POLICY IF EXISTS "Server owners can create channels" ON channels;
DROP POLICY IF EXISTS "Server owners can update channels" ON channels;
DROP POLICY IF EXISTS "Server owners can delete channels" ON channels;
DROP POLICY IF EXISTS "Users can view messages in accessible channels" ON messages;
DROP POLICY IF EXISTS "Users can send messages in accessible channels" ON messages;
DROP POLICY IF EXISTS "Users can update own messages" ON messages;
DROP POLICY IF EXISTS "Users can delete own messages" ON messages;
DROP POLICY IF EXISTS "Server owners can delete messages in their servers" ON messages;
DROP POLICY IF EXISTS "Users can view their DM channels" ON direct_message_channels;
DROP POLICY IF EXISTS "Users can create DM channels" ON direct_message_channels;
DROP POLICY IF EXISTS "Users can view DM participants" ON direct_message_participants;
DROP POLICY IF EXISTS "Users can join DM channels" ON direct_message_participants;
DROP POLICY IF EXISTS "Users can add DM participants" ON direct_message_participants;
DROP POLICY IF EXISTS "Users can view their direct messages" ON direct_messages;
DROP POLICY IF EXISTS "Users can send direct messages" ON direct_messages;
DROP POLICY IF EXISTS "Users can mark messages as read" ON direct_messages;
DROP POLICY IF EXISTS "Users can soft delete own messages" ON direct_messages;
DROP POLICY IF EXISTS "Users can update own direct messages" ON direct_messages;
DROP POLICY IF EXISTS "Users can delete own direct messages" ON direct_messages;
DROP POLICY IF EXISTS "User presence is viewable by everyone" ON user_presence;
DROP POLICY IF EXISTS "Users can update own presence" ON user_presence;
DROP POLICY IF EXISTS "Users can insert own presence" ON user_presence;
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can view their own read receipts" ON direct_message_read_receipts;
DROP POLICY IF EXISTS "Users can insert their own read receipts" ON direct_message_read_receipts;
DROP POLICY IF EXISTS "Users can view own favorites" ON media_favorites;
DROP POLICY IF EXISTS "Users can add own favorites" ON media_favorites;
DROP POLICY IF EXISTS "Users can delete own favorites" ON media_favorites;
DROP POLICY IF EXISTS "Users can view their own blocks" ON blocked_users;
DROP POLICY IF EXISTS "Users can block others" ON blocked_users;
DROP POLICY IF EXISTS "Users can unblock others" ON blocked_users;
DROP POLICY IF EXISTS "Users can view their own mutes" ON muted_conversations;
DROP POLICY IF EXISTS "Users can mute conversations" ON muted_conversations;
DROP POLICY IF EXISTS "Users can update their mutes" ON muted_conversations;
DROP POLICY IF EXISTS "Users can unmute conversations" ON muted_conversations;
DROP POLICY IF EXISTS "Anyone can view reactions" ON message_reactions;
DROP POLICY IF EXISTS "Users can add reactions" ON message_reactions;
DROP POLICY IF EXISTS "Users can remove own reactions" ON message_reactions;

-- PROFILES POLICIES
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- SERVERS POLICIES
CREATE POLICY "Users can view servers they are members of"
  ON servers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM server_members
      WHERE server_members.server_id = servers.id
        AND server_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create servers"
  ON servers FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Server owners can update their servers"
  ON servers FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Server owners can delete their servers"
  ON servers FOR DELETE
  USING (auth.uid() = owner_id);

-- SERVER MEMBERS POLICIES
CREATE POLICY "Users can view server members"
  ON server_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM server_members sm
      WHERE sm.server_id = server_members.server_id
        AND sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can join servers"
  ON server_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave servers"
  ON server_members FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Server owners can remove members"
  ON server_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM servers
      WHERE servers.id = server_members.server_id
        AND servers.owner_id = auth.uid()
    )
  );

-- CHANNEL CATEGORIES POLICIES
CREATE POLICY "Users can view channel categories"
  ON channel_categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM server_members
      WHERE server_members.server_id = channel_categories.server_id
        AND server_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Server owners can insert categories"
  ON channel_categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM servers
      WHERE servers.id = server_id
        AND servers.owner_id = auth.uid()
    )
  );

CREATE POLICY "Server owners can update categories"
  ON channel_categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM servers
      WHERE servers.id = channel_categories.server_id
        AND servers.owner_id = auth.uid()
    )
  );

CREATE POLICY "Server owners can delete categories"
  ON channel_categories FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM servers
      WHERE servers.id = channel_categories.server_id
        AND servers.owner_id = auth.uid()
    )
  );

-- CHANNELS POLICIES
CREATE POLICY "Users can view channels in their servers"
  ON channels FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM server_members
      WHERE server_members.server_id = channels.server_id
        AND server_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Server owners can create channels"
  ON channels FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM servers
      WHERE servers.id = server_id
        AND servers.owner_id = auth.uid()
    )
  );

CREATE POLICY "Server owners can update channels"
  ON channels FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM servers
      WHERE servers.id = channels.server_id
        AND servers.owner_id = auth.uid()
    )
  );

CREATE POLICY "Server owners can delete channels"
  ON channels FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM servers
      WHERE servers.id = channels.server_id
        AND servers.owner_id = auth.uid()
    )
  );

-- MESSAGES POLICIES
CREATE POLICY "Users can view messages in accessible channels"
  ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM channels
      JOIN server_members ON server_members.server_id = channels.server_id
      WHERE channels.id = messages.channel_id
        AND server_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can send messages in accessible channels"
  ON messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM channels
      JOIN server_members ON server_members.server_id = channels.server_id
      WHERE channels.id = channel_id
        AND server_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own messages"
  ON messages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own messages"
  ON messages FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Server owners can delete messages in their servers"
  ON messages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM channels
      JOIN servers ON servers.id = channels.server_id
      WHERE channels.id = messages.channel_id
        AND servers.owner_id = auth.uid()
    )
  );

-- DIRECT MESSAGE CHANNELS POLICIES
CREATE POLICY "Users can view their DM channels"
  ON direct_message_channels FOR SELECT
  USING (id IN (SELECT get_user_dm_channels(auth.uid())));

CREATE POLICY "Users can create DM channels"
  ON direct_message_channels FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- DIRECT MESSAGE PARTICIPANTS POLICIES
CREATE POLICY "Users can view DM participants"
  ON direct_message_participants FOR SELECT
  USING (dm_channel_id IN (SELECT get_user_dm_channels(auth.uid())));

CREATE POLICY "Users can add DM participants"
  ON direct_message_participants FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- DIRECT MESSAGES POLICIES
CREATE POLICY "Users can view their direct messages"
  ON direct_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM direct_message_participants
      WHERE direct_message_participants.dm_channel_id = direct_messages.dm_channel_id
        AND direct_message_participants.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can send direct messages"
  ON direct_messages FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM direct_message_participants
      WHERE direct_message_participants.dm_channel_id = dm_channel_id
        AND direct_message_participants.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can mark messages as read"
  ON direct_messages FOR UPDATE
  USING (
    -- Can only update read_at column
    EXISTS (
      SELECT 1 FROM direct_message_participants
      WHERE direct_message_participants.dm_channel_id = direct_messages.dm_channel_id
        AND direct_message_participants.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can soft delete own messages"
  ON direct_messages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own direct messages"
  ON direct_messages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own direct messages"
  ON direct_messages FOR DELETE
  USING (auth.uid() = user_id);

-- USER PRESENCE POLICIES
CREATE POLICY "User presence is viewable by everyone"
  ON user_presence FOR SELECT
  USING (true);

CREATE POLICY "Users can update own presence"
  ON user_presence FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own presence"
  ON user_presence FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- NOTIFICATIONS POLICIES
CREATE POLICY "Users can view their own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DIRECT MESSAGE READ RECEIPTS POLICIES
CREATE POLICY "Users can view their own read receipts"
  ON direct_message_read_receipts FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own read receipts"
  ON direct_message_read_receipts FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- MEDIA FAVORITES POLICIES
CREATE POLICY "Users can view own favorites"
  ON media_favorites FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can add own favorites"
  ON media_favorites FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own favorites"
  ON media_favorites FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- BLOCKED USERS POLICIES
CREATE POLICY "Users can view their own blocks"
  ON blocked_users FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can block others"
  ON blocked_users FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unblock others"
  ON blocked_users FOR DELETE
  USING (auth.uid() = user_id);

-- MUTED CONVERSATIONS POLICIES
CREATE POLICY "Users can view their own mutes"
  ON muted_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can mute conversations"
  ON muted_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their mutes"
  ON muted_conversations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can unmute conversations"
  ON muted_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- MESSAGE REACTIONS POLICIES
CREATE POLICY "Anyone can view reactions"
  ON message_reactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can add reactions"
  ON message_reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own reactions"
  ON message_reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- PART 7: REALTIME SETUP
-- ============================================================================

-- Add tables to realtime publication (safe to run multiple times)
DO $$
BEGIN
  -- Check and add each table if not already in publication
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'direct_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'user_presence') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE user_presence;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'server_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE server_members;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'channels') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE channels;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'servers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE servers;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'friend_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE friend_requests;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'friendships') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE friendships;
  END IF;
END $$;

-- ============================================================================
-- PART 8: STORAGE BUCKETS
-- ============================================================================

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('banners', 'banners', true),
  ('group-icons', 'group-icons', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/zip']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'application/zip'];

-- Drop existing storage policies
DROP POLICY IF EXISTS "Allow all operations on avatars" ON storage.objects;
DROP POLICY IF EXISTS "Allow all operations on banners" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Banner images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own banner" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own banner" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own banner" ON storage.objects;
DROP POLICY IF EXISTS "Public access to avatars" ON storage.objects;
DROP POLICY IF EXISTS "Public access to banners" ON storage.objects;
DROP POLICY IF EXISTS "Public access to group icons" ON storage.objects;
DROP POLICY IF EXISTS "Public access to chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own attachments" ON storage.objects;

-- Create storage policies
CREATE POLICY "Public access to avatars"
ON storage.objects FOR ALL
TO public
USING (bucket_id = 'avatars');

CREATE POLICY "Public access to banners"
ON storage.objects FOR ALL
TO public
USING (bucket_id = 'banners');

CREATE POLICY "Public access to group icons"
ON storage.objects FOR ALL
TO public
USING (bucket_id = 'group-icons');

CREATE POLICY "Public access to chat attachments"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'chat-attachments');

CREATE POLICY "Authenticated users can upload chat attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "Users can delete their own attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'chat-attachments' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================
-- END OF COMPLETE SCHEMA
-- ============================================================================
