import React, { useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Initiative } from '../../types';

interface AtRiskReasonModalProps {
  isOpen: boolean;
  initiative: Initiative | null;
  currentReason?: string;
  onSave: (reason: string) => void;
  onCancel: () => void;
}

export const AtRiskReasonModal: React.FC<AtRiskReasonModalProps> = ({
  isOpen,
  initiative,
  currentReason = '',
  onSave,
  onCancel
}) => {
  const [reason, setReason] = useState(currentReason);
  const [error, setError] = useState('');

  // Reset state when modal opens/closes or initiative changes
  useEffect(() => {
    if (isOpen) {
      setReason(currentReason);
      setError('');
    }
  }, [isOpen, currentReason]);

  // Handle save
  const handleSave = () => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError('Please provide a reason for marking this initiative as At Risk.');
      return;
    }
    onSave(trimmedReason);
    setError('');
  };

  // Handle cancel
  const handleCancel = () => {
    setReason(currentReason);
    setError('');
    onCancel();
  };

  // Handle Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleCancel();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, reason, currentReason]);

  if (!isOpen || !initiative) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
        onClick={handleCancel}
      >
        {/* Modal */}
        <div 
          className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-amber-50 to-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">At Risk Reason</h3>
                <p className="text-sm text-slate-500">{initiative.title}</p>
              </div>
            </div>
            <button
              onClick={handleCancel}
              className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Please provide a reason for marking this initiative as At Risk:
            </label>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError('');
              }}
              placeholder="Enter the reason (e.g., dependencies delayed, resource constraints, technical challenges...)"
              className={`w-full h-32 px-3 py-2 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent ${
                error ? 'border-red-300 bg-red-50' : 'border-slate-300'
              }`}
              autoFocus
            />
            {error && (
              <p className="text-red-600 text-sm mt-2 font-medium">{error}</p>
            )}
            <p className="text-xs text-slate-500 mt-2">
              This reason will be visible to all team members and helps track why initiatives are at risk.
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AtRiskReasonModal;

