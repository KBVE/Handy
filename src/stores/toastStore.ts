import { create } from "zustand";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number; // milliseconds, 0 = persistent
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  clearAll: () => void;
}

let toastCounter = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${Date.now()}-${toastCounter++}`;
    const newToast: Toast = {
      id,
      duration: 5000, // default 5 seconds
      ...toast,
    };

    set((state) => ({
      toasts: [...state.toasts, newToast],
    }));

    // Auto-remove after duration (if not persistent)
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, newToast.duration);
    }
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  clearAll: () => set({ toasts: [] }),
}));

// Helper functions for common toast types
export const toast = {
  success: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: "success", title, message, duration }),

  error: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: "error", title, message, duration }),

  warning: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: "warning", title, message, duration }),

  info: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: "info", title, message, duration }),
};
