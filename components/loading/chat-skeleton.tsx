"use client";

/**
 * Skeleton loading component for chat conversations
 * Used when switching between DMs/groups - shows message placeholders
 */
export function ChatSkeleton() {
  return (
    <div className="h-full border-t-2 border-t-blue-600/20 bg-white/80 backdrop-blur-sm flex flex-col">
      {/* Top Navbar Skeleton */}
      <div className="h-14 px-2 mt-4 mx-4 flex items-center bg-white/40 backdrop-blur-3xl rounded-full border border-black/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse" />
          <div className="flex flex-col gap-1">
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      </div>

      {/* Messages Skeleton */}
      <div className="flex-1 overflow-hidden px-4 pt-6 space-y-4">
        {/* Message skeletons with varying widths */}
        {[
          { avatar: true, width: "w-3/4" },
          { avatar: false, width: "w-1/2" },
          { avatar: true, width: "w-2/3" },
          { avatar: false, width: "w-1/3" },
          { avatar: true, width: "w-4/5" },
          { avatar: false, width: "w-1/2" },
          { avatar: true, width: "w-2/3" },
        ].map((item, i) => (
          <div key={i} className={`flex items-start gap-3 ${item.avatar ? "pt-4" : ""}`}>
            {item.avatar && (
              <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
            )}
            <div className={`flex-1 ${!item.avatar ? "ml-[52px]" : ""}`}>
              {item.avatar && (
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
                  <div className="h-3 w-12 bg-gray-100 rounded animate-pulse" />
                </div>
              )}
              <div className={`h-4 ${item.width} bg-gray-100 rounded animate-pulse`} />
              {i % 3 === 0 && (
                <div className="h-4 w-1/3 bg-gray-100 rounded animate-pulse mt-1" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input Area Skeleton */}
      <div className="px-4 pb-4 pt-2">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
          <div className="flex-1 h-12 bg-gray-100 rounded-full animate-pulse" />
          <div className="flex items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse" />
            <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse" />
            <div className="w-10 h-10 rounded-full bg-gray-100 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
