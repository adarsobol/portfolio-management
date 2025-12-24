import { useState } from 'react';
import { AlertTriangle, RefreshCw, Upload, X } from 'lucide-react';
import { SyncConflict } from '../../services';

interface ConflictResolutionModalProps {
  isOpen: boolean;
  conflicts: SyncConflict[];
  onKeepMine: (conflictIds: string[]) => void;
  onKeepTheirs: (conflictIds: string[]) => void;
  onClose: () => void;
}

export function ConflictResolutionModal({
  isOpen,
  conflicts,
  onKeepMine,
  onKeepTheirs,
  onClose
}: ConflictResolutionModalProps) {
  const [selectedAction, setSelectedAction] = useState<'mine' | 'theirs' | null>(null);

  if (!isOpen || conflicts.length === 0) return null;

  const handleResolve = () => {
    const conflictIds = conflicts.map(c => c.id);
    if (selectedAction === 'mine') {
      onKeepMine(conflictIds);
    } else if (selectedAction === 'theirs') {
      onKeepTheirs(conflictIds);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-amber-50 px-6 py-4 border-b border-amber-100 flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-full">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Sync Conflict Detected</h2>
            <p className="text-sm text-slate-600">
              {conflicts.length} initiative{conflicts.length > 1 ? 's were' : ' was'} modified by another user
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1 hover:bg-amber-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Conflict List */}
        <div className="px-6 py-4 max-h-64 overflow-y-auto">
          <div className="space-y-3">
            {conflicts.map((conflict) => (
              <div
                key={conflict.id}
                className="p-3 bg-slate-50 rounded-lg border border-slate-200"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-800">
                    {(conflict.serverData.title as string) || conflict.id}
                  </span>
                  <span className="text-xs text-slate-500">
                    Server v{conflict.serverVersion} vs Your v{conflict.clientVersion}
                  </span>
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Status: {conflict.serverData.status as string} | 
                  ETA: {conflict.serverData.eta as string || 'N/A'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Resolution Options */}
        <div className="px-6 py-4 border-t border-slate-100">
          <p className="text-sm text-slate-600 mb-4">
            Choose how to resolve these conflicts:
          </p>
          
          <div className="space-y-3">
            <label 
              className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                selectedAction === 'theirs' 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="resolution"
                checked={selectedAction === 'theirs'}
                onChange={() => setSelectedAction('theirs')}
                className="w-4 h-4 text-blue-600"
              />
              <RefreshCw className="w-5 h-5 text-blue-600" />
              <div>
                <div className="font-medium text-slate-800">Keep their changes</div>
                <div className="text-sm text-slate-500">
                  Reload data from the server (recommended)
                </div>
              </div>
            </label>

            <label 
              className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                selectedAction === 'mine' 
                  ? 'border-amber-500 bg-amber-50' 
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="resolution"
                checked={selectedAction === 'mine'}
                onChange={() => setSelectedAction('mine')}
                className="w-4 h-4 text-amber-600"
              />
              <Upload className="w-5 h-5 text-amber-600" />
              <div>
                <div className="font-medium text-slate-800">Keep my changes</div>
                <div className="text-sm text-slate-500">
                  Overwrite server data with your local changes
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
          >
            Decide Later
          </button>
          <button
            onClick={handleResolve}
            disabled={!selectedAction}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Resolve Conflicts
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConflictResolutionModal;

