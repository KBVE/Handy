import { useEffect } from "react";
import { OverlayScrollbars } from "overlayscrollbars";

// Track initialized elements to avoid re-initializing and properly cleanup
const initializedElements = new WeakSet<HTMLElement>();

export function useOverlayScrollbars() {
  useEffect(() => {
    // Initialize OverlayScrollbars on all scrollable elements
    const initializeScrollbars = () => {
      const scrollableElements = document.querySelectorAll(
        ".overflow-y-auto, .overflow-auto, .overflow-x-auto"
      );

      scrollableElements.forEach((element) => {
        if (element instanceof HTMLElement && !initializedElements.has(element)) {
          // Check if element is still in the document
          if (!document.contains(element)) return;

          try {
            OverlayScrollbars(element, {
              scrollbars: {
                theme: "os-theme-custom",
                autoHide: "never",
                autoHideDelay: 0,
              },
            });
            initializedElements.add(element);
          } catch {
            // Element may have been removed during initialization
          }
        }
      });
    };

    // Destroy OverlayScrollbars for removed nodes before they're fully detached
    const cleanupRemovedNodes = (mutations: MutationRecord[]) => {
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          if (node instanceof HTMLElement) {
            // Check if the removed node or any of its children has OverlayScrollbars
            const scrollableElements = [
              ...(node.classList.contains("overflow-y-auto") ||
              node.classList.contains("overflow-auto") ||
              node.classList.contains("overflow-x-auto")
                ? [node]
                : []),
              ...node.querySelectorAll(
                ".overflow-y-auto, .overflow-auto, .overflow-x-auto"
              ),
            ];

            scrollableElements.forEach((element) => {
              if (element instanceof HTMLElement && initializedElements.has(element)) {
                try {
                  const instance = OverlayScrollbars(element);
                  if (instance) {
                    instance.destroy();
                  }
                } catch {
                  // Instance may already be destroyed
                }
                initializedElements.delete(element);
              }
            });
          }
        }
      }
    };

    // Initialize immediately
    initializeScrollbars();

    // Watch for dynamically added/removed scrollable elements
    const observer = new MutationObserver((mutations) => {
      // First cleanup removed nodes
      cleanupRemovedNodes(mutations);
      // Then initialize new ones
      initializeScrollbars();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      // Cleanup all OverlayScrollbars instances
      const scrollableElements = document.querySelectorAll(
        ".overflow-y-auto, .overflow-auto, .overflow-x-auto"
      );
      scrollableElements.forEach((element) => {
        if (element instanceof HTMLElement && initializedElements.has(element)) {
          try {
            const instance = OverlayScrollbars(element);
            if (instance) {
              instance.destroy();
            }
          } catch {
            // Instance may already be destroyed
          }
          initializedElements.delete(element);
        }
      });
    };
  }, []);
}
