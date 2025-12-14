import { useEffect, useRef, RefObject } from 'react';

interface EdgeScrollingOptions {
  /** Distance from edge in pixels to trigger scrolling (default: 50) */
  threshold?: number;
  /** Maximum scroll speed in pixels per frame (default: 10) */
  maxSpeed?: number;
  /** Enable horizontal scrolling (default: true) */
  horizontal?: boolean;
  /** Enable vertical scrolling (default: true) */
  vertical?: boolean;
}

/**
 * Hook that enables edge scrolling when mouse cursor approaches the edges of a scrollable container.
 * Automatically scrolls horizontally and/or vertically based on cursor position.
 */
export function useEdgeScrolling<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  options: EdgeScrollingOptions = {}
): void {
  const {
    threshold = 50,
    maxSpeed = 10,
    horizontal = true,
    vertical = true,
  } = options;

  const animationFrameRef = useRef<number | null>(null);
  const isScrollingRef = useRef(false);
  const mousePositionRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const stopScrolling = () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      isScrollingRef.current = false;
      mousePositionRef.current = null;
    };

    const isMouseOverContainer = (x: number, y: number): boolean => {
      const rect = container.getBoundingClientRect();
      return (
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom
      );
    };

    const calculateScroll = (mouseX: number, mouseY: number, rect: DOMRect) => {
      const containerWidth = rect.width;
      const containerHeight = rect.height;

      // Calculate distances from edges
      const distFromLeft = mouseX;
      const distFromRight = containerWidth - mouseX;
      const distFromTop = mouseY;
      const distFromBottom = containerHeight - mouseY;

      // Determine scroll direction and speed
      let scrollX = 0;
      let scrollY = 0;

      // Horizontal scrolling
      if (horizontal) {
        if (distFromLeft < threshold && container.scrollLeft > 0) {
          // Scroll left
          const factor = Math.max(0, 1 - (distFromLeft / threshold));
          scrollX = -maxSpeed * factor;
        } else if (distFromRight < threshold) {
          // Check if we can scroll right
          const maxScrollLeft = container.scrollWidth - container.clientWidth;
          if (container.scrollLeft < maxScrollLeft) {
            const factor = Math.max(0, 1 - (distFromRight / threshold));
            scrollX = maxSpeed * factor;
          }
        }
      }

      // Vertical scrolling
      if (vertical) {
        if (distFromTop < threshold && container.scrollTop > 0) {
          // Scroll up
          const factor = Math.max(0, 1 - (distFromTop / threshold));
          scrollY = -maxSpeed * factor;
        } else if (distFromBottom < threshold) {
          // Check if we can scroll down
          const maxScrollTop = container.scrollHeight - container.clientHeight;
          if (container.scrollTop < maxScrollTop) {
            const factor = Math.max(0, 1 - (distFromBottom / threshold));
            scrollY = maxSpeed * factor;
          }
        }
      }

      return { scrollX, scrollY };
    };

    const scroll = () => {
      if (!mousePositionRef.current) {
        stopScrolling();
        return;
      }

      // Check if mouse is still over container
      if (!isMouseOverContainer(mousePositionRef.current.x, mousePositionRef.current.y)) {
        stopScrolling();
        return;
      }

      const rect = container.getBoundingClientRect();
      const mouseX = mousePositionRef.current.x - rect.left;
      const mouseY = mousePositionRef.current.y - rect.top;

      const { scrollX, scrollY } = calculateScroll(mouseX, mouseY, rect);

      if (scrollX !== 0 || scrollY !== 0) {
        container.scrollBy({
          left: scrollX,
          top: scrollY,
          behavior: 'auto'
        });
        animationFrameRef.current = requestAnimationFrame(scroll);
      } else {
        stopScrolling();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Check if mouse is over the container
      if (!isMouseOverContainer(e.clientX, e.clientY)) {
        stopScrolling();
        return;
      }

      // Update current mouse position
      mousePositionRef.current = { x: e.clientX, y: e.clientY };

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const { scrollX, scrollY } = calculateScroll(mouseX, mouseY, rect);

      // Start or continue scrolling if needed
      if (scrollX !== 0 || scrollY !== 0) {
        if (!isScrollingRef.current) {
          isScrollingRef.current = true;
          animationFrameRef.current = requestAnimationFrame(scroll);
        }
      } else {
        stopScrolling();
      }
    };

    const handleMouseLeave = () => {
      stopScrolling();
    };

    // Use capture phase to catch events even if child elements handle them
    // This ensures we get mousemove events even when hovering over child elements
    const mouseMoveOptions = { capture: true, passive: true };
    const mouseLeaveOptions = { capture: true };
    
    container.addEventListener('mousemove', handleMouseMove, mouseMoveOptions);
    container.addEventListener('mouseleave', handleMouseLeave, mouseLeaveOptions);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove, mouseMoveOptions);
      container.removeEventListener('mouseleave', handleMouseLeave, mouseLeaveOptions);
      stopScrolling();
    };
  }, [containerRef, threshold, maxSpeed, horizontal, vertical]);
}

