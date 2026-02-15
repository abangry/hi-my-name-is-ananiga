"use client";

import { Hash, Volume2, ChevronDown, Plus, Settings, UserPlus } from "lucide-react";
import { useState } from "react";

interface Channel {
  id: string;
  name: string;
  type: "text" | "voice";
}

interface ChannelCategory {
  id: string;
  name: string;
  channels: Channel[];
}

export function ChannelSidebar() {
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  // TODO: Fetch from Supabase
  const serverName = "My Server";
  const categories: ChannelCategory[] = [
    {
      id: "1",
      name: "TEXT CHANNELS",
      channels: [
        { id: "c1", name: "general", type: "text" },
        { id: "c2", name: "random", type: "text" },
      ],
    },
  ];

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Server Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-[#1e1f22] shadow-sm hover:bg-[#35373c] cursor-pointer transition-colors">
        <span className="font-semibold text-white text-[15px]">{serverName}</span>
        <ChevronDown className="w-4 h-4 text-[#b5bac1]" />
      </div>

      {/* Channels List */}
      <div className="flex-1 overflow-y-auto pt-4 scrollbar-thin scrollbar-thumb-[#1e1f22] scrollbar-track-transparent">
        {categories.map((category) => (
          <div key={category.id} className="mb-2">
            {/* Category Header */}
            <button
              onClick={() => toggleCategory(category.id)}
              className="w-full px-2 py-1 flex items-center justify-between group hover:text-[#dbdee1] text-[#949ba4] text-xs font-semibold tracking-wide"
            >
              <div className="flex items-center gap-1">
                <ChevronDown
                  className={`w-3 h-3 transition-transform ${
                    collapsedCategories.has(category.id) ? "-rotate-90" : ""
                  }`}
                />
                {category.name}
              </div>
              <Plus className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            {/* Channels */}
            {!collapsedCategories.has(category.id) && (
              <div className="mt-1">
                {category.channels.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => setSelectedChannelId(channel.id)}
                    className={`
                      w-full px-2 py-1.5 mx-2 rounded flex items-center gap-1.5
                      transition-colors group
                      ${
                        selectedChannelId === channel.id
                          ? "bg-[#404249] text-white"
                          : "text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]"
                      }
                    `}
                  >
                    {channel.type === "text" ? (
                      <Hash className="w-5 h-5 text-[#80848e]" />
                    ) : (
                      <Volume2 className="w-5 h-5 text-[#80848e]" />
                    )}
                    <span className="text-[15px] font-medium">{channel.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* User Bar */}
      <div className="h-[52px] bg-[#232428] px-2 flex items-center justify-between">
        {/* User Info */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-full bg-[#5865f2] flex items-center justify-center">
            <span className="text-white text-sm font-semibold">U</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm font-semibold truncate">Username</div>
            <div className="text-[#949ba4] text-xs truncate">online</div>
          </div>
        </div>

        {/* User Controls */}
        <div className="flex items-center gap-1">
          <button className="w-8 h-8 flex items-center justify-center hover:bg-[#35373c] rounded transition-colors">
            <Settings className="w-5 h-5 text-[#b5bac1]" />
          </button>
        </div>
      </div>
    </div>
  );
}
