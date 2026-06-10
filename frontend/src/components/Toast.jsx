import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

const ToastContext = createContext(null);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success', duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      removeToast(id);
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      {/* Toast List Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col space-y-3 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-center p-4 rounded-xl border border-white/10 glass-panel shadow-2xl animate-in slide-in-from-right-10 duration-200"
          >
            {/* Icon */}
            <div className="flex-shrink-0 mr-3">
              {toast.type === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
              {toast.type === 'error' && <AlertCircle className="h-5 w-5 text-red-400" />}
              {toast.type === 'info' && <Info className="h-5 w-5 text-teal-400" />}
              {toast.type === 'warning' && <AlertCircle className="h-5 w-5 text-amber-400" />}
            </div>

            {/* Content */}
            <div className="flex-1 text-sm text-slate-200 font-medium">
              {toast.message}
            </div>

            {/* Dismiss Button */}
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-4 flex-shrink-0 text-slate-400 hover:text-white transition-colors duration-150"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
