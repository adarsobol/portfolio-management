/**
 * Pure utility functions for task operations.
 * Extracted from TaskTable.tsx for testability.
 */

import { Task, Status, Priority, UnplannedTag } from '../types';

export interface NewTaskData {
  title?: string;
  estimatedEffort?: number;
  actualEffort?: number;
  eta: string;
  owner?: string;
  status?: Status;
  priority?: Priority;
  tags?: UnplannedTag[];
}

/**
 * Validate task data before creation
 */
export function validateTaskData(data: Partial<NewTaskData>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.eta) {
    errors.push('ETA is required');
  }
  
  if (data.eta && !isValidDate(data.eta)) {
    errors.push('ETA must be a valid date');
  }
  
  if (data.estimatedEffort !== undefined && data.estimatedEffort < 0) {
    errors.push('Estimated effort cannot be negative');
  }
  
  if (data.actualEffort !== undefined && data.actualEffort < 0) {
    errors.push('Actual effort cannot be negative');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if a string is a valid ISO date
 */
export function isValidDate(dateString: string): boolean {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

/**
 * Create a new task with defaults
 */
export function createTask(
  id: string,
  data: NewTaskData,
  createdBy: string
): Task {
  return {
    id,
    title: data.title || undefined,
    estimatedEffort: data.estimatedEffort || 0,
    actualEffort: data.actualEffort || 0,
    eta: data.eta,
    owner: data.owner || undefined,
    status: data.status || Status.NotStarted,
    priority: data.priority || Priority.P2,
    tags: data.tags || [],
    comments: [],
    createdAt: new Date().toISOString(),
    createdBy,
  };
}

/**
 * Calculate total actual effort from tasks
 */
export function calculateTotalActualEffort(tasks: Task[]): number {
  return tasks.reduce((sum, task) => sum + (task.actualEffort || 0), 0);
}

/**
 * Calculate total estimated effort from tasks
 */
export function calculateTotalEstimatedEffort(tasks: Task[]): number {
  return tasks.reduce((sum, task) => sum + (task.estimatedEffort || 0), 0);
}

/**
 * Filter out deleted tasks
 */
export function getActiveTasks(tasks: Task[]): Task[] {
  return tasks.filter(t => t.status !== Status.Deleted);
}

/**
 * Update a task within a task array
 */
export function updateTaskInArray(
  tasks: Task[],
  taskId: string,
  updates: Partial<Task>
): Task[] {
  return tasks.map(task => 
    task.id === taskId ? { ...task, ...updates } : task
  );
}

/**
 * Remove a task from array (soft delete by setting status to Deleted)
 */
export function softDeleteTask(tasks: Task[], taskId: string): Task[] {
  return tasks.map(task =>
    task.id === taskId 
      ? { ...task, status: Status.Deleted, deletedAt: new Date().toISOString() }
      : task
  );
}

/**
 * Sort tasks by priority
 */
export function sortTasksByPriority(tasks: Task[], direction: 'asc' | 'desc' = 'asc'): Task[] {
  const priorityOrder: Record<Priority, number> = {
    [Priority.P0]: 0,
    [Priority.P1]: 1,
    [Priority.P2]: 2,
  };
  
  return [...tasks].sort((a, b) => {
    const aOrder = priorityOrder[a.priority || Priority.P2];
    const bOrder = priorityOrder[b.priority || Priority.P2];
    return direction === 'asc' ? aOrder - bOrder : bOrder - aOrder;
  });
}

/**
 * Sort tasks by ETA
 */
export function sortTasksByEta(tasks: Task[], direction: 'asc' | 'desc' = 'asc'): Task[] {
  return [...tasks].sort((a, b) => {
    const aEta = a.eta || '';
    const bEta = b.eta || '';
    
    if (!aEta && !bEta) return 0;
    if (!aEta) return direction === 'asc' ? 1 : -1;
    if (!bEta) return direction === 'asc' ? -1 : 1;
    
    return direction === 'asc' 
      ? aEta.localeCompare(bEta)
      : bEta.localeCompare(aEta);
  });
}

/**
 * Get task completion statistics
 */
export function getTaskStats(tasks: Task[]) {
  const activeTasks = getActiveTasks(tasks);
  const total = activeTasks.length;
  const done = activeTasks.filter(t => t.status === Status.Done).length;
  const inProgress = activeTasks.filter(t => t.status === Status.InProgress).length;
  const notStarted = activeTasks.filter(t => t.status === Status.NotStarted).length;
  const atRisk = activeTasks.filter(t => t.status === Status.AtRisk).length;
  
  return {
    total,
    done,
    inProgress,
    notStarted,
    atRisk,
    completionRate: total > 0 ? (done / total) * 100 : 0,
  };
}

/**
 * Check if a task is overdue
 */
export function isTaskOverdue(task: Task): boolean {
  if (!task.eta || task.status === Status.Done || task.status === Status.Deleted) {
    return false;
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const eta = new Date(task.eta);
  eta.setHours(0, 0, 0, 0);
  
  return eta < today;
}

/**
 * Get overdue tasks
 */
export function getOverdueTasks(tasks: Task[]): Task[] {
  return tasks.filter(isTaskOverdue);
}
