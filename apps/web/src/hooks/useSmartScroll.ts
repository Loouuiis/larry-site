"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Smart scroll hook for chat UIs.
 * - Instant scroll to bottom on mount (no visible animation)
 * - Smooth scroll on new messages only if user is at bottom
 * - "New messages" indicator when user has scrolled up
 */
export function useSmartScroll(messages: unknown[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const mountedRef = useRef(false);
  const lastMessageCountRef = useRef(messages.length);

  // Instant scroll on mount — no animation visible
  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
    mountedRef.current = true;
  }, []);

  // Track whether user is at the bottom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function handleScroll() {
      if (!container) return;
      const threshold = 40;
      const atBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
      setIsAtBottom(atBottom);
      if (atBottom) setHasNewMessages(false);
    }

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Handle new messages
  useEffect(() => {
    if (!mountedRef.current) return;
    if (messages.length <= lastMessageCountRef.current) {
      lastMessageCountRef.current = messages.length;
      // Conversation switched — instant scroll
      endRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
      return;
    }

    lastMessageCountRef.current = messages.length;

    if (isAtBottom) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setHasNewMessages(true);
    }
  }, [messages.length, isAtBottom]);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior });
    setHasNewMessages(false);
  }, []);

  return { containerRef, endRef, hasNewMessages, scrollToBottom };
}
