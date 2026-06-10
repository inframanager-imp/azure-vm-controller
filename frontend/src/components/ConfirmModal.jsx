import React from 'react';
import { AlertTriangle } from 'lucide-react';
import GlassCard from './GlassCard';

const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', type = 'warning' }) => {
  if (!isOpen) return null;

  const buttonColors = {
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-md',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white shadow-md',
    primary: 'btn-primary text-white shadow-md'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
        <GlassCard className="relative overflow-hidden border border-[#1c1e2d] shadow-2xl">
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
              className="px-4 py-2 text-sm font-medium rounded-lg btn-secondary transition-all duration-150"
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
