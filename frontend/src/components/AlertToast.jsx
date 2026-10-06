export default function AlertToast({ message, onClose }) {
  if (!message) return null;

  return (
    <div className="floating-toast-alert" role="alert">
      <span>🌿 {message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="✕"
      >
        ×
      </button>
    </div>
  );
}
