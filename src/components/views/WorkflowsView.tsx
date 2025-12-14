import React, { useState } from 'react';
import { 
  Workflow, 
  User, 
  AppConfig, 
  Initiative,
  WorkflowTrigger,
  WorkflowAction,
  Role,
} from '../../types';
import { 
  Plus, 
  Play, 
  Pause, 
  Edit, 
  Trash2, 
  Copy, 
  CheckCircle2,
  Zap
} from 'lucide-react';
import { generateId } from '../../utils';
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

  // Get permissions with fallback to INITIAL_CONFIG if missing
  const rolePerms = config.rolePermissions[currentUser.role] || {};
  const canCreate = rolePerms.createWorkflows ?? (currentUser.role === Role.Admin || currentUser.role === Role.SVP || currentUser.role === Role.VP || currentUser.role === Role.DirectorDepartment || currentUser.role === Role.DirectorGroup || currentUser.role === Role.PortfolioOps || currentUser.role === Role.TeamLead);
  const canManage = rolePerms.manageWorkflows ?? (currentUser.role === Role.Admin || currentUser.role === Role.SVP || currentUser.role === Role.VP || currentUser.role === Role.DirectorDepartment || currentUser.role === Role.PortfolioOps);

  const filteredWorkflows = workflows.filter(w => 
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleWorkflow = (workflowId: string) => {
    if (!canManage) return;
    
    setConfig(prev => ({
      ...prev,
      workflows: (prev.workflows || []).map(w => 
        w.id === workflowId ? { ...w, enabled: !w.enabled } : w
      )
    }));
  };

  const handleDeleteWorkflow = (workflowId: string) => {
    if (!canManage) return;
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    
    setConfig(prev => ({
      ...prev,
      workflows: (prev.workflows || []).filter(w => w.id !== workflowId)
    }));
  };

  const handleDuplicateWorkflow = (workflow: Workflow) => {
    const duplicated: Workflow = {
      ...workflow,
      id: generateId(),
      name: `${workflow.name} (Copy)`,
      createdBy: currentUser.id,
      createdAt: new Date().toISOString(),
      runCount: 0,
      executionLog: [],
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
      
      // Update workflow execution log
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
      
      alert(`Workflow executed: ${log.initiativesAffected.length} initiatives affected`);
    } catch (error) {
      alert(`Error executing workflow: ${error}`);
    }
  };

  const handleEditWorkflow = (workflow: Workflow) => {
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
      default: return trigger;
    }
  };

  const getTriggerColor = (trigger: WorkflowTrigger): string => {
    switch (trigger) {
      case WorkflowTrigger.OnSchedule: return 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 border border-blue-200';
      case WorkflowTrigger.OnFieldChange: return 'bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-700 border border-emerald-200';
      case WorkflowTrigger.OnStatusChange: return 'bg-gradient-to-r from-purple-50 to-purple-100 text-purple-700 border border-purple-200';
      case WorkflowTrigger.OnEtaChange: return 'bg-gradient-to-r from-amber-50 to-amber-100 text-amber-700 border border-amber-200';
      case WorkflowTrigger.OnEffortChange: return 'bg-gradient-to-r from-cyan-50 to-cyan-100 text-cyan-700 border border-cyan-200';
      default: return 'bg-slate-100 text-slate-700 border border-slate-200';
    }
  };

  const getActionLabel = (action: WorkflowAction): string => {
    switch (action) {
      case WorkflowAction.SetStatus: return 'Set Status';
      case WorkflowAction.SetPriority: return 'Set Priority';
      case WorkflowAction.SetAtRisk: return 'Mark At Risk';
      case WorkflowAction.NotifyOwner: return 'Notify Owner';
      case WorkflowAction.NotifySlackChannel: return 'Notify Slack';
      case WorkflowAction.CreateComment: return 'Create Comment';
      case WorkflowAction.ExecuteMultiple: return 'Multiple Actions';
      default: return action;
    }
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
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all text-sm"
          />
          <Zap className="absolute left-4 top-3 text-slate-400" size={18} />
        </div>
      </div>

      {filteredWorkflows.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-16 text-center">
          <div className="inline-flex p-4 bg-gradient-to-br from-slate-100 to-slate-200 rounded-2xl mb-5">
            <Zap className="text-slate-400" size={48} />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">No workflows found</h3>
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
        <div className="grid gap-5">
          {filteredWorkflows.map(workflow => (
            <div
              key={workflow.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-all hover:border-slate-300"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="text-lg font-bold text-slate-800">{workflow.name}</h3>
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-lg ${getTriggerColor(workflow.trigger)}`}>
                      {getTriggerLabel(workflow.trigger)}
                    </span>
                    {workflow.enabled ? (
                      <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gradient-to-r from-emerald-50 to-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                        <CheckCircle2 size={12} />
                        Enabled
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1.5">
                        <Pause size={12} />
                        Disabled
                      </span>
                    )}
                  </div>
                  
                  {workflow.description && (
                    <p className="text-slate-500 text-sm mb-4">{workflow.description}</p>
                  )}

                  <div className="grid grid-cols-2 gap-4 mt-4 text-sm bg-slate-50 rounded-lg p-4">
                    <div>
                      <span className="text-slate-500 text-xs uppercase tracking-wider font-medium">Action</span>
                      <p className="font-semibold text-slate-700 mt-0.5">{getActionLabel(workflow.action.type)}</p>
                    </div>
                    <div>
                      <span className="text-slate-500 text-xs uppercase tracking-wider font-medium">Runs</span>
                      <p className="font-semibold text-slate-700 mt-0.5">{workflow.runCount}</p>
                    </div>
                    {workflow.lastRun && (
                      <div>
                        <span className="text-slate-500 text-xs uppercase tracking-wider font-medium">Last run</span>
                        <p className="font-semibold text-slate-700 mt-0.5">
                          {new Date(workflow.lastRun).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                    {workflow.triggerConfig?.schedule && (
                      <div>
                        <span className="text-slate-500 text-xs uppercase tracking-wider font-medium">Schedule</span>
                        <p className="font-semibold text-slate-700 mt-0.5 capitalize">
                          {workflow.triggerConfig.schedule}
                          {workflow.triggerConfig.time && ` at ${workflow.triggerConfig.time}`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 ml-4">
                  <button
                    onClick={() => handleTestWorkflow(workflow)}
                    className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-xl transition-all hover:shadow-sm"
                    title="Test workflow"
                  >
                    <Play size={18} />
                  </button>
                  {canManage && (
                    <>
                      <button
                        onClick={() => handleToggleWorkflow(workflow.id)}
                        className={`p-2.5 rounded-xl transition-all hover:shadow-sm ${
                          workflow.enabled
                            ? 'text-amber-600 hover:bg-amber-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={workflow.enabled ? 'Disable' : 'Enable'}
                      >
                        {workflow.enabled ? <Pause size={18} /> : <Play size={18} />}
                      </button>
                      <button
                        onClick={() => handleEditWorkflow(workflow)}
                        className="p-2.5 text-slate-500 hover:bg-slate-100 rounded-xl transition-all hover:shadow-sm"
                        title="Edit workflow"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => handleDuplicateWorkflow(workflow)}
                        className="p-2.5 text-slate-500 hover:bg-slate-100 rounded-xl transition-all hover:shadow-sm"
                        title="Duplicate workflow"
                      >
                        <Copy size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteWorkflow(workflow.id)}
                        className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-all hover:shadow-sm"
                        title="Delete workflow"
                      >
                        <Trash2 size={18} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
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
