import React, { useState, useEffect, useRef, useCallback } from "react";
import type { FileEntry } from "./types";

interface FilePickerProps {
  entries: FileEntry[];
  currentPath: string;
  filter: string;
  onNavigate: (dir: string) => void;
  onSelect: (filePath: string) => void;
  onClose: () => void;
}

export function FilePicker({
  entries,
  currentPath,
  filter,
  onNavigate,
  onSelect,
  onClose,
}: FilePickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = entries.filter((e) =>
    e.name.toLowerCase().startsWith(filter.toLowerCase()),
  );

  // Reset selection when entries or filter change
  useEffect(() => {
    setSelectedIndex(0);
  }, [entries, filter]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const confirm = useCallback(
    (entry: FileEntry) => {
      const full = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      if (entry.isDirectory) {
        onNavigate(full);
      } else {
        onSelect(full);
      }
    },
    [currentPath, onNavigate, onSelect],
  );

  const goUp = useCallback(() => {
    if (!currentPath) {
      onClose();
      return;
    }
    const parent = currentPath.includes("/")
      ? currentPath.slice(0, currentPath.lastIndexOf("/"))
      : "";
    onNavigate(parent);
  }, [currentPath, onNavigate, onClose]);

  // Keyboard is handled by the parent textarea's onKeyDown
  // We expose imperative methods via this hook
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          confirm(filtered[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Backspace" && filter === "") {
        e.preventDefault();
        goUp();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [filtered, selectedIndex, filter, confirm, goUp, onClose]);

  const breadcrumbs = currentPath ? currentPath.split("/") : [];

  return (
    <div className="fp-container">
      <div className="fp-header">
        <span className="fp-breadcrumb">
          <button
            className="fp-crumb"
            onClick={() => onNavigate("")}
          >
            /
          </button>
          {breadcrumbs.map((seg, i) => {
            const partial = breadcrumbs.slice(0, i + 1).join("/");
            return (
              <React.Fragment key={i}>
                <span className="fp-crumb-sep">/</span>
                <button
                  className="fp-crumb"
                  onClick={() => onNavigate(partial)}
                >
                  {seg}
                </button>
              </React.Fragment>
            );
          })}
        </span>
      </div>
      <div className="fp-list" ref={listRef}>
        {filtered.length === 0 && (
          <div className="fp-empty">No matches</div>
        )}
        {filtered.map((entry, i) => (
          <div
            key={entry.name}
            className={`fp-item${i === selectedIndex ? " fp-item-selected" : ""}`}
            onMouseEnter={() => setSelectedIndex(i)}
            onClick={() => confirm(entry)}
          >
            <span className="fp-icon">
              {entry.isDirectory ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                  <path d="M2 4h4l2 2h6v7H2z" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                  <path d="M4 2h5l3 3v9H4z" /><path d="M9 2v3h3" />
                </svg>
              )}
            </span>
            <span className="fp-name">{entry.name}</span>
            {entry.isDirectory && (
              <span className="fp-arrow">›</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
