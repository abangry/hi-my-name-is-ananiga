"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

type NotePagerProps = {
  pages: string[];
  lastPageFooter?: ReactNode;
};

export default function NotePager({ pages, lastPageFooter }: NotePagerProps) {
  const safePages = useMemo(() => pages.filter(Boolean), [pages]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);

  // height animation
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState<number>(0);

  const lastIndex = safePages.length - 1;
  const isLast = index === lastIndex;

  const canPrev = index > 0;
  const canNext = index < lastIndex;

  const go = (next: number) => {
    if (next === index) return;
    if (next < 0 || next >= safePages.length) return;
    setPendingIndex(next);
    setPhase("out");
  };

  // swap page after fade-out
  useEffect(() => {
    if (phase !== "out") return;
    const t = setTimeout(() => {
      if (pendingIndex !== null) setIndex(pendingIndex);
      setPhase("in");
      setPendingIndex(null);
    }, 180);
    return () => clearTimeout(t);
  }, [phase, pendingIndex]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === "ArrowRight") go(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index]);

  // measure height whenever content changes
  useLayoutEffect(() => {
    if (!contentRef.current) return;

    const measure = () => {
      const h = contentRef.current?.scrollHeight ?? 0;
      setMaxH(h);
    };

    measure();

    // also re-measure on resize (font wrap changes)
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [index, isLast, safePages.length, lastPageFooter]);

  if (!safePages.length) return null;

  return (
    <div className="relative">
      {/* Height-animated wrapper */}
      <div
        className="overflow-hidden transition-[max-height] duration-300 ease-out"
        style={{ maxHeight: maxH ? `${maxH}px` : undefined }}
      >
        {/* Your existing fade/slide */}
        <div
          ref={contentRef}
          className={[
            "text-[17px] leading-relaxed text-gray-700",
            "transition-all duration-200 ease-out will-change-transform",
            phase === "out" ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0",
          ].join(" ")}
        >
          {safePages[index].split("\n\n").map((p, i) => (
            <p key={i} className={i === 0 ? "" : "mt-2"}>
              {p}
            </p>
          ))}

          {/* footer appears as part of last page content */}
          {isLast && lastPageFooter ? <div className="mt-6">{lastPageFooter}</div> : null}
        </div>
      </div>

      {/* Pager */}
      <div className="mt-12 flex items-center justify-between gap-4">
        <button
          onClick={() => go(index - 1)}
          disabled={!canPrev}
          className={[
            "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium transition w-10",
            canPrev
              ? "border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
              : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed",
          ].join(" ")}
          aria-label="Previous page"
        >
          ←
        </button>

        <div className="flex items-center gap-2">
          {safePages.map((_, i) => {
            const active = i === index;
            return (
              <button
                key={i}
                onClick={() => go(i)}
                aria-label={`Go to page ${i + 1}`}
                className={[
                  "h-2.5 rounded-full transition-all duration-200",
                  active ? "w-8 bg-gray-900" : "w-2.5 bg-gray-300 hover:bg-gray-400",
                ].join(" ")}
              />
            );
          })}
        </div>

        <button
          onClick={() => go(index + 1)}
          disabled={!canNext}
          className={[
            "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium transition w-10",
            canNext
              ? "border-gray-200 bg-white hover:bg-gray-50 text-gray-700"
              : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed",
          ].join(" ")}
          aria-label="Next page"
        >
          →
        </button>
      </div>
    </div>
  );
}