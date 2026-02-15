"use client";

import { X, Upload, Image as ImageIcon } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { wsManager } from "@/lib/websocket-manager";

interface GroupSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  groupIconUrl: string | null;
  onUpdate: () => void;
}

export function GroupSettingsModal({
  isOpen,
  onClose,
  groupId,
  groupName: initialGroupName,
  groupIconUrl: initialIconUrl,
  onUpdate,
}: GroupSettingsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [groupName, setGroupName] = useState(initialGroupName);
  const [iconUrl, setIconUrl] = useState<string | null>(initialIconUrl);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialIconUrl);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setGroupName(initialGroupName);
    setIconUrl(initialIconUrl);
    setPreviewUrl(initialIconUrl);
    setIconFile(null);
  }, [initialGroupName, initialIconUrl, isOpen]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert("File size must be less than 5MB");
      return;
    }

    // Check file type
    if (!file.type.startsWith("image/")) {
      alert("File must be an image");
      return;
    }

    setIconFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!groupName.trim()) {
      alert("Group name cannot be empty");
      return;
    }

    setSaving(true);
    console.log("[GroupSettingsModal] Saving group settings:", { groupId, groupName });

    try {
      let newIconUrl = iconUrl;

      // Upload new icon if file was selected
      if (iconFile) {
        console.log("[GroupSettingsModal] Uploading new icon");
        const fileExt = iconFile.name.split(".").pop();
        const fileName = `group-${groupId}-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(fileName, iconFile, {
            cacheControl: "3600",
            upsert: true,
          });

        if (uploadError) {
          console.error("[GroupSettingsModal] Upload error:", uploadError);
          alert("Failed to upload icon");
          setSaving(false);
          return;
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from("avatars")
          .getPublicUrl(fileName);

        newIconUrl = publicUrl;
        console.log("[GroupSettingsModal] New icon URL:", newIconUrl);
      }

      // Update group in database
      const { error: updateError } = await supabase
        .from("group_chats")
        .update({
          name: groupName.trim(),
          icon_url: newIconUrl,
        })
        .eq("id", groupId);

      if (updateError) {
        console.error("[GroupSettingsModal] Update error:", updateError);
        alert("Failed to update group settings");
        setSaving(false);
        return;
      }

      console.log("[GroupSettingsModal] Group updated successfully");

      // Emit WebSocket event for real-time update to all group members
      wsManager.emitGroupUpdate(groupId, groupName.trim(), newIconUrl || undefined);

      onUpdate();
      onClose();
    } catch (error) {
      console.error("[GroupSettingsModal] Error:", error);
      alert("An error occurred while saving");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !mounted) return null;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full h-full sm:h-auto sm:max-w-md bg-white sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Group Settings</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 flex-1 overflow-y-auto">
          {/* Group Icon - Responsive */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2 sm:mb-3">
              Group Icon
            </label>
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center overflow-hidden flex-shrink-0">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Group icon"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                )}
              </div>
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 sm:px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">Upload Image</span>
                  <span className="sm:hidden">Upload</span>
                </button>
                <p className="text-xs text-gray-500 mt-2">
                  256x256px, max 5MB
                </p>
              </div>
            </div>
          </div>

          {/* Group Name - Responsive */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Group Name
            </label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={100}
              placeholder="Enter group name"
              className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/30"
            />
            <div className="text-xs text-gray-500 mt-1 text-right">
              {groupName.length}/100
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-gray-200 flex gap-2 justify-end bg-gray-50 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 sm:px-4 py-2 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !groupName.trim()}
            className="px-3 sm:px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 text-white hover:bg-[#04527a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
