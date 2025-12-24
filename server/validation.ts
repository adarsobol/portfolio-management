import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

// Validation schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const googleAuthSchema = z.object({
  credential: z.string().min(1, 'Credential is required'),
  clientId: z.string().optional(),
});

export const registerUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(['Admin', 'Team Lead', 'Group Lead (Director)', 'Portfolio Ops', 'VP'], {
    errorMap: () => ({ message: 'Invalid role' }),
  }),
  avatar: z.string().url('Invalid avatar URL').optional().or(z.literal('')),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

const taskSchema = z.object({
  id: z.string().min(1, 'Task ID is required'),
  title: z.string().optional(),
  estimatedEffort: z.number().min(0, 'Task estimated effort must be non-negative').optional(),
  actualEffort: z.number().min(0, 'Task actual effort must be non-negative').optional(),
  eta: z.string().min(1, 'Task ETA is required'),
  ownerId: z.string().min(1, 'Task owner ID is required'),
  status: z.enum(['Not Started', 'In Progress', 'At Risk', 'Done', 'Obsolete'], {
    errorMap: () => ({ message: 'Invalid task status' }),
  }),
  tags: z.array(z.enum(['Unplanned', 'Risk Item', 'PM Item', 'Both'])).optional(),
  comments: z.array(z.any()).optional(),
});

export const initiativeSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  initiativeType: z.enum(['WP', 'BAU']).optional(),
  l1_assetClass: z.enum(['PL', 'Auto', 'POS', 'Advisory'], {
    errorMap: () => ({ message: 'Invalid asset class' }),
  }),
  l2_pillar: z.string().min(1, 'Pillar is required'),
  l3_responsibility: z.string().min(1, 'Responsibility is required'),
  l4_target: z.string().min(1, 'Target is required'),
  title: z.string().min(1, 'Title is required'),
  ownerId: z.string().min(1, 'Owner ID is required'),
  secondaryOwner: z.string().optional(),
  quarter: z.string().min(1, 'Quarter is required'),
  status: z.enum(['Not Started', 'In Progress', 'At Risk', 'Done', 'Obsolete'], {
    errorMap: () => ({ message: 'Invalid status' }),
  }),
  priority: z.enum(['P0', 'P1', 'P2'], {
    errorMap: () => ({ message: 'Invalid priority' }),
  }),
  estimatedEffort: z.number().min(0, 'Estimated effort must be non-negative').optional().default(0),
  originalEstimatedEffort: z.number().min(0, 'Original estimated effort must be non-negative').optional(),
  actualEffort: z.number().min(0, 'Actual effort must be non-negative').optional().default(0),
  eta: z.string().optional(),
  originalEta: z.string().optional(),
  lastUpdated: z.string().optional(),
  lastWeeklyUpdate: z.string().optional(),
  overlookedCount: z.number().min(0, 'Overlooked count must be non-negative').optional(),
  lastDelayDate: z.string().optional(),
  dependencyTeams: z.union([z.array(z.string()), z.string()]).optional(),
  dependencyTeamNotes: z.union([z.record(z.string()), z.string()]).optional(),
  dependencies: z.union([z.array(z.any()), z.string()]).optional(),
  workType: z.enum(['Planned Work', 'Unplanned Work'], {
    errorMap: () => ({ message: 'Invalid work type' }),
  }),
  unplannedTags: z.union([z.array(z.enum(['Unplanned', 'Risk Item', 'PM Item', 'Both'])), z.string()]).optional(),
  riskActionLog: z.string().optional(),
  definitionOfDone: z.string().optional(),
  comments: z.union([z.array(z.any()), z.string()]).optional(),
  tasks: z.union([z.array(taskSchema), z.string()]).optional(),
  history: z.union([z.array(z.any()), z.string()]).optional(),
  isAtRisk: z.boolean().optional(),
  completionRate: z.number().min(0).optional(),
  version: z.number().optional(),
}).refine((data) => {
  const initiativeType = data.initiativeType || 'WP'; // Default to WP
  // WP initiatives require definitionOfDone
  if (initiativeType !== 'BAU' && (!data.definitionOfDone || data.definitionOfDone.trim().length === 0)) {
    return false;
  }
  return true;
}, {
  message: 'WP initiatives require Definition of Done',
});

export const initiativesArraySchema = z.object({
  initiatives: z.array(initiativeSchema).min(1, 'At least one initiative is required'),
});

export const changelogSchema = z.object({
  changes: z.array(z.object({
    id: z.string().optional(),
    initiativeId: z.string().min(1, 'Initiative ID is required'),
    initiativeTitle: z.string().min(1, 'Initiative title is required'),
    field: z.string().min(1, 'Field is required'),
    oldValue: z.any().optional(),
    newValue: z.any().optional(),
    changedBy: z.string().min(1, 'Changed by is required'),
    timestamp: z.string().optional(),
  })).min(1, 'At least one change is required'),
});

export const snapshotSchema = z.object({
  snapshot: z.object({
    id: z.string().optional(),
    timestamp: z.string().optional(),
    initiatives: z.array(initiativeSchema),
    metadata: z.record(z.any()).optional(),
  }),
});

export const slackWebhookSchema = z.object({
  webhookUrl: z.string().url('Invalid webhook URL'),
});

export const bulkImportUsersSchema = z.object({
  users: z.array(z.object({
    email: z.string().email('Invalid email address'),
    name: z.string().min(1, 'Name is required'),
    role: z.enum(['Admin', 'Team Lead', 'Group Lead (Director)', 'Portfolio Ops', 'VP'], {
      errorMap: () => ({ message: 'Invalid role' }),
    }),
    avatar: z.string().url('Invalid avatar URL').optional().or(z.literal('')),
  })).min(1, 'At least one user is required'),
});

// Validation middleware factory
export const validate = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        res.status(400).json({
          error: 'Validation failed',
          details: errors,
        });
      } else {
        res.status(400).json({ error: 'Invalid request data' });
      }
    }
  };
};
