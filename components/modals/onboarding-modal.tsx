"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Profile } from "@/lib/types/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface OnboardingModalProps {
  userId: string;
  onComplete: (profile: Profile) => void;
}

export function OnboardingModal({ userId, onComplete }: OnboardingModalProps) {
  const [tag, setTag] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);

  const validateTag = (value: string) => {
    // Only letters, numbers, underscore, hyphen
    const tagRegex = /^[a-zA-Z0-9_-]+$/;

    if (value.length === 0) {
      setTagError(null);
      return false;
    }

    if (value.length < 3) {
      setTagError("Tag must be at least 3 characters");
      return false;
    }

    if (value.length > 20) {
      setTagError("Tag must be less than 20 characters");
      return false;
    }

    if (!tagRegex.test(value)) {
      setTagError("Tag can only contain letters, numbers, - and _");
      return false;
    }

    setTagError(null);
    return true;
  };

  const handleTagChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase(); // Force lowercase
    setTag(value);
    validateTag(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate
    if (!validateTag(tag)) {
      setError("Please fix the tag errors");
      return;
    }

    if (displayName.trim().length === 0) {
      setError("Display name is required");
      return;
    }

    if (displayName.trim().length < 2) {
      setError("Display name must be at least 2 characters");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();

      // Update profile
      const { data, error: updateError } = await supabase
        .from("profiles")
        .update({
          tag: tag.toLowerCase(),
          display_name: displayName.trim(),
          username: displayName.trim(), // Also update username
          profile_completed: true,
        })
        .eq("id", userId)
        .select()
        .single();

      if (updateError) {
        // Check if it's a unique constraint violation
        if (updateError.code === "23505") {
          setTagError("This tag is already taken");
          setError("This tag is already taken. Please choose another.");
        } else {
          throw updateError;
        }
        return;
      }

      if (data) {
        onComplete(data as Profile);
      }
    } catch (err) {
      console.error("Onboarding error:", err);
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-[#313338] rounded-lg p-6 max-w-md w-full shadow-2xl">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">
            Complete Your Profile
          </h2>
          <p className="text-[#b5bac1] text-sm">
            Set up your unique tag and display name to get started
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tag Input */}
          <div>
            <Label htmlFor="tag" className="text-[#b5bac1] text-sm font-medium">
              Tag (Required)
            </Label>
            <div className="mt-1 flex items-center">
              <span className="text-[#b5bac1] text-lg mr-1">@</span>
              <Input
                id="tag"
                type="text"
                value={tag}
                onChange={handleTagChange}
                placeholder="yourname123"
                required
                disabled={isLoading}
                className={`bg-[#1e1f22] border-none text-white placeholder:text-[#6d6f78] ${
                  tagError ? "ring-2 ring-red-500" : ""
                }`}
                autoFocus
              />
            </div>
            {tagError && (
              <p className="text-red-400 text-xs mt-1">{tagError}</p>
            )}
            {!tagError && tag.length > 0 && (
              <p className="text-green-400 text-xs mt-1">@{tag} is available!</p>
            )}
            <p className="text-[#949ba4] text-xs mt-1">
              3-20 characters, letters, numbers, - and _ only
            </p>
          </div>

          {/* Display Name Input */}
          <div>
            <Label
              htmlFor="displayName"
              className="text-[#b5bac1] text-sm font-medium"
            >
              Display Name (Required)
            </Label>
            <Input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="John Doe"
              required
              disabled={isLoading}
              className="mt-1 bg-[#1e1f22] border-none text-white placeholder:text-[#6d6f78]"
            />
            <p className="text-[#949ba4] text-xs mt-1">
              This is how others will see you
            </p>
          </div>

          {/* Profile Picture (Optional) - Coming Soon */}
          <div>
            <Label className="text-[#b5bac1] text-sm font-medium">
              Profile Picture (Optional)
            </Label>
            <div className="mt-2 p-4 border-2 border-dashed border-[#4e5058] rounded bg-[#2b2d31] text-center">
              <p className="text-[#949ba4] text-sm">
                Default avatar will be used for now
              </p>
              <p className="text-[#6d6f78] text-xs mt-1">
                You can change this later in settings
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isLoading || !!tagError || !tag || !displayName}
            className="w-full bg-[#5865f2] hover:bg-[#4752c4] text-white font-medium py-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Setting up...
              </>
            ) : (
              "Complete Setup"
            )}
          </Button>
        </form>

        <p className="text-[#6d6f78] text-xs text-center mt-4">
          You cannot skip this step
        </p>
      </div>
    </div>
  );
}
