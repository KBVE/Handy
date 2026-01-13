import { useEffect } from "react";
import { OverlayScrollbars } from "overlayscrollbars";

export function useOverlayScrollbars() {
  useEffect(() => {
    // Initialize OverlayScrollbars on all scrollable elements
    const initializeScrollbars = () => {
      const scrollableElements = document.querySelectorAll(
        ".overflow-y-auto, .overflow-auto, .overflow-x-auto"
      );

      scrollableElements.forEach((element) => {
        if (element instanceof HTMLElement) {
          OverlayScrollbars(element, {
            scrollbars: {
              theme: "os-theme-custom",
              autoHide: "never",
              autoHideDelay: 0,
            },
          });
        }
      });
    };

    // Initialize immediately
    initializeScrollbars();

    // Watch for dynamically added scrollable elements
    const observer = new MutationObserver(() => {
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
        if (element instanceof HTMLElement) {
          const instance = OverlayScrollbars(element);
          if (instance) {
            instance.destroy();
          }
        }
      });
    };
  }, []);
}
