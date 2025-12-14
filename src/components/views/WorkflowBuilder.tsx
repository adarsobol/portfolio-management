import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import {
  Workflow,
  WorkflowTrigger,
  WorkflowCondition,
  WorkflowAction,
  WorkflowConditionConfig,
  WorkflowActionConfig,
  Status,
  AssetClass,
  WorkType,
  User,
} from '../../types';
import { generateId } from '../../utils';
import ConditionBuilder from './ConditionBuilder';
import ActionBuilder from './ActionBuilder';

interface WorkflowBuilderProps {
  workflow: Workflow | null;
  onSave: (workflow: Workflow) => void;
  onClose: () => void;
  currentUser: User;
}

const WorkflowBuilder: React.FC<WorkflowBuilderProps> = ({
  workflow,
  onSave,
  onClose,
  currentUser,
}) => {
  const [name, setName] = useState(workflow?.name || '');
  const [description, setDescription] = useState(workflow?.description || '');
  const [enabled, setEnabled] = useState(workflow?.enabled ?? true);
  const [trigger, setTrigger] = useState<WorkflowTrigger>(
    workflow?.trigger || WorkflowTrigger.OnSchedule
  );
  const [triggerConfig, setTriggerConfig] = useState<Workflow['triggerConfig']>(
    workflow?.triggerConfig || { schedule: 'daily', time: '09:00' }
  );
  const [condition, setCondition] = useState<WorkflowConditionConfig | undefined>(
    workflow?.condition
  );
  const [action, setAction] = useState<WorkflowActionConfig>(
    workflow?.action || { type: WorkflowAction.SetStatus, value: Status.InProgress }
  );
  const [scope, setScope] = useState<Workflow['scope']>(workflow?.scope);

  const handleSave = () => {
    if (!name.trim()) {
      alert('Please enter a workflow name');
      return;
    }

    const newWorkflow: Workflow = {
      id: workflow?.id || generateId(),
      name: name.trim(),
      description: description.trim() || undefined,
      enabled,
      trigger,
      triggerConfig: trigger === WorkflowTrigger.OnSchedule ? triggerConfig : undefined,
      condition,
      action,
      scope,
      createdBy: workflow?.createdBy || currentUser.id,
      createdAt: workflow?.createdAt || new Date().toISOString(),
      runCount: workflow?.runCount || 0,
      executionLog: workflow?.executionLog || [],
    };

    onSave(newWorkflow);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">
            {workflow ? 'Edit Workflow' : 'Create Workflow'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Workflow Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Auto-Delay Detection"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={2}
                placeholder="Describe what this workflow does..."
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enabled"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
              <label htmlFor="enabled" className="text-sm font-medium text-gray-700">
                Enable this workflow
              </label>
            </div>
          </div>

          {/* Trigger Section */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">WHEN</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Trigger Type
                </label>
                <select
                  value={trigger}
                  onChange={(e) => {
                    setTrigger(e.target.value as WorkflowTrigger);
                    if (e.target.value === WorkflowTrigger.OnSchedule) {
                      setTriggerConfig({ schedule: 'daily', time: '09:00' });
                    } else {
                      setTriggerConfig(undefined);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value={WorkflowTrigger.OnSchedule}>On Schedule</option>
                  <option value={WorkflowTrigger.OnFieldChange}>On Field Change</option>
                  <option value={WorkflowTrigger.OnStatusChange}>On Status Change</option>
                  <option value={WorkflowTrigger.OnEtaChange}>On ETA Change</option>
                  <option value={WorkflowTrigger.OnEffortChange}>On Effort Change</option>
                  <option value={WorkflowTrigger.OnConditionMet}>On Condition Met</option>
                </select>
              </div>

              {trigger === WorkflowTrigger.OnSchedule && triggerConfig && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Schedule
                    </label>
                    <select
                      value={triggerConfig.schedule}
                      onChange={(e) =>
                        setTriggerConfig({
                          ...triggerConfig,
                          schedule: e.target.value as 'daily' | 'weekly' | 'hourly',
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="hourly">Hourly</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Time
                    </label>
                    <input
                      type="time"
                      value={triggerConfig.time}
                      onChange={(e) =>
                        setTriggerConfig({ ...triggerConfig, time: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              {trigger === WorkflowTrigger.OnFieldChange && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Watch Fields
                  </label>
                  <select
                    multiple
                    value={triggerConfig?.fields || []}
                    onChange={(e) => {
                      const fields = Array.from(e.target.selectedOptions, (o) => o.value);
                      setTriggerConfig({ fields });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="status">Status</option>
                    <option value="eta">ETA</option>
                    <option value="actualEffort">Actual Effort</option>
                    <option value="estimatedEffort">Estimated Effort</option>
                    <option value="priority">Priority</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Hold Ctrl/Cmd to select multiple fields
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Condition Section */}
          <div className="border-t border-gray-200 pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">IF (Optional)</h3>
              {condition && (
                <button
                  onClick={() => setCondition(undefined)}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Remove Condition
                </button>
              )}
            </div>
            {condition ? (
              <ConditionBuilder
                condition={condition}
                onChange={setCondition}
              />
            ) : (
              <button
                onClick={() =>
                  setCondition({
                    type: WorkflowCondition.DueDatePassed,
                  })
                }
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Plus size={18} />
                Add Condition
              </button>
            )}
          </div>

          {/* Action Section */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">THEN</h3>
            <ActionBuilder action={action} onChange={setAction} />
          </div>

          {/* Scope Section */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">SCOPE (Optional)</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Asset Classes
                </label>
                <div className="flex flex-wrap gap-2">
                  {Object.values(AssetClass).map((ac) => (
                    <label key={ac} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={scope?.assetClasses?.includes(ac) || false}
                        onChange={(e) => {
                          const current = scope?.assetClasses || [];
                          setScope({
                            ...scope,
                            assetClasses: e.target.checked
                              ? [...current, ac]
                              : current.filter((a) => a !== ac),
                          });
                        }}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm">{ac}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Work Types
                </label>
                <div className="flex flex-wrap gap-2">
                  {Object.values(WorkType).map((wt) => (
                    <label key={wt} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={scope?.workTypes?.includes(wt) || false}
                        onChange={(e) => {
                          const current = scope?.workTypes || [];
                          setScope({
                            ...scope,
                            workTypes: e.target.checked
                              ? [...current, wt]
                              : current.filter((w) => w !== wt),
                          });
                        }}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <span className="text-sm">{wt}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Save Workflow
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkflowBuilder;

