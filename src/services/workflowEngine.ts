import { 
  Workflow, 
  WorkflowConditionConfig, 
  WorkflowActionConfig, 
  Initiative, 
  Status, 
  WorkflowExecutionLog,
} from '../types';
import { generateId } from '../utils';

export class WorkflowEngine {
  /**
   * Execute a workflow against a set of initiatives
   */
  async executeWorkflow(
    workflow: Workflow,
    initiatives: Initiative[],
    recordChange: (initiative: Initiative, field: string, oldValue: any, newValue: any) => void
  ): Promise<WorkflowExecutionLog> {
    const log: WorkflowExecutionLog = {
      id: generateId(),
      workflowId: workflow.id,
      timestamp: new Date().toISOString(),
      initiativesAffected: [],
      actionsTaken: [],
      errors: [],
    };

    try {
      // 1. Filter initiatives by scope
      let scopedInitiatives = this.filterByScope(initiatives, workflow.scope);

      // 2. Evaluate conditions and filter
      if (workflow.condition) {
        scopedInitiatives = scopedInitiatives.filter(initiative => 
          this.evaluateCondition(workflow.condition!, initiative)
        );
      }

      // 3. Execute actions on matching initiatives
      for (const initiative of scopedInitiatives) {
        try {
          await this.executeAction(workflow.action, initiative, recordChange);
          log.initiativesAffected.push(initiative.id);
          log.actionsTaken.push(`Applied ${workflow.action.type} to "${initiative.title}"`);
        } catch (error) {
          log.errors?.push(`Error processing ${initiative.title}: ${error}`);
        }
      }
    } catch (error) {
      log.errors?.push(`Workflow execution error: ${error}`);
    }

    return log;
  }

  /**
   * Filter initiatives by workflow scope
   */
  private filterByScope(initiatives: Initiative[], scope?: Workflow['scope']): Initiative[] {
    if (!scope) return initiatives;

    return initiatives.filter(initiative => {
      if (scope.assetClasses && !scope.assetClasses.includes(initiative.l1_assetClass)) {
        return false;
      }
      if (scope.workTypes && !scope.workTypes.includes(initiative.workType)) {
        return false;
      }
      if (scope.owners && !scope.owners.includes(initiative.ownerId)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Recursively evaluate a condition against an initiative
   */
  evaluateCondition(condition: WorkflowConditionConfig, initiative: Initiative): boolean {
    const today = new Date().toISOString().split('T')[0];

    switch (condition.type) {
      case 'due_date_passed':
        return (initiative.eta ?? '') < today;

      case 'due_date_within_days':
        if (!condition.days) return false;
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + condition.days);
        const targetDateStr = targetDate.toISOString().split('T')[0];
        const eta = initiative.eta ?? '';
        return eta <= targetDateStr && eta >= today;

      case 'last_updated_older_than':
        if (!condition.days) return false;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - condition.days);
        return initiative.lastUpdated < cutoffDate.toISOString().split('T')[0];

      case 'status_equals':
        return initiative.status === condition.value;

      case 'status_not_equals':
        return initiative.status !== condition.value;

      case 'actual_effort_greater_than':
        return (initiative.actualEffort ?? 0) > (condition.value || 0);

      case 'actual_effort_percentage':
        if (!condition.percentage || (initiative.estimatedEffort ?? 0) === 0) return false;
        const percentage = ((initiative.actualEffort ?? 0) / (initiative.estimatedEffort ?? 1)) * 100;
        return percentage >= condition.percentage;

      case 'effort_variance_exceeds':
        if (!condition.value) return false;
        const variance = Math.abs((initiative.estimatedEffort ?? 0) - (initiative.actualEffort ?? 0));
        return variance > condition.value;

      case 'priority_equals':
        return initiative.priority === condition.value;

      case 'risk_action_log_empty':
        return !initiative.riskActionLog || initiative.riskActionLog.trim() === '';

      case 'owner_equals':
        return initiative.ownerId === condition.value;

      case 'asset_class_equals':
        return initiative.l1_assetClass === condition.value;

      case 'and':
        if (!condition.children || condition.children.length === 0) return true;
        return condition.children.every(child => this.evaluateCondition(child, initiative));

      case 'or':
        if (!condition.children || condition.children.length === 0) return false;
        return condition.children.some(child => this.evaluateCondition(child, initiative));

      default:
        return false;
    }
  }

  /**
   * Execute an action on an initiative
   */
  private async executeAction(
    action: WorkflowActionConfig,
    initiative: Initiative,
    recordChange: (initiative: Initiative, field: string, oldValue: any, newValue: any) => void
  ): Promise<void> {
    if (action.type === 'execute_multiple' && action.actions) {
      for (const subAction of action.actions) {
        await this.executeAction(subAction, initiative, recordChange);
      }
      return;
    }

    switch (action.type) {
      case 'set_status':
        if (action.value && initiative.status !== action.value) {
          recordChange(initiative, 'Status', initiative.status, action.value);
          initiative.status = action.value as Status;
        }
        break;

      case 'transition_status':
        // Transition logic: Not Started -> In Progress -> At Risk -> Done
        const transitions: Record<Status, Status> = {
          [Status.NotStarted]: Status.InProgress,
          [Status.InProgress]: Status.AtRisk,
          [Status.AtRisk]: Status.Done,
          [Status.Done]: Status.Done,
          [Status.Obsolete]: Status.Obsolete,
        };
        const newStatus = transitions[initiative.status];
        if (newStatus && newStatus !== initiative.status) {
          recordChange(initiative, 'Status', initiative.status, newStatus);
          initiative.status = newStatus;
        }
        break;

      case 'set_priority':
        if (action.value && initiative.priority !== action.value) {
          recordChange(initiative, 'Priority', initiative.priority, action.value);
          initiative.priority = action.value;
        }
        break;

      case 'require_risk_action_log':
        // This would typically trigger a UI notification or validation
        // For now, we'll set status to At Risk if log is empty
        if (!initiative.riskActionLog || initiative.riskActionLog.trim() === '') {
          if (initiative.status !== Status.AtRisk) {
            recordChange(initiative, 'Status', initiative.status, Status.AtRisk);
            initiative.status = Status.AtRisk;
          }
        }
        break;

      case 'notify_owner':
        // Notification would be handled by Slack service or other notification system
        // This is a placeholder - actual implementation would call notification service
        console.log(`[Workflow] Notify owner for initiative: ${initiative.title}`);
        break;

      case 'notify_slack':
        // Would integrate with Slack service
        console.log(`[Workflow] Notify Slack channel ${action.channel} for initiative: ${initiative.title}`);
        break;

      case 'create_comment':
        if (action.message) {
          if (!initiative.comments) {
            initiative.comments = [];
          }
          initiative.comments.push({
            id: generateId(),
            text: `[Automated] ${action.message}`,
            authorId: 'system',
            timestamp: new Date().toISOString(),
          });
        }
        break;

      case 'update_eta':
        if (action.value && initiative.eta !== action.value) {
          recordChange(initiative, 'ETA', initiative.eta ?? '', action.value);
          initiative.eta = action.value;
        }
        break;

      case 'update_effort':
        if (action.value !== undefined && initiative.estimatedEffort !== action.value) {
          recordChange(initiative, 'Effort', initiative.estimatedEffort, action.value);
          initiative.estimatedEffort = action.value;
        }
        break;
    }
  }
}

export const workflowEngine = new WorkflowEngine();

