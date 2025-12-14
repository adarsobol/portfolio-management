import React, { useState, useMemo, useRef } from 'react';
import { AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { Initiative, User, Status, Priority, WorkType, AppConfig, AssetClass, Comment, UserCommentReadState } from '../../types';
import { StatusBadge, PriorityBadge } from '../shared/Shared';
import { CommentPopover } from '../shared/CommentPopover';
import { getOwnerName, checkOutdated } from '../../utils';
import { QUARTERS } from '../../constants';
import { useEdgeScrolling } from '../../hooks';

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
  viewMode?: 'flat' | 'grouped';
  // Comment popover props
  commentReadState?: UserCommentReadState;
  onAddComment?: (initiativeId: string, comment: Comment) => void;
  onMarkCommentRead?: (initiativeId: string) => void;
}

interface GroupedInitiatives {
  [assetClass: string]: {
    [pillar: string]: Initiative[];
  };
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
  config,
  viewMode = 'flat',
  commentReadState = {},
  onAddComment,
  onMarkCommentRead
}) => {
  // Ref for scrollable container
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Enable edge scrolling for horizontal and vertical scrolling
  useEdgeScrolling(scrollContainerRef, {
    threshold: 50,
    maxSpeed: 10,
    horizontal: true,
    vertical: true,
  });

  // Track collapsed groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };

  const getOwnerNameById = (id?: string) => getOwnerName(users, id);

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

  // Group initiatives by asset class and pillar
  const groupedInitiatives = useMemo((): GroupedInitiatives => {
    const groups: GroupedInitiatives = {};
    
    filteredInitiatives.forEach(item => {
      if (!groups[item.l1_assetClass]) {
        groups[item.l1_assetClass] = {};
      }
      if (!groups[item.l1_assetClass][item.l2_pillar]) {
        groups[item.l1_assetClass][item.l2_pillar] = [];
      }
      groups[item.l1_assetClass][item.l2_pillar].push(item);
    });
    
    return groups;
  }, [filteredInitiatives]);

  const SortableHeader = ({ label, sortKey, alignRight = false }: { label: string, sortKey: string, alignRight?: boolean }) => {
    const isActive = sortConfig?.key === sortKey;
    const isAsc = sortConfig?.direction === 'asc';

    return (
      <th 
        className={`px-4 py-3 text-left font-bold text-slate-700 cursor-pointer bg-gradient-to-b from-slate-100 to-slate-50 hover:from-slate-200 hover:to-slate-100 transition-all border-r border-slate-200 select-none whitespace-nowrap text-xs uppercase tracking-wider ${alignRight ? 'text-right' : ''}`}
        onClick={() => handleSort(sortKey)}
      >
        <div className={`flex items-center gap-1.5 ${alignRight ? 'justify-end' : ''}`}>
          {label}
          <div className={`${isActive ? 'text-blue-500' : 'text-slate-400'}`}>
            {isActive ? (
               isAsc ? <ArrowUp size={13} /> : <ArrowDown size={13} />
            ) : (
               <ArrowUpDown size={13} />
            )}
          </div>
        </div>
      </th>
    );
  };

  const getStatusSelectStyle = (status: Status) => {
    switch (status) {
      // Not Started: Light gray - clearly shows item hasn't begun
      case Status.NotStarted: return 'bg-slate-200 text-slate-700 border-slate-300';
      // In Progress: Vibrant blue for positive momentum
      case Status.InProgress: return 'bg-blue-500 text-white border-blue-600 shadow-sm';
      // At Risk/Delayed: Prominent amber for immediate attention
      case Status.AtRisk: return 'bg-amber-500 text-white border-amber-600 shadow-sm';
      // Completed: Muted green to fade into background
      case Status.Done: return 'bg-emerald-100 text-emerald-700 border-emerald-300';
      default: return 'bg-white text-slate-700 border-slate-200';
    }
  };

  const getPrioritySelectStyle = (priority: Priority) => {
    switch (priority) {
      // P0: Bright red with strong presence
      case Priority.P0: return 'bg-gradient-to-r from-red-500 to-red-600 text-white border-red-700 shadow-md ring-1 ring-red-200';
      // P1: Clear amber for important items
      case Priority.P1: return 'bg-amber-500 text-white border-amber-600 shadow-sm';
      // P2: Neutral slate for lower priority
      case Priority.P2: return 'bg-slate-200 text-slate-600 border-slate-300';
      default: return 'bg-white text-slate-700 border-slate-200';
    }
  };

  const renderRow = (item: Initiative, index: number, editable: boolean) => {
    const isOutdated = checkOutdated(item.lastUpdated);
    const prevEffort = getPreviousValue(item, 'Effort');
    const prevEta = getPreviousValue(item, 'ETA');

    return (
      <tr key={item.id} className="group hover:bg-blue-50/60 transition-colors border-b border-slate-100">
        <td className="px-3 py-2.5 border-r border-b border-slate-200 text-center text-xs text-slate-400 font-mono select-none bg-slate-50/50">
          {index + 1}
        </td>
        <td className="px-3 py-2.5 border-r border-b border-slate-200 min-w-[280px] relative">
          <button
            onClick={() => { setEditingItem(item); setIsModalOpen(true); }}
            className="font-semibold text-slate-900 text-sm leading-snug truncate text-left w-full hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition-all cursor-pointer block"
            title={item.title}
          >
            {item.title}
          </button>
          {/* Improved metadata styling with distinct colors */}
          <div className="text-[10px] mt-1.5 flex gap-1.5 items-center flex-wrap">
             {viewMode === 'flat' && (
               <>
                 <span className="font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{item.l1_assetClass}</span>
                 <span className="text-slate-300">•</span>
                 <span className="text-slate-500 truncate max-w-[140px] italic" title={item.l2_pillar}>{item.l2_pillar}</span>
               </>
             )}
             {item.workType === WorkType.Unplanned && (
               <span className="text-amber-600 font-bold ml-1 flex items-center gap-0.5 bg-amber-50 px-1.5 py-0.5 rounded">
                 <AlertTriangle size={9} />
                 <span className="text-[9px]">Unplanned</span>
               </span>
             )}
             {onAddComment && onMarkCommentRead && (
               <CommentPopover
                 initiative={item}
                 currentUser={currentUser}
                 users={users}
                 onAddComment={onAddComment}
                 lastReadTimestamp={commentReadState[item.id]}
                 onMarkAsRead={onMarkCommentRead}
               />
             )}
          </div>
          {item.status === Status.AtRisk && (
             <div className="absolute top-2 right-2">
                <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse shadow-sm" title={`Risk: ${item.riskActionLog}`}></div>
             </div>
          )}
        </td>
        <td className="px-3 py-2.5 border-r border-b border-slate-200 whitespace-nowrap">
          <div className="flex items-center gap-2.5" title="Primary Owner">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 border border-slate-300 shadow-sm">
              {getOwnerNameById(item.ownerId)?.charAt(0)}
            </div>
            <div className="flex flex-col justify-center gap-0.5">
              <span className="text-slate-800 font-medium text-xs truncate max-w-[110px]">{getOwnerNameById(item.ownerId)}</span>
              {item.secondaryOwner && (
                <span className="text-[9px] text-slate-400 italic truncate max-w-[90px] leading-none">{item.secondaryOwner}</span>
              )}
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 border-r border-b border-slate-200 text-center">
          {editable ? (
             <select 
               value={item.status}
               onChange={(e) => handleInlineUpdate(item.id, 'status', e.target.value)}
               className={`w-full text-[11px] font-bold border focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-1.5 py-1 rounded-md cursor-pointer h-full ${getStatusSelectStyle(item.status)}`}
             >
               {Object.values(Status).map(s => <option key={s} value={s} className="bg-white text-slate-900">{s}</option>)}
             </select>
          ) : (
             <StatusBadge status={item.status} />
          )}
        </td>
        <td className="px-3 py-2.5 border-r border-b border-slate-200 text-center">
          {editable ? (
            <select 
              value={item.priority}
              onChange={(e) => handleInlineUpdate(item.id, 'priority', e.target.value)}
              className={`w-full text-[11px] font-bold border focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-1.5 py-1 rounded-md cursor-pointer h-full ${getPrioritySelectStyle(item.priority)}`}
            >
              {Object.values(Priority).map(p => <option key={p} value={p} className="bg-white text-slate-900">{p}</option>)}
            </select>
          ) : (
            <PriorityBadge priority={item.priority} />
          )}
        </td>
        <td className="px-3 py-2.5 border-r border-b border-slate-200 text-xs text-slate-600 whitespace-nowrap">
          {editable ? (
            <select 
              value={item.quarter}
              onChange={(e) => handleInlineUpdate(item.id, 'quarter', e.target.value)}
              className="w-full bg-white text-xs border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded-md cursor-pointer"
            >
              {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          ) : (
            <span className="bg-slate-50 px-2 py-1 rounded text-slate-600 font-medium">{item.quarter}</span>
          )}
        </td>
        <td className="px-3 py-2.5 border-r border-b border-slate-200">
          {editable ? (
            <div className="flex items-center gap-1.5">
              <input 
                type="number"
                min="0"
                step="0.5"
                value={item.actualEffort}
                onChange={(e) => handleInlineUpdate(item.id, 'actualEffort', parseFloat(e.target.value) || 0)}
                className="w-14 bg-white text-xs font-mono text-slate-700 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded-md text-right"
                title="Actual Effort"
              />
              <span className="text-slate-300 text-xs font-medium">/</span>
              <input 
                type="number"
                min="0"
                step="0.5"
                value={item.estimatedEffort}
                onChange={(e) => handleInlineUpdate(item.id, 'estimatedEffort', parseFloat(e.target.value) || 0)}
                className="w-14 bg-white text-xs font-mono text-slate-700 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded-md text-right"
                title="Planned Effort"
              />
              <span className="text-slate-400 text-xs font-medium">w</span>
            </div>
          ) : (
            <div className="font-mono text-slate-700 text-xs font-semibold text-right bg-slate-50 px-2 py-1 rounded">{item.actualEffort}/{item.estimatedEffort}w</div>
          )}
          {item.originalEstimatedEffort !== item.estimatedEffort && (
             <div className="text-[9px] text-slate-400 italic text-right mt-1">Orig: {item.originalEstimatedEffort}w</div>
          )}
        </td>
        <td className="px-3 py-2.5 border-r border-b border-slate-200 min-w-[90px]">
          <div className="flex flex-col items-center gap-1.5">
            {editable ? (
              <div className="flex items-center gap-1">
                <input 
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={item.completionRate ?? 0}
                  onChange={(e) => handleInlineUpdate(item.id, 'completionRate', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-12 bg-white text-xs font-semibold text-slate-700 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded-md text-right"
                  title="Completion %"
                />
                <span className="text-xs text-slate-400 font-medium">%</span>
              </div>
            ) : (
              <span className="text-xs font-bold text-slate-700">{item.completionRate ?? 0}%</span>
            )}
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
              <div 
                className={`h-full transition-all duration-300 ${
                  (item.completionRate ?? 0) === 100 ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' :
                  (item.completionRate ?? 0) >= 50 ? 'bg-gradient-to-r from-blue-400 to-blue-500' :
                  (item.completionRate ?? 0) > 0 ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-slate-200'
                }`}
                style={{ width: `${item.completionRate ?? 0}%` }}
              />
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 border-r border-b border-slate-200 min-w-[110px]">
          <div className="flex flex-col gap-1">
             {editable ? (
               <input 
                  type="date"
                  value={item.eta}
                  onChange={(e) => handleInlineUpdate(item.id, 'eta', e.target.value)}
                  className="w-full bg-white text-xs border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded-md"
               />
             ) : (
               <span className="text-xs font-semibold text-slate-700">{item.eta}</span>
             )}
             
             {prevEta !== null && (
               <span className="text-[9px] text-slate-400 italic bg-slate-50 px-1.5 py-0.5 rounded inline-block">Prev: {prevEta}</span>
             )}
             
             <div className="flex items-center gap-1 text-[9px]">
               <span className={`${isOutdated ? 'text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded' : 'text-slate-400'}`}>
                 Upd: {new Date(item.lastUpdated).toLocaleDateString()}
               </span>
             </div>
          </div>
        </td>
      </tr>
    );
  };

  const renderGroupedView = () => {
    const assetClasses = Object.keys(groupedInitiatives).sort();
    let globalIndex = 0;

    return assetClasses.map(assetClass => {
      const pillars = Object.keys(groupedInitiatives[assetClass]).sort();
      const assetKey = `asset-${assetClass}`;
      const isAssetCollapsed = collapsedGroups.has(assetKey);
      const assetCount = pillars.reduce((sum, p) => sum + groupedInitiatives[assetClass][p].length, 0);

      return (
        <React.Fragment key={assetClass}>
          {/* Asset Class Header Row */}
          <tr 
            className="bg-slate-800 text-white cursor-pointer hover:bg-slate-700 transition-colors"
            onClick={() => toggleGroup(assetKey)}
          >
            <td colSpan={9} className="px-3 py-2">
              <div className="flex items-center gap-2">
                {isAssetCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                <Layers size={16} />
                <span className="font-bold">{assetClass}</span>
                <span className="text-slate-400 text-xs ml-2">
                  {assetCount} {assetCount === 1 ? 'initiative' : 'initiatives'}
                </span>
              </div>
            </td>
          </tr>

          {!isAssetCollapsed && pillars.map(pillar => {
            const pillarKey = `pillar-${assetClass}-${pillar}`;
            const isPillarCollapsed = collapsedGroups.has(pillarKey);
            const items = groupedInitiatives[assetClass][pillar];

            return (
              <React.Fragment key={pillarKey}>
                {/* Pillar Header Row */}
                <tr 
                  className="bg-slate-100 cursor-pointer hover:bg-slate-200 transition-colors"
                  onClick={() => toggleGroup(pillarKey)}
                >
                  <td colSpan={9} className="px-4 py-1.5 border-b border-slate-200">
                    <div className="flex items-center gap-2 pl-4">
                      {isPillarCollapsed ? <ChevronRight size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                      <span className="font-semibold text-slate-700 text-sm">{pillar}</span>
                      <span className="text-slate-400 text-xs">
                        ({items.length})
                      </span>
                    </div>
                  </td>
                </tr>

                {!isPillarCollapsed && items.map(item => {
                  globalIndex++;
                  const editable = canInlineEdit(item);
                  return renderRow(item, globalIndex, editable);
                })}
              </React.Fragment>
            );
          })}
        </React.Fragment>
      );
    });
  };

  const renderFlatView = () => {
    return filteredInitiatives.map((item, index) => {
      const editable = canInlineEdit(item);
      return renderRow(item, index, editable);
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col min-h-[500px]">
      {/* Excel-style formula bar with visual separation */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200 text-xs text-slate-600 font-mono">
        <div className="w-8 text-center text-slate-400 font-bold italic select-none bg-slate-100 rounded py-0.5">fx</div>
        <div className="h-5 w-px bg-slate-200"></div>
        <div className="flex-1 truncate italic text-slate-500">
          {viewMode === 'grouped' ? 'Grouped by Asset Class → Pillar' : 'Task View — Portfolio Initiatives'}
        </div>
      </div>

      <div ref={scrollContainerRef} className="overflow-auto custom-scrollbar flex-1">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-20 shadow-md">
            <tr className="bg-gradient-to-b from-slate-100 to-slate-50 border-b-2 border-slate-300">
              <th className="w-12 px-3 py-3 text-center font-bold text-slate-500 text-xs border-r border-slate-200 bg-gradient-to-b from-slate-100 to-slate-50 select-none">
                #
              </th>
              <SortableHeader label="Initiative" sortKey="title" />
              <SortableHeader label="Owner" sortKey="owner" />
              <SortableHeader label="Status" sortKey="status" />
              <SortableHeader label="Priority" sortKey="priority" />
              <th className="px-4 py-3 text-left font-bold text-slate-700 bg-gradient-to-b from-slate-100 to-slate-50 border-r border-slate-200 text-xs uppercase tracking-wider whitespace-nowrap select-none">Quarter</th>
              <th className="px-4 py-3 text-right font-bold text-slate-700 bg-gradient-to-b from-slate-100 to-slate-50 border-r border-slate-200 text-xs uppercase tracking-wider whitespace-nowrap select-none">Effort (Act/Plan)</th>
              <th className="px-4 py-3 text-center font-bold text-slate-700 bg-gradient-to-b from-slate-100 to-slate-50 border-r border-slate-200 text-xs uppercase tracking-wider whitespace-nowrap select-none">Progress</th>
              <SortableHeader label="ETA / Update" sortKey="eta" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filteredInitiatives.length === 0 ? (
               <tr><td colSpan={9} className="px-6 py-12 text-center text-slate-500 text-sm">No initiatives found matching your filters.</td></tr>
            ) : viewMode === 'grouped' ? renderGroupedView() : renderFlatView()}
          </tbody>
        </table>
      </div>
      {/* Footer with stats */}
      <div className="bg-gradient-to-r from-slate-50 to-white border-t border-slate-200 px-4 py-2.5 text-[11px] text-slate-600 flex justify-between items-center font-mono">
         <span className="font-semibold">{filteredInitiatives.length} initiatives loaded</span>
         <div className="flex gap-6">
            <span className="bg-slate-100 px-2.5 py-1 rounded-md">SUM Effort: <strong>{filteredInitiatives.reduce((acc, curr) => acc + curr.estimatedEffort, 0)}w</strong></span>
            <span className="bg-slate-100 px-2.5 py-1 rounded-md">AVG Effort: <strong>{(filteredInitiatives.reduce((acc, curr) => acc + curr.estimatedEffort, 0) / (filteredInitiatives.length || 1)).toFixed(1)}w</strong></span>
         </div>
      </div>
    </div>
  );
};
