import React, { useState, useMemo } from 'react';
import { 
  Workflow, 
  User, 
  AppConfig, 
  Initiative,
  WorkflowTrigger,
  WorkflowAction,
  WorkflowActionConfig,
  WorkflowCondition,
  WorkflowConditionConfig,
} from '../../types';
import { 
  Plus, 
  Play, 
  Edit, 
  Trash2, 
  Copy, 
  Zap,
  Lock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { generateId, getSystemRules, markSystemWorkflows, canViewTab, canManageWorkflows } from '../../utils';
import { workflowEngine } from '../../services/workflowEngine';
import WorkflowBuilder from './WorkflowBuilder';

interface WorkflowsViewProps {
  workflows: Workflow[];
  setWorkflows: (workflows: Workflow[] | ((prev: Workflow[]) => Workflow[])) => void;
  currentUser: User;
  initiatives: Initiative[];
  setInitiatives: (initiatives: Initiative[] | ((prev: Initiative[]) => Initiative[])) => void;
  recordChange: (initiative: Initiative, field: string, oldValue: any, newValue: any) => void;
  config: AppConfig;
  setConfig: (config: AppConfig | ((prev: AppConfig) => AppConfig)) => void;
}

export const WorkflowsView: React.FC<WorkflowsViewProps> = ({
  workflows,
  currentUser,
  initiatives,
  setInitiatives,
  recordChange,
  config,
  setConfig
}) => {
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Get permissions using helper functions
  const canView = canViewTab(config, currentUser.role, 'accessWorkflows');
  const canManage = canManageWorkflows(config, currentUser.role);
  // For workflows, if user can view, they can create (createWorkflows permission removed, replaced with view/edit/full)
  const canCreate = canView;

  // Get system rules and merge with workflows
  const systemRules = useMemo(() => getSystemRules(), []);
  const allRulesAndWorkflows = useMemo(() => {
    const markedWorkflows = markSystemWorkflows(workflows);
    return [...systemRules, ...markedWorkflows].sort((a, b) => {
      // System rules first, then custom workflows
      if (a.system && !b.system) return -1;
      if (!a.system && b.system) return 1;
      return 0;
    });
  }, [workflows, systemRules]);

  const filteredItems = useMemo(() => {
    let filtered = allRulesAndWorkflows.filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Apply sorting
    if (sortConfig) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: any, bVal: any;
        switch (sortConfig.key) {
          case 'name':
            aVal = a.name.toLowerCase();
            bVal = b.name.toLowerCase();
            break;
          case 'type':
            aVal = a.system ? 0 : 1;
            bVal = b.system ? 0 : 1;
            break;
          case 'trigger':
            aVal = getTriggerLabel(a.trigger);
            bVal = getTriggerLabel(b.trigger);
            break;
          case 'status':
            aVal = a.enabled ? 0 : 1;
            bVal = b.enabled ? 0 : 1;
            break;
          default:
            return 0;
        }
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [allRulesAndWorkflows, searchQuery, sortConfig]);

  const toggleRowExpansion = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const handleToggleWorkflow = (workflowId: string) => {
    if (!canManage) return;
    
    // Check if it's a system rule from getSystemRules (these are always enabled)
    const systemRule = systemRules.find(r => r.id === workflowId);
    if (systemRule) {
      // System rules from getSystemRules are always enabled and cannot be toggled
      alert('This system rule is always enabled and cannot be disabled.');
      return;
    }
    
    // For workflows in config (including system workflows from INITIAL_CONFIG)
    setConfig(prev => ({
      ...prev,
      workflows: (prev.workflows || []).map(w => 
        w.id === workflowId ? { ...w, enabled: !w.enabled } : w
      )
    }));
  };

  const handleDeleteWorkflow = (workflowId: string) => {
    if (!canManage) return;
    const item = allRulesAndWorkflows.find(w => w.id === workflowId);
    if (item?.readOnly) {
      alert('System rules cannot be deleted.');
      return;
    }
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    
    setConfig(prev => ({
      ...prev,
      workflows: (prev.workflows || []).filter(w => w.id !== workflowId)
    }));
  };

  const handleDuplicateWorkflow = (workflow: Workflow) => {
    if (workflow.readOnly) {
      alert('System rules cannot be duplicated.');
      return;
    }
    const duplicated: Workflow = {
      ...workflow,
      id: generateId(),
      name: `${workflow.name} (Copy)`,
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
      runCount: 0,
      executionLog: [],
      system: false,
      readOnly: false,
    };
    
    setConfig(prev => ({
      ...prev,
      workflows: [...(prev.workflows || []), duplicated]
    }));
  };

  const handleTestWorkflow = async (workflow: Workflow) => {
    try {
      // Create a copy of initiatives for workflow execution
      const initiativesCopy = initiatives.map(i => ({ ...i }));
      const log = await workflowEngine.executeWorkflow(
        workflow,
        initiativesCopy,
        recordChange
      );
      
      // Update initiatives if any were modified
      if (log.initiativesAffected.length > 0) {
        setInitiatives(initiativesCopy);
      }
      
      // Update workflow execution log (only for custom workflows)
      if (!workflow.system) {
        setConfig(prev => ({
          ...prev,
          workflows: (prev.workflows || []).map(w => 
            w.id === workflow.id 
              ? { 
                  ...w, 
                  lastRun: new Date().toISOString(),
                  runCount: w.runCount + 1,
                  executionLog: [...(w.executionLog || []), log].slice(-10) // Keep last 10
                }
              : w
          )
        }));
      }
      
      alert(`Workflow executed: ${log.initiativesAffected.length} initiatives affected`);
    } catch (error) {
      alert(`Error executing workflow: ${error}`);
    }
  };

  const handleEditWorkflow = (workflow: Workflow) => {
    if (workflow.readOnly) {
      alert('System rules cannot be edited.');
      return;
    }
    setEditingWorkflow(workflow);
    setIsBuilderOpen(true);
  };

  const handleSaveWorkflow = (workflow: Workflow) => {
    if (editingWorkflow) {
      // Update existing
      setConfig(prev => ({
        ...prev,
        workflows: (prev.workflows || []).map(w => 
          w.id === editingWorkflow.id ? workflow : w
        )
      }));
    } else {
      // Add new
      setConfig(prev => ({
        ...prev,
        workflows: [...(prev.workflows || []), workflow]
      }));
    }
    setIsBuilderOpen(false);
    setEditingWorkflow(null);
  };

  const getTriggerLabel = (trigger: WorkflowTrigger): string => {
    switch (trigger) {
      case WorkflowTrigger.OnSchedule: return 'Scheduled';
      case WorkflowTrigger.OnFieldChange: return 'Field Change';
      case WorkflowTrigger.OnStatusChange: return 'Status Change';
      case WorkflowTrigger.OnEtaChange: return 'ETA Change';
      case WorkflowTrigger.OnEffortChange: return 'Effort Change';
      case WorkflowTrigger.OnConditionMet: return 'Condition Met';
      case WorkflowTrigger.OnCreate: return 'On Create';
      default: return trigger;
    }
  };

  const getTriggerDisplay = (workflow: Workflow): string => {
    const baseLabel = getTriggerLabel(workflow.trigger);
    if (workflow.trigger === WorkflowTrigger.OnSchedule && workflow.triggerConfig?.schedule) {
      const schedule = workflow.triggerConfig.schedule;
      const time = workflow.triggerConfig.time || '';
      return `${schedule.charAt(0).toUpperCase() + schedule.slice(1)}${time ? ` at ${time}` : ''}`;
    }
    if (workflow.trigger === WorkflowTrigger.OnFieldChange && workflow.triggerConfig?.fields) {
      return `On ${workflow.triggerConfig.fields.join(', ')} change`;
    }
    return baseLabel;
  };

  const formatCondition = (condition?: WorkflowConditionConfig): string => {
    if (!condition) return 'None';
    
    const formatSingleCondition = (cond: WorkflowConditionConfig): string => {
      switch (cond.type) {
        case WorkflowCondition.DueDatePassed:
          return 'Due date passed';
        case WorkflowCondition.DueDateWithinDays:
          return `Due date within ${cond.days || 0} days`;
        case WorkflowCondition.LastUpdatedOlderThan:
          return `Last updated > ${cond.days || 0} days ago`;
        case WorkflowCondition.StatusEquals:
          return `Status = ${cond.value || ''}`;
        case WorkflowCondition.StatusNotEquals:
          return `Status ≠ ${cond.value || ''}`;
        case WorkflowCondition.ActualEffortGreaterThan:
          return `Actual effort > ${cond.value || 0}`;
        case WorkflowCondition.ActualEffortPercentageOfEstimated:
          return `Actual effort ≥ ${cond.percentage || 0}% of estimated`;
        case WorkflowCondition.EffortVarianceExceeds:
          return `Effort variance > ${cond.value || 0}`;
        case WorkflowCondition.PriorityEquals:
          return `Priority = ${cond.value || ''}`;
        case WorkflowCondition.RiskActionLogEmpty:
          return 'Risk action log is empty';
        case WorkflowCondition.OwnerEquals:
          return `Owner = ${cond.value || ''}`;
        case WorkflowCondition.AssetClassEquals:
          return `Asset class = ${cond.value || ''}`;
        case WorkflowCondition.And:
          if (cond.children && cond.children.length > 0) {
            return cond.children.map(formatSingleCondition).join(' AND ');
          }
          return 'All conditions';
        case WorkflowCondition.Or:
          if (cond.children && cond.children.length > 0) {
            return cond.children.map(formatSingleCondition).join(' OR ');
          }
          return 'Any condition';
        default:
          return cond.type;
      }
    };
    
    return formatSingleCondition(condition);
  };

  const formatAction = (action: WorkflowActionConfig): string => {
    switch (action.type) {
      case WorkflowAction.SetStatus:
        return `Set Status: ${action.value || ''}`;
      case WorkflowAction.TransitionStatus:
        return 'Transition Status';
      case WorkflowAction.SetPriority:
        return `Set Priority: ${action.value || ''}`;
      case WorkflowAction.SetAtRisk:
        return 'Mark At Risk';
      case WorkflowAction.NotifyOwner:
        return 'Notify Owner';
      case WorkflowAction.NotifySlackChannel:
        return `Notify Slack: ${action.channel || 'channel'}`;
      case WorkflowAction.CreateComment:
        return `Create Comment: ${action.message?.substring(0, 30) || ''}${action.message && action.message.length > 30 ? '...' : ''}`;
      case WorkflowAction.UpdateEta:
        return `Update ETA: ${action.value || ''}`;
      case WorkflowAction.UpdateEffort:
        return `Update Effort: ${action.value || ''}`;
      case WorkflowAction.ExecuteMultiple:
        return `Execute ${action.actions?.length || 0} actions`;
      default:
        return action.type;
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (!sortConfig || sortConfig.key !== column) {
      return <span className="text-slate-400">↕</span>;
    }
    return sortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl shadow-md">
              <Zap size={22} className="text-white" />
            </div>
            Workflows & Automations
          </h1>
          <p className="text-slate-500 mt-1 ml-12">Automate status transitions, notifications, and more</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              if (!canCreate) {
                alert('You do not have permission to create workflows. Please contact an administrator.');
                return;
              }
              setEditingWorkflow(null);
              setIsBuilderOpen(true);
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all font-semibold text-sm shadow-md hover:shadow-lg ${
              canCreate
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
            disabled={!canCreate}
            title={!canCreate ? 'You do not have permission to create workflows' : 'Create a new workflow'}
          >
            <Plus size={18} />
            Create Workflow
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="relative">
          <input
            type="text"
            placeholder="Search workflows and rules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all text-sm"
          />
          <Zap className="absolute left-4 top-3 text-slate-400" size={18} />
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-16 text-center">
          <div className="inline-flex p-4 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl mb-5">
            <Zap className="text-slate-400" size={48} />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">No workflows or rules found</h3>
          <p className="text-slate-500 mb-6">
            {searchQuery ? 'Try a different search term' : 'Create your first workflow to automate tasks'}
          </p>
          {canCreate && !searchQuery && (
            <button
              onClick={() => setIsBuilderOpen(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 font-semibold shadow-md hover:shadow-lg transition-all"
            >
              Create Workflow
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 tracking-wider w-8">
                    <button
                      onClick={() => handleSort('type')}
                      className="flex items-center gap-1 hover:text-slate-800"
                    >
                      <SortIcon column="type" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 tracking-wider">
                    <button
                      onClick={() => handleSort('name')}
                      className="flex items-center gap-1 hover:text-slate-800"
                    >
                      Name
                      <SortIcon column="name" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 tracking-wider">
                    <button
                      onClick={() => handleSort('trigger')}
                      className="flex items-center gap-1 hover:text-slate-800"
                    >
                      Trigger
                      <SortIcon column="trigger" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 tracking-wider">
                    Condition
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 tracking-wider">
                    Action
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 tracking-wider">
                    <button
                      onClick={() => handleSort('status')}
                      className="flex items-center gap-1 hover:text-slate-800"
                    >
                      Status
                      <SortIcon column="status" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredItems.map((item) => {
                  const isExpanded = expandedRows.has(item.id);
                  const isSystemRule = item.system || false;
                  const isReadOnly = item.readOnly || false;
                  
                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        className={`hover:bg-slate-50 transition-colors ${
                          isSystemRule ? 'bg-slate-50/50' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {isSystemRule && (
                              <span title="System Rule">
                                <Lock size={14} className="text-slate-400" />
                              </span>
                            )}
                            {item.description && (
                              <button
                                onClick={() => toggleRowExpansion(item.id)}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-800">{item.name}</span>
                              {isSystemRule && (
                                <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-200 text-slate-700 border border-slate-300">
                                  System Rule
                                </span>
                              )}
                              {!isSystemRule && (
                                <span className="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700 border border-blue-200">
                                  Custom Workflow
                                </span>
                              )}
                            </div>
                            {!isExpanded && item.description && (
                              <p className="text-sm text-slate-500 mt-1 line-clamp-1">{item.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-slate-700">{getTriggerDisplay(item)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-slate-700">{formatCondition(item.condition)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-slate-700">{formatAction(item.action)}</span>
                        </td>
                        <td className="px-4 py-3">
                          {systemRules.find(r => r.id === item.id) ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500">Always Enabled</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleToggleWorkflow(item.id)}
                              disabled={!canManage}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                item.enabled
                                  ? 'bg-emerald-500'
                                  : 'bg-slate-300'
                              } ${!canManage ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                              title={item.enabled ? 'Disable' : 'Enable'}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  item.enabled ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleTestWorkflow(item)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                              title="Test workflow"
                            >
                              <Play size={16} />
                            </button>
                            {canManage && (
                              <>
                                {!isReadOnly && (
                                  <>
                                    <button
                                      onClick={() => handleEditWorkflow(item)}
                                      className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-all"
                                      title="Edit workflow"
                                    >
                                      <Edit size={16} />
                                    </button>
                                    <button
                                      onClick={() => handleDuplicateWorkflow(item)}
                                      className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-all"
                                      title="Duplicate workflow"
                                    >
                                      <Copy size={16} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteWorkflow(item.id)}
                                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                      title="Delete workflow"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && item.description && (
                        <tr className="bg-slate-50/30">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="text-sm text-slate-600">
                              <p className="font-medium mb-1">Description:</p>
                              <p>{item.description}</p>
                              {item.lastRun && (
                                <div className="mt-2 flex gap-4 text-xs text-slate-500">
                                  <span>Last run: {new Date(item.lastRun).toLocaleString()}</span>
                                  <span>Run count: {item.runCount}</span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isBuilderOpen && (
        <WorkflowBuilder
          workflow={editingWorkflow}
          onSave={handleSaveWorkflow}
          onClose={() => {
            setIsBuilderOpen(false);
            setEditingWorkflow(null);
          }}
          currentUser={currentUser}
        />
      )}
    </div>
  );
};
