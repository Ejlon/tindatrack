// A dismissible alert / notification banner.
// type: 'success' | 'error' | 'warning' | 'info'
export default function Alert({ type = 'info', message, onClose }) {
  if (!message) return null;

  const styles = {
    success: 'bg-green-50  border-green-400  text-green-800',
    error:   'bg-red-50    border-red-400    text-red-800',
    warning: 'bg-yellow-50 border-yellow-400 text-yellow-800',
    info:    'bg-blue-50   border-blue-400   text-blue-800',
  };

  return (
    <div className={`flex items-start gap-3 border-l-4 rounded-lg p-4 ${styles[type]}`}>
      <p className="flex-1 text-sm">{message}</p>
      {onClose && (
        <button onClick={onClose} className="text-current opacity-60 hover:opacity-100 text-lg leading-none">
          ×
        </button>
      )}
    </div>
  );
}
