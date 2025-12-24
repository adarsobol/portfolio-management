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

// Task schema is no longer strictly validated - tasks are stored as JSON strings

// Lenient initiative schema - accepts any fields, only validates required ones
export const initiativeSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  title: z.string().min(1, 'Title is required'),
}).passthrough(); // Allow any additional fields without validation

export const initiativesArraySchema = z.object({
  initiatives: z.array(initiativeSchema).min(1, 'At least one initiative is required'),
});

// Lenient changelog schema
export const changelogSchema = z.object({
  changes: z.array(z.object({
    id: z.string().optional(),
    initiativeId: z.string(),
    initiativeTitle: z.string().optional(),
    field: z.string().optional(),
    oldValue: z.any().optional(),
    newValue: z.any().optional(),
    changedBy: z.string().optional(),
    timestamp: z.string().optional(),
  }).passthrough()).min(1, 'At least one change is required'),
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
