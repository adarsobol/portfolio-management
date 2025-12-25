import React from 'react';
import { Trash2, RotateCcw, Clock, User as UserIcon, Calendar } from 'lucide-react';
import { Initiative, User, Status } from '../../types';

interface TrashViewProps {
  deletedInitiatives: Initiative[];
  users: User[];
  onRestore: (id: string) => void;
  isLoading?: boolean;
}

export function TrashView({ deletedInitiatives, users, onRestore, isLoading }: TrashViewProps) {
  const getOwnerName = (ownerId: string) => {
    const user = users.find(u => u.id === ownerId);
    return user?.name || ownerId;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const getTimeAgo = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays} days ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
      return `${Math.floor(diffDays / 30)} months ago`;
    } catch {
      return '';
    }
  };

  // Count deleted tasks across all initiatives
  const deletedTasksCount = deletedInitiatives.reduce((count, init) => {
    return count + (init.tasks?.filter(t => t.status === Status.Deleted).length || 0);
  }, 0);

  if (deletedInitiatives.length === 0 && deletedTasksCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <Trash2 className="w-16 h-16 mb-4 text-slate-300" />
        <h3 className="text-lg font-medium mb-2">Trash is empty</h3>
        <p className="text-sm text-slate-400">Deleted items will appear here</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
          <Trash2 className="w-5 h-5" />
          Trash
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          {deletedInitiatives.length} deleted initiative{deletedInitiatives.length !== 1 ? 's' : ''}
          {deletedTasksCount > 0 && ` and ${deletedTasksCount} deleted task${deletedTasksCount !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Deleted Initiatives */}
      {deletedInitiatives.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-medium text-slate-600 uppercase tracking-wide mb-3">
            Deleted Initiatives
          </h3>
          <div className="space-y-3">
            {deletedInitiatives.map(initiative => (
              <div
                key={initiative.id}
                className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-slate-800 truncate">
                      {initiative.title}
                    </h4>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <UserIcon className="w-3.5 h-3.5" />
                        {getOwnerName(initiative.ownerId)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {initiative.l2_pillar}
                      </span>
                      {initiative.deletedAt && (
                        <span className="flex items-center gap-1 text-red-500">
                          <Clock className="w-3.5 h-3.5" />
                          Deleted {getTimeAgo(initiative.deletedAt)}
                        </span>
                      )}
                    </div>
                    {initiative.deletedAt && (
                      <p className="text-xs text-slate-400 mt-1">
                        Deleted on {formatDate(initiative.deletedAt)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => onRestore(initiative.id)}
                    disabled={isLoading}
                    className="ml-4 flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-6">
        <p className="text-sm text-amber-800">
          <strong>Note:</strong> Items in trash are kept in the database with a "Deleted" status. 
          You can restore them at any time. To permanently delete items, remove them directly from the Google Sheet.
        </p>
      </div>
    </div>
  );
}

export default TrashView;

