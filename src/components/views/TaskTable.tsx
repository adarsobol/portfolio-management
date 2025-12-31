import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, ChevronRight, Plus, X, Layers, FileText, CheckSquare } from 'lucide-react';
import { Initiative, User, Status, Priority, WorkType, AppConfig, Comment, UserCommentReadState, InitiativeType, Task, Role, UnplannedTag } from '../../types';
import { StatusBadge, PriorityBadge, getStatusRowColor, getPriorityRowColor, getStatusCellBg, getPriorityCellBg } from '../shared/Shared';
import { CommentPopover } from '../shared/CommentPopover';
import { getOwnerName, checkOutdated, generateId, canEditAllTasks, canEditOwnTasks, canDeleteTasks, canDeleteTaskItem, canEditTaskItem } from '../../utils';
import { weeksToDays, daysToWeeks } from '../../utils/effortConverter';
import { sheetsSync } from '../../services';
import { logger } from '../../utils/logger';

interface TaskTableProps {
  filteredInitiatives: Initiative[];
  allInitiatives?: Initiative[]; // All initiatives for trade-off dropdown (unfiltered)
  handleInlineUpdate: (id: string, field: keyof Initiative, value: any, suppressNotification?: boolean) => void;
  setEditingItem: (item: Initiative) => void;
  setIsModalOpen: (isOpen: boolean) => void;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  handleSort: (key: string) => void;
  users: User[];
  currentUser: User;
  config: AppConfig;
  viewMode?: 'flat';
  // Comment popover props
  commentReadState?: UserCommentReadState;
  onAddComment?: (initiativeId: string, comment: Comment) => void;
  onMarkCommentRead?: (initiativeId: string) => void;
  onDeleteInitiative?: (id: string) => void;
  // At Risk reason modal props
  onOpenAtRiskModal?: (initiative: Initiative) => void;
  effortDisplayUnit?: 'weeks' | 'days';
  setEffortDisplayUnit?: (unit: 'weeks' | 'days') => void;
  optimisticUpdates?: Map<string, { field: string; value: any; timestamp: number }>;
}

interface GroupedInitiatives {
  [assetClass: string]: {
    [pillar: string]: Initiative[];
  };
}

export const TaskTable: React.FC<TaskTableProps> = ({
  filteredInitiatives,
  allInitiatives,
  handleInlineUpdate,
  setEditingItem: _setEditingItem,
  setIsModalOpen: _setIsModalOpen,
  sortConfig,
  handleSort,
  users,
  currentUser,
  config,
  viewMode = 'flat',
  commentReadState = {},
  onAddComment,
  onMarkCommentRead,
  onDeleteInitiative: _onDeleteInitiative,
  onOpenAtRiskModal,
  effortDisplayUnit: _effortDisplayUnit = 'weeks',
  setEffortDisplayUnit: _setEffortDisplayUnit,
  optimisticUpdates = new Map()
}) => {
  const navigate = useNavigate();
  void _onDeleteInitiative; // Reserved for delete functionality
  
  // Per-initiative effort display unit state
  const [effortDisplayUnits, setEffortDisplayUnits] = useState<Map<string, 'weeks' | 'days'>>(new Map());
  
  // Helper functions for per-initiative display units
  const getDisplayUnit = (initiativeId: string): 'weeks' | 'days' => {
    return effortDisplayUnits.get(initiativeId) || 'weeks';
  };
  
  const setDisplayUnit = (initiativeId: string, unit: 'weeks' | 'days') => {
    setEffortDisplayUnits(prev => new Map(prev).set(initiativeId, unit));
  };
  
  // Use allInitiatives if provided, otherwise fall back to filteredInitiatives
  const allInitiativesList = allInitiatives || filteredInitiatives;
  // Ref for scrollable container
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Track collapsed groups
  const [_collapsedGroups, _setCollapsedGroups] = useState<Set<string>>(new Set());
  void _collapsedGroups; void _setCollapsedGroups; // Reserved for group collapse feature
  
  // Track expanded tasks for all initiatives
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  
  // Track which initiatives are in "add task" mode
  const [addingTaskFor, setAddingTaskFor] = useState<string | null>(null);
  
  // State for hover tooltip
  const [hoveredAtRiskDot, setHoveredAtRiskDot] = useState<string | null>(null);
  const [tooltipPositions, setTooltipPositions] = useState<Map<string, 'above' | 'below'>>(new Map());
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const atRiskButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  
  // New task form state
  const [newTaskForm, setNewTaskForm] = useState<Partial<Task> & { 
    initiativeId?: string; 
    tradeOffInitiativeId?: string;
    tradeOffTaskId?: string;
    tradeOffEta?: string;
  }>({
    title: '',
    estimatedEffort: 1,
    actualEffort: 0,
    eta: '',
    ownerId: '',
    status: Status.NotStarted,
    tags: [],
    initiativeId: undefined,
    tradeOffInitiativeId: undefined,
    tradeOffTaskId: undefined,
    tradeOffEta: undefined
  });

  const _toggleGroup = (groupKey: string) => {
    _setCollapsedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };
  void _toggleGroup; // Reserved for group toggle feature
  
  const toggleTasks = (initiativeId: string) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(initiativeId)) {
        newSet.delete(initiativeId);
        setAddingTaskFor(null);
      } else {
        newSet.add(initiativeId);
      }
      return newSet;
    });
  };
  
  const handleAddTask = (defaultInitiativeId?: string) => {
    // Use selected initiative or default to the one passed in
    const targetInitiativeId = newTaskForm.initiativeId || defaultInitiativeId;
    if (!targetInitiativeId) {
      alert('Please select an initiative');
      return;
    }
    
    const initiative = filteredInitiatives.find(i => i.id === targetInitiativeId);
    if (!initiative) {
      alert('Please select an initiative');
      return;
    }
    
    if (!newTaskForm.eta || !newTaskForm.ownerId) {
      alert('Please fill in all required fields (ETA and Owner)');
      return;
    }
    
    const newTask: Task = {
      id: generateId(),
      title: newTaskForm.title || undefined,
      estimatedEffort: newTaskForm.estimatedEffort || 1,
      actualEffort: newTaskForm.actualEffort || 0,
      eta: newTaskForm.eta,
      ownerId: newTaskForm.ownerId,
      status: newTaskForm.status || Status.NotStarted,
      tags: newTaskForm.tags || [],
      comments: [],
      createdAt: new Date().toISOString()
    };
    
    const updatedTasks = [...(initiative.tasks || []), newTask];
    const totalActualEffort = updatedTasks.reduce((sum, task) => sum + (task.actualEffort || 0), 0);
    
    // Update tasks and actual effort (auto-calculate actual effort from tasks if tasks exist)
    handleInlineUpdate(targetInitiativeId, 'tasks', updatedTasks);
    handleInlineUpdate(targetInitiativeId, 'actualEffort', totalActualEffort, true); // suppressNotification: true
    
    // Handle trade-off if specified
    if (newTaskForm.tradeOffInitiativeId && newTaskForm.tradeOffEta) {
      const tradeOffInitiative = allInitiativesList.find(i => i.id === newTaskForm.tradeOffInitiativeId);
      if (tradeOffInitiative) {
        // If task ID is provided, update task ETA
        if (newTaskForm.tradeOffTaskId) {
          if (tradeOffInitiative.tasks && tradeOffInitiative.tasks.length > 0) {
            const taskExists = tradeOffInitiative.tasks.some(t => t.id === newTaskForm.tradeOffTaskId);
            if (taskExists) {
              const updatedTradeOffTasks = tradeOffInitiative.tasks.map(task =>
                task.id === newTaskForm.tradeOffTaskId
                  ? { ...task, eta: newTaskForm.tradeOffEta! }
                  : task
              );
              handleInlineUpdate(newTaskForm.tradeOffInitiativeId, 'tasks', updatedTradeOffTasks);
            } else {
              console.warn('Trade-off task not found:', newTaskForm.tradeOffTaskId);
            }
          } else {
            console.warn('Trade-off initiative has no tasks:', newTaskForm.tradeOffInitiativeId);
          }
        } else {
          // No task ID provided, update initiative ETA
          handleInlineUpdate(newTaskForm.tradeOffInitiativeId, 'eta', newTaskForm.tradeOffEta);
        }
      } else {
        console.warn('Trade-off initiative not found:', newTaskForm.tradeOffInitiativeId);
      }
    }
    
    // Reset form and close add mode
    setNewTaskForm({
      title: '',
      estimatedEffort: 1,
      actualEffort: 0,
      eta: '',
      ownerId: '',
      status: Status.NotStarted,
      tags: [],
      initiativeId: undefined,
      tradeOffInitiativeId: undefined,
      tradeOffTaskId: undefined,
      tradeOffEta: undefined
    });
    setAddingTaskFor(null);
  };
  
  const handleUpdateTask = (initiativeId: string, taskId: string, field: keyof Task, value: any) => {
    console.log('handleUpdateTask called', { initiativeId, taskId, field, value });
    
    // Use allInitiatives if available (full list), otherwise fall back to filteredInitiatives
    const sourceInitiatives = allInitiatives || filteredInitiatives;
    const initiative = sourceInitiatives.find(i => i.id === initiativeId);
    if (!initiative || !initiative.tasks) {
      console.warn(`Initiative ${initiativeId} not found or has no tasks`);
      return;
    }
    
    console.log('Current initiative tasks:', initiative.tasks);
    
    // Find the task to update
    const taskToUpdate = initiative.tasks.find(t => t.id === taskId);
    if (!taskToUpdate) {
      console.warn(`Task ${taskId} not found in initiative ${initiativeId}`);
      return;
    }

    // Check edit permissions for this specific task
    if (!canEditTask(initiative, taskToUpdate)) {
      const editScope = config.rolePermissions?.[currentUser.role]?.editTasks;
      if (editScope === 'own') {
        alert('You can only edit tasks that you own.');
      } else {
        alert('You do not have permission to edit tasks.');
      }
      return;
    }
    
    console.log('Task to update:', taskToUpdate, 'new value:', value);
    
    // Create a new array with updated task - ensure we create a completely new object
    const updatedTasks = initiative.tasks.map(task =>
      task.id === taskId ? { ...task, [field]: value } : task
    );
    
    console.log('Updated tasks:', updatedTasks);
    
    // Recalculate actual effort if effort fields changed (planned effort is manually set for BAU initiatives)
    if (field === 'estimatedEffort' || field === 'actualEffort') {
      const totalActualEffort = updatedTasks.reduce((sum, task) => sum + (task.actualEffort || 0), 0);
      
      console.log('Updating actual effort:', { totalActualEffort });
      
      // Update tasks array first, then actual effort
      // React 18+ will batch these automatically
      handleInlineUpdate(initiativeId, 'tasks', updatedTasks);
      handleInlineUpdate(initiativeId, 'actualEffort', totalActualEffort, true); // suppressNotification: true
    } else {
      // For non-effort fields, just update tasks
      console.log('Updating tasks only');
      handleInlineUpdate(initiativeId, 'tasks', updatedTasks);
    }
  };
  
  const canDeleteTask = (item: Initiative, task: Task): boolean => {
    return canDeleteTaskItem(config, currentUser.role, task.ownerId, item.ownerId, currentUser.id);
  };

  const canEditTask = (item: Initiative, task: Task): boolean => {
    // For task-level editing, check task ownership specifically
    // If user can edit all tasks, allow
    if (canEditAllTasks(config, currentUser.role)) return true;
    // Otherwise, check if user can edit this specific task
    return canEditTaskItem(config, currentUser.role, task.ownerId, item.ownerId, currentUser.id);
  };

  const handleDeleteTask = async (initiativeId: string, taskId: string) => {
    const initiative = filteredInitiatives.find(i => i.id === initiativeId);
    if (!initiative || !initiative.tasks) return;
    
    const task = initiative.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Check delete permissions
    if (!canDeleteTask(initiative, task)) {
      const deleteScope = config.rolePermissions?.[currentUser.role]?.deleteTasks;
      if (deleteScope === 'own') {
        alert('You can only delete tasks that you own.');
      } else {
        alert('You do not have permission to delete tasks.');
      }
      return;
    }

    // Confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to delete this task?\n\nYou can restore it from the Trash later.`
    );

    if (!confirmed) {
      return;
    }

    try {
      // Soft delete in Google Sheets
      const result = await sheetsSync.deleteTask(taskId);
      
      if (result.success) {
        // Update local state to mark task as deleted
        const updatedTasks = initiative.tasks.map(t => 
          t.id === taskId 
            ? { ...t, status: Status.Deleted, deletedAt: result.deletedAt } 
            : t
        );
        const totalActualEffort = updatedTasks
          .filter(t => t.status !== Status.Deleted)
          .reduce((sum, t) => sum + (t.actualEffort || 0), 0);
        
        // Update tasks and actual effort
        handleInlineUpdate(initiativeId, 'tasks', updatedTasks);
        handleInlineUpdate(initiativeId, 'actualEffort', totalActualEffort, true); // suppressNotification: true
      } else {
        alert('Failed to delete task. Please try again.');
        logger.error('Failed to delete task', { context: 'TaskTable.handleDeleteTask', taskId, initiativeId });
      }
    } catch (error) {
      logger.error('Failed to delete task', { context: 'TaskTable.handleDeleteTask', error: error instanceof Error ? error : new Error(String(error)), taskId, initiativeId });
      alert('Failed to delete task. Please try again.');
    }
  };

  const getOwnerNameById = (id?: string) => getOwnerName(users, id);

  const canInlineEdit = (item: Initiative): boolean => {
    // #region agent log
    const canEditAll = canEditAllTasks(config, currentUser.role);
    const canEditOwn = canEditOwnTasks(config, currentUser.role);
    const ownerMatch = item.ownerId === currentUser.id;
    const editTasksPermValue = config.rolePermissions?.[currentUser.role]?.editTasks;
    const result = canEditAll || (ownerMatch && canEditOwn);
    console.log('[DEBUG canInlineEdit]', { currentUserId: currentUser.id, currentUserRole: currentUser.role, itemOwnerId: item.ownerId, itemTitle: item.title, ownerMatch, canEditAll, canEditOwn, editTasksPermValue, result });
    fetch('http://127.0.0.1:7242/ingest/30bff00f-1252-4a6a-a1a1-ff6715802d11',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'TaskTable.tsx:canInlineEdit',message:'Permission check for inline edit',data:{currentUserId:currentUser.id,currentUserRole:currentUser.role,itemOwnerId:item.ownerId,itemTitle:item.title,ownerMatch,canEditAll,canEditOwn,editTasksPermValue,result},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B,C,E'})}).catch(()=>{});
    // #endregion
    // Check if user can edit all tasks
    if (canEditAllTasks(config, currentUser.role)) return true;
    // Check if user can edit own tasks and this is their task
    if (item.ownerId === currentUser.id && canEditOwnTasks(config, currentUser.role)) return true;
    return false;
  };

  const _canDelete = (): boolean => {
    // Only Admin or Director (Group Lead) can delete
    return currentUser.role === Role.Admin || currentUser.role === Role.DirectorGroup;
  };
  void _canDelete; // Reserved for delete permission check

  const getPreviousValue = (item: Initiative, fieldName: string) => {
    if (!item.history || item.history.length === 0) return null;
    const records = item.history.filter(h => h.field === fieldName);
    if (records.length === 0) return null;
    const lastRecord = records[records.length - 1];
    return lastRecord.oldValue;
  };

  // Group initiatives by asset class and pillar (for flat/table view)
  const _groupedInitiatives = useMemo((): GroupedInitiatives => {
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
  void _groupedInitiatives; // Reserved for grouped view feature


  const SortableHeader = ({ label, sortKey, alignRight = false }: { label: string, sortKey: string, alignRight?: boolean }) => {
    const isActive = sortConfig?.key === sortKey;
    const isAsc = sortConfig?.direction === 'asc';

    return (
      <th 
        className={`px-3 py-2.5 text-center font-bold text-slate-700 cursor-pointer bg-gradient-to-b from-slate-100 to-slate-50 hover:from-slate-200 hover:to-slate-100 transition-all border-r border-slate-200 select-none whitespace-nowrap text-xs tracking-wider ${alignRight ? 'text-right' : ''}`}
        onClick={() => handleSort(sortKey)}
      >
        <div className={`flex items-center gap-1.5 ${alignRight ? 'justify-end' : 'justify-center'}`}>
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
      case Status.InProgress: return 'bg-blue-600 text-white border-blue-700 shadow-sm';
      // At Risk/Delayed: Red for immediate attention (changed from amber)
      case Status.AtRisk: return 'bg-red-600 text-white border-red-700 shadow-lg';
      // Completed: Muted green to fade into background
      case Status.Done: return 'bg-emerald-100 text-emerald-800 border-emerald-300';
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

  // Icon utilities for visual hierarchy
  const getInitiativeIcon = (initiative: Initiative): React.ReactNode => {
    if (initiative.initiativeType === InitiativeType.BAU) {
      return <Layers size={14} className="text-purple-600" />;
    }
    return <FileText size={14} className="text-blue-600" />;
  };

  const getTaskIcon = (_task: Task): React.ReactNode => {
    return <CheckSquare size={12} className="text-purple-500" />;
  };

  // Loading indicator component
  const LoadingIndicator = ({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) => {
    const sizeClasses = {
      sm: 'w-3 h-3',
      md: 'w-4 h-4',
      lg: 'w-6 h-6'
    };
    
    return (
      <div className={`${sizeClasses[size]} border-2 border-blue-500 border-t-transparent rounded-full animate-spin`} />
    );
  };

  const renderRow = (item: Initiative, _index: number, editable: boolean) => {
    const isOutdated = checkOutdated(item.lastUpdated);
    const _prevEffort = getPreviousValue(item, 'Effort');
    void _prevEffort; // Reserved for effort history display
    const prevEta = getPreviousValue(item, 'ETA');
    const isBAU = item.initiativeType === InitiativeType.BAU;
    const tasksExpanded = expandedTasks.has(item.id);
    const isAddingTask = addingTaskFor === item.id;
    // Get per-initiative display unit (defaults to 'weeks')
    const displayUnit = getDisplayUnit(item.id);
    const tasks = item.tasks || [];
    const isAtRisk = item.status === Status.AtRisk;
    const showTooltip = hoveredAtRiskDot === item.id && isAtRisk;

    const statusRowColor = getStatusRowColor(item.status);
    const priorityRowColor = getPriorityRowColor(item.priority);
    const rowColorClass = `${statusRowColor} ${priorityRowColor}`;
    const isUpdating = optimisticUpdates.has(item.id);

    return (
      <>
        <tr key={item.id} className={`group hover:bg-blue-50/60 transition-colors border-b border-slate-100 ${rowColorClass} ${isUpdating ? 'bg-blue-50/30' : ''}`}>
          <td className="px-2.5 py-2 border-r border-b border-slate-200 text-center text-xs text-slate-400 font-mono select-none bg-slate-50/50">
            {item.id}
          </td>
          <td className="px-3 py-2 border-r border-b border-slate-200 min-w-[320px] relative">
            <div className="flex items-start gap-2 justify-between">
              {/* Left side: Icon, chevron, and title */}
              <div className="flex items-start gap-2 flex-1 min-w-0">
                {/* Initiative icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {getInitiativeIcon(item)}
                </div>
                {tasks.length > 0 && (
                  <button
                    onClick={() => toggleTasks(item.id)}
                    className={`p-1 hover:bg-purple-100 rounded transition-colors flex-shrink-0 mt-0.5 ${isBAU ? '' : 'hover:bg-blue-100'}`}
                    title={tasksExpanded ? `Collapse ${tasks.length} tasks` : `Expand ${tasks.length} tasks`}
                  >
                    {tasksExpanded ? (
                      <ChevronDown size={14} className={isBAU ? "text-purple-600" : "text-blue-600"} />
                    ) : (
                      <ChevronRight size={14} className={isBAU ? "text-purple-600" : "text-blue-600"} />
                    )}
                  </button>
                )}
                {/* Title button - always starts at same position */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigate(`/item/${encodeURIComponent(item.id)}`);
                  }}
                  className={`font-semibold text-slate-900 text-sm leading-relaxed break-words text-left flex-1 min-w-0 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition-all cursor-pointer ${
                    isBAU ? 'bg-purple-50/50 border border-purple-200' : 'bg-blue-50/30 border border-blue-200'
                  }`}
                  title={item.title}
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="break-words">{item.title}</span>
                    {isBAU && (
                      <span className="px-1 py-0.5 bg-purple-100 text-purple-700 text-[8px] font-bold rounded flex-shrink-0">
                        BAU
                      </span>
                    )}
                  </div>
                </button>
              </div>
              {/* Right side: Task count badge, status dots, and add task button */}
              <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                {!tasksExpanded && tasks.length > 0 && (
                  <>
                    <span className="px-1.5 py-0.5 bg-purple-600 text-white text-[9px] font-bold rounded-full min-w-[18px] text-center">
                      {tasks.length}
                    </span>
                    {/* Show status breakdown dots */}
                    <div className="flex gap-0.5">
                      {tasks.filter(t => t.status === Status.InProgress).length > 0 && (
                        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" title={`${tasks.filter(t => t.status === Status.InProgress).length} in progress`} />
                      )}
                      {tasks.filter(t => t.status === Status.AtRisk).length > 0 && (
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full" title={`${tasks.filter(t => t.status === Status.AtRisk).length} at risk`} />
                      )}
                      {tasks.filter(t => t.status === Status.Done).length > 0 && (
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" title={`${tasks.filter(t => t.status === Status.Done).length} done`} />
                      )}
                    </div>
                  </>
                )}
                {/* Add task button - visible when editable */}
                {editable && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // Expand tasks if not already expanded
                      if (!tasksExpanded) {
                        setExpandedTasks(prev => {
                          const newSet = new Set(prev);
                          newSet.add(item.id);
                          return newSet;
                        });
                      }
                      // Show add task form
                      setAddingTaskFor(item.id);
                      const defaultEta = new Date().toISOString().split('T')[0];
                      setNewTaskForm({
                        title: '',
                        estimatedEffort: 1,
                        actualEffort: 0,
                        eta: defaultEta,
                        ownerId: item.ownerId,
                        status: Status.NotStarted,
                        tags: [],
                        initiativeId: item.id,
                        tradeOffInitiativeId: undefined,
                        tradeOffTaskId: undefined,
                        tradeOffEta: undefined
                      });
                    }}
                    className={`p-1 hover:bg-blue-100 rounded transition-colors flex-shrink-0 ${isBAU ? 'hover:bg-purple-100' : ''}`}
                    title="Add new task"
                  >
                    <Plus size={14} className={isBAU ? "text-purple-600" : "text-blue-600"} />
                  </button>
                )}
              </div>
            </div>
          {/* Compact metadata styling */}
          <div className="text-[9px] mt-1 flex gap-1 items-center flex-wrap">
             {viewMode === 'flat' && (
               <>
                 <span className="font-bold text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded">{item.l1_assetClass}</span>
                 <span className="text-slate-400">•</span>
                 <span className="text-slate-500 truncate max-w-[100px] italic" title={item.l2_pillar}>{item.l2_pillar}</span>
               </>
             )}
             {item.workType === WorkType.Unplanned && (
               <span className="text-amber-600 font-bold flex items-center gap-0.5 bg-amber-50 px-1 py-0.5 rounded">
                 <AlertTriangle size={8} />
                 <span className="text-[8px]">Unplanned</span>
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
          {isAtRisk && (
             <div className="absolute top-2 right-2">
                <div className="relative group">
                  <button
                    ref={(el) => {
                      if (el) {
                        atRiskButtonRefs.current.set(item.id, el);
                      } else {
                        atRiskButtonRefs.current.delete(item.id);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenAtRiskModal) {
                        onOpenAtRiskModal(item);
                      }
                    }}
                    onMouseEnter={(e) => {
                      // Check if we're near the top of the viewport
                      const button = e.currentTarget;
                      const buttonRect = button.getBoundingClientRect();
                      const tooltipHeight = 150; // Approximate tooltip height
                      const spaceAbove = buttonRect.top;
                      const shouldShowBelow = spaceAbove < tooltipHeight + 20;
                      
                      setTooltipPositions(prev => {
                        const next = new Map(prev);
                        next.set(item.id, shouldShowBelow ? 'below' : 'above');
                        return next;
                      });
                      
                      hoverTimeoutRef.current = setTimeout(() => {
                        setHoveredAtRiskDot(item.id);
                      }, 300);
                    }}
                    onMouseLeave={() => {
                      if (hoverTimeoutRef.current) {
                        clearTimeout(hoverTimeoutRef.current);
                      }
                      setHoveredAtRiskDot(null);
                    }}
                    className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-sm hover:bg-red-600 transition-colors cursor-pointer"
                    title="Click to edit risk reason"
                  />
                  {/* Hover Tooltip */}
                  {showTooltip && item.riskActionLog && (() => {
                    const button = atRiskButtonRefs.current.get(item.id);
                    const position = tooltipPositions.get(item.id) || 'above';
                    const buttonRect = button?.getBoundingClientRect();
                    
                    if (!buttonRect) return null;
                    
                    const tooltipStyle = position === 'below'
                      ? {
                          position: 'fixed' as const,
                          top: `${buttonRect.bottom + 8}px`,
                          right: `${window.innerWidth - buttonRect.right}px`,
                          zIndex: 9999
                        }
                      : {
                          position: 'fixed' as const,
                          top: `${buttonRect.top - 8}px`,
                          right: `${window.innerWidth - buttonRect.right}px`,
                          transform: 'translateY(-100%)',
                          zIndex: 9999
                        };
                    
                    return (
                      <div
                        className="w-64 bg-white rounded-lg shadow-xl border border-slate-200 p-3 pointer-events-none"
                        style={tooltipStyle}
                      >
                      <div className="text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                        <AlertTriangle size={12} className="text-red-600" />
                        At Risk Reason
                      </div>
                      <p className="text-xs text-slate-600 whitespace-pre-wrap break-words">
                        {item.riskActionLog}
                      </p>
                      <div className="mt-2 pt-2 border-t border-slate-100 text-center">
                        <span className="text-[10px] text-blue-600 font-medium">Click to edit →</span>
                      </div>
                    </div>
                    );
                  })()}
                </div>
             </div>
          )}
        </td>
        <td className="px-2.5 py-2 border-r border-b border-slate-200 whitespace-nowrap">
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
        <td className={`px-2.5 py-2 border-r border-b border-slate-200 text-center relative ${getStatusCellBg(item.status)}`}>
          {isUpdating && (
            <div className="absolute top-1 right-1 z-10">
              <LoadingIndicator size="sm" />
            </div>
          )}
          {editable ? (
             <select 
               value={item.status}
               onChange={(e) => handleInlineUpdate(item.id, 'status', e.target.value)}
               className={`w-full text-[11px] font-bold border focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-1.5 py-1 rounded-md cursor-pointer h-full ${getStatusSelectStyle(item.status)}`}
             >
               {Object.values(Status).filter(s => s !== Status.Deleted).map(s => <option key={s} value={s} className="bg-white text-slate-900">{s}</option>)}
             </select>
          ) : (
             <StatusBadge status={item.status} />
          )}
        </td>
        <td className={`px-2.5 py-2 border-r border-b border-slate-200 text-center relative ${getPriorityCellBg(item.priority)}`}>
          {isUpdating && (
            <div className="absolute top-1 right-1 z-10">
              <LoadingIndicator size="sm" />
            </div>
          )}
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
        <td className="px-2.5 py-2 border-r border-b border-slate-200 min-w-[150px]">
          {editable ? (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const currentWeeks = item.actualEffort || 0;
                    const decrement = displayUnit === 'days' ? daysToWeeks(1) : 0.25;
                    handleInlineUpdate(item.id, 'actualEffort', Math.max(0, currentWeeks - decrement));
                  }}
                  className="p-0.5 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-colors flex-shrink-0"
                  title={displayUnit === 'days' ? 'Decrease by 1 day' : 'Decrease by 0.25 weeks'}
                >
                  <ArrowDown size={12} />
                </button>
                <input 
                  type="number"
                  min="0"
                  step={displayUnit === 'days' ? '1' : '0.25'}
                  value={displayUnit === 'days'
                    ? weeksToDays(item.actualEffort || 0).toFixed(1)
                    : (item.actualEffort || 0).toFixed(2)}
                  onChange={(e) => {
                    const inputValue = parseFloat(e.target.value) || 0;
                    const weeksValue = displayUnit === 'days'
                      ? daysToWeeks(inputValue)
                      : inputValue;
                    handleInlineUpdate(item.id, 'actualEffort', weeksValue);
                  }}
                  className="w-16 bg-white text-xs font-mono text-slate-700 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded-md text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  title="Actual Effort"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const currentWeeks = item.actualEffort || 0;
                    const increment = displayUnit === 'days' ? daysToWeeks(1) : 0.25;
                    handleInlineUpdate(item.id, 'actualEffort', currentWeeks + increment);
                  }}
                  className="p-0.5 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-colors flex-shrink-0"
                  title={displayUnit === 'days' ? 'Increase by 1 day' : 'Increase by 0.25 weeks'}
                >
                  <ArrowUp size={12} />
                </button>
              </div>
              <span className="text-slate-300 text-xs font-medium flex-shrink-0">/</span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const currentWeeks = item.estimatedEffort || 0;
                    const decrement = displayUnit === 'days' ? daysToWeeks(1) : 0.25;
                    handleInlineUpdate(item.id, 'estimatedEffort', Math.max(0, currentWeeks - decrement));
                  }}
                  className="p-0.5 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-colors flex-shrink-0"
                  title={displayUnit === 'days' ? 'Decrease by 1 day' : 'Decrease by 0.25 weeks'}
                >
                  <ArrowDown size={12} />
                </button>
                <input 
                  type="number"
                  min="0"
                  step={displayUnit === 'days' ? '1' : '0.25'}
                  value={displayUnit === 'days' 
                    ? weeksToDays(item.estimatedEffort || 0).toFixed(1)
                    : (item.estimatedEffort || 0).toFixed(2)}
                  onChange={(e) => {
                    const inputValue = parseFloat(e.target.value) || 0;
                    const weeksValue = displayUnit === 'days' 
                      ? daysToWeeks(inputValue)
                      : inputValue;
                    handleInlineUpdate(item.id, 'estimatedEffort', weeksValue);
                  }}
                  className="w-16 bg-white text-xs font-mono text-slate-700 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded-md text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  title="Planned Effort"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const currentWeeks = item.estimatedEffort || 0;
                    const increment = displayUnit === 'days' ? daysToWeeks(1) : 0.25;
                    handleInlineUpdate(item.id, 'estimatedEffort', currentWeeks + increment);
                  }}
                  className="p-0.5 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-colors flex-shrink-0"
                  title={displayUnit === 'days' ? 'Increase by 1 day' : 'Increase by 0.25 weeks'}
                >
                  <ArrowUp size={12} />
                </button>
              </div>
              <div className="flex items-center gap-0.5 border border-slate-300 rounded ml-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDisplayUnit(item.id, 'days');
                  }}
                  className={`px-1 py-0.5 text-[9px] font-medium rounded transition-colors ${
                    displayUnit === 'days' 
                      ? 'bg-blue-600 text-white' 
                      : 'text-slate-600 hover:bg-slate-100 bg-white'
                  }`}
                  title="Switch to days"
                >
                  D
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDisplayUnit(item.id, 'weeks');
                  }}
                  className={`px-1 py-0.5 text-[9px] font-medium rounded transition-colors ${
                    displayUnit === 'weeks' 
                      ? 'bg-blue-600 text-white' 
                      : 'text-slate-600 hover:bg-slate-100 bg-white'
                  }`}
                  title="Switch to weeks"
                >
                  W
                </button>
              </div>
              <span className="text-slate-400 text-xs font-medium flex-shrink-0">{displayUnit === 'days' ? 'd' : 'w'}</span>
            </div>
          ) : (
            <div className="font-mono text-slate-700 text-xs font-semibold text-right bg-slate-50 px-2 py-1 rounded">
              {displayUnit === 'days' 
                ? `${weeksToDays(item.actualEffort || 0).toFixed(1)}/${weeksToDays(item.estimatedEffort || 0).toFixed(1)}d`
                : `${item.actualEffort}/${item.estimatedEffort}w`}
            </div>
          )}
          {item.originalEstimatedEffort !== item.estimatedEffort && (
             <div className="text-[9px] text-slate-400 italic text-right mt-1">Orig: {item.originalEstimatedEffort}w</div>
          )}
        </td>
        <td className="px-2.5 py-2 border-r border-b border-slate-200 min-w-[90px]">
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
                  className="w-14 bg-white text-xs font-semibold text-slate-700 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded-md text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
        <td className="px-2.5 py-2 border-r border-b border-slate-200 min-w-[110px]">
          <div className="flex flex-col gap-1">
             {editable ? (
               <input 
                  type="date"
                  value={item.eta || ''}
                  onChange={(e) => handleInlineUpdate(item.id, 'eta', e.target.value)}
                  className="w-full bg-white text-xs border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded-md"
               />
             ) : (
               <span className="text-xs font-semibold text-slate-700">{item.eta || 'N/A'}</span>
             )}
             
             {prevEta !== null && (
               <span className="text-[9px] text-slate-400 italic bg-slate-50 px-1.5 py-0.5 rounded inline-block">Prev: {String(prevEta)}</span>
             )}
             
             <div className="flex items-center gap-1 text-[9px]">
               <span className={`${isOutdated ? 'text-red-500 font-bold bg-red-50 px-1.5 py-0.5 rounded' : 'text-slate-400'}`}>
                 Upd: {new Date(item.lastUpdated).toLocaleDateString()}
               </span>
             </div>
          </div>
        </td>
      </tr>
      
      {/* Tasks dropdown row for all initiatives with tasks */}
      {tasksExpanded && tasks.length > 0 && (
        <tr className="bg-purple-50/30">
          <td colSpan={8} className="px-3 py-2 border-b border-slate-200">
            <div className="space-y-1.5">
              {/* Tasks List */}
              {tasks.filter(t => t.status !== Status.Deleted).length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold text-purple-700 mb-1.5 tracking-wide">Tasks ({tasks.filter(t => t.status !== Status.Deleted).length})</div>
                  {tasks.filter(task => task.status !== Status.Deleted).map((task, taskIndex) => (
                    <div key={task.id} className="bg-purple-50/30 border-l-4 border-l-purple-400 border border-purple-200 rounded-md shadow-sm hover:shadow transition-shadow relative ml-8">
                      <div className="flex items-center">
                        {/* Column 1: ID - Empty, matching initiative ID column width */}
                        <div className="w-12 px-2.5 py-2 text-center border-r border-purple-200"></div>
                        
                        {/* Column 2: Task Title (aligned with Initiative column) */}
                        <div className="px-3 py-2 border-r border-purple-200 min-w-[320px] flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {getTaskIcon(task)}
                            {editable ? (
                              <input
                                type="text"
                                value={task.title || ''}
                                onChange={(e) => handleUpdateTask(item.id, task.id, 'title', e.target.value || undefined)}
                                placeholder={`Task ${taskIndex + 1}`}
                                className="flex-1 min-w-[120px] text-xs font-medium text-slate-700 px-1.5 py-0.5 border border-purple-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-300 bg-white"
                              />
                            ) : (
                              <span className="text-xs font-medium text-slate-700">
                                {task.title || `Task ${taskIndex + 1}`}
                              </span>
                            )}
                            {!editable && task.tags && task.tags.length > 0 && (
                              <div className="flex gap-0.5">
                                {task.tags.map(tag => (
                                  <span key={tag} className="px-1 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-medium rounded">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            {editable && (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <label className="flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={task.tags?.includes(UnplannedTag.Unplanned) || false}
                                    onChange={(e) => {
                                      const currentTags = task.tags || [];
                                      const newTags = e.target.checked
                                        ? [...currentTags.filter(t => t !== UnplannedTag.Unplanned), UnplannedTag.Unplanned]
                                        : currentTags.filter(t => t !== UnplannedTag.Unplanned);
                                      handleUpdateTask(item.id, task.id, 'tags', newTags);
                                    }}
                                    className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                                  />
                                  <span className="text-[10px] text-slate-600">Unplanned</span>
                                </label>
                                <label className="flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={task.tags?.includes(UnplannedTag.PMItem) || false}
                                    onChange={(e) => {
                                      const currentTags = task.tags || [];
                                      const newTags = e.target.checked
                                        ? [...currentTags.filter(t => t !== UnplannedTag.PMItem), UnplannedTag.PMItem]
                                        : currentTags.filter(t => t !== UnplannedTag.PMItem);
                                      handleUpdateTask(item.id, task.id, 'tags', newTags);
                                    }}
                                    className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                                  />
                                  <span className="text-[10px] text-slate-600">PM Item</span>
                                </label>
                                <label className="flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={task.tags?.includes(UnplannedTag.RiskItem) || false}
                                    onChange={(e) => {
                                      const currentTags = task.tags || [];
                                      const newTags = e.target.checked
                                        ? [...currentTags.filter(t => t !== UnplannedTag.RiskItem), UnplannedTag.RiskItem]
                                        : currentTags.filter(t => t !== UnplannedTag.RiskItem);
                                      handleUpdateTask(item.id, task.id, 'tags', newTags);
                                    }}
                                    className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                                  />
                                  <span className="text-[10px] text-slate-600">Risk Item</span>
                                </label>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Column 3: Owner (aligned with Owner column) */}
                        <div className="px-2.5 py-2 border-r border-purple-200 whitespace-nowrap">
                          {editable ? (
                            <div className="flex items-center gap-1.5">
                              <select
                                value={task.ownerId}
                                onChange={(e) => handleUpdateTask(item.id, task.id, 'ownerId', e.target.value)}
                                className="text-xs px-1.5 py-0.5 border border-purple-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-300 bg-white"
                              >
                                {users.filter(u => u.role === Role.TeamLead).map(u => (
                                  <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2.5" title="Owner">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-100 to-purple-200 flex items-center justify-center text-[10px] font-bold text-purple-600 border border-purple-300 shadow-sm">
                                {getOwnerNameById(task.ownerId)?.charAt(0)}
                              </div>
                              <div className="flex flex-col justify-center gap-0.5">
                                <span className="text-slate-800 font-medium text-xs truncate max-w-[110px]">{getOwnerNameById(task.ownerId)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* Column 4: Status (aligned with Status column) */}
                        <div className="px-2.5 py-2 border-r border-purple-200 text-center">
                          {editable ? (
                            <select
                              value={task.status}
                              onChange={(e) => handleUpdateTask(item.id, task.id, 'status', e.target.value as Status)}
                              className={`w-full text-[11px] font-bold border focus:border-purple-500 focus:ring-1 focus:ring-purple-500 px-1.5 py-1 rounded-md cursor-pointer ${getStatusSelectStyle(task.status)}`}
                            >
                              {Object.values(Status).filter(s => s !== Status.Deleted).map(s => (
                                <option key={s} value={s} className="bg-white text-slate-900">{s}</option>
                              ))}
                            </select>
                          ) : (
                            <StatusBadge status={task.status} />
                          )}
                        </div>
                        
                        {/* Column 5: Priority - Empty (tasks don't have priority) */}
                        <div className="px-2.5 py-2 border-r border-purple-200 text-center"></div>
                        
                        {/* Column 6: Effort (aligned with Effort column) */}
                        <div className="px-2.5 py-2 border-r border-purple-200 min-w-[150px]">
                          {editable ? (() => {
                            // Get display unit from parent initiative
                            const taskDisplayUnit = getDisplayUnit(item.id);
                            return (
                            <div className="flex items-center gap-1.5">
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const currentWeeks = task.actualEffort || 0;
                                    const decrement = taskDisplayUnit === 'days' ? daysToWeeks(1) : 0.25;
                                    handleUpdateTask(item.id, task.id, 'actualEffort', Math.max(0, currentWeeks - decrement));
                                  }}
                                  className="p-0.5 hover:bg-purple-100 rounded text-slate-500 hover:text-purple-600 transition-colors flex-shrink-0"
                                  title={taskDisplayUnit === 'days' ? 'Decrease by 1 day' : 'Decrease by 0.25 weeks'}
                                >
                                  <ArrowDown size={12} />
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  step={taskDisplayUnit === 'days' ? '1' : '0.25'}
                                  value={taskDisplayUnit === 'days'
                                    ? weeksToDays(task.actualEffort || 0).toFixed(1)
                                    : (task.actualEffort || 0).toFixed(2)}
                                  onChange={(e) => {
                                    const inputValue = parseFloat(e.target.value) || 0;
                                    const weeksValue = taskDisplayUnit === 'days'
                                      ? daysToWeeks(inputValue)
                                      : inputValue;
                                    if (!isNaN(weeksValue) && weeksValue >= 0) {
                                      handleUpdateTask(item.id, task.id, 'actualEffort', weeksValue);
                                    }
                                  }}
                                  className="w-16 bg-white text-xs font-mono text-slate-700 border border-purple-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 px-2 py-1 rounded-md text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  title="Actual Effort"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const currentWeeks = task.actualEffort || 0;
                                    const increment = taskDisplayUnit === 'days' ? daysToWeeks(1) : 0.25;
                                    handleUpdateTask(item.id, task.id, 'actualEffort', currentWeeks + increment);
                                  }}
                                  className="p-0.5 hover:bg-purple-100 rounded text-slate-500 hover:text-purple-600 transition-colors flex-shrink-0"
                                  title={taskDisplayUnit === 'days' ? 'Increase by 1 day' : 'Increase by 0.25 weeks'}
                                >
                                  <ArrowUp size={12} />
                                </button>
                              </div>
                              <span className="text-slate-300 text-xs font-medium flex-shrink-0">/</span>
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const currentWeeks = task.estimatedEffort || 0;
                                    const decrement = taskDisplayUnit === 'days' ? daysToWeeks(1) : 0.25;
                                    handleUpdateTask(item.id, task.id, 'estimatedEffort', Math.max(0, currentWeeks - decrement));
                                  }}
                                  className="p-0.5 hover:bg-purple-100 rounded text-slate-500 hover:text-purple-600 transition-colors flex-shrink-0"
                                  title={taskDisplayUnit === 'days' ? 'Decrease by 1 day' : 'Decrease by 0.25 weeks'}
                                >
                                  <ArrowDown size={12} />
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  step={taskDisplayUnit === 'days' ? '1' : '0.25'}
                                  value={taskDisplayUnit === 'days'
                                    ? weeksToDays(task.estimatedEffort || 0).toFixed(1)
                                    : (task.estimatedEffort || 0).toFixed(2)}
                                  onChange={(e) => {
                                    const inputValue = parseFloat(e.target.value) || 0;
                                    const weeksValue = taskDisplayUnit === 'days'
                                      ? daysToWeeks(inputValue)
                                      : inputValue;
                                    if (!isNaN(weeksValue) && weeksValue >= 0) {
                                      handleUpdateTask(item.id, task.id, 'estimatedEffort', weeksValue);
                                    }
                                  }}
                                  className="w-16 bg-white text-xs font-mono text-slate-700 border border-purple-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 px-2 py-1 rounded-md text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  title="Planned Effort"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const currentWeeks = task.estimatedEffort || 0;
                                    const increment = taskDisplayUnit === 'days' ? daysToWeeks(1) : 0.25;
                                    handleUpdateTask(item.id, task.id, 'estimatedEffort', currentWeeks + increment);
                                  }}
                                  className="p-0.5 hover:bg-purple-100 rounded text-slate-500 hover:text-purple-600 transition-colors flex-shrink-0"
                                  title={taskDisplayUnit === 'days' ? 'Increase by 1 day' : 'Increase by 0.25 weeks'}
                                >
                                  <ArrowUp size={12} />
                                </button>
                              </div>
                              {setDisplayUnit && (
                                <div className="flex items-center gap-0.5 border border-purple-300 rounded ml-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setDisplayUnit(item.id, 'days');
                                    }}
                                    className={`px-1 py-0.5 text-[9px] font-medium rounded transition-colors ${
                                      taskDisplayUnit === 'days' 
                                        ? 'bg-purple-600 text-white' 
                                        : 'text-slate-600 hover:bg-slate-100 bg-white'
                                    }`}
                                    title="Switch to days"
                                  >
                                    D
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setDisplayUnit(item.id, 'weeks');
                                    }}
                                    className={`px-1 py-0.5 text-[9px] font-medium rounded transition-colors ${
                                      taskDisplayUnit === 'weeks' 
                                        ? 'bg-purple-600 text-white' 
                                        : 'text-slate-600 hover:bg-slate-100 bg-white'
                                    }`}
                                    title="Switch to weeks"
                                  >
                                    W
                                  </button>
                                </div>
                              )}
                              <span className="text-slate-400 text-xs font-medium flex-shrink-0">{taskDisplayUnit === 'days' ? 'd' : 'w'}</span>
                            </div>
                            );
                          })() : (() => {
                            // Get display unit from parent initiative for read-only display
                            const taskDisplayUnit = getDisplayUnit(item.id);
                            return (
                            <div className="font-mono text-slate-700 text-xs font-semibold text-right bg-purple-50 px-2 py-1 rounded">
                              {taskDisplayUnit === 'days'
                                ? `${weeksToDays(task.actualEffort || 0).toFixed(1)}/${weeksToDays(task.estimatedEffort || 0).toFixed(1)}d`
                                : `${task.actualEffort || 0}/${task.estimatedEffort || 0}w`}
                            </div>
                            );
                          })()}
                        </div>
                        
                        {/* Column 7: Progress - Empty (tasks don't have progress) */}
                        <div className="px-2.5 py-2 border-r border-purple-200 text-center"></div>
                        
                        {/* Column 8: ETA (aligned with ETA / Update column) */}
                        <div className="px-2.5 py-2 min-w-[110px]">
                          <div className="flex flex-col gap-1">
                            {editable ? (
                              <input
                                type="date"
                                value={task.eta || ''}
                                onChange={(e) => handleUpdateTask(item.id, task.id, 'eta', e.target.value)}
                                className="w-full bg-white text-xs border border-purple-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 px-2 py-1 rounded-md"
                              />
                            ) : (
                              <span className="text-xs font-semibold text-slate-700">{task.eta || 'N/A'}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Delete Button - positioned absolutely on the right */}
                      {canDeleteTask(item, task) && (
                        <button
                          onClick={() => handleDeleteTask(item.id, task.id)}
                          className="absolute top-2 right-2 p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors z-10"
                          title="Delete task"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {/* Add Task Button / Form */}
              {editable && (
                <div className="border-t border-slate-200 pt-3 mt-3">
                  {!isAddingTask ? (
                    <button
                      onClick={() => {
                        setAddingTaskFor(item.id);
                        const defaultEta = new Date().toISOString().split('T')[0];
                        setNewTaskForm({
                          title: '',
                          estimatedEffort: 1,
                          actualEffort: 0,
                          eta: defaultEta,
                          ownerId: item.ownerId,
                          status: Status.NotStarted,
                          tags: [],
                          initiativeId: item.id,
                          tradeOffInitiativeId: undefined,
                          tradeOffTaskId: undefined,
                          tradeOffEta: undefined
                        });
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 hover:border-blue-300 transition-colors"
                    >
                      <Plus size={16} />
                      Add New Task
                    </button>
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-2.5 space-y-2.5">
                      {/* Header */}
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                        <h3 className="text-xs font-semibold text-slate-800">New Task</h3>
                        <button
                          onClick={() => {
                            setAddingTaskFor(null);
                            setNewTaskForm({
                              title: '',
                              estimatedEffort: 1,
                              actualEffort: 0,
                              eta: '',
                              ownerId: '',
                              status: Status.NotStarted,
                              tags: [],
                              initiativeId: item.id,
                              tradeOffInitiativeId: undefined,
                              tradeOffTaskId: undefined,
                              tradeOffEta: undefined
                            });
                          }}
                          className="p-0.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                          aria-label="Close"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      {/* Form Fields */}
                      <div className="space-y-2.5">
                        {/* Task Title */}
                        <div>
                          <label className="block text-[10px] font-medium text-slate-700 mb-1">
                            Task Title <span className="text-slate-400 font-normal">(optional)</span>
                          </label>
                          <input
                            type="text"
                            value={newTaskForm.title || ''}
                            onChange={(e) => setNewTaskForm(prev => ({ ...prev, title: e.target.value }))}
                            placeholder="Enter task title..."
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                          />
                        </div>

                        {/* Effort, ETA, Owner, Status, Tags in one row */}
                        <div className="grid grid-cols-5 gap-2">
                          {/* Effort */}
                          <div>
                            <label className="block text-[10px] font-medium text-slate-700 mb-1">
                              Effort <span className="text-red-500">*</span>
                              <span className="text-[9px] text-slate-400 font-normal ml-0.5">(Planned / Actual)</span>
                            </label>
                            <div className="flex items-center gap-1">
                              {/* Planned Effort - Blue theme */}
                              <div className="flex items-center gap-0.5 bg-blue-50 border border-blue-200 rounded-md px-0.5 py-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setNewTaskForm(prev => ({ ...prev, estimatedEffort: Math.max(0, Number(prev.estimatedEffort || 1) - 0.25) }));
                                  }}
                                  className="p-0.5 hover:bg-blue-100 rounded text-blue-600 hover:text-blue-800 transition-colors"
                                  title="Decrease planned"
                                >
                                  <ArrowDown size={9} />
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.25"
                                  value={newTaskForm.estimatedEffort || 1}
                                  onChange={(e) => setNewTaskForm(prev => ({ ...prev, estimatedEffort: parseFloat(e.target.value) || 1 }))}
                                  className="w-10 px-0.5 py-0.5 text-xs font-mono border-0 bg-transparent focus:outline-none text-right text-blue-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  placeholder="1"
                                  title="Planned effort"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setNewTaskForm(prev => ({ ...prev, estimatedEffort: Number(prev.estimatedEffort || 1) + 0.25 }));
                                  }}
                                  className="p-0.5 hover:bg-blue-100 rounded text-blue-600 hover:text-blue-800 transition-colors"
                                  title="Increase planned"
                                >
                                  <ArrowUp size={9} />
                                </button>
                              </div>
                              <span className="text-slate-400 text-[10px]">/</span>
                              {/* Actual Effort - Slate theme */}
                              <div className="flex items-center gap-0.5 bg-slate-50 border border-slate-300 rounded-md px-0.5 py-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setNewTaskForm(prev => ({ ...prev, actualEffort: Math.max(0, Number(prev.actualEffort || 0) - 0.25) }));
                                  }}
                                  className="p-0.5 hover:bg-slate-200 rounded text-slate-600 hover:text-slate-800 transition-colors"
                                  title="Decrease actual"
                                >
                                  <ArrowDown size={9} />
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.25"
                                  value={newTaskForm.actualEffort || 0}
                                  onChange={(e) => setNewTaskForm(prev => ({ ...prev, actualEffort: parseFloat(e.target.value) || 0 }))}
                                  className="w-10 px-0.5 py-0.5 text-xs font-mono border-0 bg-transparent focus:outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  placeholder="0"
                                  title="Actual effort"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setNewTaskForm(prev => ({ ...prev, actualEffort: Number(prev.actualEffort || 0) + 0.25 }));
                                  }}
                                  className="p-0.5 hover:bg-slate-200 rounded text-slate-600 hover:text-slate-800 transition-colors"
                                  title="Increase actual"
                                >
                                  <ArrowUp size={9} />
                                </button>
                              </div>
                              <span className="text-[9px] text-slate-500 font-medium">w</span>
                            </div>
                          </div>

                          {/* ETA */}
                          <div>
                            <label className="block text-[10px] font-medium text-slate-700 mb-1">
                              ETA <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="date"
                              value={newTaskForm.eta || ''}
                              onChange={(e) => setNewTaskForm(prev => ({ ...prev, eta: e.target.value }))}
                              className="w-full px-1.5 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                            />
                          </div>

                          {/* Owner */}
                          <div>
                            <label className="block text-[10px] font-medium text-slate-700 mb-1">
                              Owner <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={newTaskForm.ownerId || item.ownerId}
                              onChange={(e) => setNewTaskForm(prev => ({ ...prev, ownerId: e.target.value }))}
                              className="w-full px-1.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                            >
                              <option value="">Select...</option>
                              {users.filter(u => u.role === Role.TeamLead).map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          </div>

                          {/* Status */}
                          <div>
                            <label className="block text-[10px] font-medium text-slate-700 mb-1">
                              Status
                            </label>
                            <select
                              value={newTaskForm.status || Status.NotStarted}
                              onChange={(e) => setNewTaskForm(prev => ({ ...prev, status: e.target.value as Status }))}
                              className="w-full px-1.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                            >
                              {Object.values(Status).filter(s => s !== Status.Deleted).map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>

                          {/* Tags */}
                          <div>
                            <label className="block text-[10px] font-medium text-slate-700 mb-1">
                              Tags <span className="text-slate-400 font-normal">(opt)</span>
                            </label>
                            <div className="flex gap-2">
                              <label className="flex items-center gap-0.5 text-[10px] text-slate-700 cursor-pointer hover:text-slate-900 transition-colors">
                                <input
                                  type="checkbox"
                                  checked={newTaskForm.tags?.includes(UnplannedTag.Unplanned) || false}
                                  onChange={(e) => {
                                    const currentTags = newTaskForm.tags || [];
                                    const newTags = e.target.checked
                                      ? [...currentTags.filter(t => t !== UnplannedTag.Unplanned), UnplannedTag.Unplanned]
                                      : currentTags.filter(t => t !== UnplannedTag.Unplanned);
                                    setNewTaskForm(prev => ({ ...prev, tags: newTags }));
                                  }}
                                  className="w-3 h-3 rounded border-slate-300 text-blue-600 focus:ring-1 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                                />
                                <span>Unplanned</span>
                              </label>
                              <label className="flex items-center gap-0.5 text-[10px] text-slate-700 cursor-pointer hover:text-slate-900 transition-colors">
                                <input
                                  type="checkbox"
                                  checked={newTaskForm.tags?.includes(UnplannedTag.PMItem) || false}
                                  onChange={(e) => {
                                    const currentTags = newTaskForm.tags || [];
                                    const newTags = e.target.checked
                                      ? [...currentTags.filter(t => t !== UnplannedTag.PMItem), UnplannedTag.PMItem]
                                      : currentTags.filter(t => t !== UnplannedTag.PMItem);
                                    setNewTaskForm(prev => ({ ...prev, tags: newTags }));
                                  }}
                                  className="w-3 h-3 rounded border-slate-300 text-blue-600 focus:ring-1 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                                />
                                <span>PM</span>
                              </label>
                              <label className="flex items-center gap-0.5 text-[10px] text-slate-700 cursor-pointer hover:text-slate-900 transition-colors">
                                <input
                                  type="checkbox"
                                  checked={newTaskForm.tags?.includes(UnplannedTag.RiskItem) || false}
                                  onChange={(e) => {
                                    const currentTags = newTaskForm.tags || [];
                                    const newTags = e.target.checked
                                      ? [...currentTags.filter(t => t !== UnplannedTag.RiskItem), UnplannedTag.RiskItem]
                                      : currentTags.filter(t => t !== UnplannedTag.RiskItem);
                                    setNewTaskForm(prev => ({ ...prev, tags: newTags }));
                                  }}
                                  className="w-3 h-3 rounded border-slate-300 text-blue-600 focus:ring-1 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                                />
                                <span>Risk</span>
                              </label>
                            </div>
                          </div>
                        </div>
                        
                        {/* Trade-off Section */}
                        <div className="pt-1.5 border-t border-slate-200">
                          <label className="block text-[10px] font-medium text-slate-700 mb-1.5">
                            Trade-off <span className="text-slate-400 font-normal">(optional)</span>
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] font-medium text-slate-600 mb-1">
                                Initiative
                              </label>
                              <select
                                value={newTaskForm.tradeOffInitiativeId || ''}
                                onChange={(e) => {
                                  const selectedInitiativeId = e.target.value || undefined;
                                  const selectedInitiative = selectedInitiativeId ? allInitiativesList.find(i => i.id === selectedInitiativeId) : undefined;
                                  setNewTaskForm(prev => ({ 
                                    ...prev, 
                                    tradeOffInitiativeId: selectedInitiativeId,
                                    tradeOffTaskId: undefined,
                                    tradeOffEta: selectedInitiative?.eta || prev.tradeOffEta
                                  }));
                                }}
                                className="w-full px-2 py-1 text-[11px] border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                              >
                                <option value="">Select...</option>
                                {allInitiativesList
                                  .filter(i => i.ownerId === item.ownerId)
                                  .map(i => (
                                    <option key={i.id} value={i.id}>
                                      {i.title} ({i.l1_assetClass}) {i.initiativeType === InitiativeType.BAU ? '[BAU]' : '[WP]'}
                                    </option>
                                  ))}
                                {allInitiativesList
                                  .filter(i => i.ownerId === item.ownerId).length === 0 && (
                                    <option value="" disabled>No initiatives found</option>
                                  )}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium text-slate-600 mb-1">
                                Task <span className="text-slate-400 font-normal">(opt)</span>
                              </label>
                              <select
                                value={newTaskForm.tradeOffTaskId || ''}
                                onChange={(e) => {
                                  const selectedTaskId = e.target.value || undefined;
                                  const tradeOffInitiative = allInitiativesList.find(i => i.id === newTaskForm.tradeOffInitiativeId);
                                  const selectedTask = tradeOffInitiative?.tasks?.find(t => t.id === selectedTaskId);
                                  setNewTaskForm(prev => ({ 
                                    ...prev, 
                                    tradeOffTaskId: selectedTaskId,
                                    tradeOffEta: selectedTask?.eta || tradeOffInitiative?.eta || prev.tradeOffEta
                                  }));
                                }}
                                disabled={!newTaskForm.tradeOffInitiativeId || (() => {
                                  const tradeOffInitiative = allInitiativesList.find(i => i.id === newTaskForm.tradeOffInitiativeId);
                                  return !tradeOffInitiative || !tradeOffInitiative.tasks || tradeOffInitiative.tasks.length === 0;
                                })()}
                                className="w-full px-2 py-1 text-[11px] border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                              >
                                <option value="">Select task...</option>
                                {newTaskForm.tradeOffInitiativeId && (() => {
                                  const tradeOffInitiative = allInitiativesList.find(i => i.id === newTaskForm.tradeOffInitiativeId);
                                  if (tradeOffInitiative?.tasks && tradeOffInitiative.tasks.length > 0) {
                                    return tradeOffInitiative.tasks.map(task => (
                                      <option key={task.id} value={task.id}>
                                        {task.title || `Task ${task.id.slice(-4)}`} ({task.eta || 'No ETA'})
                                      </option>
                                    ));
                                  }
                                  return <option value="" disabled>No tasks available</option>;
                                })()}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium text-slate-600 mb-1">
                                ETA
                              </label>
                              <input
                                type="date"
                                value={newTaskForm.tradeOffEta || ''}
                                onChange={(e) => setNewTaskForm(prev => ({ ...prev, tradeOffEta: e.target.value || undefined }))}
                                disabled={!newTaskForm.tradeOffInitiativeId}
                                className="w-full px-2 py-1 text-[11px] border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                              />
                              {newTaskForm.tradeOffInitiativeId && !newTaskForm.tradeOffEta && (() => {
                                const tradeOffInitiative = allInitiativesList.find(i => i.id === newTaskForm.tradeOffInitiativeId);
                                if (newTaskForm.tradeOffTaskId) {
                                  const task = tradeOffInitiative?.tasks?.find(t => t.id === newTaskForm.tradeOffTaskId);
                                  if (task?.eta) {
                                    return (
                                      <div className="text-[9px] text-slate-500 mt-0.5">
                                        Current: {task.eta}
                                      </div>
                                    );
                                  }
                                } else if (tradeOffInitiative?.eta) {
                                  return (
                                    <div className="text-[9px] text-slate-500 mt-0.5">
                                      Current: {tradeOffInitiative.eta}
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                        <button
                          onClick={() => {
                            setAddingTaskFor(null);
                            setNewTaskForm({
                              title: '',
                              estimatedEffort: 1,
                              actualEffort: 0,
                              eta: '',
                              ownerId: '',
                              status: Status.NotStarted,
                              tags: [],
                              initiativeId: item.id,
                              tradeOffInitiativeId: undefined,
                              tradeOffTaskId: undefined,
                              tradeOffEta: undefined
                            });
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleAddTask(item.id)}
                          disabled={!newTaskForm.eta || !newTaskForm.ownerId}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                        >
                          Add Task
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
      </>
    );
  };


  const renderFlatView = () => {
    return filteredInitiatives.map((item, index) => {
      const editable = canInlineEdit(item);
      return renderRow(item, index, editable);
    });
  };

  // Render table view (flat)
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col min-h-[500px]">
      <div ref={scrollContainerRef} className="overflow-auto custom-scrollbar flex-1">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-20 shadow-md">
            <tr className="bg-gradient-to-b from-slate-100 to-slate-50 border-b-2 border-slate-300">
              <th className="w-12 px-3 py-2.5 text-center font-bold text-slate-500 text-xs border-r border-slate-200 bg-gradient-to-b from-slate-100 to-slate-50 select-none">
                ID
              </th>
              <SortableHeader label={`Initiative (${filteredInitiatives.length})`} sortKey="title" />
              <SortableHeader label="Owner" sortKey="owner" />
              <SortableHeader label="Status" sortKey="status" />
              <SortableHeader label="Priority" sortKey="priority" />
              <th className="px-3 py-2.5 text-center font-bold text-slate-700 bg-gradient-to-b from-slate-100 to-slate-50 border-r border-slate-200 text-xs tracking-wider whitespace-nowrap select-none min-w-[150px]">
                Effort (act/plan)
              </th>
              <th className="px-3 py-2.5 text-center font-bold text-slate-700 bg-gradient-to-b from-slate-100 to-slate-50 border-r border-slate-200 text-xs tracking-wider whitespace-nowrap select-none">Progress</th>
              <SortableHeader label="ETA / Update" sortKey="eta" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filteredInitiatives.length === 0 ? (
               <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500 text-sm">No initiatives found matching your filters.</td></tr>
            ) : renderFlatView()}
          </tbody>
        </table>
      </div>
    </div>
  );
};
