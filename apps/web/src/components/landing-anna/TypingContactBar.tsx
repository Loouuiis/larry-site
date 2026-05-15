"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const LINES = [
  "We're spending hours daily on updating spreadsheets and trackers",
  "My team is never aligned on tasks and responsibilities",
  "We always run over our budget",
  "Updates are scattered across tools",
  "Deadlines shift without early warning signals",
  "Difficult to know what tasks are actually blocked",
  "Information is outdated or inconsistent across tools",
  "There is no clear visibility on actual project status",
  "We are constantly chasing progress updates manually",
  "Critical risks surface too late in projects",
  "We are losing hours every day to manual coordination of work",
  "Delays are often missed until it's too late",
];

export function TypingContactBar() {
  const [typedText, setTypedText] = useState("");
  const [mode, setMode] = useState<"typing" | "input">("typing");
  const [inputValue, setInputValue] = useState("");
  const stateRef = useRef({ li: 0, ci: 0, deleting: false, paused: false });
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setTypedText(LINES[0]);
      return;
    }
    let timer: number | undefined;
    const tick = () => {
      const s = stateRef.current;
      if (s.paused) return;
      const line = LINES[s.li];
      if (!s.deleting) {
        s.ci++;
        setTypedText(line.slice(0, s.ci));
        if (s.ci === line.length) {
          s.deleting = true;
          timer = window.setTimeout(tick, 1900);
          return;
        }
        timer = window.setTimeout(tick, 36 + Math.random() * 30);
      } else {
        s.ci--;
        setTypedText(line.slice(0, s.ci));
        if (s.ci === 0) {
          s.deleting = false;
          s.li = (s.li + 1) % LINES.length;
          timer = window.setTimeout(tick, 250);
          return;
        }
        timer = window.setTimeout(tick, 14);
      }
    };
    timer = window.setTimeout(tick, 600);
    return () => {
      stateRef.current.paused = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const switchToInput = () => {
    if (mode === "input") return;
    stateRef.current.paused = true;
    setMode("input");
    // Carry over the currently-typed phrase so the user can edit it.
    setInputValue(typedText);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const msg = mode === "input" ? inputValue : typedText;
    const qs = msg ? `?msg=${encodeURIComponent(msg)}` : "";
    router.push(`/book-a-demo${qs}`);
  };

  return (
    <form className="contact__bar" autoComplete="off" onSubmit={onSubmit}>
      {mode === "typing" ? (
        <div
          className="contact__type-line"
          onClick={switchToInput}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              switchToInput();
            }
          }}
        >
          <span>{typedText}</span>
          <span className="contact__type-caret">|</span>
        </div>
      ) : (
        <input
          ref={inputRef}
          className="contact__input"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Tell us what's slowing your team down…"
          style={{ display: "block" }}
        />
      )}
      <button type="submit" className="contact__send" aria-label="Send">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5" />
          <path d="m5 12 7-7 7 7" />
        </svg>
      </button>
    </form>
  );
}
