"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const MAX_LEN = 20;
const SENT_MSG_MS = 2000;
const CLEAR_TEXT_MS = 600;

export default function LeaveGoodbyeNote() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState<string>("");

  const inputRef = useRef<HTMLInputElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);

  const left = useMemo(() => MAX_LEN - text.length, [text]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const pill = pillRef.current;
      if (!pill) return;
      if (!pill.contains(e.target as Node)) close();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open, status]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Enter") submit();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, text, status]);

  function close() {
    if (status === "sending") return;
    setOpen(false);
    setStatus("idle");
    setMsg("");
    setText("");
  }

  async function submit() {
    const cleaned = text.trim();
    if (!cleaned) return;
    if (status === "sending") return;

    setStatus("sending");
    setMsg("");

    try {
      const res = await fetch("/api/goodbye", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: cleaned }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
      }

      if (!res.ok || !data?.ok) {
        setStatus("error");
        setMsg(data?.error ?? `Request failed (${res.status})`);
        return;
      }

      setStatus("sent");
      setMsg("Sent. Thank you");

      setTimeout(() => setText(""), CLEAR_TEXT_MS);

      setTimeout(() => {
        setMsg("");
        setStatus("idle");
      }, SENT_MSG_MS);
    } catch {
      setStatus("error");
      setMsg("Network error.");
    }
  }

  const canSend = status !== "sending" && text.trim().length > 0;

  return (
    <>
      <div className="mt-6 flex justify-start">
        <div
          ref={pillRef}
          role="button"
          tabIndex={0}
          aria-label="Leave a last note"
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setOpen(true);
            if (e.key === "Escape") close();
          }}
          className={[
            "relative inline-flex items-center",
            "rounded-2xl border border-gray-200 bg-white",
            "px-4 py-2 text-sm font-medium text-gray-700",
            "hover:bg-gray-50 transition-colors",
            "overflow-hidden",
            "focus:outline-none focus:ring-2 focus:ring-gray-200",
            "transition-[width] duration-300 ease-out",
            open ? "w-[min(520px,100%)]" : "w-[180px]",
            "cursor-pointer",
          ].join(" ")}
          style={{ transformOrigin: "left center" }}
        >
          
          <span
            className={[
              "whitespace-nowrap select-none",
              "transition-opacity duration-300 ease-out",
              open ? "opacity-0" : "opacity-100",
            ].join(" ")}
          >
            Leave a last note
          </span>

         
          <div
            className={[
              "absolute inset-0 flex items-center gap-3",
              "px-1 py-2",
              "transition-opacity duration-300 ease-out",
              open ? "opacity-100" : "opacity-0 pointer-events-none",
            ].join(" ")}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
              maxLength={MAX_LEN}
              placeholder="say something small…"
              className="w-full pl-3 bg-transparent outline-none text-gray-700 placeholder:text-gray-400 font-medium"
            />

            {msg ? (
              <span className={[
                "text-xs tabular-nums shrink-0 font-medium",
                status === "error" ? "text-red-500" : "text-green-600",
              ].join(" ")}>
                {msg}
              </span>
            ) : (
              <span className="text-xs text-gray-400 tabular-nums shrink-0">{left}</span>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                submit();
              }}
              disabled={!canSend}
              className={[
                "shrink-0 rounded-xl border px-3 py-1.5 text-xs font-medium transition",
                canSend
                  ? "border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
                  : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed",
              ].join(" ")}
              aria-label="Send note"
            >
              {status === "sending" ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>

    </>
  );
}