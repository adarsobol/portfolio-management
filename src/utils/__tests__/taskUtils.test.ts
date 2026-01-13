import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateTaskData,
  isValidDate,
  createTask,
  calculateTotalActualEffort,
  calculateTotalEstimatedEffort,
  getActiveTasks,
  updateTaskInArray,
  softDeleteTask,
  sortTasksByPriority,
  sortTasksByEta,
  getTaskStats,
  isTaskOverdue,
  getOverdueTasks,
} from '../taskUtils';
import { Task, Status, Priority } from '../../types';

// Helper to create test task
const createTestTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  eta: '2024-12-31',
  status: Status.InProgress,
  priority: Priority.P1,
  estimatedEffort: 5,
  actualEffort: 3,
  ...overrides,
});

describe('Task Validation', () => {
  describe('validateTaskData', () => {
    it('should pass validation with valid data', () => {
      const result = validateTaskData({ eta: '2024-12-31' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail when ETA is missing', () => {
      const result = validateTaskData({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ETA is required');
    });

    it('should fail with invalid date', () => {
      const result = validateTaskData({ eta: 'not-a-date' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ETA must be a valid date');
    });

    it('should fail with negative effort values', () => {
      const result = validateTaskData({ eta: '2024-12-31', estimatedEffort: -5 });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Estimated effort cannot be negative');
    });
  });

  describe('isValidDate', () => {
    it('should return true for valid ISO date', () => {
      expect(isValidDate('2024-12-31')).toBe(true);
    });

    it('should return true for valid datetime', () => {
      expect(isValidDate('2024-12-31T12:00:00Z')).toBe(true);
    });

    it('should return false for invalid date string', () => {
      expect(isValidDate('not-a-date')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidDate('')).toBe(false);
    });
  });
});

describe('Task Creation', () => {
  describe('createTask', () => {
    it('should create a task with required fields', () => {
      const task = createTask('task-123', { eta: '2024-12-31' }, 'user-1');
      
      expect(task.id).toBe('task-123');
      expect(task.eta).toBe('2024-12-31');
      expect(task.createdBy).toBe('user-1');
      expect(task.createdAt).toBeDefined();
    });

    it('should apply default values', () => {
      const task = createTask('task-123', { eta: '2024-12-31' }, 'user-1');
      
      expect(task.status).toBe(Status.NotStarted);
      expect(task.priority).toBe(Priority.P2);
      expect(task.estimatedEffort).toBe(0);
      expect(task.actualEffort).toBe(0);
      expect(task.tags).toEqual([]);
      expect(task.comments).toEqual([]);
    });

    it('should use provided values over defaults', () => {
      const task = createTask(
        'task-123',
        {
          eta: '2024-12-31',
          title: 'My Task',
          status: Status.InProgress,
          priority: Priority.P0,
          estimatedEffort: 10,
        },
        'user-1'
      );
      
      expect(task.title).toBe('My Task');
      expect(task.status).toBe(Status.InProgress);
      expect(task.priority).toBe(Priority.P0);
      expect(task.estimatedEffort).toBe(10);
    });
  });
});

describe('Effort Calculations', () => {
  const tasks = [
    createTestTask({ id: '1', actualEffort: 5, estimatedEffort: 10 }),
    createTestTask({ id: '2', actualEffort: 3, estimatedEffort: 8 }),
    createTestTask({ id: '3', actualEffort: 0, estimatedEffort: 5 }),
  ];

  describe('calculateTotalActualEffort', () => {
    it('should sum actual effort', () => {
      expect(calculateTotalActualEffort(tasks)).toBe(8);
    });

    it('should return 0 for empty array', () => {
      expect(calculateTotalActualEffort([])).toBe(0);
    });

    it('should handle undefined values', () => {
      const tasksWithUndefined = [
        createTestTask({ id: '1', actualEffort: undefined }),
        createTestTask({ id: '2', actualEffort: 5 }),
      ];
      expect(calculateTotalActualEffort(tasksWithUndefined)).toBe(5);
    });
  });

  describe('calculateTotalEstimatedEffort', () => {
    it('should sum estimated effort', () => {
      expect(calculateTotalEstimatedEffort(tasks)).toBe(23);
    });
  });
});

describe('Task Filtering', () => {
  describe('getActiveTasks', () => {
    it('should filter out deleted tasks', () => {
      const tasks = [
        createTestTask({ id: '1', status: Status.InProgress }),
        createTestTask({ id: '2', status: Status.Deleted }),
        createTestTask({ id: '3', status: Status.Done }),
      ];
      
      const active = getActiveTasks(tasks);
      expect(active).toHaveLength(2);
      expect(active.find(t => t.id === '2')).toBeUndefined();
    });
  });
});

describe('Task Updates', () => {
  describe('updateTaskInArray', () => {
    const tasks = [
      createTestTask({ id: '1', title: 'Task 1' }),
      createTestTask({ id: '2', title: 'Task 2' }),
    ];

    it('should update the correct task', () => {
      const updated = updateTaskInArray(tasks, '1', { title: 'Updated' });
      expect(updated[0].title).toBe('Updated');
      expect(updated[1].title).toBe('Task 2');
    });

    it('should not mutate original array', () => {
      const original = [...tasks];
      updateTaskInArray(tasks, '1', { title: 'Updated' });
      expect(tasks).toEqual(original);
    });

    it('should leave array unchanged if task not found', () => {
      const updated = updateTaskInArray(tasks, 'not-found', { title: 'Updated' });
      expect(updated).toEqual(tasks);
    });
  });

  describe('softDeleteTask', () => {
    it('should set status to Deleted and add deletedAt', () => {
      const tasks = [createTestTask({ id: '1', status: Status.InProgress })];
      const result = softDeleteTask(tasks, '1');
      
      expect(result[0].status).toBe(Status.Deleted);
      expect(result[0].deletedAt).toBeDefined();
    });

    it('should not affect other tasks', () => {
      const tasks = [
        createTestTask({ id: '1' }),
        createTestTask({ id: '2' }),
      ];
      const result = softDeleteTask(tasks, '1');
      
      expect(result[1].status).not.toBe(Status.Deleted);
    });
  });
});

describe('Task Sorting', () => {
  describe('sortTasksByPriority', () => {
    const tasks = [
      createTestTask({ id: '1', priority: Priority.P2 }),
      createTestTask({ id: '2', priority: Priority.P0 }),
      createTestTask({ id: '3', priority: Priority.P1 }),
    ];

    it('should sort ascending (P0 first)', () => {
      const sorted = sortTasksByPriority(tasks, 'asc');
      expect(sorted[0].priority).toBe(Priority.P0);
      expect(sorted[1].priority).toBe(Priority.P1);
      expect(sorted[2].priority).toBe(Priority.P2);
    });

    it('should sort descending (P2 first)', () => {
      const sorted = sortTasksByPriority(tasks, 'desc');
      expect(sorted[0].priority).toBe(Priority.P2);
    });

    it('should not mutate original array', () => {
      const original = tasks.map(t => t.id);
      sortTasksByPriority(tasks, 'asc');
      expect(tasks.map(t => t.id)).toEqual(original);
    });
  });

  describe('sortTasksByEta', () => {
    const tasks = [
      createTestTask({ id: '1', eta: '2024-12-31' }),
      createTestTask({ id: '2', eta: '2024-10-01' }),
      createTestTask({ id: '3', eta: '2024-11-15' }),
    ];

    it('should sort ascending (earliest first)', () => {
      const sorted = sortTasksByEta(tasks, 'asc');
      expect(sorted[0].eta).toBe('2024-10-01');
      expect(sorted[2].eta).toBe('2024-12-31');
    });

    it('should sort descending (latest first)', () => {
      const sorted = sortTasksByEta(tasks, 'desc');
      expect(sorted[0].eta).toBe('2024-12-31');
    });

    it('should handle missing ETAs', () => {
      const tasksWithMissing = [
        createTestTask({ id: '1', eta: '2024-12-31' }),
        createTestTask({ id: '2', eta: '' }),
        createTestTask({ id: '3', eta: '2024-10-01' }),
      ];
      
      const sorted = sortTasksByEta(tasksWithMissing, 'asc');
      expect(sorted[0].eta).toBe('2024-10-01');
      expect(sorted[2].eta).toBe(''); // Empty ETAs at end
    });
  });
});

describe('Task Statistics', () => {
  describe('getTaskStats', () => {
    const tasks = [
      createTestTask({ id: '1', status: Status.NotStarted }),
      createTestTask({ id: '2', status: Status.InProgress }),
      createTestTask({ id: '3', status: Status.Done }),
      createTestTask({ id: '4', status: Status.Done }),
      createTestTask({ id: '5', status: Status.Deleted }),
    ];

    it('should calculate stats correctly', () => {
      const stats = getTaskStats(tasks);
      
      expect(stats.total).toBe(4); // Excludes deleted
      expect(stats.done).toBe(2);
      expect(stats.inProgress).toBe(1);
      expect(stats.notStarted).toBe(1);
    });

    it('should calculate completion rate', () => {
      const stats = getTaskStats(tasks);
      expect(stats.completionRate).toBe(50); // 2 of 4 = 50%
    });

    it('should handle empty array', () => {
      const stats = getTaskStats([]);
      expect(stats.total).toBe(0);
      expect(stats.completionRate).toBe(0);
    });
  });
});

describe('Overdue Detection', () => {
  const mockToday = new Date('2024-10-15T12:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockToday);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isTaskOverdue', () => {
    it('should return true for past ETA', () => {
      const task = createTestTask({ eta: '2024-10-01', status: Status.InProgress });
      expect(isTaskOverdue(task)).toBe(true);
    });

    it('should return false for future ETA', () => {
      const task = createTestTask({ eta: '2024-12-31', status: Status.InProgress });
      expect(isTaskOverdue(task)).toBe(false);
    });

    it('should return false for Done tasks', () => {
      const task = createTestTask({ eta: '2024-10-01', status: Status.Done });
      expect(isTaskOverdue(task)).toBe(false);
    });

    it('should return false for Deleted tasks', () => {
      const task = createTestTask({ eta: '2024-10-01', status: Status.Deleted });
      expect(isTaskOverdue(task)).toBe(false);
    });

    it('should return false when no ETA', () => {
      const task = createTestTask({ eta: '', status: Status.InProgress });
      expect(isTaskOverdue(task)).toBe(false);
    });
  });

  describe('getOverdueTasks', () => {
    it('should return only overdue tasks', () => {
      const tasks = [
        createTestTask({ id: '1', eta: '2024-10-01', status: Status.InProgress }), // Overdue
        createTestTask({ id: '2', eta: '2024-12-31', status: Status.InProgress }), // Not overdue
        createTestTask({ id: '3', eta: '2024-09-01', status: Status.Done }), // Done, not counted
      ];
      
      const overdue = getOverdueTasks(tasks);
      expect(overdue).toHaveLength(1);
      expect(overdue[0].id).toBe('1');
    });
  });
});
