"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Smile, Circle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateUserStatus, type UserStatus } from "@/lib/actions/presence";
import { Profile } from "@/lib/types/database.types";

interface SetStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile;
}

const statusOptions: { value: UserStatus; label: string; color: string; description: string }[] = [
  { value: "online", label: "Online", color: "#23a559", description: "Let everyone know you're available" },
  { value: "idle", label: "Idle", color: "#f0b232", description: "You're away from keyboard" },
  { value: "dnd", label: "Do Not Disturb", color: "#f23f43", description: "You don't want to be disturbed" },
  { value: "offline", label: "Invisible", color: "#80848e", description: "Appear offline to others" },
];

export function SetStatusModal({ isOpen, onClose, profile }: SetStatusModalProps) {
  const [mounted, setMounted] = useState(false);
  const [customStatus, setCustomStatus] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<UserStatus>("online");
  const [loading, setLoading] = useState(false);
  const [currentCustomStatus, setCurrentCustomStatus] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<UserStatus>("online");
  const supabase = createClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  // load your current status so we can show it when the modal opens
  useEffect(() => {
    if (!isOpen || !profile) return;

    const fetchCurrentStatus = async () => {
      const { data } = await supabase
        .from("user_presence")
        .select("status, custom_status")
        .eq("user_id", profile.id)
        .single();

      if (data) {
        setCurrentStatus(data.status as UserStatus);
        setSelectedStatus(data.status as UserStatus);
        setCurrentCustomStatus(data.custom_status);
        setCustomStatus(data.custom_status || "");
      }
    };

    fetchCurrentStatus();
  }, [isOpen, profile, supabase]);

  const handleSave = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      await updateUserStatus(selectedStatus, customStatus.trim() || null);

      onClose();
    } catch (error) {
      console.error("Error updating status:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearStatus = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      await updateUserStatus(selectedStatus, null);

      setCustomStatus("");
      setCurrentCustomStatus(null);
    } catch (error) {
      console.error("Error clearing status:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !mounted) return null;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <h2 className="text-xl font-bold text-gray-900">Set Your Status</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-200 transition-all duration-200 hover:scale-110"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Custom Status Input */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2.5">
              Custom Status
            </label>
            <div className="relative">
              <Smile className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={customStatus}
                onChange={(e) => setCustomStatus(e.target.value)}
                placeholder="What's happening?"
                maxLength={100}
                className="w-full pl-12 pr-4 py-3.5 bg-white border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 font-medium placeholder:text-gray-400"
              />
            </div>
            {currentCustomStatus && (
              <button
                onClick={handleClearStatus}
                disabled={loading}
                className="mt-2.5 text-sm text-blue-600 hover:text-blue-700 font-bold disabled:opacity-50 hover:underline"
              >
                Clear Status
              </button>
            )}
          </div>

          {/* Status Selection */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2.5">
              Activity Status
            </label>
            <div className="space-y-2.5">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedStatus(option.value)}
                  className={`w-full flex items-center gap-3.5 p-4 rounded-xl border-2 transition-all duration-200 hover:scale-[1.02] hover:shadow-md ${
                    selectedStatus === option.value
                      ? "border-blue-500 bg-gradient-to-r from-blue-50 to-purple-50 shadow-md"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  <div className="relative">
                    <Circle
                      className="w-5 h-5 flex-shrink-0"
                      fill={option.color}
                      stroke={option.color}
                    />
                    {selectedStatus === option.value && (
                      <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-blue-600 ring-2 ring-white"></div>
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-bold text-gray-900">{option.label}</div>
                    <div className="text-xs text-gray-500 font-medium">{option.description}</div>
                  </div>
                  {selectedStatus === option.value && (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-600 to-blue-700 flex items-center justify-center flex-shrink-0 shadow-md">
                      <svg
                        className="w-3.5 h-3.5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-200 rounded-xl transition-all duration-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-5 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md hover:shadow-lg hover:scale-105"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              "Save Status"
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
