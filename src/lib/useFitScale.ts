import { useLayoutEffect, useState } from "react";

/**
 * Shrinks a matrix table so the whole thing fits its container without
 * scrolling, as long as the screen allows it. Below `minScale` the table would
 * stop being readable, so it keeps its natural size and scrolls as before.
 */
export const useFitScale = <
  Container extends HTMLElement,
  Content extends HTMLElement,
>(
  minScale = 0.6,
) => {
  // Callback refs, not useRef: the table mounts after the data arrives, and the
  // measuring effect has to re-run when that happens.
  const [container, setContainer] = useState<Container | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [scale, setScale] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);

  useLayoutEffect(() => {
    if (!container || !content) return;

    const measure = () => {
      const available = container.clientWidth;
      const natural = content.offsetWidth;
      if (!available || !natural) return;
      const ratio = available / natural;
      // Shrinking past minScale would be unreadable and would still scroll, so
      // in that case the table keeps its natural size (and its sticky headers).
      setScale(ratio >= 1 || ratio < minScale ? 1 : ratio);
      setContentHeight(content.offsetHeight);
    };

    measure();
    // offsetWidth/offsetHeight ignore the transform, so observing the content
    // cannot feed back into itself.
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [container, content, minScale]);

  const fitted = scale < 1;

  return {
    containerRef: setContainer,
    contentRef: setContent,
    /** The table element itself, for the PNG export. */
    contentNode: content,
    /** Wrapper around the table: reserves the height the scaled table takes. */
    wrapperStyle: fitted
      ? { height: contentHeight * scale, overflow: "hidden" as const }
      : undefined,
    /** Applied to the table itself. */
    contentStyle: fitted
      ? { transform: `scale(${scale})`, transformOrigin: "top left" as const }
      : undefined,
  };
};
