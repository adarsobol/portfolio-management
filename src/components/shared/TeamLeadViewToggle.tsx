import React from 'react';

interface TeamLeadViewToggleProps {
  isEnabled: boolean;
  onToggle: () => void;
}

export const TeamLeadViewToggle: React.FC<TeamLeadViewToggleProps> = ({
  isEnabled,
  onToggle
}) => {
  return (
    <div className="mb-3 p-2 bg-slate-800/30 rounded-lg border border-slate-700/50">
      <label className="flex items-center justify-between cursor-pointer group">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-300 group-hover:text-slate-200 transition-colors">
            TL View
          </span>
          {isEnabled && (
            <span className="text-[10px] px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded font-medium">
              Active
            </span>
          )}
        </div>
        <div className="relative">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={onToggle}
            className="sr-only"
          />
          <div
            className={`w-10 h-5 rounded-full transition-colors duration-200 ${
              isEnabled ? 'bg-indigo-600' : 'bg-slate-700'
            }`}
          >
            <div
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                isEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </div>
        </div>
      </label>
    </div>
  );
};

