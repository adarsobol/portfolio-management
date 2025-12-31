import React from 'react';
import { AlertTriangle, X, TrendingUp } from 'lucide-react';
import { Initiative } from '../../types';

interface EffortExceededModalProps {
  isOpen: boolean;
  onClose: () => void;
  initiative: Initiative | null;
}

export const EffortExceededModal: React.FC<EffortExceededModalProps> = ({
  isOpen,
  onClose,
  initiative
}) => {
  if (!isOpen || !initiative) return null;

  const actualEffort = initiative.actualEffort || 0;
  const originalEffort = initiative.originalEstimatedEffort || 0;
  const variance = actualEffort - originalEffort;
  const variancePercent = originalEffort > 0 
    ? ((variance / originalEffort) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 border-2 border-red-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-50 to-orange-50 px-6 py-4 border-b border-red-200 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Effort Exceeded</h2>
                <p className="text-sm text-slate-600 mt-0.5">Actual effort exceeds original allocation</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-red-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <p className="text-sm font-semibold text-slate-900 mb-3">
              {initiative.title}
            </p>
            <p className="text-sm text-slate-700 mb-4">
              The actual effort consumed has exceeded the original allocated effort by{' '}
              <span className="font-semibold text-red-600">
                {variancePercent}%
              </span>
              . Please review and update the initiative plan if needed.
            </p>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-medium text-slate-600">Actual Effort</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {actualEffort.toFixed(2)}w
                </p>
              </div>

              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-medium text-slate-600">Original Allocated</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {originalEffort.toFixed(2)}w
                </p>
              </div>
            </div>

            {/* Variance Info */}
            <div className="mt-3 pt-3 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Variance:</span>
                <span className="text-sm font-semibold text-red-600">
                  +{variance.toFixed(2)}w ({variancePercent}%)
                </span>
              </div>
            </div>
          </div>

          {/* Warning Badge */}
          <div className="flex items-center justify-center">
            <div className="px-4 py-2 bg-red-100 rounded-lg border border-red-300">
              <p className="text-sm font-semibold text-red-800">
                Exceeded by {variancePercent}%
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 rounded-b-xl border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};

export default EffortExceededModal;

