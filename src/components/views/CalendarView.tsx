import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Calendar, ChevronLeft, ChevronRight, AlertTriangle, PlayCircle, CheckCircle, Edit, Check, X, History } from 'lucide-react';
import { Initiative, Status, Priority, User, AppConfig } from '../../types';
import { getStatuses } from '../../utils/valueLists';

interface CalendarViewProps {
  filteredInitiatives: Initiative[];
  handleInlineUpdate: (id: string, field: keyof Initiative, value: any) => void;
  setEditingItem: (item: Initiative) => void;
  setIsModalOpen: (isOpen: boolean) => void;
  calendarDate: Date;
  setCalendarDate: (date: Date) => void;
  users: User[];
  filterOwners: string[];
  filterAssetClass: string;
  filterWorkType: string;
  filterStatus: Status | null;
  searchQuery: string;
  totalInitiativesCount: number;
  onFilterChange?: (filters: { owners?: string[]; assetClass?: string; workType?: string; status?: Status | null }) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  config: AppConfig;
}

// Helper functions
const _getPriorityColor = (priority: Priority): string => {
  switch (priority) {
    case Priority.P0:
      return 'bg-red-500 text-white';
    case Priority.P1:
      return 'bg-amber-500 text-white';
    case Priority.P2:
      return 'bg-slate-500 text-white';
    default:
      return 'bg-slate-400 text-white';
  }
};
void _getPriorityColor; // Reserved for future priority badge styling

// Date comparison helpers
const isOverdue = (eta: string): boolean => {
  if (!eta) return false;
  const etaDate = new Date(eta);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  etaDate.setHours(0, 0, 0, 0);
  return etaDate < today;
};

const isDueSoon = (eta: string, days: number = 7): boolean => {
  if (!eta) return false;
  const etaDate = new Date(eta);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  etaDate.setHours(0, 0, 0, 0);
  const diffTime = etaDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= days;
};

// Highlight search matches in text
const highlightSearchMatch = (text: string, query: string): React.ReactNode => {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return parts.map((part, i) => 
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-yellow-200 font-semibold">{part}</mark>
    ) : part
  );
};

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  item: Initiative | null;
}

interface UndoOperation {
  id: string;
  oldEta: string;
  newEta: string;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  filteredInitiatives,
  handleInlineUpdate,
  setEditingItem,
  setIsModalOpen,
  calendarDate,
  setCalendarDate,
  users,
  filterOwners,
  filterAssetClass,
  filterWorkType,
  filterStatus,
  searchQuery,
  totalInitiativesCount,
  onFilterChange,
  showToast,
  config
}) => {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    item: null
  });
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<UndoOperation[]>([]);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const maxVisibleItems = 3;
  const maxUndoOperations = 10;

  // Memoize days array calculation
  const days = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDay = new Date(year, month, 1).getDay();
    const daysArray = [];
    for (let i = 0; i < startDay; i++) daysArray.push(null);
    for (let i = 1; i <= daysInMonth; i++) daysArray.push(new Date(year, month, i));
    return daysArray;
  }, [calendarDate]);

  const prevMonth = useCallback(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    setCalendarDate(new Date(year, month - 1, 1));
  }, [calendarDate, setCalendarDate]);

  const nextMonth = useCallback(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    setCalendarDate(new Date(year, month + 1, 1));
  }, [calendarDate, setCalendarDate]);

  const today = useCallback(() => {
    setCalendarDate(new Date());
  }, [setCalendarDate]);

  // Close context menu on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu({ visible: false, x: 0, y: 0, item: null });
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu({ visible: false, x: 0, y: 0, item: null });
      }
    };

    if (contextMenu.visible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu.visible]);

  const handleContextMenu = (e: React.MouseEvent, item: Initiative) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      item
    });
  };

  const handleStatusChange = (status: Status) => {
    if (contextMenu.item) {
      handleInlineUpdate(contextMenu.item.id, 'status', status);
      setContextMenu({ visible: false, x: 0, y: 0, item: null });
    }
  };

  const handleMarkComplete = () => {
    if (contextMenu.item) {
      handleInlineUpdate(contextMenu.item.id, 'status', Status.Done);
      setContextMenu({ visible: false, x: 0, y: 0, item: null });
    }
  };

  const handleEdit = () => {
    if (contextMenu.item) {
      setEditingItem(contextMenu.item);
      setIsModalOpen(true);
      setContextMenu({ visible: false, x: 0, y: 0, item: null });
    }
  };

  // Get active filter count
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filterOwners.length > 0) count++;
    if (filterAssetClass) count++;
    if (filterWorkType) count++;
    if (filterStatus) count++;
    if (searchQuery) count++;
    return count;
  }, [filterOwners, filterAssetClass, filterWorkType, filterStatus, searchQuery]);

  // Get owner names for display
  const getOwnerName = (ownerId: string): string => {
    const user = users.find(u => u.id === ownerId);
    return user?.name || ownerId;
  };

  const onDragStart = useCallback((e: React.DragEvent, id: string, _item: Initiative) => {
    e.dataTransfer.setData("text/plain", id);
    setDraggedItemId(id);
    
    // Create ghost image
    const dragElement = e.currentTarget as HTMLElement;
    const rect = dragElement.getBoundingClientRect();
    const ghost = dragElement.cloneNode(true) as HTMLElement;
    ghost.style.position = 'absolute';
    ghost.style.top = '-1000px';
    ghost.style.opacity = '0.5';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, rect.width / 2, rect.height / 2);
    setTimeout(() => document.body.removeChild(ghost), 0);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    setDragOverDate(dateStr);
  }, []);

  const onDragLeave = useCallback(() => {
    setDragOverDate(null);
  }, []);

  const onDragEnd = useCallback(() => {
    setDraggedItemId(null);
    setDragOverDate(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    const item = filteredInitiatives.find(i => i.id === id);
    
    if (item && item.eta !== dateStr) {
      // Store undo operation
      const undoOp: UndoOperation = {
        id,
        oldEta: item.eta || '',
        newEta: dateStr
      };
      setUndoStack(prev => {
        const newStack = [undoOp, ...prev].slice(0, maxUndoOperations);
        return newStack;
      });
      
      // Update ETA
      handleInlineUpdate(id, 'eta', dateStr);
      
      // Show toast notification
      if (showToast) {
        const oldDate = item.eta ? new Date(item.eta).toLocaleDateString() : 'unscheduled';
        const newDate = new Date(dateStr).toLocaleDateString();
        showToast(`ETA updated: ${oldDate} → ${newDate}`, 'success');
      }
    }
    
    setDragOverDate(null);
  }, [filteredInitiatives, handleInlineUpdate, showToast, maxUndoOperations]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const lastOp = undoStack[0];
    handleInlineUpdate(lastOp.id, 'eta', lastOp.oldEta);
    setUndoStack(prev => prev.slice(1));
    if (showToast) {
      showToast('Change undone', 'info');
    }
  }, [undoStack, handleInlineUpdate, showToast]);

  return (
    <div className="flex flex-col h-full space-y-2 relative">
      {/* Context Menu */}
      {contextMenu.visible && contextMenu.item && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white rounded shadow-lg border border-slate-200 py-0.5 z-50 min-w-[140px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            transform: 'translate(-10px, -10px)'
          }}
        >
          <button
            onClick={handleEdit}
            className="w-full text-left px-2.5 py-1 text-[11px] text-slate-700 hover:bg-slate-100 flex items-center gap-1.5"
          >
            <Edit className="w-3 h-3" />
            Edit Initiative
          </button>
          <div className="border-t border-slate-200 my-0.5"></div>
          <div className="px-2 py-0.5 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
            Change Status
          </div>
          {getStatuses(config).filter(status => status !== Status.Deleted).map(status => (
            <button
              key={status}
              onClick={() => handleStatusChange(status as Status)}
              className={`w-full text-left px-2.5 py-1 text-[11px] hover:bg-slate-100 flex items-center gap-1.5 ${
                contextMenu.item?.status === status ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'
              }`}
            >
              {contextMenu.item?.status === status && <Check className="w-3 h-3" />}
              <span className={contextMenu.item?.status === status ? '' : 'ml-4'}>{status}</span>
            </button>
          ))}
          <div className="border-t border-slate-200 my-0.5"></div>
          <button
            onClick={handleMarkComplete}
            className="w-full text-left px-2.5 py-1 text-[11px] text-emerald-700 hover:bg-emerald-50 flex items-center gap-1.5"
          >
            <CheckCircle className="w-3 h-3" />
            Mark as Complete
          </button>
        </div>
      )}
      
      {/* Legend */}
      <div className="bg-white px-3 py-2 rounded-lg shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded border border-slate-200">
          <span className="font-semibold text-slate-700 tracking-wide text-[10px]">Legend</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded bg-slate-100 border border-slate-300"></div>
            <span className="font-medium text-slate-600 text-[10px]">Not Started</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded bg-blue-100 border border-blue-300"></div>
            <span className="font-medium text-slate-600 text-[10px]">In Progress</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded bg-red-100 border border-red-300"></div>
            <span className="font-medium text-slate-600 text-[10px]">At Risk</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-300"></div>
            <span className="font-medium text-slate-600 text-[10px]">Done</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded bg-slate-200 border border-slate-400"></div>
            <span className="font-medium text-slate-600 text-[10px]">Obsolete</span>
          </div>
        </div>
        <div className="ml-auto text-slate-400 italic flex items-center gap-1 text-[10px]">
          <span className="text-slate-300">•</span>
          Drag items to change ETA
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-indigo-50">
          <div className="flex items-center gap-3 flex-1">
             <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
               <div className="p-1.5 bg-gradient-to-br from-purple-500 to-indigo-500 rounded">
                 <Calendar className="text-white" size={14} />
               </div>
               {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
             </h3>
             <div className="flex bg-white/80 rounded p-0.5 shadow-sm border border-slate-200">
               <button onClick={prevMonth} className="p-1 hover:bg-slate-100 rounded transition-all text-slate-600"><ChevronLeft size={12} /></button>
               <button onClick={today} className="px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 rounded transition-all">Today</button>
               <button onClick={nextMonth} className="p-1 hover:bg-slate-100 rounded transition-all text-slate-600"><ChevronRight size={12} /></button>
             </div>
             
             {/* Filtered Count Indicator */}
             {activeFiltersCount > 0 && (
               <div className="text-[10px] text-slate-600 bg-white/80 px-2 py-1 rounded border border-slate-200">
                 Showing <span className="font-bold">{filteredInitiatives.length}</span> of <span className="font-bold">{totalInitiativesCount}</span>
               </div>
             )}
             
             {/* Undo Button */}
             {undoStack.length > 0 && (
               <button
                 onClick={handleUndo}
                 className="text-[10px] text-slate-600 bg-white/80 px-2 py-1 rounded border border-slate-200 hover:bg-white transition-colors"
                 title={`Undo last change (${undoStack.length} available)`}
               >
                 Undo
               </button>
             )}
          </div>
        </div>
        
        {/* Quick Filters */}
        {(activeFiltersCount > 0 || onFilterChange) && (
          <div className="px-3 py-1.5 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-1.5 items-center">
            {filterOwners.length > 0 && filterOwners.map(ownerId => (
              <span key={ownerId} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px] font-medium">
                Owner: {getOwnerName(ownerId)}
                {onFilterChange && (
                  <button
                    onClick={() => onFilterChange({ owners: filterOwners.filter(id => id !== ownerId) })}
                    className="hover:bg-blue-200 rounded-full p-0.5"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </span>
            ))}
            {filterAssetClass && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-medium">
                Asset: {filterAssetClass}
                {onFilterChange && (
                  <button
                    onClick={() => onFilterChange({ assetClass: '' })}
                    className="hover:bg-purple-200 rounded-full p-0.5"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </span>
            )}
            {filterWorkType && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[10px] font-medium">
                Type: {filterWorkType}
                {onFilterChange && (
                  <button
                    onClick={() => onFilterChange({ workType: '' })}
                    className="hover:bg-amber-200 rounded-full p-0.5"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </span>
            )}
            {filterStatus && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-medium">
                Status: {filterStatus}
                {onFilterChange && (
                  <button
                    onClick={() => onFilterChange({ status: null })}
                    className="hover:bg-emerald-200 rounded-full p-0.5"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-[10px] font-medium">
                Search: "{searchQuery}"
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
           {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, idx) => {
             const isWeekend = idx === 0 || idx === 6;
             return (
               <div key={d} className={`py-1.5 text-center text-[10px] font-semibold tracking-wide ${
                 isWeekend ? 'text-slate-500' : 'text-slate-600'
               }`}>{d}</div>
             );
           })}
        </div>
        
        <div className="grid grid-cols-7 auto-rows-fr bg-slate-200 gap-px">
           {days.map((date, idx) => {
             if (!date) return <div key={`empty-${idx}`} className="bg-slate-50 min-h-[90px] border border-dashed border-slate-200" />;
             
             const offset = date.getTimezoneOffset();
             const localDate = new Date(date.getTime() - (offset*60*1000));
             const dateStr = localDate.toISOString().split('T')[0];
             const dayOfWeek = date.getDay();
             const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

             const dayItems = filteredInitiatives.filter(i => i.eta === dateStr);
             const isToday = new Date().toDateString() === date.toDateString();
             const isExpanded = expandedDays.has(dateStr);
             const visibleItems = isExpanded ? dayItems : dayItems.slice(0, maxVisibleItems);
             const hiddenCount = dayItems.length - maxVisibleItems;

             const toggleExpand = () => {
               const newExpanded = new Set(expandedDays);
               if (isExpanded) {
                 newExpanded.delete(dateStr);
               } else {
                 newExpanded.add(dateStr);
               }
               setExpandedDays(newExpanded);
             };

             return (
               <div 
                 key={dateStr} 
                 onDragOver={(e) => onDragOver(e, dateStr)}
                 onDragLeave={onDragLeave}
                 onDrop={(e) => onDrop(e, dateStr)}
                 className={`bg-white min-h-[90px] p-1.5 hover:bg-blue-50/40 transition-colors group relative ${
                   isWeekend ? 'bg-slate-50/30' : ''
                 } ${
                   isToday ? 'bg-blue-100/50 ring-2 ring-blue-400 ring-inset' : ''
                 } ${
                   dragOverDate === dateStr ? 'bg-blue-200 ring-2 ring-blue-500 ring-inset' : ''
                 } ${
                   dayItems.length === 0 ? 'border border-dashed border-slate-200' : ''
                 }`}
               >
                 <div className={`text-[10px] font-semibold mb-1 flex justify-between items-center ${isToday ? 'text-blue-700' : 'text-slate-500'}`}>
                    <span className={isToday ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white w-5 h-5 flex items-center justify-center rounded-full shadow-sm font-bold text-[10px]" : "w-5 h-5 flex items-center justify-center text-slate-600 font-semibold"}>{date.getDate()}</span>
                    {dayItems.length > 0 && (
                      <span className="text-[9px] bg-blue-100 text-blue-700 px-1 py-0.5 rounded-full font-semibold">{dayItems.length}</span>
                    )}
                 </div>
                 
                 <div className="relative space-y-1 overflow-y-auto max-h-[calc(90px-28px)] scrollbar-thin scrollbar-thumb-slate-400 scrollbar-track-transparent">
                   {/* Gradient overlay when items are hidden */}
                   {!isExpanded && hiddenCount > 0 && (
                     <div className="absolute bottom-0 left-0 right-0 h-5 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none z-10"></div>
                   )}
                   {visibleItems.map(item => {
                     const overdue = isOverdue(item.eta || '');
                     const dueSoon = isDueSoon(item.eta || '');
                     
                     // Status-based color coding
                     let bgClass = 'bg-slate-100 text-slate-900 border border-slate-200 hover:bg-slate-200'; // Default: Not Started
                     let statusBorderColor = 'border-l-2 border-l-slate-400';
                     
                     switch (item.status) {
                       case Status.AtRisk:
                         bgClass = 'bg-red-100 text-red-900 border border-red-200 hover:bg-red-200';
                         statusBorderColor = 'border-l-2 border-l-red-500';
                         break;
                       case Status.Done:
                         bgClass = 'bg-emerald-100 text-emerald-900 border border-emerald-200 hover:bg-emerald-200';
                         statusBorderColor = 'border-l-2 border-l-emerald-500';
                         break;
                       case Status.InProgress:
                         bgClass = 'bg-blue-100 text-blue-900 border border-blue-200 hover:bg-blue-200';
                         statusBorderColor = 'border-l-2 border-l-blue-500';
                         break;
                       case Status.Obsolete:
                         bgClass = 'bg-slate-200 text-slate-600 border border-slate-300 hover:bg-slate-300';
                         statusBorderColor = 'border-l-2 border-l-slate-500';
                         break;
                       // Not Started uses default slate
                     }
                     
                     // Add overdue border or due soon background
                     let borderClass = '';
                     let backgroundTint = '';
                     if (overdue) {
                       borderClass = 'border-red-500 border';
                     } else if (dueSoon && item.status !== Status.Done) {
                       backgroundTint = 'bg-yellow-100';
                       borderClass = 'border-yellow-300';
                     }

                     // Status icon - compact
                     const getStatusIcon = () => {
                       if (item.status === Status.AtRisk) {
                         return <AlertTriangle className="w-2.5 h-2.5 text-red-700" />;
                       } else if (item.status === Status.InProgress) {
                         return <PlayCircle className="w-2.5 h-2.5 text-blue-700" />;
                       } else if (item.status === Status.Done) {
                         return <CheckCircle className="w-2.5 h-2.5 text-emerald-700" />;
                       } else if (item.status === Status.Obsolete) {
                         return <History className="w-2.5 h-2.5 text-slate-600" />;
                       }
                       return null;
                     };

                     return (
                       <div
                         key={item.id}
                         draggable
                         onDragStart={(e) => onDragStart(e, item.id, item)}
                         onDragEnd={onDragEnd}
                         onContextMenu={(e) => handleContextMenu(e, item)}
                         className={`w-full text-left text-[9px] px-1.5 py-0.5 rounded font-medium cursor-move shadow-sm transition-all hover:shadow relative ${
                           bgClass
                         } ${statusBorderColor} ${borderClass} ${backgroundTint} ${
                           draggedItemId === item.id ? 'opacity-50 scale-95' : ''
                         }`}
                         title={`${item.id} - ${item.title}`}
                         onClick={() => { setEditingItem(item); setIsModalOpen(true); }}
                       >
                         {/* Status Icon */}
                         <div className="absolute top-0.5 left-1">
                           {getStatusIcon()}
                         </div>
                         
                         {/* Overdue Indicator */}
                         {overdue && (
                           <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border border-white"></div>
                         )}
                         
                         {/* Title + Asset Class - single line */}
                         <div className="truncate pr-2.5 pl-3.5 leading-tight">
                           {highlightSearchMatch(item.title, searchQuery)}
                           {item.l1_assetClass && <span className="text-[8px] opacity-60 ml-1">• {item.l1_assetClass}</span>}
                         </div>
                       </div>
                     );
                   })}
                   
                   {/* Show More Button */}
                   {!isExpanded && hiddenCount > 0 && (
                     <button
                       onClick={(e) => {
                         e.stopPropagation();
                         toggleExpand();
                       }}
                       className="w-full text-[8px] text-slate-600 hover:text-slate-800 font-medium py-0.5 px-1 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                     >
                       +{hiddenCount} more
                     </button>
                   )}
                   
                   {/* Collapse Button */}
                   {isExpanded && dayItems.length > maxVisibleItems && (
                     <button
                       onClick={(e) => {
                         e.stopPropagation();
                         toggleExpand();
                       }}
                       className="w-full text-[8px] text-slate-600 hover:text-slate-800 font-medium py-0.5 px-1 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                     >
                       Show less
                     </button>
                   )}
                 </div>
               </div>
             );
           })}
        </div>
      </div>
    </div>
  );
};
