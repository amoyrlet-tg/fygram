import { dismissToast, useToasts } from "./store";
import "./Toast.css";

export function ToastHost() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          className={`toast toast-${toast.kind}`}
          onClick={() => dismissToast(toast.key)}
          type="button"
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
