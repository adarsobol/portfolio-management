import { Workflow, WorkflowTrigger, WorkflowCondition, WorkflowAction, Status } from '../types';
import { generateId } from './index';

/**
 * Extract and format system automation rules
 * These are hardcoded automation rules that exist in the codebase.
 * Note: The hardcoded rule for effort-based status transition has been replaced
 * by the "Effort-Based Status Transition" workflow in INITIAL_CONFIG, so we
 * don't need to extract it separately here.
 */
export function getSystemRules(): Workflow[] {
  // Currently no additional system rules beyond those in INITIAL_CONFIG
  // This function exists for future hardcoded rules that need to be extracted
  return [];
}

/**
 * Mark workflows from INITIAL_CONFIG as system rules
 */
export function markSystemWorkflows(workflows: Workflow[]): Workflow[] {
  return workflows.map(w => ({
    ...w,
    system: w.createdBy === 'system' || w.system === true,
    readOnly: w.createdBy === 'system' || w.readOnly === true,
  }));
}

