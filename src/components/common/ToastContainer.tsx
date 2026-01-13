import { useToastStore, type Toast } from "../../stores/toastStore";

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useToastStore((state) => state.removeToast);

  const getToastStyles = () => {
    switch (toast.type) {
      case "success":
        return "bg-green-500/10 border-green-500/30 text-green-400";
      case "error":
        return "bg-red-500/10 border-red-500/30 text-red-400";
      case "warning":
        return "bg-yellow-500/10 border-yellow-500/30 text-yellow-400";
      case "info":
        return "bg-blue-500/10 border-blue-500/30 text-blue-400";
    }
  };

  const getIcon = () => {
    switch (toast.type) {
      case "success":
        return "✓";
      case "error":
        return "✕";
      case "warning":
        return "⚠";
      case "info":
        return "ℹ";
    }
  };

  return (
    <div
      className={`
        ${getToastStyles()}
        border rounded-lg p-3 shadow-lg
        backdrop-blur-sm
        min-w-[300px] max-w-[450px]
        animate-slide-in-right
        flex items-start gap-3
      `}
    >
      <div className="flex-shrink-0 text-lg font-bold mt-0.5">
        {getIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{toast.title}</div>
        {toast.message && (
          <div className="text-xs text-gray-400 mt-1 break-words">
            {toast.message}
          </div>
        )}
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        className="flex-shrink-0 text-gray-400 hover:text-white transition-colors text-sm"
        aria-label="Close notification"
      >
        ✕
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-20 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} />
        </div>
      ))}
    </div>
  );
}
