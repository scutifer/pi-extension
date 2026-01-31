import React, { useEffect, useState, useCallback, useRef } from "react";

function truncate(text: string, max: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return compact.slice(0, max - 1) + "…";
}

export interface TocEntry {
  id: string;
  text: string;
  role: "user" | "assistant";
}

export function extractTocEntries(container: HTMLElement | null): TocEntry[] {
  if (!container) return [];
  const entries: TocEntry[] = [];

  // User messages
  container.querySelectorAll(".msg-user").forEach((el) => {
    const id = el.id;
    const text = el.textContent?.trim() || "";
    if (id && text) entries.push({ id, text, role: "user" });
  });

  // Assistant text blocks (not thinking, not tool calls)
  container.querySelectorAll(".msg-assistant .msg-text").forEach((el) => {
    const msg = el.closest(".msg-assistant");
    const id = msg?.id;
    const text = el.textContent?.trim() || "";
    if (id && text) entries.push({ id, text, role: "assistant" });
  });

  // Sort by DOM order
  const allEls = Array.from(container.querySelectorAll("[id]"));
  const idOrder = new Map(allEls.map((el, i) => [el.id, i]));
  entries.sort((a, b) => (idOrder.get(a.id) ?? 0) - (idOrder.get(b.id) ?? 0));

  return entries;
}

interface TableOfContentsProps {
  entries: TocEntry[];
  scrollContainer: HTMLElement | null;
}

export function TableOfContents({ entries, scrollContainer }: TableOfContentsProps) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Track active heading via IntersectionObserver
  useEffect(() => {
    if (entries.length === 0) return;

    const observer = new IntersectionObserver(
      (observations) => {
        for (const obs of observations) {
          if (obs.isIntersecting) {
            setActiveId(obs.target.id);
            break;
          }
        }
      },
      {
        root: scrollContainer,
        rootMargin: "-5% 0px -85% 0px",
        threshold: 0,
      }
    );

    for (const e of entries) {
      const el = document.getElementById(e.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [entries, scrollContainer]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  const handleClick = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ block: "center" });
      setActiveId(id);
    }
  }, []);

  if (entries.length === 0) return null;

  return (
    <>
      {/* Fixed trigger: 3 horizontal lines on the left edge, vertically centered */}
      <button
        ref={triggerRef}
        className={`toc-trigger ${open ? "toc-trigger-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Table of contents"
      >
        <span className="toc-trigger-line" />
        <span className="toc-trigger-line toc-trigger-line-short" />
        <span className="toc-trigger-line" />
      </button>

      {/* Popover card */}
      {open && (
        <div className="toc-popover" ref={popoverRef}>
          <div className="toc-popover-title">CONTENTS</div>
          <nav className="toc-popover-nav">
            {entries.map((entry) => (
              <button
                key={entry.id}
                className={`toc-popover-item ${activeId === entry.id ? "toc-popover-item-active" : ""}`}
                onClick={() => handleClick(entry.id)}
                title={entry.text}
              >
                <span className={`toc-popover-role toc-popover-role-${entry.role}`}>{entry.role}</span>
                <span className="toc-popover-text">{truncate(entry.text, 80)}</span>
              </button>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
