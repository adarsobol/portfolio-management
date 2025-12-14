import { useEffect, useRef } from 'react';

interface GlobalEdgeScrollingOptions {
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
 * Hook that enables edge scrolling globally for the entire viewport/window.
 * When mouse cursor approaches the edges of the browser window, it automatically scrolls.
 */
export function useGlobalEdgeScrolling(options: GlobalEdgeScrollingOptions = {}): void {
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
    const stopScrolling = () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      isScrollingRef.current = false;
      mousePositionRef.current = null;
    };

    const calculateScroll = (mouseX: number, mouseY: number) => {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      // Calculate distances from edges
      const distFromLeft = mouseX;
      const distFromRight = windowWidth - mouseX;
      const distFromTop = mouseY;
      const distFromBottom = windowHeight - mouseY;

      // Determine scroll direction and speed
      let scrollX = 0;
      let scrollY = 0;

      // Horizontal scrolling
      if (horizontal) {
        const maxScrollLeft = document.documentElement.scrollWidth - windowWidth;
        if (distFromLeft < threshold && window.scrollX > 0) {
          // Scroll left
          const factor = Math.max(0, 1 - (distFromLeft / threshold));
          scrollX = -maxSpeed * factor;
        } else if (distFromRight < threshold && window.scrollX < maxScrollLeft) {
          // Scroll right
          const factor = Math.max(0, 1 - (distFromRight / threshold));
          scrollX = maxSpeed * factor;
        }
      }

      // Vertical scrolling
      if (vertical) {
        const maxScrollTop = document.documentElement.scrollHeight - windowHeight;
        if (distFromTop < threshold && window.scrollY > 0) {
          // Scroll up
          const factor = Math.max(0, 1 - (distFromTop / threshold));
          scrollY = -maxSpeed * factor;
        } else if (distFromBottom < threshold && window.scrollY < maxScrollTop) {
          // Scroll down
          const factor = Math.max(0, 1 - (distFromBottom / threshold));
          scrollY = maxSpeed * factor;
        }
      }

      return { scrollX, scrollY };
    };

    const scroll = () => {
      if (!mousePositionRef.current) {
        stopScrolling();
        return;
      }

      const { scrollX, scrollY } = calculateScroll(
        mousePositionRef.current.x,
        mousePositionRef.current.y
      );

      if (scrollX !== 0 || scrollY !== 0) {
        window.scrollBy({
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
      // Update current mouse position
      mousePositionRef.current = { x: e.clientX, y: e.clientY };

      const { scrollX, scrollY } = calculateScroll(e.clientX, e.clientY);

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

    // Listen to mouse movements globally
    document.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      stopScrolling();
    };
  }, [threshold, maxSpeed, horizontal, vertical]);
}

