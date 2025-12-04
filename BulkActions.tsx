
import React from 'react';
import { CalendarCheck, Trash2, X as XIcon } from 'lucide-react';

interface BulkActionsProps {
  selectedIds: Set<string>;
  handleBulkShiftETA: () => void;
  handleBulkDelete: () => void;
  setSelectedIds: (ids: Set<string>) => void;
}

export const BulkActions: React.FC<BulkActionsProps> = ({
  selectedIds,
  handleBulkShiftETA,
  handleBulkDelete,
  setSelectedIds
}) => {
  if (selectedIds.size === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-xl shadow-lg z-50 flex items-center gap-4 animate-in slide-in-from-bottom-5">
      <span className="font-bold text-sm">{selectedIds.size} Selected</span>
      <div className="h-4 w-px bg-slate-700"></div>
      <button onClick={handleBulkShiftETA} className="flex items-center gap-2 text-sm hover:text-blue-300">
        <CalendarCheck size={16} /> Shift ETA +1 Week
      </button>
      <button onClick={handleBulkDelete} className="flex items-center gap-2 text-sm text-red-400 hover:text-red-300 ml-2">
        <Trash2 size={16} /> Delete
      </button>
      <button onClick={() => setSelectedIds(new Set())} className="ml-2 text-slate-400 hover:text-white">
        <XIcon size={16} />
      </button>
    </div>
  );
};
