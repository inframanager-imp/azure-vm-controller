import React from 'react';
import { AlertTriangle } from 'lucide-react';
import GlassCard from './GlassCard';

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', type = 'warning' }) => {
  if (!isOpen) return null;

  const buttonColors = {
    danger: 'bg-red-600/80 hover:bg-red-600 border border-red-500/30 text-white shadow-lg shadow-red-900/20',
    warning: 'bg-amber-600/80 hover:bg-amber-600 border border-amber-500/30 text-white shadow-lg shadow-amber-900/20',
    primary: 'bg-teal-600/80 hover:bg-teal-600 border border-teal-500/30 text-white shadow-lg shadow-teal-900/20'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <GlassCard className="relative overflow-hidden border border-white/10 shadow-2xl">
          {/* Modal Header */}
          <div className="flex items-center space-x-3 mb-4">
            <div className={`p-2 rounded-lg ${type === 'danger' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-semibold font-sans text-white">{title}</h3>
          </div>

          {/* Modal Body */}
          <div className="mb-6">
            <p className="text-slate-300 leading-relaxed text-sm">{message}</p>
          </div>

          {/* Modal Footer */}
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-300 border border-white/5 transition-all duration-150"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-150 ${buttonColors[type] || buttonColors.warning}`}
            >
              {confirmText}
            </button>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default ConfirmModal;
