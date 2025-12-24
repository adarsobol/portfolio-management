// Sync Status Badge Component
// Shows current Google Sheets sync status with visual indicators

import { useState, useEffect } from 'react';
import { Cloud, CloudOff, RefreshCw, Check, AlertCircle, Upload, Download, Settings } from 'lucide-react';
import { sheetsSync, SyncStatus } from '../../services';

interface SyncStatusBadgeProps {
  initiatives?: unknown[];
  onRefresh?: () => void;
}

export function SyncStatusBadge({ initiatives, onRefresh }: SyncStatusBadgeProps) {
  const [status, setStatus] = useState<SyncStatus>(sheetsSync.getStatus());
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(sheetsSync.isEnabled());

  useEffect(() => {
    return sheetsSync.subscribe(setStatus);
  }, []);

  const handleForcePush = async () => {
    if (!initiatives) return;
    setIsLoading(true);
    try {
      await sheetsSync.pushFullData({ initiatives: initiatives as never[] });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        await sheetsSync.pullFromSheets();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForceSync = async () => {
    setIsLoading(true);
    try {
      await sheetsSync.forceSyncNow();
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSync = () => {
    const newState = !syncEnabled;
    setSyncEnabled(newState);
    sheetsSync.setEnabled(newState);
  };

  // Determine badge appearance
  const getBadgeStyle = () => {
    if (!syncEnabled) {
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-500',
        icon: <CloudOff size={14} />,
        label: 'Sync disabled'
      };
    }

    if (!status.isOnline) {
      return {
        bg: 'bg-orange-100',
        text: 'text-orange-700',
        icon: <CloudOff size={14} />,
        label: 'Offline'
      };
    }

    if (status.error) {
      return {
        bg: 'bg-red-100',
        text: 'text-red-700',
        icon: <AlertCircle size={14} />,
        label: 'Sync error'
      };
    }

    if (status.pending > 0) {
      return {
        bg: 'bg-amber-100',
        text: 'text-amber-700',
        icon: <RefreshCw size={14} className="animate-spin" />,
        label: `Syncing ${status.pending}...`
      };
    }

    if (status.lastSync) {
      return {
        bg: 'bg-emerald-100',
        text: 'text-emerald-700',
        icon: <Check size={14} />,
        label: 'Synced'
      };
    }

    return {
      bg: 'bg-slate-100',
      text: 'text-slate-600',
      icon: <Cloud size={14} />,
      label: 'Ready'
    };
  };

  const badge = getBadgeStyle();

  const formatTime = (isoString: string | null) => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="relative">
      {/* Main Badge */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${badge.bg} ${badge.text} hover:shadow-md`}
      >
        {badge.icon}
        <span>{badge.label}</span>
        <Settings size={12} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
      </button>

      {/* Expanded Panel */}
      {isExpanded && (
        <div className="absolute bottom-full right-0 mb-2 w-72 bg-white rounded-lg shadow-xl border border-slate-200 p-4 z-50">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-slate-800 text-sm">Google Sheets Sync</h4>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              ×
            </button>
          </div>

          {/* Status Details */}
          <div className="space-y-2 text-xs mb-4">
            <div className="flex justify-between">
              <span className="text-slate-500">Status:</span>
              <span className={badge.text}>{badge.label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Last sync:</span>
              <span className="text-slate-700">{formatTime(status.lastSync)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Pending:</span>
              <span className="text-slate-700">{status.pending} items</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Connection:</span>
              <span className={status.isOnline ? 'text-emerald-600' : 'text-red-600'}>
                {status.isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>

          {/* Error Display */}
          {status.error && (
            <div className="bg-red-50 text-red-700 text-xs p-2 rounded mb-3">
              {status.error}
            </div>
          )}

          {/* Toggle Sync */}
          <div className="flex items-center justify-between py-2 border-t border-slate-100">
            <span className="text-xs text-slate-600">Auto-sync enabled</span>
            <button
              onClick={toggleSync}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                syncEnabled ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  syncEnabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
            <button
              onClick={handleForceSync}
              disabled={isLoading || status.pending === 0}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
              Sync Now
            </button>
            <button
              onClick={handleForcePush}
              disabled={isLoading || !initiatives}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 rounded hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload size={12} />
              Push All
            </button>
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={12} />
              Refresh
            </button>
          </div>

          {/* Help Text */}
          <p className="text-[10px] text-slate-400 mt-3">
            Changes sync automatically to Google Sheets. Use Push to overwrite Sheets with local data, 
            or Pull to restore from Sheets.
          </p>
        </div>
      )}
    </div>
  );
}

export default SyncStatusBadge;

