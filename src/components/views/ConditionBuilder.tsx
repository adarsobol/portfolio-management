import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  WorkflowCondition,
  WorkflowConditionConfig,
  Status,
  Priority,
  AssetClass,
} from '../../types';

interface ConditionBuilderProps {
  condition: WorkflowConditionConfig;
  onChange: (condition: WorkflowConditionConfig) => void;
}

const ConditionBuilder: React.FC<ConditionBuilderProps> = ({ condition, onChange }) => {
  const handleTypeChange = (type: WorkflowCondition) => {
    const baseCondition: WorkflowConditionConfig = { type };
    
    // Set default values based on condition type
    if (type === WorkflowCondition.DueDateWithinDays) {
      baseCondition.days = 7;
    } else if (type === WorkflowCondition.LastUpdatedOlderThan) {
      baseCondition.days = 14;
    } else if (type === WorkflowCondition.ActualEffortPercentageOfEstimated) {
      baseCondition.percentage = 100;
    } else if (type === WorkflowCondition.StatusEquals || type === WorkflowCondition.StatusNotEquals) {
      baseCondition.value = Status.NotStarted;
    } else if (type === WorkflowCondition.PriorityEquals) {
      baseCondition.value = Priority.P0;
    } else if (type === WorkflowCondition.And || type === WorkflowCondition.Or) {
      baseCondition.children = [];
    }
    
    onChange(baseCondition);
  };

  const addChildCondition = () => {
    if (!condition.children) {
      onChange({ ...condition, children: [] });
    }
    const newChild: WorkflowConditionConfig = {
      type: WorkflowCondition.DueDatePassed,
    };
    onChange({
      ...condition,
      children: [...(condition.children || []), newChild],
    });
  };

  const updateChildCondition = (index: number, child: WorkflowConditionConfig) => {
    const children = [...(condition.children || [])];
    children[index] = child;
    onChange({ ...condition, children });
  };

  const removeChildCondition = (index: number) => {
    const children = condition.children?.filter((_, i) => i !== index) || [];
    onChange({ ...condition, children });
  };

  if (condition.type === WorkflowCondition.And || condition.type === WorkflowCondition.Or) {
    return (
      <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center gap-3">
          <select
            value={condition.type}
            onChange={(e) => handleTypeChange(e.target.value as WorkflowCondition)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
          >
            <option value={WorkflowCondition.And}>AND</option>
            <option value={WorkflowCondition.Or}>OR</option>
          </select>
        </div>
        <div className="space-y-2 ml-4">
          {condition.children?.map((child, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1">
                <ConditionBuilder
                  condition={child}
                  onChange={(updated) => updateChildCondition(index, updated)}
                />
              </div>
              <button
                onClick={() => removeChildCondition(index)}
                className="p-1 text-red-600 hover:bg-red-50 rounded"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            onClick={addChildCondition}
            className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <Plus size={16} />
            Add Condition
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <select
        value={condition.type}
        onChange={(e) => handleTypeChange(e.target.value as WorkflowCondition)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        <optgroup label="Date Conditions">
          <option value={WorkflowCondition.DueDatePassed}>Due Date Has Passed</option>
          <option value={WorkflowCondition.DueDateWithinDays}>Due Date Within Days</option>
          <option value={WorkflowCondition.LastUpdatedOlderThan}>Last Updated Older Than</option>
        </optgroup>
        <optgroup label="Status Conditions">
          <option value={WorkflowCondition.StatusEquals}>Status Equals</option>
          <option value={WorkflowCondition.StatusNotEquals}>Status Not Equals</option>
        </optgroup>
        <optgroup label="Effort Conditions">
          <option value={WorkflowCondition.ActualEffortGreaterThan}>Actual Effort Greater Than</option>
          <option value={WorkflowCondition.ActualEffortPercentageOfEstimated}>
            Actual Effort % of Estimated
          </option>
          <option value={WorkflowCondition.EffortVarianceExceeds}>Effort Variance Exceeds</option>
        </optgroup>
        <optgroup label="Other Conditions">
          <option value={WorkflowCondition.PriorityEquals}>Priority Equals</option>
          <option value={WorkflowCondition.IsAtRisk}>Is At Risk</option>
          <option value={WorkflowCondition.RiskActionLogEmpty}>Risk Action Log Empty</option>
          <option value={WorkflowCondition.OwnerEquals}>Owner Equals</option>
          <option value={WorkflowCondition.AssetClassEquals}>Asset Class Equals</option>
        </optgroup>
        <optgroup label="Logic Operators">
          <option value={WorkflowCondition.And}>AND (All conditions)</option>
          <option value={WorkflowCondition.Or}>OR (Any condition)</option>
        </optgroup>
      </select>

      {condition.type === WorkflowCondition.DueDateWithinDays && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Days</label>
          <input
            type="number"
            value={condition.days || 7}
            onChange={(e) =>
              onChange({ ...condition, days: parseInt(e.target.value) || 0 })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            min="1"
          />
        </div>
      )}

      {condition.type === WorkflowCondition.LastUpdatedOlderThan && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Days</label>
          <input
            type="number"
            value={condition.days || 14}
            onChange={(e) =>
              onChange({ ...condition, days: parseInt(e.target.value) || 0 })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            min="1"
          />
        </div>
      )}

      {condition.type === WorkflowCondition.StatusEquals ||
        condition.type === WorkflowCondition.StatusNotEquals ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={condition.value as Status}
            onChange={(e) =>
              onChange({ ...condition, value: e.target.value as Status })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {Object.values(Status).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {condition.type === WorkflowCondition.PriorityEquals && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
          <select
            value={condition.value as Priority}
            onChange={(e) =>
              onChange({ ...condition, value: e.target.value as Priority })
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

      {condition.type === WorkflowCondition.ActualEffortGreaterThan && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Effort (weeks)</label>
          <input
            type="number"
            value={condition.value || 0}
            onChange={(e) =>
              onChange({ ...condition, value: parseFloat(e.target.value) || 0 })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            min="0"
            step="0.1"
          />
        </div>
      )}

      {condition.type === WorkflowCondition.ActualEffortPercentageOfEstimated && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Percentage</label>
          <input
            type="number"
            value={condition.percentage || 100}
            onChange={(e) =>
              onChange({ ...condition, percentage: parseFloat(e.target.value) || 0 })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            min="0"
            max="1000"
          />
        </div>
      )}

      {condition.type === WorkflowCondition.EffortVarianceExceeds && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Variance (weeks)</label>
          <input
            type="number"
            value={condition.value || 0}
            onChange={(e) =>
              onChange({ ...condition, value: parseFloat(e.target.value) || 0 })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            min="0"
            step="0.1"
          />
        </div>
      )}

      {condition.type === WorkflowCondition.OwnerEquals && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Owner ID</label>
          <input
            type="text"
            value={condition.value || ''}
            onChange={(e) => onChange({ ...condition, value: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., u_ah"
          />
        </div>
      )}

      {condition.type === WorkflowCondition.AssetClassEquals && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Asset Class</label>
          <select
            value={condition.value as AssetClass}
            onChange={(e) =>
              onChange({ ...condition, value: e.target.value as AssetClass })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {Object.values(AssetClass).map((ac) => (
              <option key={ac} value={ac}>
                {ac}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

export default ConditionBuilder;

