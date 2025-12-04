import React from 'react';
import { MoreHorizontal, AlertTriangle, MessageSquare, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { Initiative, User, Status, Priority, WorkType, UnplannedTag, AppConfig } from '../types';
import { StatusBadge, PriorityBadge } from './Shared';

interface TaskTableProps {
  filteredInitiatives: Initiative[];
  handleInlineUpdate: (id: string, field: keyof Initiative, value: any) => void;
  setEditingItem: (item: Initiative) => void;
  setIsModalOpen: (isOpen: boolean) => void;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  handleSort: (key: string) => void;
  users: User[];
  currentUser: User;
  config: AppConfig;
}

export const TaskTable: React.FC<TaskTableProps> = ({
  filteredInitiatives,
  handleInlineUpdate,
  setEditingItem,
  setIsModalOpen,
  sortConfig,
  handleSort,
  users,
  currentUser,
  config
}) => {

  const getOwnerName = (id?: string) => users.find(u => u.id === id)?.name || 'Unknown';

  const checkOutdated = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays > 14;
  };

  const canInlineEdit = (item: Initiative): boolean => {
    const perms = config.rolePermissions[currentUser.role];
    if (perms.editAll) return true;
    if (item.workType === WorkType.Unplanned && perms.editUnplanned) return true;
    if (item.ownerId === currentUser.id && perms.editOwn) return true;
    return false;
  };

  const getPreviousValue = (item: Initiative, fieldName: string) => {
    if (!item.history || item.history.length === 0) return null;
    const records = item.history.filter(h => h.field === fieldName);
    if (records.length === 0) return null;
    const lastRecord = records[records.length - 1];
    return lastRecord.oldValue;
  };

  const SortableHeader = ({ label, sortKey, alignRight = false }: { label: string, sortKey: string, alignRight?: boolean }) => {
    const isActive = sortConfig?.key === sortKey;
    const isAsc = sortConfig?.direction === 'asc';

    return (
      <th 
        className={`px-3 py-2 text-left font-bold text-slate-600 cursor-pointer bg-slate-100 hover:bg-slate-200 transition-colors border-r border-slate-300 select-none whitespace-nowrap text-xs uppercase tracking-wider ${alignRight ? 'text-right' : ''}`}
        onClick={() => handleSort(sortKey)}
      >
        <div className={`flex items-center gap-1 ${alignRight ? 'justify-end' : ''}`}>
          {label}
          <div className="text-slate-400">
            {isActive ? (
               isAsc ? <ArrowUp size={12} /> : <ArrowDown size={12} />
            ) : (
               <ArrowUpDown size={12} />
            )}
          </div>
        </div>
      </th>
    );
  };

  const getStatusSelectStyle = (status: Status) => {
    switch (status) {
      case Status.Planned: return 'bg-slate-200 text-slate-700';
      case Status.InProgress: return 'bg-blue-500 text-white';
      case Status.Delayed: return 'bg-red-500 text-white';
      case Status.Complete: return 'bg-emerald-500 text-white';
      default: return 'bg-white text-slate-700';
    }
  };

  return (
    <div className="bg-white border border-slate-300 shadow-sm overflow-hidden flex-1 flex flex-col min-h-[500px]">
      <div className="flex items-center gap-2 px-2 py-1 bg-slate-50 border-b border-slate-300 text-xs text-slate-600 font-mono">
        <div className="w-8 text-center text-slate-400 font-bold italic select-none">fx</div>
        <div className="h-4 w-px bg-slate-300"></div>
        <div className="flex-1 truncate italic text-slate-400">
          Task View
        </div>
      </div>

      <div className="overflow-auto custom-scrollbar flex-1">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-20 shadow-sm">
            <tr className="bg-slate-100 border-b-2 border-slate-300">
              <th className="w-10 px-2 py-1 text-center font-bold text-slate-500 text-xs border-r border-slate-300 bg-slate-100 select-none">
                #
              </th>
              <SortableHeader label="Initiative" sortKey="title" />
              <SortableHeader label="Owner" sortKey="owner" />
              <SortableHeader label="Status" sortKey="status" />
              <SortableHeader label="Priority" sortKey="priority" />
              <th className="px-3 py-1 text-left font-bold text-slate-600 bg-slate-100 border-r border-slate-300 text-xs uppercase tracking-wider whitespace-nowrap select-none">Quarter</th>
              <th className="px-3 py-1 text-right font-bold text-slate-600 bg-slate-100 border-r border-slate-300 text-xs uppercase tracking-wider whitespace-nowrap select-none">Effort (Act/Org)</th>
              <SortableHeader label="ETA / Update" sortKey="eta" />
              <th className="px-3 py-1 text-center font-bold text-slate-600 bg-slate-100 text-xs uppercase tracking-wider whitespace-nowrap select-none">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {filteredInitiatives.length === 0 ? (
               <tr><td colSpan={9} className="px-6 py-8 text-center text-slate-500">No initiatives found matching your filters.</td></tr>
            ) : filteredInitiatives.map((item, index) => {
              const isOutdated = checkOutdated(item.lastUpdated);
              const editable = canInlineEdit(item);
              
              const prevEffort = getPreviousValue(item, 'Effort');
              const prevEta = getPreviousValue(item, 'ETA');

              return (
                <tr key={item.id} className="group hover:bg-blue-50 transition-colors">
                  <td className="px-2 py-1 border-r border-b border-slate-200 text-center text-xs text-slate-400 font-mono select-none">
                    {index + 1}
                  </td>
                  <td className="px-2 py-1 border-r border-b border-slate-200 min-w-[250px] relative">
                    <div className="font-medium text-slate-900 text-sm leading-tight truncate pr-2" title={item.title}>{item.title}</div>
                    <div className="text-[9px] text-slate-500 mt-0.5 flex gap-1 items-center flex-wrap">
                       <span className="font-semibold text-slate-600">{item.l1_assetClass}</span>
                       <span className="text-slate-300">•</span>
                       <span className="truncate max-w-[120px]" title={item.l2_pillar}>{item.l2_pillar}</span>
                       {item.workType === WorkType.Unplanned && (
                         <span className="text-amber-600 font-bold ml-1 flex items-center gap-0.5">
                           <AlertTriangle size={8} />
                         </span>
                       )}
                       {item.comments && item.comments.length > 0 && (
                          <span className="flex items-center gap-0.5 text-blue-500 ml-1">
                            <MessageSquare size={8} /> {item.comments.length}
                          </span>
                       )}
                    </div>
                    {(item.status === Status.Delayed || item.isAtRisk) && (
                       <div className="absolute top-1 right-1">
                          <div className="w-2 h-2 bg-red-500 rounded-full" title={`Risk: ${item.riskActionLog}`}></div>
                       </div>
                    )}
                  </td>
                  <td className="px-2 py-1 border-r border-b border-slate-200 whitespace-nowrap">
                    <div className="flex items-center gap-2" title="Primary Owner">
                      <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-600 border border-slate-300">
                        {getOwnerName(item.ownerId)?.charAt(0)}
                      </div>
                      <div className="flex flex-col justify-center">
                        <span className="text-slate-700 font-medium text-xs truncate max-w-[100px]">{getOwnerName(item.ownerId)}</span>
                        {item.secondaryOwner && (
                          <span className="text-[9px] text-slate-400 truncate max-w-[80px] leading-none">{item.secondaryOwner}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1 border-r border-b border-slate-200 text-center">
                    {editable ? (
                       <select 
                         value={item.status}
                         onChange={(e) => handleInlineUpdate(item.id, 'status', e.target.value)}
                         className={`w-full text-[11px] font-bold border-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-1 py-0.5 rounded cursor-pointer h-full shadow-sm ${getStatusSelectStyle(item.status)}`}
                       >
                         {Object.values(Status).map(s => <option key={s} value={s} className="bg-white text-slate-900">{s}</option>)}
                       </select>
                    ) : (
                       <StatusBadge status={item.status} />
                    )}
                  </td>
                  <td className="px-2 py-1 border-r border-b border-slate-200 text-center">
                    <PriorityBadge priority={item.priority} />
                  </td>
                  <td className="px-2 py-1 border-r border-b border-slate-200 text-xs text-slate-600 whitespace-nowrap">
                     {item.quarter}
                  </td>
                  <td className="px-2 py-1 border-r border-b border-slate-200 text-right">
                    <div className="font-mono text-slate-700 text-xs font-medium">{item.actualEffort}/{item.estimatedEffort}w</div>
                    {prevEffort !== null && (
                       <div className="text-[9px] text-slate-400 italic">Prev: {prevEffort}w</div>
                    )}
                  </td>
                  <td className="px-2 py-1 border-r border-b border-slate-200 min-w-[100px]">
                    <div className="flex flex-col gap-0.5">
                       {editable ? (
                         <input 
                            type="date"
                            value={item.eta}
                            onChange={(e) => handleInlineUpdate(item.id, 'eta', e.target.value)}
                            className="w-full bg-transparent text-xs border-transparent focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-1 py-0 rounded h-full"
                         />
                       ) : (
                         <span className="text-xs font-medium text-slate-700 pl-1">{item.eta}</span>
                       )}
                       
                       {prevEta !== null && (
                         <span className="text-[9px] text-slate-400 italic pl-1">Prev: {prevEta}</span>
                       )}
                       
                       <div className="flex items-center gap-1 text-[9px] text-slate-400 pl-1">
                         <span className={`${isOutdated ? 'text-red-500 font-bold' : ''}`}>
                           Upd: {new Date(item.lastUpdated).toLocaleDateString()}
                         </span>
                       </div>
                    </div>
                  </td>
                  <td className="px-2 py-1 border-b border-slate-200 text-center">
                    <button 
                      onClick={() => { setEditingItem(item); setIsModalOpen(true); }}
                      className="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-slate-100 transition-colors"
                      title="Edit Details"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="bg-slate-50 border-t border-slate-300 p-1.5 text-[10px] text-slate-500 flex justify-between items-center font-mono">
         <span>{filteredInitiatives.length} initiatives loaded</span>
         <div className="flex gap-4">
            <span>SUM Effort: {filteredInitiatives.reduce((acc, curr) => acc + curr.estimatedEffort, 0)}w</span>
            <span>AVG Effort: {(filteredInitiatives.reduce((acc, curr) => acc + curr.estimatedEffort, 0) / (filteredInitiatives.length || 1)).toFixed(1)}w</span>
         </div>
      </div>
    </div>
  );
};