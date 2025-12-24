import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, AlertTriangle, PlayCircle, CheckCircle, Edit, Check, X, History } from 'lucide-react';
import { Initiative, Status, WorkType, InitiativeType, Priority, User, AssetClass } from '../../types';

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
}

// Helper functions
const getPriorityColor = (priority: Priority): string => {
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

const getOwnerInitials = (users: User[], ownerId: string): string => {
  const user = users.find(u => u.id === ownerId);
  if (!user) return '?';
  return user.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

const getOwnerAvatar = (users: User[], ownerId: string): string | null => {
  const user = users.find(u => u.id === ownerId);
  return user?.avatar || null;
};

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
  showToast
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
  const maxVisibleItems = 4;
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

  const onDragStart = useCallback((e: React.DragEvent, id: string, item: Initiative) => {
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
    <div className="flex flex-col h-full space-y-5 relative">
      {/* Context Menu */}
      {contextMenu.visible && contextMenu.item && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50 min-w-[180px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            transform: 'translate(-10px, -10px)'
          }}
        >
          <button
            onClick={handleEdit}
            className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
          >
            <Edit className="w-4 h-4" />
            Edit Initiative
          </button>
          <div className="border-t border-slate-200 my-1"></div>
          <div className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Change Status
          </div>
          {Object.values(Status).map(status => (
            <button
              key={status}
              onClick={() => handleStatusChange(status)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-100 flex items-center gap-2 ${
                contextMenu.item?.status === status ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'
              }`}
            >
              {contextMenu.item?.status === status && <Check className="w-4 h-4" />}
              <span className={contextMenu.item?.status === status ? '' : 'ml-6'}>{status}</span>
            </button>
          ))}
          <div className="border-t border-slate-200 my-1"></div>
          <button
            onClick={handleMarkComplete}
            className="w-full text-left px-4 py-2 text-sm text-emerald-700 hover:bg-emerald-50 flex items-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            Mark as Complete
          </button>
        </div>
      )}
      
      {/* Legend */}
      <div className="bg-white p-5 rounded-xl shadow-md border-2 border-slate-300 flex flex-wrap gap-6 items-center">
        <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-lg border-2 border-slate-300">
          <span className="font-bold text-slate-800 tracking-wide text-xs">Legend</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-md bg-blue-100 border-2 border-blue-300 shadow-sm"></div>
            <span className="font-semibold text-slate-700 text-xs">WP</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-md bg-amber-100 border-2 border-amber-300 shadow-sm"></div>
            <span className="font-semibold text-slate-700 text-xs">BAU</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <div className="w-4 h-4 rounded-md bg-red-100 border-2 border-red-300 shadow-sm"></div>
            <span className="font-semibold text-slate-700 text-xs">At Risk</span>
          </div>
          <div className="flex items-center gap-2">
            <PlayCircle className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-slate-700 text-xs">In Progress</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <div className="w-4 h-4 rounded-md bg-emerald-100 border-2 border-emerald-300 shadow-sm"></div>
            <span className="font-semibold text-slate-700 text-xs">Complete</span>
          </div>
        </div>
        <div className="ml-auto text-slate-500 italic flex items-center gap-1.5 text-xs">
          <span className="text-slate-400">•</span>
          Drag items to change ETA
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b-2 border-slate-300 bg-gradient-to-r from-purple-100 to-indigo-100">
          <div className="flex items-center gap-4 flex-1">
             <h3 className="text-xl font-bold text-slate-900 flex items-center gap-3">
               <div className="p-2.5 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-lg shadow-md">
                 <Calendar className="text-white" size={20} />
               </div>
               {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
             </h3>
             <div className="flex bg-white/80 rounded-lg p-1 shadow-sm border border-slate-200">
               <button onClick={prevMonth} className="p-1.5 hover:bg-slate-100 rounded-md transition-all text-slate-600"><ChevronLeft size={16} /></button>
               <button onClick={today} className="px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-md transition-all">Today</button>
               <button onClick={nextMonth} className="p-1.5 hover:bg-slate-100 rounded-md transition-all text-slate-600"><ChevronRight size={16} /></button>
             </div>
             
             {/* Filtered Count Indicator */}
             {activeFiltersCount > 0 && (
               <div className="text-xs text-slate-600 bg-white/80 px-3 py-1.5 rounded-lg border border-slate-200">
                 Showing <span className="font-bold">{filteredInitiatives.length}</span> of <span className="font-bold">{totalInitiativesCount}</span> initiatives
               </div>
             )}
             
             {/* Undo Button */}
             {undoStack.length > 0 && (
               <button
                 onClick={handleUndo}
                 className="text-xs text-slate-600 bg-white/80 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-white transition-colors"
                 title={`Undo last change (${undoStack.length} available)`}
               >
                 Undo
               </button>
             )}
          </div>
        </div>
        
        {/* Quick Filters */}
        {(activeFiltersCount > 0 || onFilterChange) && (
          <div className="px-6 py-2 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-2 items-center">
            {filterOwners.length > 0 && filterOwners.map(ownerId => (
              <span key={ownerId} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                Owner: {getOwnerName(ownerId)}
                {onFilterChange && (
                  <button
                    onClick={() => onFilterChange({ owners: filterOwners.filter(id => id !== ownerId) })}
                    className="hover:bg-blue-200 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
            {filterAssetClass && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                Asset: {filterAssetClass}
                {onFilterChange && (
                  <button
                    onClick={() => onFilterChange({ assetClass: '' })}
                    className="hover:bg-purple-200 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            )}
            {filterWorkType && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                Type: {filterWorkType}
                {onFilterChange && (
                  <button
                    onClick={() => onFilterChange({ workType: '' })}
                    className="hover:bg-amber-200 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            )}
            {filterStatus && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                Status: {filterStatus}
                {onFilterChange && (
                  <button
                    onClick={() => onFilterChange({ status: null })}
                    className="hover:bg-emerald-200 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                Search: "{searchQuery}"
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-7 border-b-2 border-slate-300 bg-gradient-to-b from-slate-100 to-slate-50">
           {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, idx) => {
             const isWeekend = idx === 0 || idx === 6;
             return (
               <div key={d} className={`py-3 text-center text-sm font-bold tracking-wider ${
                 isWeekend ? 'text-slate-600' : 'text-slate-700'
               }`}>{d}</div>
             );
           })}
        </div>
        
        <div className="grid grid-cols-7 auto-rows-fr bg-slate-200 gap-px">
           {days.map((date, idx) => {
             if (!date) return <div key={`empty-${idx}`} className="bg-slate-50 min-h-[150px] border-2 border-dashed border-slate-200" />;
             
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
                 className={`bg-white min-h-[150px] p-3 hover:bg-blue-50/40 transition-colors group relative ${
                   isWeekend ? 'bg-slate-50/30' : ''
                 } ${
                   isToday ? 'bg-blue-100/50 ring-3 ring-blue-400 ring-inset' : ''
                 } ${
                   dragOverDate === dateStr ? 'bg-blue-200 ring-3 ring-blue-500 ring-inset' : ''
                 } ${
                   dayItems.length === 0 ? 'border-2 border-dashed border-slate-200' : ''
                 }`}
               >
                 <div className={`text-sm font-bold mb-2.5 flex justify-between items-center ${isToday ? 'text-blue-700' : 'text-slate-600'}`}>
                    <span className={isToday ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white w-8 h-8 flex items-center justify-center rounded-full shadow-md font-bold text-sm" : "w-8 h-8 flex items-center justify-center text-slate-700 font-bold"}>{date.getDate()}</span>
                    {dayItems.length > 0 && (
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-bold shadow-sm">{dayItems.length}</span>
                    )}
                 </div>
                 
                 <div className="relative space-y-2 overflow-y-auto max-h-[calc(150px-50px)] scrollbar-thin scrollbar-thumb-slate-400 scrollbar-track-transparent">
                   {/* Gradient overlay when items are hidden */}
                   {!isExpanded && hiddenCount > 0 && (
                     <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none z-10"></div>
                   )}
                   {visibleItems.map(item => {
                     const isRisk = item.status === Status.AtRisk;
                     const isBAU = item.initiativeType === InitiativeType.BAU;
                     const overdue = isOverdue(item.eta || '');
                     const dueSoon = isDueSoon(item.eta || '');
                     
                     // Enhanced color coding with stronger contrast
                     let bgClass = 'bg-blue-100 text-blue-900 border-2 border-blue-300 hover:bg-blue-200';
                     let statusBorderColor = 'border-l-[3px] border-l-blue-400';
                     if (isRisk) {
                       bgClass = 'bg-red-100 text-red-900 border-2 border-red-300 hover:bg-red-200';
                       statusBorderColor = 'border-l-[3px] border-l-red-500';
                     } else if (item.status === Status.Done) {
                       bgClass = 'bg-emerald-100 text-emerald-900 border-2 border-emerald-300 hover:bg-emerald-200';
                       statusBorderColor = 'border-l-[3px] border-l-emerald-500';
                     } else if (isBAU) {
                       bgClass = 'bg-amber-100 text-amber-900 border-2 border-amber-300 hover:bg-amber-200';
                       statusBorderColor = 'border-l-[3px] border-l-amber-400';
                     }
                     
                     // Add overdue border or due soon background
                     let borderClass = '';
                     let backgroundTint = '';
                     if (overdue) {
                       borderClass = 'border-red-500 border-2';
                     } else if (dueSoon && item.status !== Status.Done) {
                       backgroundTint = 'bg-yellow-100';
                       borderClass = 'border-yellow-300';
                     }

                     const ownerAvatar = getOwnerAvatar(users, item.ownerId);
                     const ownerInitials = getOwnerInitials(users, item.ownerId);

                     // Status icon - larger and more visible
                     const getStatusIcon = () => {
                       if (item.status === Status.AtRisk) {
                         return <AlertTriangle className="w-4 h-4 text-red-700" />;
                       } else if (item.status === Status.InProgress) {
                         return <PlayCircle className="w-4 h-4 text-blue-700" />;
                       } else if (item.status === Status.Done) {
                         return <CheckCircle className="w-4 h-4 text-emerald-700" />;
                       } else if (item.status === Status.Obsolete) {
                         return <History className="w-4 h-4 text-slate-600" />;
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
                         className={`w-full text-left text-xs px-2.5 py-1.5 rounded-md font-semibold cursor-move shadow-md transition-all hover:shadow-lg relative ${
                           bgClass
                         } ${statusBorderColor} ${borderClass} ${backgroundTint} ${
                           draggedItemId === item.id ? 'opacity-50 scale-95' : ''
                         }`}
                         title={`${item.id} - ${item.title}`}
                         onClick={() => { setEditingItem(item); setIsModalOpen(true); }}
                       >
                         {/* Status Icon */}
                         <div className="absolute top-1.5 left-1.5">
                           {getStatusIcon()}
                         </div>
                         
                         {/* Overdue Indicator */}
                         {overdue && (
                           <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-sm"></div>
                         )}
                         
                         {/* Title with truncation and search highlighting */}
                         <div className="line-clamp-2 pr-4 pl-5">
                           <span className="font-mono text-[9px] opacity-80 mr-1.5">{item.id}</span>
                           {highlightSearchMatch(item.title, searchQuery)}
                         </div>
                         
                         {/* Owner Badge */}
                         <div className="flex items-center mt-1 pt-1 border-t border-current/30">
                           {ownerAvatar ? (
                             <img 
                               src={ownerAvatar} 
                               alt={ownerInitials}
                               className="w-4 h-4 rounded-full border-2 border-current/30"
                             />
                           ) : (
                             <div className="w-4 h-4 rounded-full bg-current/30 flex items-center justify-center text-[7px] font-bold leading-none">
                               {ownerInitials}
                             </div>
                           )}
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
                       className="w-full text-[10px] text-slate-700 hover:text-slate-900 font-semibold py-1.5 px-2 bg-slate-200 hover:bg-slate-300 rounded-md transition-colors shadow-sm"
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
                       className="w-full text-[10px] text-slate-700 hover:text-slate-900 font-semibold py-1.5 px-2 bg-slate-200 hover:bg-slate-300 rounded-md transition-colors shadow-sm"
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
