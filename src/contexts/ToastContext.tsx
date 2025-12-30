import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { ErrorDetails } from '../utils/errorUtils';
import { ErrorToast } from '../components/shared/ErrorToast';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  errorDetails?: ErrorDetails; // Optional error details for enhanced error toasts
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showSuccess: (message: string, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showErrorWithDetails: (errorDetails: ErrorDetails, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
  showWarning: (message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration: number = 5000) => {
    const id = `${Date.now()}-${Math.random()}`;
    const newToast: Toast = { id, type, message, duration };
    
    setToasts(prev => [...prev, newToast]);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const showSuccess = useCallback((message: string, duration?: number) => {
    showToast(message, 'success', duration);
  }, [showToast]);

  const showError = useCallback((message: string, duration?: number) => {
    showToast(message, 'error', duration || 7000);
  }, [showToast]);

  const showErrorWithDetails = useCallback((errorDetails: ErrorDetails, duration: number = 10000) => {
    const id = `${Date.now()}-${Math.random()}`;
    const newToast: Toast = { 
      id, 
      type: 'error', 
      message: errorDetails.message, 
      duration,
      errorDetails
    };
    
    setToasts(prev => [...prev, newToast]);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const showInfo = useCallback((message: string, duration?: number) => {
    showToast(message, 'info', duration);
  }, [showToast]);

  const showWarning = useCallback((message: string, duration?: number) => {
    showToast(message, 'warning', duration);
  }, [showToast]);

  return (
    <ToastContext.Provider value={{
      toasts,
      showToast,
      showSuccess,
      showError,
      showErrorWithDetails,
      showInfo,
      showWarning,
      removeToast
    }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md w-full pointer-events-none">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  // Use ErrorToast component for errors with details
  if (toast.type === 'error' && toast.errorDetails) {
    return (
      <ErrorToast
        error={toast.errorDetails}
        onDismiss={() => onRemove(toast.id)}
      />
    );
  }

  const icons = {
    success: <CheckCircle className="w-5 h-5" />,
    error: <AlertCircle className="w-5 h-5" />,
    warning: <AlertTriangle className="w-5 h-5" />,
    info: <Info className="w-5 h-5" />
  };

  const styles = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  return (
    <div
      className={`${styles[toast.type]} border rounded-lg shadow-lg p-4 flex items-start gap-3 pointer-events-auto`}
      role="alert"
    >
      <div className="flex-shrink-0 mt-0.5">
        {icons[toast.type]}
      </div>
      <p className="flex-1 text-sm font-medium">{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        className="flex-shrink-0 text-current opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
