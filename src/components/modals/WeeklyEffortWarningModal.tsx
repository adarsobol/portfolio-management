import React from 'react';
import { AlertTriangle, X, TrendingUp } from 'lucide-react';
import { ValidationResult } from '../../services/weeklyEffortValidation';

interface WeeklyEffortWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  validationResult: ValidationResult | null;
}

export const WeeklyEffortWarningModal: React.FC<WeeklyEffortWarningModalProps> = ({
  isOpen,
  onClose,
  validationResult
}) => {
  if (!isOpen || !validationResult) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 border-2 border-amber-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-4 border-b border-amber-200 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Weekly Effort Exceeded</h2>
                <p className="text-sm text-slate-600 mt-0.5">Effort validation alert</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-amber-100 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-slate-600" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <p className="text-sm text-slate-700 mb-4">
              Your weekly effort update exceeds the historical average by more than{' '}
              <span className="font-semibold text-amber-600">
                {validationResult.deviationPercent.toFixed(1)}%
              </span>
              . Please review your effort reporting.
            </p>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-medium text-slate-600">Current Week</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {validationResult.currentWeekEffort.toFixed(1)}w
                </p>
              </div>

              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span className="text-xs font-medium text-slate-600">Average Weekly</span>
                </div>
                <p className="text-2xl font-bold text-slate-900">
                  {validationResult.averageWeeklyEffort.toFixed(1)}w
                </p>
              </div>
            </div>

            {/* Quarter Info */}
            <div className="mt-3 pt-3 border-t border-slate-200">
              <p className="text-xs text-slate-500">
                Quarter: <span className="font-semibold text-slate-700">{validationResult.quarter}</span>
              </p>
            </div>
          </div>

          {/* Deviation Badge */}
          <div className="flex items-center justify-center">
            <div className="px-4 py-2 bg-amber-100 rounded-lg border border-amber-300">
              <p className="text-sm font-semibold text-amber-800">
                Deviation: {validationResult.deviationPercent.toFixed(1)}%
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

export default WeeklyEffortWarningModal;

