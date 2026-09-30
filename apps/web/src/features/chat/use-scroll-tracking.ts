import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ScrollTracking, UseScrollTrackingParams } from './chat.types';

export const PROMPT_ATTRIBUTE = 'data-prompt-id';

const BOTTOM_THRESHOLD_PX = 80;
const SCROLL_PADDING_PX = 16;
const SELECT_LOCK_MS = 600;
// Observe only the top 30% of the container: a prompt becomes active when its
// top edge crosses into that band.
const ACTIVE_BAND_MARGIN = '0px 0px -70% 0px';

function prefersReducedMotion(): boolean {
  return (
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );
}

function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

function findPrompt(container: HTMLElement, id: string): HTMLElement | null {
  for (const node of container.querySelectorAll<HTMLElement>(
    `[${PROMPT_ATTRIBUTE}]`,
  )) {
    if (node.getAttribute(PROMPT_ATTRIBUTE) === id) return node;
  }
  return null;
}

function isNearBottom(element: HTMLElement): boolean {
  return (
    element.scrollHeight - element.scrollTop - element.clientHeight <=
    BOTTOM_THRESHOLD_PX
  );
}

export function useScrollTracking({
  promptIds,
  resetKey,
}: UseScrollTrackingParams): ScrollTracking {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [observedActiveId, setObservedActiveId] = useState<string | null>(null);
  const [lockedId, setLockedId] = useState<string | null>(null);
  const [trackedKey, setTrackedKey] = useState(resetKey);
  const pinnedRef = useRef(true);
  const prependAnchorRef = useRef<number | null>(null);
  const promptKey = promptIds.join('\n');
  const ids = useMemo(
    () => (promptKey ? promptKey.split('\n') : []),
    [promptKey],
  );

  // A different conversation starts pinned to the bottom with no highlight.
  if (trackedKey !== resetKey) {
    setTrackedKey(resetKey);
    setObservedActiveId(null);
    setLockedId(null);
    setIsAtBottom(true);
  }

  useEffect(() => {
    pinnedRef.current = true;
    prependAnchorRef.current = null;
  }, [resetKey]);

  useEffect(() => {
    if (!container) return;
    const onScroll = () => {
      const pinned = isNearBottom(container);
      pinnedRef.current = pinned;
      setIsAtBottom(pinned);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [container]);

  useEffect(() => {
    if (!container || !content || typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      const anchor = prependAnchorRef.current;
      if (anchor !== null) {
        // Older messages were prepended: keep the same distance from the bottom.
        prependAnchorRef.current = null;
        container.scrollTop = container.scrollHeight - anchor;
      } else if (pinnedRef.current) {
        container.scrollTop = container.scrollHeight;
      }
      setIsOverflowing(container.scrollHeight > container.clientHeight + 1);
    });
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [container, content]);

  useEffect(() => {
    if (!container || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute(PROMPT_ATTRIBUTE);
          if (!id) continue;
          if (entry.isIntersecting) {
            setObservedActiveId(id);
          } else if (
            entry.rootBounds &&
            entry.boundingClientRect.top >= entry.rootBounds.bottom
          ) {
            // The prompt left the band downward (reader scrolled up), so the
            // prompt before it is the one being read.
            const previous = ids[ids.indexOf(id) - 1] ?? null;
            setObservedActiveId((current) =>
              current === id ? previous : current,
            );
          }
        }
      },
      { root: container, rootMargin: ACTIVE_BAND_MARGIN, threshold: 0 },
    );
    for (const id of ids) {
      const node = findPrompt(container, id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [container, ids]);

  useEffect(() => {
    if (lockedId === null) return;
    const timer = window.setTimeout(() => setLockedId(null), SELECT_LOCK_MS);
    return () => window.clearTimeout(timer);
  }, [lockedId]);

  const scrollToPrompt = useCallback(
    (id: string) => {
      if (!container) return;
      const node = findPrompt(container, id);
      if (!node) return;
      setLockedId(id);
      pinnedRef.current = false;
      container.scrollTo({
        top: Math.max(0, node.offsetTop - SCROLL_PADDING_PX),
        behavior: scrollBehavior(),
      });
      node.focus({ preventScroll: true });
    },
    [container],
  );

  const scrollToBottom = useCallback(() => {
    if (!container) return;
    pinnedRef.current = true;
    setIsAtBottom(true);
    container.scrollTo({
      top: container.scrollHeight,
      behavior: scrollBehavior(),
    });
  }, [container]);

  const preserveScrollPosition = useCallback(() => {
    if (!container) return;
    prependAnchorRef.current = container.scrollHeight - container.scrollTop;
  }, [container]);

  return {
    containerRef: setContainer,
    contentRef: setContent,
    activePromptId: lockedId ?? observedActiveId,
    isOverflowing,
    isAtBottom,
    scrollToPrompt,
    scrollToBottom,
    preserveScrollPosition,
  };
}
