chaos answer...


1) Client

NEXT_PUBLIC_SUPABASE_URL=https://xyz.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=xyz
KLIPY=xyz
NEXT_PUBLIC_KLIPY_API_KEY=xyz
NEXT_PUBLIC_WS_URL=http://localhost:3001


2) Socket 

PORT=3001
SUPABASE_URL=https://xyz.supabase.co
SUPABASE_ANON_KEY=xyz
SUPABASE_SERVICE_ROLE_KEY=xyz
NODE_ENV=development

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Database Schema](#database-schema)
5. [Real-time System](#real-time-system)
6. [Authentication Flow](#authentication-flow)
7. [Key Features](#key-features)
8. [Deployment Guide](#deployment-guide)
9. [Environment Variables](#environment-variables)
10. [Development Setup](#development-setup)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (Browser)                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   Next.js App   │  │  Zustand Stores │  │ WebSocket Client│ │
│  │   (React 19)    │  │  (State Mgmt)   │  │ (Socket.io)     │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
└───────────┼────────────────────┼────────────────────┼──────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌───────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
│   Next.js API     │  │    Supabase     │  │  WebSocket Gateway  │
│   Routes          │  │  (PostgreSQL)   │  │  (Node.js/Socket.io)│
│   /app/api/*      │  │                 │  │  Port 3001          │
└───────────────────┘  └─────────────────┘  └─────────────────────┘
            │                    │                    │
            └────────────────────┼────────────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │      Supabase Cloud     │
                    │  ┌───────────────────┐  │
                    │  │    PostgreSQL     │  │
                    │  │    Database       │  │
                    │  └───────────────────┘  │
                    │  ┌───────────────────┐  │
                    │  │   Auth Service    │  │
                    │  └───────────────────┘  │
                    │  ┌───────────────────┐  │
                    │  │  Storage (Files)  │  │
                    │  └───────────────────┘  │
                    │  ┌───────────────────┐  │
                    │  │  Realtime (PG)    │  │
                    │  └───────────────────┘  │
                    └─────────────────────────┘
```

### Data Flow

1. **HTTP Requests**: Next.js handles page rendering and API routes
2. **Database Operations**: Server Actions communicate with Supabase
3. **Real-time Messages**: WebSocket Gateway handles instant messaging
4. **State Management**: Zustand stores manage client-side state
5. **Authentication**: Supabase Auth with JWT tokens

---

## Technology Stack

### Frontend
- **Next.js 15** - React framework with App Router
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Zustand** - State management
- **Socket.io Client** - WebSocket client
- **Framer Motion** - Animations
- **Lucide React** - Icons

### Backend
- **Supabase** - Backend-as-a-Service
  - PostgreSQL database
  - Authentication
  - Row Level Security (RLS)
  - Realtime subscriptions
  - Storage (avatars, attachments)
- **Node.js WebSocket Server** - Real-time messaging gateway
  - Socket.io
  - JWT authentication

---

## Project Structure

```
chat-app/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes
│   │   └── upload/               # File upload endpoints
│   ├── auth/                     # Authentication pages
│   │   ├── sign-in/
│   │   ├── sign-up/
│   │   ├── forgot-password/
│   │   └── confirm-signup/
│   ├── me/                       # Main dashboard (protected)
│   │   ├── page.tsx              # Idle/home area
│   │   ├── [user_tag]/           # DM chat routes
│   │   │   └── page.tsx
│   │   └── group_[id]/           # Group chat routes
│   │       └── page.tsx
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Landing page
│   └── globals.css               # Global styles
│
├── components/                   # React components
│   ├── auth/                     # Auth-related components
│   │   ├── auth-form.tsx
│   │   └── auth-scene.tsx
│   ├── dashboard/                # Main app components
│   │   ├── main-dashboard.tsx    # Main layout wrapper
│   │   ├── unified-sidebar.tsx   # Navigation sidebar
│   │   ├── dm-chat-ws.tsx        # DM chat (WebSocket)
│   │   ├── dm-chat-stable.tsx    # DM chat (Supabase)
│   │   ├── group-chat.tsx        # Group chat
│   │   └── idle-area.tsx         # Home/idle screen
│   ├── modals/                   # Modal dialogs
│   │   ├── user-profile-modal.tsx
│   │   ├── settings-modal.tsx
│   │   ├── create-group-chat-modal.tsx
│   │   ├── group-settings-modal.tsx
│   │   └── invite-to-group-modal.tsx
│   ├── ui/                       # Reusable UI components
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── typing-indicator.tsx
│   │   ├── message-context-menu.tsx
│   │   └── ...
│   └── loading/                  # Loading states
│       └── chat-skeleton.tsx
│
├── lib/                          # Core libraries
│   ├── actions/                  # Server Actions
│   │   ├── friends.ts            # Friend management
│   │   ├── messages.ts           # Message operations
│   │   ├── group-chats.ts        # Group chat operations
│   │   ├── blocks.ts             # Block/mute functionality
│   │   ├── presence.ts           # User presence/status
│   │   └── profile.ts            # Profile management
│   ├── hooks/                    # Custom React hooks
│   │   ├── use-chat-socket-singleton.ts  # Chat WebSocket hook
│   │   ├── use-global-socket.ts          # Global WebSocket events
│   │   └── use-typing-indicator.ts       # Typing indicator
│   ├── stores/                   # Zustand state stores
│   │   ├── chat-store.ts         # Chat state management
│   │   ├── friends-store.ts      # Friends list state
│   │   ├── block-store.ts        # Blocked users state
│   │   └── notification-store.ts # Notifications state
│   ├── supabase/                 # Supabase clients
│   │   ├── client.ts             # Browser client
│   │   ├── server.ts             # Server client
│   │   └── middleware.ts         # Auth middleware
│   ├── types/                    # TypeScript types
│   │   └── database.types.ts     # Database types
│   ├── utils/                    # Utility functions
│   │   └── sounds.ts             # Notification sounds
│   └── websocket-manager.ts      # WebSocket singleton
│
├── supabase/                     # Database
│   ├── complete_schema.sql       # Full database schema
│   └── migrations/               # Individual migrations
│
├── websocket-gateway/            # WebSocket server
│   ├── src/
│   │   └── index.ts              # Main server file
│   ├── package.json
│   └── .env.example
│
├── public/                       # Static assets
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.ts
```

---

## Database Schema

The database uses PostgreSQL via Supabase. The full schema is in `supabase/complete_schema.sql`.

### Core Tables

| Table | Description |
|-------|-------------|
| `profiles` | User profiles (username, tag, avatar, bio) |
| `friendships` | Friend relationships |
| `friend_requests` | Pending friend requests |
| `direct_message_channels` | DM channel metadata |
| `direct_message_participants` | Users in each DM channel |
| `direct_messages` | DM message content |
| `group_chats` | Group chat metadata |
| `group_chat_members` | Group membership |
| `group_chat_messages` | Group message content |
| `user_presence` | Online status & custom status |
| `blocked_users` | User blocks |
| `muted_conversations` | Muted DMs/groups |
| `message_read_status` | Read receipts |

### Key Functions (RPCs)

- `get_or_create_dm_channel` - Get/create DM channel between users
- `get_friends_with_dm_info` - Get friends list with DM data
- `get_group_chats_for_user` - Get user's group chats
- `block_user` / `unblock_user` - Block management
- `send_friend_request` / `accept_friend_request` - Friend system
- `mark_dm_messages_as_read` / `mark_group_messages_as_read` - Read status

---

## Real-time System

### WebSocket Gateway (`websocket-gateway/`)

A separate Node.js server handles real-time messaging:

**Events Handled:**
- `message:send` - Send new message
- `message:edit` - Edit existing message
- `message:delete` - Delete message
- `typing:start` / `typing:stop` - Typing indicators
- `conversation:join` / `conversation:leave` - Room management
- `group:invite` / `group:leave` / `group:update` - Group management
- `friend:request_action` - Friend requests
- `user:block` / `user:unblock` - Block management

**Events Emitted:**
- `message:received` - New message broadcast
- `message:persisted` - Message saved confirmation
- `message:edited` / `message:deleted` - Edit/delete broadcasts
- `typing:update` / `typing:global` - Typing indicator broadcasts
- `sidebar:message` / `sidebar:read` - Sidebar updates
- `group:left` / `group:invited` / `group:updated` - Group events
- `friend:request` - Friend request notifications

### Client-Side WebSocket Manager (`lib/websocket-manager.ts`)

A singleton class that manages the WebSocket connection:
- Automatic reconnection
- Event subscription system
- Room management
- Typing indicator coordination

---

## Authentication Flow

1. User signs up/signs in via Supabase Auth
2. Supabase returns JWT access token
3. Token stored in cookies (handled by `@supabase/ssr`)
4. Middleware validates token on protected routes
5. WebSocket server validates token for real-time connections

### Protected Routes

All routes under `/me/*` require authentication. The middleware in `middleware.ts` handles redirection.

---

## Key Features

### Direct Messages
- One-on-one messaging
- Real-time typing indicators
- Message editing and deletion
- Read receipts
- User blocking/muting

### Group Chats
- Multi-user conversations
- Group creation and management
- Member invitations
- Group settings (name, icon)
- System messages (join/leave/invite)

### Friend System
- Send/accept/decline friend requests
- Friends list with online status
- Quick DM access from friends

### User Presence
- Online/Idle/DND/Invisible status
- Custom status messages
- Real-time status updates

### Notifications
- Unread message counts
- Sound notifications
- Browser tab title updates

---

## Deployment Guide

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- Hosting provider (Vercel, Railway, etc.)

### Step 1: Clone Repository

```bash
git clone <repository-url>
cd chat-app
```

### Step 2: Set Up Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)

2. Go to **SQL Editor** in your Supabase dashboard

3. Copy the contents of `supabase/complete_schema.sql` and run it

4. Go to **Settings > API** and note down:
   - Project URL
   - `anon` public key
   - `service_role` secret key

5. Go to **Authentication > Providers** and configure:
   - Enable Email provider
   - (Optional) Enable OAuth providers

6. Go to **Storage** and verify these buckets exist:
   - `avatars`
   - `banners`
   - `group-icons`
   - `chat-attachments`

### Step 3: Configure Environment Variables

Create `.env.local` in the root directory:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# WebSocket Gateway URL (for client)
NEXT_PUBLIC_WS_URL=http://localhost:3001

# Klipy API (for GIFs/stickers) - Get free key at klipy.co
NEXT_PUBLIC_KLIPY_API_KEY=your-klipy-api-key
```

Create `.env` in `websocket-gateway/`:

```env
PORT=3001
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NODE_ENV=development
```

### Step 4: Install Dependencies

```bash
# Main app
npm install

# WebSocket gateway
cd websocket-gateway
npm install
cd ..
```

### Step 5: Run Development Servers

**Terminal 1 - Next.js App:**
```bash
npm run dev
```

**Terminal 2 - WebSocket Gateway:**
```bash
cd websocket-gateway
npm run dev
```

The app will be available at `http://localhost:3000`

### Step 6: Production Deployment

> **IMPORTANT:** The WebSocket server **cannot** be hosted on Vercel. Vercel only supports serverless functions which timeout after 10-60 seconds and don't support persistent WebSocket connections. You must use a different hosting provider for the WebSocket gateway.

#### Recommended Hosting Setup

| Component | Recommended Host | Why |
|-----------|------------------|-----|
| Next.js App | Vercel | Free tier, optimized for Next.js, automatic deployments |
| WebSocket Gateway | Render | Free tier (750 hrs/month), supports WebSockets, auto-deploy |

---

#### Step 6.1: Deploy WebSocket Gateway (Render)

1. **Create Render Account**
   - Go to [render.com](https://render.com) and sign up (free tier: 750 hours/month - enough for always-on)

2. **Create New Web Service**
   - Click **"New +"** → **"Web Service"**
   - Connect your GitHub account and select your repository

3. **Configure Service**
   - **Name:** `chat-websocket-gateway` (or whatever you want)
   - **Root Directory:** `websocket-gateway`
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** Free

4. **Add Environment Variables**
   - In the **Environment** section, add:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NODE_ENV=production
   ```
   - Note: Render auto-assigns `PORT`, don't set it manually

5. **Deploy**
   - Click **"Create Web Service"**
   - Render will build and deploy automatically
   - You'll get a URL like `https://chat-websocket-gateway.onrender.com`
   - **Save this URL** - you'll need it for the Next.js deployment

> **Note:** Free Render services spin down after 15 minutes of inactivity. The first request after spin-down takes ~30 seconds. For production with instant response, consider their paid tier ($7/month).

---

#### Step 6.2: Update CORS Configuration

Before deploying the Next.js app, update the CORS origins in `websocket-gateway/src/index.ts` to allow your Vercel domain:

```typescript
const io = new Server(httpServer, {
  cors: {
    origin: [
      'https://your-app.vercel.app',      // Your Vercel domain
      'https://your-custom-domain.com',   // Custom domain (if any)
      'http://localhost:3000'             // Keep for local development
    ],
    credentials: true
  }
})
```

Commit and push this change - Render will auto-redeploy.

---

#### Step 6.3: Deploy Next.js App (Vercel)

1. **Create Vercel Account**
   - Go to [vercel.com](https://vercel.com) and sign up

2. **Import Project**
   - Click **"Add New"** → **"Project"**
   - Import your GitHub repository

3. **Configure Project**
   - Framework Preset: Next.js (auto-detected)
   - Root Directory: `.` (leave default)

4. **Add Environment Variables**
   - In the **Environment Variables** section, add:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_WS_URL=wss://chat-websocket-gateway.onrender.com
   NEXT_PUBLIC_KLIPY_API_KEY=your-klipy-api-key
   ```
   - **Note:** Use `wss://` (not `https://`) for the WebSocket URL in production

5. **Deploy**
   - Click **Deploy**
   - Your app will be live at `https://your-app.vercel.app`

---

#### Step 6.4: Verify Deployment

1. Open your Vercel URL in a browser
2. Sign up/sign in to test authentication
3. Open browser DevTools → Network tab → WS filter
4. Verify WebSocket connection shows "101 Switching Protocols"
5. Test sending messages between two accounts

#### Troubleshooting Production Issues

| Issue | Solution |
|-------|----------|
| WebSocket won't connect | Check CORS origins include your Vercel domain |
| "wss://" connection failed | Ensure Render is using HTTPS (it does by default) |
| Messages not persisting | Verify `SUPABASE_SERVICE_ROLE_KEY` is set in Render |
| Auth not working | Check Supabase Auth settings allow your domain |
| Slow first connection | Free Render services spin down after inactivity - first request takes ~30s |

---

## Environment Variables

### Next.js App (`.env.local`)

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `NEXT_PUBLIC_WS_URL` | WebSocket server URL | Yes (defaults to localhost:3001 for dev) |
| `NEXT_PUBLIC_KLIPY_API_KEY` | Klipy API key for GIFs/stickers | Yes |

#### Getting a Klipy API Key

The chat application uses [Klipy](https://klipy.co) for GIF and sticker search functionality. To get your free API key:

1. Visit [klipy.co](https://klipy.co)
2. Sign up for a free account
3. Navigate to your dashboard to get your API key
4. Add the key to your `.env.local` file as `NEXT_PUBLIC_KLIPY_API_KEY`

### WebSocket Gateway (`.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3001) | No |
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |
| `NODE_ENV` | Environment (development/production) | No |

---

## Development Setup

### Quick Start

```bash
# 1. Clone and install
git clone <repo>
cd chat-app
npm install
cd websocket-gateway && npm install && cd ..

# 2. Set up environment variables (see above)

# 3. Run both servers
# Terminal 1:
npm run dev

# Terminal 2:
cd websocket-gateway && npm run dev
```

### Common Commands

```bash
# Next.js
npm run dev          # Development server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint

# WebSocket Gateway
cd websocket-gateway
npm run dev          # Development server (with hot reload)
npm run build        # Compile TypeScript
npm run start        # Start production server
```

### Debugging

- Check browser console for WebSocket connection logs
- WebSocket server logs to terminal with `[Connection]`, `[Message]`, `[Typing]` prefixes
- Supabase Dashboard > Logs for database/auth issues

---

## Troubleshooting

### WebSocket Connection Failed
- Verify `NEXT_PUBLIC_WS_URL` is correct
- Check WebSocket server is running
- Check CORS configuration in WebSocket server

### Authentication Issues
- Verify Supabase credentials
- Check cookies are being set (HTTPS required in production)
- Clear browser cookies and try again

### Database Errors
- Run the full schema SQL in Supabase SQL Editor
- Check RLS policies are enabled
- Verify service role key for WebSocket server

### Messages Not Appearing
- Check WebSocket connection in browser dev tools
- Verify user is authenticated
- Check Supabase realtime is enabled for tables

---

