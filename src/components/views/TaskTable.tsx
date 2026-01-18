import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, ChevronRight, Plus, X, Layers, FileText, CheckSquare } from 'lucide-react';
import { Initiative, User, Status, Priority, WorkType, AppConfig, Comment, UserCommentReadState, InitiativeType, Task, Role, UnplannedTag } from '../../types';
import { StatusBadge, PriorityBadge, getStatusCellBg, getPriorityCellBg } from '../shared/Shared';
import { CommentPopover } from '../shared/CommentPopover';
import { checkOutdated, generateId, canEditAllTasks, canEditOwnTasks, canDeleteTaskItem, canEditTaskItem } from '../../utils';
import { weeksToDays, daysToWeeks, weeksToHours, hoursToWeeks, daysToHours, hoursToDays } from '../../utils/effortConverter';
import { sheetsSync } from '../../services';
import { logger } from '../../utils/logger';
import { getStatuses, getPriorities } from '../../utils/valueLists';

interface TaskTableProps {
  filteredInitiatives: Initiative[];
  allInitiatives?: Initiative[]; // All initiatives for trade-off dropdown (unfiltered)
  handleInlineUpdate: (id: string, field: keyof Initiative, value: any, suppressNotification?: boolean, tradeOffSourceId?: string, tradeOffSourceTitle?: string) => void;
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
  onBulkDeleteInitiatives?: (ids: string[]) => Promise<void>;
  // At Risk reason modal props
  onOpenAtRiskModal?: (initiative: Initiative) => void;
  effortDisplayUnit?: 'weeks' | 'days' | 'hours';
  setEffortDisplayUnit?: (unit: 'weeks' | 'days' | 'hours') => void;
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
  onBulkDeleteInitiatives,
  onOpenAtRiskModal,
  effortDisplayUnit: _effortDisplayUnit = 'weeks',
  setEffortDisplayUnit: _setEffortDisplayUnit,
  optimisticUpdates = new Map()
}) => {
  const navigate = useNavigate();
  void _onDeleteInitiative; // Reserved for delete functionality
  
  // Bulk selection state (Admin only)
  const isAdmin = currentUser.role === Role.Admin;
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  
  // Per-initiative effort display unit state
  const [effortDisplayUnits, setEffortDisplayUnits] = useState<Map<string, 'weeks' | 'days' | 'hours'>>(new Map());
  
  // Helper functions for per-initiative display units
  const getDisplayUnit = (initiativeId: string): 'weeks' | 'days' | 'hours' => {
    return effortDisplayUnits.get(initiativeId) || 'weeks';
  };
  
  const setDisplayUnit = (initiativeId: string, unit: 'weeks' | 'days' | 'hours') => {
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
    estimatedEffort: 0,
    actualEffort: 0,
    eta: '',
    owner: '',
    status: Status.NotStarted,
    priority: Priority.P2,
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
  
  // Bulk selection handlers (Admin only)
  const handleSelectItem = (id: string) => {
    if (!isAdmin) return;
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };
  
  const handleSelectAll = () => {
    if (!isAdmin) return;
    if (selectedItems.size === filteredInitiatives.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredInitiatives.map(i => i.id)));
    }
  };
  
  const handleClearSelection = () => {
    setSelectedItems(new Set());
  };
  
  const handleBulkDelete = async () => {
    if (!isAdmin || !onBulkDeleteInitiatives || selectedItems.size === 0) return;
    
    const count = selectedItems.size;
    const confirmed = window.confirm(
      `Are you sure you want to delete ${count} ${count === 1 ? 'initiative' : 'initiatives'}?\n\nYou can restore them from the Trash later.`
    );
    
    if (!confirmed) {
      return;
    }
    
    try {
      await onBulkDeleteInitiatives(Array.from(selectedItems));
      setSelectedItems(new Set());
    } catch (error) {
      logger.error('Failed to bulk delete initiatives', { 
        context: 'TaskTable.handleBulkDelete', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
    }
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
    
    if (!newTaskForm.eta) {
      alert('Please fill in the required ETA field');
      return;
    }
    
    const newTask: Task = {
      id: generateId(),
      title: newTaskForm.title || undefined,
      estimatedEffort: newTaskForm.estimatedEffort || 0,
      actualEffort: newTaskForm.actualEffort || 0,
      eta: newTaskForm.eta,
      owner: newTaskForm.owner || undefined,
      status: newTaskForm.status || Status.NotStarted,
      priority: newTaskForm.priority || Priority.P2,
      tags: newTaskForm.tags || [],
      comments: [],
      createdAt: new Date().toISOString(),
      createdBy: currentUser.id
    };
    
    const updatedTasks = [...(initiative.tasks || []), newTask];
    const totalActualEffort = updatedTasks.reduce((sum, task) => sum + (task.actualEffort || 0), 0);
    
    // Update tasks and actual effort (auto-calculate actual effort from tasks if tasks exist)
    handleInlineUpdate(targetInitiativeId, 'tasks', updatedTasks);
    handleInlineUpdate(targetInitiativeId, 'actualEffort', totalActualEffort, true); // suppressNotification: true
    
    // Handle trade-off if specified
    if (newTaskForm.tradeOffInitiativeId && newTaskForm.tradeOffEta) {
      const tradeOffInitiative = allInitiativesList.find(i => i.id === newTaskForm.tradeOffInitiativeId);
      const sourceInitiative = allInitiativesList.find(i => i.id === targetInitiativeId);
      if (tradeOffInitiative && sourceInitiative) {
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
              handleInlineUpdate(newTaskForm.tradeOffInitiativeId, 'tasks', updatedTradeOffTasks, false, sourceInitiative.id, sourceInitiative.title);
            } else {
              logger.warn('Trade-off task not found', { context: 'TaskTable.handleAddTaskSubmit', metadata: { tradeOffTaskId: newTaskForm.tradeOffTaskId } });
            }
          } else {
            logger.warn('Trade-off initiative has no tasks', { context: 'TaskTable.handleAddTaskSubmit', metadata: { tradeOffInitiativeId: newTaskForm.tradeOffInitiativeId } });
          }
        } else {
          // No task ID provided, update initiative ETA
          handleInlineUpdate(newTaskForm.tradeOffInitiativeId, 'eta', newTaskForm.tradeOffEta, false, sourceInitiative.id, sourceInitiative.title);
        }
      } else {
        logger.warn('Trade-off initiative not found', { context: 'TaskTable.handleAddTaskSubmit', metadata: { tradeOffInitiativeId: newTaskForm.tradeOffInitiativeId } });
      }
    }
    
    // Reset form and close add mode
    setNewTaskForm({
      title: '',
      estimatedEffort: 0,
      actualEffort: 0,
      eta: '',
      owner: '',
      status: Status.NotStarted,
      priority: Priority.P2,
      tags: [],
      initiativeId: undefined,
      tradeOffInitiativeId: undefined,
      tradeOffTaskId: undefined,
      tradeOffEta: undefined
    });
    setAddingTaskFor(null);
  };
  
  const handleUpdateTask = (initiativeId: string, taskId: string, field: keyof Task, value: any) => {
    logger.debug('handleUpdateTask called', { context: 'TaskTable.handleUpdateTask', metadata: { initiativeId, taskId, field, value } });
    
    // Use allInitiatives if available (full list), otherwise fall back to filteredInitiatives
    const sourceInitiatives = allInitiatives || filteredInitiatives;
    const initiative = sourceInitiatives.find(i => i.id === initiativeId);
    if (!initiative || !initiative.tasks) {
      logger.warn('Initiative not found or has no tasks', { context: 'TaskTable.handleUpdateTask', metadata: { initiativeId } });
      return;
    }
    
    logger.debug('Current initiative tasks', { context: 'TaskTable.handleUpdateTask', metadata: { taskCount: initiative.tasks.length } });
    
    // Find the task to update
    const taskToUpdate = initiative.tasks.find(t => t.id === taskId);
    if (!taskToUpdate) {
      logger.warn('Task not found in initiative', { context: 'TaskTable.handleUpdateTask', metadata: { taskId, initiativeId } });
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
    
    // Block status change to In Progress if ETA is empty
    if (field === 'status' && value === Status.InProgress) {
      if (!taskToUpdate.eta || !taskToUpdate.eta.trim()) {
        alert('Cannot move to In Progress without ETA. Please set an ETA first.');
        return; // Prevent status change
      }
    }
    
    logger.debug('Task to update', { context: 'TaskTable.handleUpdateTask', metadata: { taskId, field, value } });
    
    // Create a new array with updated task - ensure we create a completely new object
    const updatedTasks = initiative.tasks.map(task =>
      task.id === taskId ? { ...task, [field]: value } : task
    );
    
    logger.debug('Updated tasks', { context: 'TaskTable.handleUpdateTask', metadata: { count: updatedTasks.length } });
    
    // Recalculate actual effort if effort fields changed (planned effort is manually set for BAU initiatives)
    if (field === 'estimatedEffort' || field === 'actualEffort') {
      const totalActualEffort = updatedTasks.reduce((sum, task) => sum + (task.actualEffort || 0), 0);
      
      logger.debug('Updating actual effort', { context: 'TaskTable.handleUpdateTask', metadata: { totalActualEffort } });
      
      // Update tasks array first, then actual effort
      // React 18+ will batch these automatically
      handleInlineUpdate(initiativeId, 'tasks', updatedTasks);
      handleInlineUpdate(initiativeId, 'actualEffort', totalActualEffort, true); // suppressNotification: true
    } else {
      // For non-effort fields, just update tasks
      logger.debug('Updating tasks only', { context: 'TaskTable.handleUpdateTask' });
      handleInlineUpdate(initiativeId, 'tasks', updatedTasks);
    }
  };
  
  const canDeleteTask = (item: Initiative, task: Task): boolean => {
    return canDeleteTaskItem(config, currentUser.role, task.ownerId, item.ownerId, currentUser.id, currentUser.email);
  };

  const canEditTask = (item: Initiative, task: Task): boolean => {
    // For task-level editing, check task ownership specifically
    // If user can edit all tasks, allow
    if (canEditAllTasks(config, currentUser.role)) return true;
    // Otherwise, check if user can edit this specific task
    return canEditTaskItem(config, currentUser.role, task.ownerId, item.ownerId, currentUser.id, currentUser.email);
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
        logger.error('Failed to delete task', { context: 'TaskTable.handleDeleteTask', metadata: { taskId, initiativeId } });
      }
    } catch (error) {
      logger.error('Failed to delete task', { context: 'TaskTable.handleDeleteTask', error: error instanceof Error ? error : new Error(String(error)), metadata: { taskId, initiativeId } });
      alert('Failed to delete task. Please try again.');
    }
  };

  const canInlineEdit = (item: Initiative): boolean => {
    // Check if user can edit all tasks
    if (canEditAllTasks(config, currentUser.role)) return true;
    
    // Check if user can edit own tasks
    if (canEditOwnTasks(config, currentUser.role)) {
      // Check if user owns the initiative (using canEditTaskItem for email matching)
      if (canEditTaskItem(config, currentUser.role, undefined, item.ownerId, currentUser.id, currentUser.email)) {
        return true;
      }
      
      // Check if user owns ANY task within the initiative
      if (item.tasks?.some(task => 
        canEditTaskItem(config, currentUser.role, task.ownerId, item.ownerId, currentUser.id, currentUser.email)
      )) {
        return true;
      }
    }
    
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
        className={`px-3 py-2.5 text-center font-bold text-slate-700 cursor-pointer bg-gradient-to-b from-slate-100 to-slate-50 hover:from-slate-150 hover:to-slate-100 transition-all duration-200 border-r border-slate-200 select-none whitespace-nowrap text-xs tracking-wider ${alignRight ? 'text-right' : ''}`}
        onClick={() => handleSort(sortKey)}
      >
        <div className={`flex items-center gap-1.5 ${alignRight ? 'justify-end' : 'justify-center'}`}>
          {label}
          <div className={`transition-colors duration-200 ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
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
      case Priority.P1: return 'bg-blue-500 text-white border-blue-600 shadow-sm';
      // P2: Neutral slate for lower priority
      case Priority.P2: return 'bg-slate-200 text-slate-600 border-slate-300';
      default: return 'bg-white text-slate-700 border-slate-200';
    }
  };

  // Icon utilities for visual hierarchy
  const getInitiativeIcon = (initiative: Initiative): React.ReactNode => {
    if (initiative.initiativeType === InitiativeType.BAU) {
      return <Layers size={14} className="text-blue-600" />;
    }
    return <FileText size={14} className="text-cyan-600" />;
  };

  const getTaskIcon = (_task: Task): React.ReactNode => {
    return <CheckSquare size={12} className="text-blue-500" />;
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

  const renderRow = (item: Initiative, index: number, editable: boolean) => {
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
    const activeTasks = tasks.filter(t => t.status !== Status.Deleted);
    const isAtRisk = item.status === Status.AtRisk;
    const showTooltip = hoveredAtRiskDot === item.id && isAtRisk;

    const isUpdating = optimisticUpdates.has(item.id);
    // Zebra striping: even rows get subtle background
    const zebraStripe = index % 2 === 0 ? '' : 'bg-slate-50/50';

    const isSelected = isAdmin && selectedItems.has(item.id);
    
    return (
      <>
        <tr key={item.id} className={`group  transition-all duration-200 border-b border-slate-200 ${zebraStripe} ${isUpdating ? 'bg-blue-50/30' : ''} ${isSelected ? 'bg-blue-100/50 border-l-2 border-l-blue-500' : ''}`}>
          {isAdmin && (
            <td className="px-2 py-1.5 border-r border-slate-200 text-center bg-slate-50/50">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleSelectItem(item.id)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer accent-blue-500"
                onClick={(e) => e.stopPropagation()}
              />
            </td>
          )}
          <td className="px-2 py-1.5 border-r border-slate-200 text-center text-xs text-slate-400 font-mono select-none bg-slate-50/50">
            {item.id}
          </td>
          <td className="px-3 py-1.5 border-r border-slate-200 min-w-[320px] relative">
            <div className="flex items-start gap-2 justify-between">
              {/* Left side: Fixed-width icon area + chevron + title for consistent alignment */}
              <div className="flex items-start flex-1 min-w-0">
                {/* Fixed-width container for icon + chevron (always same width) */}
                <div className="flex items-center gap-1 flex-shrink-0 w-14">
                  {/* Initiative icon */}
                  <div className="flex-shrink-0">
                    {getInitiativeIcon(item)}
                  </div>
                  {/* Chevron - always takes space, invisible when no tasks */}
                  <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                    {activeTasks.length > 0 ? (
                      <button
                        onClick={() => toggleTasks(item.id)}
                        className={`p-1 hover:bg-blue-100 rounded transition-all duration-200 ${isBAU ? 'hover:bg-blue-100' : 'hover:bg-blue-100'}`}
                        title={tasksExpanded ? `Collapse ${activeTasks.length} tasks` : `Expand ${activeTasks.length} tasks`}
                      >
                        {tasksExpanded ? (
                          <ChevronDown size={14} className={`transition-transform duration-200 ${isBAU ? "text-blue-600" : "text-blue-600"}`} />
                        ) : (
                          <ChevronRight size={14} className={`transition-transform duration-200 ${isBAU ? "text-blue-600" : "text-blue-600"}`} />
                        )}
                      </button>
                    ) : null}
                  </div>
                </div>
                {/* Title button - always starts at same position due to fixed-width container above */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navigate(`/item/${encodeURIComponent(item.id)}`);
                  }}
                  className={`font-semibold text-slate-900 text-xs leading-relaxed break-words text-left flex-1 min-w-0 hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg transition-all duration-200 cursor-pointer ${
                    isBAU ? 'bg-purple-50 border border-purple-200' : 'bg-blue-50 border border-blue-200'
                  }`}
                  title={item.title}
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="break-words">{item.title}</span>
                    {isBAU && (
                      <span className="px-1 py-0.5 bg-purple-600 text-white text-[8px] font-bold rounded flex-shrink-0 shadow-sm">
                        BAU
                      </span>
                    )}
                  </div>
                </button>
              </div>
              {/* Right side: Task count badge, status dots, and add task button */}
              <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                {!tasksExpanded && activeTasks.length > 0 && (
                  <>
                    <span className="px-1.5 py-0.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-[9px] font-bold rounded-full min-w-[18px] text-center shadow-sm">
                      {activeTasks.length}
                    </span>
                    {/* Show status breakdown dots */}
                    <div className="flex gap-0.5">
                      {activeTasks.filter(t => t.status === Status.InProgress).length > 0 && (
                        <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full shadow-sm" title={`${activeTasks.filter(t => t.status === Status.InProgress).length} in progress`} />
                      )}
                      {activeTasks.filter(t => t.status === Status.AtRisk).length > 0 && (
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full shadow-sm" title={`${activeTasks.filter(t => t.status === Status.AtRisk).length} at risk`} />
                      )}
                      {activeTasks.filter(t => t.status === Status.Done).length > 0 && (
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-sm" title={`${activeTasks.filter(t => t.status === Status.Done).length} done`} />
                      )}
                    </div>
                  </>
                )}
                {/* Add task button and comment popover - stacked vertically to save space */}
                <div className="flex flex-col items-center gap-0.5">
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
                          estimatedEffort: 0,
                          actualEffort: 0,
                          eta: defaultEta,
                          owner: '',
                          status: Status.NotStarted,
                          priority: Priority.P2,
                          tags: [],
                          initiativeId: item.id,
                          tradeOffInitiativeId: undefined,
                          tradeOffTaskId: undefined,
                          tradeOffEta: undefined
                        });
                      }}
                      className="p-1 hover:bg-blue-100 rounded transition-all duration-200 flex-shrink-0 group"
                      title="Add new task"
                    >
                      <Plus size={14} className="text-blue-600 group-hover:scale-110 transition-transform duration-200" />
                    </button>
                  )}
                  {/* Comment popover - positioned below the + button */}
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
              </div>
            </div>
          {/* Compact metadata styling */}
          <div className="text-xs text-slate-500 mt-1 flex gap-1 items-center flex-wrap">
             {viewMode === 'flat' && (
               <>
                 <span className="font-bold text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded-md border border-cyan-200">{item.l1_assetClass}</span>
                 <span className="text-slate-400">•</span>
                 <span className="text-slate-500 truncate max-w-[100px] italic" title={item.l2_pillar}>{item.l2_pillar}</span>
                 {item.l3_responsibility && (
                   <>
                     <span className="text-slate-400">•</span>
                     <span className="text-slate-500 truncate max-w-[120px]" title={item.l3_responsibility}>{item.l3_responsibility}</span>
                   </>
                 )}
               </>
             )}
             {item.workType === WorkType.Unplanned && (
               <span className="text-blue-600 font-bold flex items-center gap-0.5 bg-gradient-to-r from-blue-50 to-blue-100 px-1.5 py-0.5 rounded-md border border-blue-200 shadow-sm">
                 <AlertTriangle size={8} />
                 <span className="text-[8px]">Unplanned</span>
               </span>
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
                    className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-md shadow-red-500/30 hover:bg-red-600 transition-all duration-200 cursor-pointer"
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
                        className="w-64 glass-dark rounded-xl shadow-2xl border border-white/10 p-3 pointer-events-none animate-scale-in"
                        style={tooltipStyle}
                      >
                      <div className="text-xs font-semibold text-white mb-1.5 flex items-center gap-1.5">
                        <AlertTriangle size={12} className="text-red-400" />
                        At Risk Reason
                      </div>
                      <p className="text-xs text-slate-300 whitespace-pre-wrap break-words">
                        {item.riskActionLog}
                      </p>
                      <div className="mt-2 pt-2 border-t border-white/10 text-center">
                        <span className="text-[10px] text-blue-600 font-medium">Click to edit →</span>
                      </div>
                    </div>
                    );
                  })()}
                </div>
             </div>
          )}
        </td>
        <td className="px-2.5 py-1.5 border-r border-slate-200 whitespace-nowrap">
          <div className="flex items-center gap-2.5" title="Owner">
            <div className="flex flex-col justify-center gap-0.5">
              {(() => {
                const ownerName = users.find(u => u.id === item.ownerId)?.name;
                return ownerName ? (
                  <span className="text-slate-800 font-medium text-xs truncate max-w-[110px]">{ownerName}</span>
                ) : (
                  <span className="text-slate-400 text-xs italic">-</span>
                );
              })()}
            </div>
          </div>
        </td>
        <td className={`px-2.5 py-1.5 border-r border-slate-200 text-center relative ${getStatusCellBg(item.status)}`}>
          {isUpdating && (
            <div className="absolute top-1 right-1 z-10">
              <LoadingIndicator size="sm" />
            </div>
          )}
          {editable ? (
             <select 
               value={item.status}
               onChange={(e) => handleInlineUpdate(item.id, 'status', e.target.value)}
               className={`w-full text-[11px] font-bold border focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-1.5 py-1 rounded-md cursor-pointer h-full transition-all duration-200 ${getStatusSelectStyle(item.status)}`}
             >
               {getStatuses(config).filter(s => s !== Status.Deleted).map(s => <option key={s} value={s} className="bg-white text-slate-900">{s}</option>)}
             </select>
          ) : (
             <StatusBadge status={item.status} />
          )}
        </td>
        <td className={`px-2.5 py-1.5 border-r border-slate-200 text-center relative ${getPriorityCellBg(item.priority)}`}>
          {isUpdating && (
            <div className="absolute top-1 right-1 z-10">
              <LoadingIndicator size="sm" />
            </div>
          )}
          {editable ? (
            <select 
              value={item.priority}
              onChange={(e) => handleInlineUpdate(item.id, 'priority', e.target.value)}
              className={`w-full text-[11px] font-bold border focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-1.5 py-1 rounded-md cursor-pointer h-full transition-all duration-200 ${getPrioritySelectStyle(item.priority)}`}
            >
              {getPriorities(config).map(p => <option key={p} value={p} className="bg-white text-slate-900">{p}</option>)}
            </select>
          ) : (
            <PriorityBadge priority={item.priority} />
          )}
        </td>
        <td className="px-2.5 py-1.5 border-r border-slate-200 min-w-[150px]">
          {editable ? (
            <div className="flex items-center gap-1.5">
              {/* Effort exceeded flag */}
              {(item.actualEffort || 0) > (item.originalEstimatedEffort || 0) && (item.originalEstimatedEffort || 0) > 0 && (
                <div className="flex-shrink-0" title={`Actual effort (${(item.actualEffort || 0).toFixed(2)}w) exceeds original allocation (${(item.originalEstimatedEffort || 0).toFixed(2)}w)`}>
                  <AlertTriangle size={14} className="text-red-500" />
                </div>
              )}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const currentWeeks = item.actualEffort || 0;
                    let decrement: number;
                    if (displayUnit === 'hours') {
                      decrement = hoursToWeeks(1);
                    } else if (displayUnit === 'days') {
                      decrement = daysToWeeks(1);
                    } else {
                      decrement = 0.25;
                    }
                    handleInlineUpdate(item.id, 'actualEffort', Math.max(0, currentWeeks - decrement));
                  }}
                  className="p-0.5 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-colors flex-shrink-0"
                  title={displayUnit === 'hours' ? 'Decrease by 1 hour' : displayUnit === 'days' ? 'Decrease by 1 day' : 'Decrease by 0.25 weeks'}
                >
                  <ArrowDown size={12} />
                </button>
                <input 
                  type="number"
                  min="0"
                  step={displayUnit === 'hours' ? '1' : displayUnit === 'days' ? '1' : '0.25'}
                  value={displayUnit === 'hours'
                    ? weeksToHours(item.actualEffort || 0).toFixed(1)
                    : displayUnit === 'days'
                    ? weeksToDays(item.actualEffort || 0).toFixed(1)
                    : (item.actualEffort || 0).toFixed(2)}
                  onChange={(e) => {
                    const inputValue = parseFloat(e.target.value) || 0;
                    let weeksValue: number;
                    if (displayUnit === 'hours') {
                      weeksValue = hoursToWeeks(inputValue);
                    } else if (displayUnit === 'days') {
                      weeksValue = daysToWeeks(inputValue);
                    } else {
                      weeksValue = inputValue;
                    }
                    handleInlineUpdate(item.id, 'actualEffort', weeksValue);
                  }}
                  className="w-16 bg-white text-xs font-mono text-slate-700 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded-md text-right transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  title="Actual Effort"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const currentWeeks = item.actualEffort || 0;
                    let increment: number;
                    if (displayUnit === 'hours') {
                      increment = hoursToWeeks(1);
                    } else if (displayUnit === 'days') {
                      increment = daysToWeeks(1);
                    } else {
                      increment = 0.25;
                    }
                    handleInlineUpdate(item.id, 'actualEffort', currentWeeks + increment);
                  }}
                  className="p-0.5 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-all duration-200 flex-shrink-0"
                  title={displayUnit === 'hours' ? 'Increase by 1 hour' : displayUnit === 'days' ? 'Increase by 1 day' : 'Increase by 0.25 weeks'}
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
                    let decrement: number;
                    if (displayUnit === 'hours') {
                      decrement = hoursToWeeks(1);
                    } else if (displayUnit === 'days') {
                      decrement = daysToWeeks(1);
                    } else {
                      decrement = 0.25;
                    }
                    handleInlineUpdate(item.id, 'estimatedEffort', Math.max(0, currentWeeks - decrement));
                  }}
                  className="p-0.5 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-all duration-200 flex-shrink-0"
                  title={displayUnit === 'hours' ? 'Decrease by 1 hour' : displayUnit === 'days' ? 'Decrease by 1 day' : 'Decrease by 0.25 weeks'}
                >
                  <ArrowDown size={12} />
                </button>
                <input 
                  type="number"
                  min="0"
                  step={displayUnit === 'hours' ? '1' : displayUnit === 'days' ? '1' : '0.25'}
                  value={displayUnit === 'hours'
                    ? weeksToHours(item.estimatedEffort || 0).toFixed(1)
                    : displayUnit === 'days' 
                    ? weeksToDays(item.estimatedEffort || 0).toFixed(1)
                    : (item.estimatedEffort || 0).toFixed(2)}
                  onChange={(e) => {
                    const inputValue = parseFloat(e.target.value) || 0;
                    let weeksValue: number;
                    if (displayUnit === 'hours') {
                      weeksValue = hoursToWeeks(inputValue);
                    } else if (displayUnit === 'days') {
                      weeksValue = daysToWeeks(inputValue);
                    } else {
                      weeksValue = inputValue;
                    }
                    handleInlineUpdate(item.id, 'estimatedEffort', weeksValue);
                  }}
                  className="w-16 bg-white text-xs font-mono text-slate-700 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded-md text-right transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  title="Planned Effort"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const currentWeeks = item.estimatedEffort || 0;
                    let increment: number;
                    if (displayUnit === 'hours') {
                      increment = hoursToWeeks(1);
                    } else if (displayUnit === 'days') {
                      increment = daysToWeeks(1);
                    } else {
                      increment = 0.25;
                    }
                    handleInlineUpdate(item.id, 'estimatedEffort', currentWeeks + increment);
                  }}
                  className="p-0.5 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-all duration-200 flex-shrink-0"
                  title={displayUnit === 'hours' ? 'Increase by 1 hour' : displayUnit === 'days' ? 'Increase by 1 day' : 'Increase by 0.25 weeks'}
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
                                      setDisplayUnit(item.id, 'hours');
                                    }}
                                    className={`px-1 py-0.5 text-[9px] font-medium rounded transition-all duration-200 ${
                                      displayUnit === 'hours' 
                                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm' 
                                        : 'text-slate-600 hover:bg-slate-100 bg-white'
                                    }`}
                                    title="Switch to hours"
                                  >
                                    H
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setDisplayUnit(item.id, 'days');
                                    }}
                                    className={`px-1 py-0.5 text-[9px] font-medium rounded transition-all duration-200 ${
                                      displayUnit === 'days' 
                                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm' 
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
                                    className={`px-1 py-0.5 text-[9px] font-medium rounded transition-all duration-200 ${
                                      displayUnit === 'weeks' 
                                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm' 
                                        : 'text-slate-600 hover:bg-slate-100 bg-white'
                                    }`}
                                    title="Switch to weeks"
                                  >
                                    W
                                  </button>
              </div>
              <span className="text-slate-400 text-xs font-medium flex-shrink-0">{displayUnit === 'hours' ? 'h' : displayUnit === 'days' ? 'd' : 'w'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 justify-end">
              {/* Effort exceeded flag for read-only view */}
              {(item.actualEffort || 0) > (item.originalEstimatedEffort || 0) && (item.originalEstimatedEffort || 0) > 0 && (
                <div className="flex-shrink-0" title={`Actual effort (${(item.actualEffort || 0).toFixed(2)}w) exceeds original allocation (${(item.originalEstimatedEffort || 0).toFixed(2)}w)`}>
                  <AlertTriangle size={14} className="text-red-500" />
                </div>
              )}
              <div className="font-mono text-slate-700 text-xs font-semibold text-right bg-slate-50 px-2 py-1 rounded">
                {displayUnit === 'hours'
                  ? `${weeksToHours(item.actualEffort || 0).toFixed(1)}/${weeksToHours(item.estimatedEffort || 0).toFixed(1)}h`
                  : displayUnit === 'days' 
                  ? `${weeksToDays(item.actualEffort || 0).toFixed(1)}/${weeksToDays(item.estimatedEffort || 0).toFixed(1)}d`
                  : `${item.actualEffort}/${item.estimatedEffort}w`}
              </div>
            </div>
          )}
          {item.originalEstimatedEffort !== item.estimatedEffort && (
             <div className="text-[9px] text-slate-400 italic text-right mt-1">Orig: {item.originalEstimatedEffort}w</div>
          )}
        </td>
        <td className="px-2.5 py-1.5 border-r border-slate-200 min-w-[90px]">
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
                  className="w-14 bg-white text-xs font-semibold text-slate-700 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded-md text-right transition-all duration-200 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                  (item.completionRate ?? 0) > 0 ? 'bg-gradient-to-r from-blue-400 to-blue-500' : 'bg-slate-200'
                }`}
                style={{ width: `${item.completionRate ?? 0}%` }}
              />
            </div>
          </div>
        </td>
        <td className="px-2.5 py-1.5 border-r border-slate-200 min-w-[110px]">
          <div className="flex flex-col gap-1">
             {editable ? (
               <input 
                  type="date"
                  value={item.eta || ''}
                  onChange={(e) => handleInlineUpdate(item.id, 'eta', e.target.value)}
                  className="w-full bg-white text-xs border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded-md transition-all duration-200 font-mono"
               />
             ) : (
               <span className="text-xs font-semibold text-slate-700 font-mono">{item.eta || 'N/A'}</span>
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
      {tasksExpanded && (
        <tr className="bg-slate-50">
          <td colSpan={isAdmin ? 9 : 8} className="px-3 py-1.5 border-b border-slate-200">
            <div className="space-y-1.5">
              {/* Tasks List */}
              {tasks.filter(t => t.status !== Status.Deleted).length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold text-slate-700 mb-1.5 tracking-wide">Tasks ({tasks.filter(t => t.status !== Status.Deleted).length})</div>
                  {tasks.filter(task => task.status !== Status.Deleted).map((task, taskIndex) => (
                    <div key={task.id} className="bg-slate-50 border-l-4 border-l-blue-400 border border-slate-200 rounded-md shadow-sm hover:shadow-md hover:border-blue-300 transition-all duration-200 ml-8">
                      <div className="flex items-center">
                        {/* Column 1: ID - Empty, matching initiative ID column width */}
                        <div className="w-12 px-2.5 py-2 text-center border-r border-slate-200"></div>
                        
                        {/* Column 2: Task Title (aligned with Initiative column) */}
                        <div className="px-3 py-2 border-r border-slate-200 min-w-[320px] flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {getTaskIcon(task)}
                            {editable ? (
                              <input
                                type="text"
                                value={task.title || ''}
                                onChange={(e) => handleUpdateTask(item.id, task.id, 'title', e.target.value || undefined)}
                                placeholder={`Task ${taskIndex + 1}`}
                                className="flex-1 min-w-[120px] text-xs font-medium text-slate-700 px-1.5 py-0.5 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white transition-all duration-200"
                              />
                            ) : (
                              <span className="text-xs font-medium text-slate-700">
                                {task.title || `Task ${taskIndex + 1}`}
                              </span>
                            )}
                            {!editable && task.tags && task.tags.length > 0 && (
                              <div className="flex gap-0.5">
                                {task.tags.map(tag => (
                                  <span key={tag} className="px-1 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-medium rounded">
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
                                  className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5 accent-purple-500"
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
                                  className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5 accent-purple-500"
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
                                  className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5 accent-purple-500"
                                />
                                <span className="text-[10px] text-slate-600">Risk Item</span>
                              </label>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Column 3: Owner */}
                        <div className="px-2.5 py-2 border-r border-blue-200 whitespace-nowrap min-w-[120px]">
                          {editable ? (
                            <input
                              type="text"
                              value={task.owner || ''}
                              onChange={(e) => handleUpdateTask(item.id, task.id, 'owner', e.target.value || undefined)}
                              placeholder="Owner..."
                              className="text-xs px-1.5 py-0.5 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white w-24 transition-all duration-200"
                            />
                          ) : (
                            <div className="flex items-center justify-center">
                              {task.owner ? (
                                <span className="text-slate-700 font-medium text-xs truncate max-w-[100px]">{task.owner}</span>
                              ) : (
                                <span className="text-slate-400 text-xs">-</span>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Column 4: Status (aligned with Status column) */}
                        <div className="px-2.5 py-2 border-r border-blue-200 text-center min-w-[100px]">
                          {editable ? (
                            <select
                              value={task.status}
                              onChange={(e) => handleUpdateTask(item.id, task.id, 'status', e.target.value as Status)}
                              className={`w-full text-[11px] font-bold border focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-1.5 py-1 rounded-md cursor-pointer transition-all duration-200 ${getStatusSelectStyle(task.status)}`}
                            >
                              {getStatuses(config).filter(s => s !== Status.Deleted).map(s => (
                                <option key={s} value={s} className="bg-white text-slate-900">{s}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex justify-center">
                              <StatusBadge status={task.status} />
                            </div>
                          )}
                        </div>
                        
                        {/* Column 5: Priority (aligned with Priority column) */}
                        <div className="px-2.5 py-2 border-r border-blue-200 text-center min-w-[70px]">
                          {editable ? (
                            <select
                              value={task.priority || Priority.P2}
                              onChange={(e) => handleUpdateTask(item.id, task.id, 'priority', e.target.value as Priority)}
                              className={`w-full text-[11px] font-bold border focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-1.5 py-1 rounded-md cursor-pointer transition-all duration-200 ${getPrioritySelectStyle(task.priority || Priority.P2)}`}
                            >
                              {getPriorities(config).map(p => (
                                <option key={p} value={p} className="bg-white text-slate-900">{p}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex justify-center">
                              {task.priority ? <PriorityBadge priority={task.priority} /> : <span className="text-slate-400 text-xs">-</span>}
                            </div>
                          )}
                        </div>
                        
                        {/* Column 6: Effort (aligned with Effort column) */}
                        <div className="px-2.5 py-2 border-r border-blue-200 min-w-[150px]">
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
                                    let decrement: number;
                                    if (taskDisplayUnit === 'hours') {
                                      decrement = hoursToWeeks(1);
                                    } else if (taskDisplayUnit === 'days') {
                                      decrement = daysToWeeks(1);
                                    } else {
                                      decrement = 0.25;
                                    }
                                    handleUpdateTask(item.id, task.id, 'actualEffort', Math.max(0, currentWeeks - decrement));
                                  }}
                                  className="p-0.5 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-all duration-200 flex-shrink-0"
                                  title={taskDisplayUnit === 'hours' ? 'Decrease by 1 hour' : taskDisplayUnit === 'days' ? 'Decrease by 1 day' : 'Decrease by 0.25 weeks'}
                                >
                                  <ArrowDown size={12} />
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  step={taskDisplayUnit === 'hours' ? '1' : taskDisplayUnit === 'days' ? '1' : '0.25'}
                                  value={taskDisplayUnit === 'hours'
                                    ? weeksToHours(task.actualEffort || 0).toFixed(1)
                                    : taskDisplayUnit === 'days'
                                    ? weeksToDays(task.actualEffort || 0).toFixed(1)
                                    : (task.actualEffort || 0).toFixed(2)}
                                  onChange={(e) => {
                                    const inputValue = parseFloat(e.target.value) || 0;
                                    let weeksValue: number;
                                    if (taskDisplayUnit === 'hours') {
                                      weeksValue = hoursToWeeks(inputValue);
                                    } else if (taskDisplayUnit === 'days') {
                                      weeksValue = daysToWeeks(inputValue);
                                    } else {
                                      weeksValue = inputValue;
                                    }
                                    if (!isNaN(weeksValue) && weeksValue >= 0) {
                                      handleUpdateTask(item.id, task.id, 'actualEffort', weeksValue);
                                    }
                                  }}
                                  className="w-16 bg-white text-xs font-mono text-slate-700 border border-blue-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded-md text-right transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  title="Actual Effort"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const currentWeeks = task.actualEffort || 0;
                                    let increment: number;
                                    if (taskDisplayUnit === 'hours') {
                                      increment = hoursToWeeks(1);
                                    } else if (taskDisplayUnit === 'days') {
                                      increment = daysToWeeks(1);
                                    } else {
                                      increment = 0.25;
                                    }
                                    handleUpdateTask(item.id, task.id, 'actualEffort', currentWeeks + increment);
                                  }}
                                  className="p-0.5 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-all duration-200 flex-shrink-0"
                                  title={taskDisplayUnit === 'hours' ? 'Increase by 1 hour' : taskDisplayUnit === 'days' ? 'Increase by 1 day' : 'Increase by 0.25 weeks'}
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
                                    let decrement: number;
                                    if (taskDisplayUnit === 'hours') {
                                      decrement = hoursToWeeks(1);
                                    } else if (taskDisplayUnit === 'days') {
                                      decrement = daysToWeeks(1);
                                    } else {
                                      decrement = 0.25;
                                    }
                                    handleUpdateTask(item.id, task.id, 'estimatedEffort', Math.max(0, currentWeeks - decrement));
                                  }}
                                  className="p-0.5 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-all duration-200 flex-shrink-0"
                                  title={taskDisplayUnit === 'hours' ? 'Decrease by 1 hour' : taskDisplayUnit === 'days' ? 'Decrease by 1 day' : 'Decrease by 0.25 weeks'}
                                >
                                  <ArrowDown size={12} />
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  step={taskDisplayUnit === 'hours' ? '1' : taskDisplayUnit === 'days' ? '1' : '0.25'}
                                  value={taskDisplayUnit === 'hours'
                                    ? weeksToHours(task.estimatedEffort || 0).toFixed(1)
                                    : taskDisplayUnit === 'days'
                                    ? weeksToDays(task.estimatedEffort || 0).toFixed(1)
                                    : (task.estimatedEffort || 0).toFixed(2)}
                                  onChange={(e) => {
                                    const inputValue = parseFloat(e.target.value) || 0;
                                    let weeksValue: number;
                                    if (taskDisplayUnit === 'hours') {
                                      weeksValue = hoursToWeeks(inputValue);
                                    } else if (taskDisplayUnit === 'days') {
                                      weeksValue = daysToWeeks(inputValue);
                                    } else {
                                      weeksValue = inputValue;
                                    }
                                    if (!isNaN(weeksValue) && weeksValue >= 0) {
                                      handleUpdateTask(item.id, task.id, 'estimatedEffort', weeksValue);
                                    }
                                  }}
                                  className="w-16 bg-white text-xs font-mono text-slate-700 border border-blue-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded-md text-right transition-all duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  title="Planned Effort"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const currentWeeks = task.estimatedEffort || 0;
                                    let increment: number;
                                    if (taskDisplayUnit === 'hours') {
                                      increment = hoursToWeeks(1);
                                    } else if (taskDisplayUnit === 'days') {
                                      increment = daysToWeeks(1);
                                    } else {
                                      increment = 0.25;
                                    }
                                    handleUpdateTask(item.id, task.id, 'estimatedEffort', currentWeeks + increment);
                                  }}
                                  className="p-0.5 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-all duration-200 flex-shrink-0"
                                  title={taskDisplayUnit === 'hours' ? 'Increase by 1 hour' : taskDisplayUnit === 'days' ? 'Increase by 1 day' : 'Increase by 0.25 weeks'}
                                >
                                  <ArrowUp size={12} />
                                </button>
                              </div>
                              {setDisplayUnit && (
                                <div className="flex items-center gap-0.5 border border-blue-300 rounded ml-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setDisplayUnit(item.id, 'hours');
                                    }}
                                    className={`px-1 py-0.5 text-[9px] font-medium rounded transition-all duration-200 ${
                                      taskDisplayUnit === 'hours' 
                                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm' 
                                        : 'text-slate-600 hover:bg-slate-100 bg-white'
                                    }`}
                                    title="Switch to hours"
                                  >
                                    H
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setDisplayUnit(item.id, 'days');
                                    }}
                                    className={`px-1 py-0.5 text-[9px] font-medium rounded transition-all duration-200 ${
                                      taskDisplayUnit === 'days' 
                                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm' 
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
                                    className={`px-1 py-0.5 text-[9px] font-medium rounded transition-all duration-200 ${
                                      taskDisplayUnit === 'weeks' 
                                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm' 
                                        : 'text-slate-600 hover:bg-slate-100 bg-white'
                                    }`}
                                    title="Switch to weeks"
                                  >
                                    W
                                  </button>
                                </div>
                              )}
                              <span className="text-slate-400 text-xs font-medium flex-shrink-0">{taskDisplayUnit === 'hours' ? 'h' : taskDisplayUnit === 'days' ? 'd' : 'w'}</span>
                            </div>
                            );
                          })() : (() => {
                            // Get display unit from parent initiative for read-only display
                            const taskDisplayUnit = getDisplayUnit(item.id);
                            return (
                            <div className="flex justify-center">
                              <span className="font-mono text-slate-700 text-xs font-semibold bg-blue-50 px-2 py-1 rounded">
                                {taskDisplayUnit === 'hours'
                                  ? `${weeksToHours(task.actualEffort || 0).toFixed(1)}/${weeksToHours(task.estimatedEffort || 0).toFixed(1)}h`
                                  : taskDisplayUnit === 'days'
                                  ? `${weeksToDays(task.actualEffort || 0).toFixed(1)}/${weeksToDays(task.estimatedEffort || 0).toFixed(1)}d`
                                  : `${(task.actualEffort || 0).toFixed(2)}/${(task.estimatedEffort || 0).toFixed(2)}w`}
                              </span>
                            </div>
                            );
                          })()}
                        </div>
                        
                        {/* Column 7: Progress - Empty (tasks don't have progress) */}
                        <div className="px-2.5 py-2 border-r border-blue-200 text-center min-w-[60px]">
                          <span className="text-slate-400 text-xs">-</span>
                        </div>
                        
                        {/* Column 8: ETA (aligned with ETA / Update column) */}
                        <div className="px-2.5 py-2 min-w-[100px] border-r border-blue-200">
                          {editable ? (
                            <input
                              type="date"
                              value={task.eta || ''}
                              onChange={(e) => handleUpdateTask(item.id, task.id, 'eta', e.target.value)}
                              className="w-full bg-white text-xs border border-blue-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-2 py-1 rounded-md transition-all duration-200 font-mono"
                            />
                          ) : (
                            <div className="flex justify-center">
                              <span className="text-xs font-semibold text-slate-700 font-mono">{task.eta || 'N/A'}</span>
                            </div>
                          )}
                        </div>
                        
                        {/* Column 9: Actions (Delete button) */}
                        <div className="px-2 py-2 flex items-center justify-center min-w-[40px]">
                          {canDeleteTask(item, task) && (
                            <button
                              onClick={() => handleDeleteTask(item.id, task.id)}
                              className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Delete task"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Add Task Form */}
              {editable && isAddingTask && (
                <div className="border-t border-slate-200 pt-3 mt-3">
                  <div className="bg-white/95 backdrop-blur-sm border border-blue-200 rounded-lg shadow-lg p-2.5 space-y-2.5 animate-scale-in">
                      {/* Header */}
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                        <h3 className="text-xs font-semibold text-slate-800">New Task</h3>
                        <button
                          onClick={() => {
                            setAddingTaskFor(null);
                            setNewTaskForm({
                              title: '',
                              estimatedEffort: 0,
                              actualEffort: 0,
                              eta: '',
                              owner: '',
                              status: Status.NotStarted,
                              priority: Priority.P2,
                              tags: [],
                              initiativeId: item.id,
                              tradeOffInitiativeId: undefined,
                              tradeOffTaskId: undefined,
                              tradeOffEta: undefined
                            });
                            // Collapse the expanded section if there are no active tasks
                            if (activeTasks.length === 0) {
                              setExpandedTasks(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(item.id);
                                return newSet;
                              });
                            }
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
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                          />
                        </div>

                        {/* Effort, ETA, Owner, Status, Tags in one row */}
                        <div className="grid grid-cols-5 gap-2">
                          {/* Effort */}
                          <div>
                            <label className="block text-[10px] font-medium text-slate-700 mb-1">
                              Effort
                              <span className="text-[9px] text-slate-400 font-normal ml-0.5">(Actual / Planned)</span>
                            </label>
                            <div className="flex items-center gap-1">
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
                              <span className="text-slate-400 text-[10px]">/</span>
                              {/* Planned Effort - Amber theme */}
                              <div className="flex items-center gap-0.5 bg-blue-50 border border-blue-200 rounded-md px-0.5 py-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setNewTaskForm(prev => ({ ...prev, estimatedEffort: Math.max(0, Number(prev.estimatedEffort || 0) - 0.25) }));
                                  }}
                                  className="p-0.5 hover:bg-blue-100 rounded text-blue-600 hover:text-blue-800 transition-all duration-200"
                                  title="Decrease planned"
                                >
                                  <ArrowDown size={9} />
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.25"
                                  value={newTaskForm.estimatedEffort || 0}
                                  onChange={(e) => setNewTaskForm(prev => ({ ...prev, estimatedEffort: parseFloat(e.target.value) || 0 }))}
                                  className="w-10 px-0.5 py-0.5 text-xs font-mono border-0 bg-transparent focus:outline-none text-right text-blue-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  placeholder="0"
                                  title="Planned effort"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setNewTaskForm(prev => ({ ...prev, estimatedEffort: Number(prev.estimatedEffort || 0) + 0.25 }));
                                  }}
                                  className="p-0.5 hover:bg-blue-100 rounded text-blue-600 hover:text-blue-800 transition-all duration-200"
                                  title="Increase planned"
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
                              className="w-full px-1.5 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 font-mono"
                            />
                          </div>

                          {/* Owner */}
                          <div>
                            <label className="block text-[10px] font-medium text-slate-700 mb-1">
                              Owner
                            </label>
                            <input
                              type="text"
                              value={newTaskForm.owner || ''}
                              onChange={(e) => setNewTaskForm(prev => ({ ...prev, owner: e.target.value || undefined }))}
                              placeholder="Enter name..."
                              className="w-full px-1.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                            />
                          </div>

                          {/* Status */}
                          <div>
                            <label className="block text-[10px] font-medium text-slate-700 mb-1">
                              Status
                            </label>
                            <select
                              value={newTaskForm.status || Status.NotStarted}
                              onChange={(e) => setNewTaskForm(prev => ({ ...prev, status: e.target.value as Status }))}
                              className="w-full px-1.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                            >
                              {Object.values(Status).filter(s => s !== Status.Deleted).map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>

                          {/* Priority */}
                          <div>
                            <label className="block text-[10px] font-medium text-slate-700 mb-1">
                              Priority
                            </label>
                            <select
                              value={newTaskForm.priority || Priority.P2}
                              onChange={(e) => setNewTaskForm(prev => ({ ...prev, priority: e.target.value as Priority }))}
                              className={`w-full px-1.5 py-1.5 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 ${getPrioritySelectStyle(newTaskForm.priority || Priority.P2)}`}
                            >
                              {getPriorities(config).map(p => (
                                <option key={p} value={p} className="bg-white text-slate-900">{p}</option>
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
                                  className="w-3 h-3 rounded border-slate-300 text-blue-600 focus:ring-1 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer accent-blue-500"
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
                                  className="w-3 h-3 rounded border-slate-300 text-blue-600 focus:ring-1 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer accent-blue-500"
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
                                  className="w-3 h-3 rounded border-slate-300 text-blue-600 focus:ring-1 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer accent-blue-500"
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
                                className="w-full px-2 py-1 text-[11px] border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                              >
                                <option value="">Select...</option>
                                {allInitiativesList
                                  .filter(i => i.ownerId === item.ownerId && i.status !== Status.Deleted)
                                  .map(i => (
                                    <option key={i.id} value={i.id}>
                                      {i.title} [{i.priority}] ({i.l1_assetClass}) {i.initiativeType === InitiativeType.BAU ? '[BAU]' : '[WP]'}
                                    </option>
                                  ))}
                                {allInitiativesList
                                  .filter(i => i.ownerId === item.ownerId && i.status !== Status.Deleted).length === 0 && (
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
                                  const activeTasks = tradeOffInitiative?.tasks?.filter(t => t.status !== Status.Deleted) || [];
                                  return !tradeOffInitiative || activeTasks.length === 0;
                                })()}
                                className="w-full px-2 py-1 text-[11px] border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                              >
                                <option value="">Select task...</option>
                                {newTaskForm.tradeOffInitiativeId && (() => {
                                  const tradeOffInitiative = allInitiativesList.find(i => i.id === newTaskForm.tradeOffInitiativeId);
                                  const activeTasks = tradeOffInitiative?.tasks?.filter(t => t.status !== Status.Deleted) || [];
                                  if (activeTasks.length > 0) {
                                    return activeTasks.map(task => (
                                      <option key={task.id} value={task.id}>
                                        {task.title || `Task ${task.id.slice(-4)}`} {task.priority ? `[${task.priority}]` : ''} ({task.eta || 'No ETA'})
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
                                className="w-full px-2 py-1 text-[11px] border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 font-mono disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
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
                              estimatedEffort: 0,
                              actualEffort: 0,
                              eta: '',
                              owner: '',
                              status: Status.NotStarted,
                              priority: Priority.P2,
                              tags: [],
                              initiativeId: item.id,
                              tradeOffInitiativeId: undefined,
                              tradeOffTaskId: undefined,
                              tradeOffEta: undefined
                            });
                            // Collapse the expanded section if there are no active tasks
                            if (activeTasks.length === 0) {
                              setExpandedTasks(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(item.id);
                                return newSet;
                              });
                            }
                          }}
                          className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleAddTask(item.id)}
                          disabled={!newTaskForm.eta}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-md hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-blue-500 disabled:hover:to-blue-600"
                        >
                          Add Task
                        </button>
                      </div>
                    </div>
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
  const colSpan = isAdmin ? 9 : 8;
  const allSelected = isAdmin && filteredInitiatives.length > 0 && selectedItems.size === filteredInitiatives.length;
  const someSelected = isAdmin && selectedItems.size > 0 && selectedItems.size < filteredInitiatives.length;
  
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex-1 flex flex-col min-h-[500px] relative  ">
      <div ref={scrollContainerRef} className="overflow-auto custom-scrollbar flex-1">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-20 shadow-lg">
            <tr className="bg-gradient-to-b from-slate-100 to-slate-50 border-b-2 border-slate-300">
              {isAdmin && (
                <th className="w-12 px-2 py-2.5 text-center border-r border-slate-200 bg-gradient-to-b from-slate-100 to-slate-50 select-none">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(input) => {
                      if (input) input.indeterminate = someSelected;
                    }}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer accent-blue-500"
                    title={allSelected ? 'Deselect all' : 'Select all'}
                  />
                </th>
              )}
              <th className="w-12 px-3 py-2.5 text-center font-bold text-slate-700 text-xs border-r border-slate-200 bg-gradient-to-b from-slate-100 to-slate-50 select-none ">
                ID
              </th>
              <SortableHeader label={`Initiative (${filteredInitiatives.length})`} sortKey="title" />
              <SortableHeader label="Owner" sortKey="owner" />
              <SortableHeader label="Status" sortKey="status" />
              <SortableHeader label="Priority" sortKey="priority" />
              <th className="px-3 py-2.5 text-center font-bold text-slate-700 bg-gradient-to-b from-slate-100 to-slate-50 border-r border-slate-200 text-xs tracking-wider whitespace-nowrap select-none min-w-[150px] ">
                Effort (act/plan)
              </th>
              <th className="px-3 py-2.5 text-center font-bold text-slate-700 bg-gradient-to-b from-slate-100 to-slate-50 border-r border-slate-200 text-xs tracking-wider whitespace-nowrap select-none ">Progress</th>
              <SortableHeader label="ETA / Update" sortKey="eta" />
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filteredInitiatives.length === 0 ? (
               <tr><td colSpan={colSpan} className="px-4 py-12 text-center text-slate-500 text-sm">No initiatives found matching your filters.</td></tr>
            ) : renderFlatView()}
          </tbody>
        </table>
      </div>
      {isAdmin && selectedItems.size > 0 && (
        <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-r from-blue-50 to-blue-100/50 border-t-2 border-blue-300 shadow-xl z-30 px-4 py-3 flex items-center justify-between backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-800 ">
              {selectedItems.size} {selectedItems.size === 1 ? 'item' : 'items'} selected
            </span>
            <button
              onClick={handleClearSelection}
              className="text-xs text-slate-600 hover:text-slate-800 underline font-medium transition-colors"
            >
              Clear selection
            </button>
          </div>
          <button
            onClick={handleBulkDelete}
            className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white text-sm font-semibold rounded-lg transition-all duration-200 shadow-md shadow-red-500/20"
          >
            Delete Selected
          </button>
        </div>
      )}
    </div>
  );
};
