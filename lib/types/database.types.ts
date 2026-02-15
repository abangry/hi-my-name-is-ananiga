// TypeScript types for database schema
// Auto-generated types can be created with: npx supabase gen types typescript

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline'
export type ChannelType = 'text' | 'voice' | 'announcement'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          tag: string | null
          display_name: string | null
          avatar_url: string | null
          status: UserStatus
          custom_status: string | null
          profile_completed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          tag?: string | null
          display_name?: string | null
          avatar_url?: string | null
          status?: UserStatus
          custom_status?: string | null
          profile_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          tag?: string | null
          display_name?: string | null
          avatar_url?: string | null
          status?: UserStatus
          custom_status?: string | null
          profile_completed?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      servers: {
        Row: {
          id: string
          name: string
          icon_url: string | null
          owner_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          icon_url?: string | null
          owner_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          icon_url?: string | null
          owner_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      server_members: {
        Row: {
          id: string
          server_id: string
          user_id: string
          nickname: string | null
          joined_at: string
        }
        Insert: {
          id?: string
          server_id: string
          user_id: string
          nickname?: string | null
          joined_at?: string
        }
        Update: {
          id?: string
          server_id?: string
          user_id?: string
          nickname?: string | null
          joined_at?: string
        }
      }
      channel_categories: {
        Row: {
          id: string
          server_id: string
          name: string
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          server_id: string
          name: string
          position?: number
          created_at?: string
        }
        Update: {
          id?: string
          server_id?: string
          name?: string
          position?: number
          created_at?: string
        }
      }
      channels: {
        Row: {
          id: string
          server_id: string
          name: string
          description: string | null
          type: ChannelType
          position: number
          category_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          server_id: string
          name: string
          description?: string | null
          type?: ChannelType
          position?: number
          category_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          server_id?: string
          name?: string
          description?: string | null
          type?: ChannelType
          position?: number
          category_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          channel_id: string
          user_id: string | null
          content: string
          attachment_url: string | null
          reply_to_id: string | null
          edited_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          channel_id: string
          user_id?: string | null
          content: string
          attachment_url?: string | null
          reply_to_id?: string | null
          edited_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          channel_id?: string
          user_id?: string | null
          content?: string
          attachment_url?: string | null
          reply_to_id?: string | null
          edited_at?: string | null
          created_at?: string
        }
      }
      direct_message_channels: {
        Row: {
          id: string
          created_at: string
        }
        Insert: {
          id?: string
          created_at?: string
        }
        Update: {
          id?: string
          created_at?: string
        }
      }
      direct_message_participants: {
        Row: {
          id: string
          dm_channel_id: string
          user_id: string
        }
        Insert: {
          id?: string
          dm_channel_id: string
          user_id: string
        }
        Update: {
          id?: string
          dm_channel_id?: string
          user_id?: string
        }
      }
      direct_messages: {
        Row: {
          id: string
          dm_channel_id: string
          user_id: string | null
          content: string
          attachment_url: string | null
          edited_at: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          dm_channel_id: string
          user_id?: string | null
          content: string
          attachment_url?: string | null
          edited_at?: string | null
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          dm_channel_id?: string
          user_id?: string | null
          content?: string
          attachment_url?: string | null
          edited_at?: string | null
          read_at?: string | null
          created_at?: string
        }
      }
      user_presence: {
        Row: {
          user_id: string
          status: UserStatus
          last_seen: string
          updated_at: string
        }
        Insert: {
          user_id: string
          status?: UserStatus
          last_seen?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          status?: UserStatus
          last_seen?: string
          updated_at?: string
        }
      }
    }
    Views: {
      user_dm_channels: {
        Row: {
          dm_channel_id: string
          created_at: string
          other_user_id: string
          other_username: string
          other_display_name: string | null
          other_avatar_url: string | null
          other_user_status: UserStatus
          last_message_content: string | null
          last_message_at: string | null
        }
      }
      user_servers_with_info: {
        Row: {
          server_id: string
          server_name: string
          server_icon: string | null
          owner_id: string
          joined_at: string
          nickname: string | null
          channel_count: number
          member_count: number
        }
      }
    }
    Functions: {
      get_or_create_dm_channel: {
        Args: { other_user_id: string }
        Returns: string
      }
      get_dm_channel_id: {
        Args: { user_id_1: string; user_id_2: string }
        Returns: string | null
      }
      get_unread_message_count: {
        Args: { p_channel_id: string; p_last_read_at: string }
        Returns: number
      }
      get_unread_dm_count: {
        Args: { p_dm_channel_id: string; p_last_read_at: string }
        Returns: number
      }
    }
  }
}

// Convenience types for common queries
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Server = Database['public']['Tables']['servers']['Row']
export type ServerMember = Database['public']['Tables']['server_members']['Row']
export type Channel = Database['public']['Tables']['channels']['Row']
export type ChannelCategory = Database['public']['Tables']['channel_categories']['Row']
export type Message = Database['public']['Tables']['messages']['Row']
export type DirectMessageChannel = Database['public']['Tables']['direct_message_channels']['Row']
export type DirectMessage = Database['public']['Tables']['direct_messages']['Row']
export type UserPresence = Database['public']['Tables']['user_presence']['Row']

// Extended types with relations
export type MessageWithUser = Message & {
  user: Profile | null
  reply_to?: Message | null
}

export type ChannelWithCategory = Channel & {
  category: ChannelCategory | null
}

export type ServerWithMemberInfo = Server & {
  member_count: number
  channel_count: number
  is_owner: boolean
}

export type DMChannelWithInfo = Database['public']['Views']['user_dm_channels']['Row']

export type ServerWithInfo = Database['public']['Views']['user_servers_with_info']['Row']
