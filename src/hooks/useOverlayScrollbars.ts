import { useEffect, useRef } from "react";
import { OverlayScrollbars } from "overlayscrollbars";

/**
 * Hook to apply OverlayScrollbars to a specific element via ref.
 * This is the safe way to use OverlayScrollbars with React - only
 * apply it to stable elements that won't be unmounted/remounted.
 *
 * Usage:
 * ```tsx
 * function MyComponent() {
 *   const scrollRef = useOverlayScrollbarsRef();
 *   return <div ref={scrollRef} className="overflow-y-auto">...</div>;
 * }
 * ```
 */
export function useOverlayScrollbarsRef<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const instanceRef = useRef<OverlayScrollbars | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Initialize OverlayScrollbars
    try {
      instanceRef.current = OverlayScrollbars(element, {
        scrollbars: {
          theme: "os-theme-custom",
          autoHide: "never",
          autoHideDelay: 0,
        },
      });
    } catch (error) {
      console.warn("Failed to initialize OverlayScrollbars:", error);
    }

    // Cleanup on unmount
    return () => {
      try {
        instanceRef.current?.destroy();
        instanceRef.current = null;
      } catch {
        // Already destroyed
      }
    };
  }, []);

  return ref;
}

/**
 * Global OverlayScrollbars initialization for the main app container only.
 * This should only be called once at the app root level on a stable element.
 *
 * IMPORTANT: Do NOT use this for dynamic content. Use useOverlayScrollbarsRef
 * for components that need custom scrollbars.
 */
export function useOverlayScrollbars(): void {
  useEffect(() => {
    // Only initialize on the main scrollable container
    // This selector should match ONLY stable, non-dynamic elements
    const mainContainer = document.querySelector<HTMLElement>(
      "[data-main-scroll]"
    );

    let instance: OverlayScrollbars | null = null;

    if (mainContainer) {
      try {
        instance = OverlayScrollbars(mainContainer, {
          scrollbars: {
            theme: "os-theme-custom",
            autoHide: "never",
            autoHideDelay: 0,
          },
        });
      } catch (error) {
        console.warn("Failed to initialize main scrollbar:", error);
      }
    }

    return () => {
      try {
        instance?.destroy();
      } catch {
        // Already destroyed
      }
    };
  }, []);
}
