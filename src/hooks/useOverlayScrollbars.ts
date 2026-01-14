import { useEffect } from "react";
import { OverlayScrollbars } from "overlayscrollbars";

// Use a Map to track instances by element, allowing proper cleanup
const instanceMap = new WeakMap<HTMLElement, OverlayScrollbars>();

// Debounce initialization to avoid rapid re-initialization
let initTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Safely destroy an OverlayScrollbars instance
 */
function destroyInstance(element: HTMLElement): void {
  try {
    const instance = instanceMap.get(element);
    if (instance) {
      instance.destroy();
      instanceMap.delete(element);
    }
  } catch {
    // Instance may already be destroyed or element detached
    instanceMap.delete(element);
  }
}

/**
 * Safely initialize OverlayScrollbars on an element
 */
function initializeInstance(element: HTMLElement): void {
  // Skip if already initialized
  if (instanceMap.has(element)) return;

  // Skip if element is not in DOM
  if (!document.body.contains(element)) return;

  // Skip hidden elements (display: none or hidden class)
  if (element.offsetParent === null && !element.closest(".hidden")) {
    // Element might be in a hidden container, skip for now
    // It will be initialized when it becomes visible
    return;
  }

  try {
    const instance = OverlayScrollbars(element, {
      scrollbars: {
        theme: "os-theme-custom",
        autoHide: "never",
        autoHideDelay: 0,
      },
    });
    instanceMap.set(element, instance);
  } catch {
    // Element may have been removed during initialization
  }
}

/**
 * Initialize scrollbars on all matching elements
 */
function initializeAllScrollbars(): void {
  const selector = ".overflow-y-auto, .overflow-auto, .overflow-x-auto";
  const elements = document.querySelectorAll<HTMLElement>(selector);

  elements.forEach((element) => {
    // Only initialize if visible (not in a hidden container)
    if (!element.closest(".hidden")) {
      initializeInstance(element);
    }
  });
}

/**
 * Cleanup scrollbars on removed nodes
 */
function cleanupRemovedNodes(nodes: NodeList): void {
  const selector = ".overflow-y-auto, .overflow-auto, .overflow-x-auto";

  nodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;

    // Check if the node itself is a scrollable element
    if (
      node.classList.contains("overflow-y-auto") ||
      node.classList.contains("overflow-auto") ||
      node.classList.contains("overflow-x-auto")
    ) {
      destroyInstance(node);
    }

    // Check children
    const children = node.querySelectorAll<HTMLElement>(selector);
    children.forEach((child) => destroyInstance(child));
  });
}

/**
 * Hook to automatically apply OverlayScrollbars to scrollable elements.
 * Handles dynamic content and cleanup safely.
 */
export function useOverlayScrollbars(): void {
  useEffect(() => {
    // Initialize on mount
    initializeAllScrollbars();

    // Watch for DOM changes
    const observer = new MutationObserver((mutations) => {
      // First, cleanup any removed nodes synchronously
      for (const mutation of mutations) {
        if (mutation.removedNodes.length > 0) {
          cleanupRemovedNodes(mutation.removedNodes);
        }
      }

      // Then, debounce initialization of new elements
      if (initTimeout) {
        clearTimeout(initTimeout);
      }
      initTimeout = setTimeout(() => {
        initializeAllScrollbars();
        initTimeout = null;
      }, 50);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"], // Watch for class changes (hidden -> visible)
    });

    // Cleanup on unmount
    return () => {
      observer.disconnect();

      if (initTimeout) {
        clearTimeout(initTimeout);
        initTimeout = null;
      }

      // Destroy all tracked instances
      const selector = ".overflow-y-auto, .overflow-auto, .overflow-x-auto";
      const elements = document.querySelectorAll<HTMLElement>(selector);
      elements.forEach((element) => destroyInstance(element));
    };
  }, []);
}
