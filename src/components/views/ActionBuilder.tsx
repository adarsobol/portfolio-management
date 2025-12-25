import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  WorkflowAction,
  WorkflowActionConfig,
  Status,
  Priority,
} from '../../types';

interface ActionBuilderProps {
  action: WorkflowActionConfig;
  onChange: (action: WorkflowActionConfig) => void;
}

const ActionBuilder: React.FC<ActionBuilderProps> = ({ action, onChange }) => {
  const handleTypeChange = (type: WorkflowAction) => {
    const baseAction: WorkflowActionConfig = { type };
    
    // Set default values based on action type
    if (type === WorkflowAction.SetStatus) {
      baseAction.value = Status.InProgress;
    } else if (type === WorkflowAction.SetPriority) {
      baseAction.value = Priority.P1;
    } else if (type === WorkflowAction.NotifySlackChannel) {
      baseAction.channel = '#portfolio-updates';
      baseAction.message = 'Workflow triggered';
    } else if (type === WorkflowAction.CreateComment) {
      baseAction.message = 'Automated comment';
    } else if (type === WorkflowAction.ExecuteMultiple) {
      baseAction.actions = [];
    }
    
    onChange(baseAction);
  };

  const addSubAction = () => {
    if (!action.actions) {
      onChange({ ...action, actions: [] });
    }
    const newAction: WorkflowActionConfig = {
      type: WorkflowAction.SetStatus,
      value: Status.InProgress,
    };
    onChange({
      ...action,
      actions: [...(action.actions || []), newAction],
    });
  };

  const updateSubAction = (index: number, subAction: WorkflowActionConfig) => {
    const actions = [...(action.actions || [])];
    actions[index] = subAction;
    onChange({ ...action, actions });
  };

  const removeSubAction = (index: number) => {
    const actions = action.actions?.filter((_, i) => i !== index) || [];
    onChange({ ...action, actions });
  };

  if (action.type === WorkflowAction.ExecuteMultiple) {
    return (
      <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-3">
          <span className="font-medium text-gray-700">Execute Multiple Actions</span>
        </div>
        <div className="space-y-2 ml-4">
          {action.actions?.map((subAction, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1">
                <ActionBuilder
                  action={subAction}
                  onChange={(updated) => updateSubAction(index, updated)}
                />
              </div>
              <button
                onClick={() => removeSubAction(index)}
                className="p-1 text-red-600 hover:bg-red-50 rounded"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            onClick={addSubAction}
            className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Plus size={16} />
            Add Action
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <select
        value={action.type}
        onChange={(e) => handleTypeChange(e.target.value as WorkflowAction)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        <optgroup label="Status Actions">
          <option value={WorkflowAction.SetStatus}>Set Status</option>
          <option value={WorkflowAction.TransitionStatus}>Transition Status</option>
        </optgroup>
        <optgroup label="Priority Actions">
          <option value={WorkflowAction.SetPriority}>Set Priority</option>
        </optgroup>
        <optgroup label="Risk Actions">
          <option value={WorkflowAction.SetAtRisk}>Set At Risk</option>
          <option value={WorkflowAction.RequireRiskActionLog}>Require Risk Action Log</option>
        </optgroup>
        <optgroup label="Notification Actions">
          <option value={WorkflowAction.NotifyOwner}>Notify Owner</option>
          <option value={WorkflowAction.NotifySlackChannel}>Notify Slack Channel</option>
          <option value={WorkflowAction.CreateComment}>Create Comment</option>
        </optgroup>
        <optgroup label="Field Updates">
          <option value={WorkflowAction.UpdateEta}>Update ETA</option>
          <option value={WorkflowAction.UpdateEffort}>Update Effort</option>
        </optgroup>
        <optgroup label="Multiple">
          <option value={WorkflowAction.ExecuteMultiple}>Execute Multiple Actions</option>
        </optgroup>
      </select>

      {action.type === WorkflowAction.SetStatus && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={action.value as Status}
            onChange={(e) =>
              onChange({ ...action, value: e.target.value as Status })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {Object.values(Status).filter(s => s !== Status.Deleted).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      )}

      {action.type === WorkflowAction.SetPriority && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
          <select
            value={action.value as Priority}
            onChange={(e) =>
              onChange({ ...action, value: e.target.value as Priority })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {Object.values(Priority).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}

      {action.type === WorkflowAction.NotifySlackChannel && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Channel</label>
            <input
              type="text"
              value={action.channel || ''}
              onChange={(e) => onChange({ ...action, channel: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="#portfolio-updates"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea
              value={action.message || ''}
              onChange={(e) => onChange({ ...action, message: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={2}
              placeholder="Notification message..."
            />
          </div>
        </div>
      )}

      {action.type === WorkflowAction.CreateComment && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Comment Message</label>
          <textarea
            value={action.message || ''}
            onChange={(e) => onChange({ ...action, message: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={3}
            placeholder="Comment text..."
          />
        </div>
      )}

      {action.type === WorkflowAction.UpdateEta && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New ETA (YYYY-MM-DD)</label>
          <input
            type="date"
            value={action.value || ''}
            onChange={(e) => onChange({ ...action, value: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      )}

      {action.type === WorkflowAction.UpdateEffort && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New Effort (weeks)</label>
          <input
            type="number"
            value={action.value || 0}
            onChange={(e) =>
              onChange({ ...action, value: parseFloat(e.target.value) || 0 })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            min="0"
            step="0.1"
          />
        </div>
      )}

      {action.type === WorkflowAction.NotifyOwner && action.message !== undefined && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message (Optional)</label>
          <textarea
            value={action.message || ''}
            onChange={(e) => onChange({ ...action, message: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={2}
            placeholder="Notification message..."
          />
        </div>
      )}
    </div>
  );
};

export default ActionBuilder;

