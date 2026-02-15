"use client";

import { Hash, Users, Pin, Search, Smile, Plus, Gift } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface Message {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  content: string;
  created_at: string;
}

export function ChatArea() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // TODO: Fetch messages from Supabase and subscribe to realtime updates
  const channelName = "general";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    // TODO: Send message to Supabase
    console.log("Sending message:", messageInput);

    setMessageInput("");
  };

  return (
    <div className="flex flex-col h-full bg-[#313338]">
      {/* Channel Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-[#26272b] shadow-sm">
        <div className="flex items-center gap-2">
          <Hash className="w-6 h-6 text-[#80848e]" />
          <span className="font-semibold text-white">{channelName}</span>
        </div>

        <div className="flex items-center gap-4">
          <button className="text-[#b5bac1] hover:text-[#dbdee1] transition-colors">
            <Users className="w-6 h-6" />
          </button>
          <button className="text-[#b5bac1] hover:text-[#dbdee1] transition-colors">
            <Pin className="w-6 h-6" />
          </button>
          <button className="text-[#b5bac1] hover:text-[#dbdee1] transition-colors">
            <Search className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-thumb-[#1e1f22] scrollbar-track-transparent">
        {/* Welcome Message */}
        {messages.length === 0 && (
          <div className="py-8">
            <div className="w-16 h-16 rounded-full bg-[#5865f2] flex items-center justify-center mb-4">
              <Hash className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-white text-3xl font-bold mb-2">
              Welcome to #{channelName}!
            </h2>
            <p className="text-[#b5bac1] text-sm">
              This is the start of the #{channelName} channel.
            </p>
          </div>
        )}

        {/* Message List */}
        {messages.map((message, index) => {
          const prevMessage = index > 0 ? messages[index - 1] : null;
          const isNewGroup =
            !prevMessage ||
            prevMessage.user_id !== message.user_id ||
            new Date(message.created_at).getTime() -
              new Date(prevMessage.created_at).getTime() >
              300000; // 5 minutes

          return (
            <MessageItem
              key={message.id}
              message={message}
              isNewGroup={isNewGroup}
            />
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="px-4 pb-6">
        <form onSubmit={handleSendMessage} className="relative">
          <button
            type="button"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[#b5bac1] hover:text-[#dbdee1] transition-colors"
          >
            <Plus className="w-6 h-6" />
          </button>

          <input
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder={`Message #${channelName}`}
            className="w-full bg-[#383a40] text-white rounded-lg pl-14 pr-12 py-3 focus:outline-none placeholder:text-[#6d6f78]"
          />

          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <button
              type="button"
              className="text-[#b5bac1] hover:text-[#dbdee1] transition-colors"
            >
              <Gift className="w-6 h-6" />
            </button>
            <button
              type="button"
              className="text-[#b5bac1] hover:text-[#dbdee1] transition-colors"
            >
              <Smile className="w-6 h-6" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface MessageItemProps {
  message: Message;
  isNewGroup: boolean;
}

function MessageItem({ message, isNewGroup }: MessageItemProps) {
  const timestamp = new Date(message.created_at);
  const timeString = timestamp.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (isNewGroup) {
    return (
      <div className="flex gap-4 py-1 px-4 hover:bg-[#2e3035] group">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-[#5865f2] flex items-center justify-center flex-shrink-0">
          {message.avatar_url ? (
            <img
              src={message.avatar_url}
              alt={message.username}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <span className="text-white font-semibold">
              {message.username.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Message Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-white hover:underline cursor-pointer">
              {message.username}
            </span>
            <span className="text-[#949ba4] text-xs">{timeString}</span>
          </div>
          <p className="text-[#dbdee1] break-words">{message.content}</p>
        </div>
      </div>
    );
  }

  // Compact message (same user within 5 minutes)
  return (
    <div className="flex gap-4 py-0.5 px-4 hover:bg-[#2e3035] group">
      {/* Timestamp (shown on hover) */}
      <div className="w-10 flex items-start justify-end flex-shrink-0">
        <span className="text-[#949ba4] text-xs opacity-0 group-hover:opacity-100 transition-opacity pt-0.5">
          {timestamp.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })}
        </span>
      </div>

      {/* Message Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[#dbdee1] break-words">{message.content}</p>
      </div>
    </div>
  );
}
