import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Initiative, User, Role, Status, Priority, WorkType, UnplannedTag, AssetClass, PermissionKey, PermissionValue, TradeOffAction, Dependency, DependencyTeam, InitiativeType, Task, AppConfig
} from '../../types';
import { HIERARCHY, QUARTERS, DEPENDENCY_TEAM_CATEGORIES, getAssetClassFromTeam } from '../../constants';
import { 
  X, MessageSquare, FileText, Send, Share2, Copy, Check, Scale, History, AlertTriangle,
  ChevronDown, ChevronRight, Plus, MoreVertical, Users, Layers, Trash2, ArrowUp, ArrowDown
} from 'lucide-react';
import { getOwnerName, generateId, generateInitiativeId, parseMentions, getMentionedUsers, canCreateTasks, canEditAllTasks, canEditOwnTasks } from '../../utils';
import { slackService } from '../../services';

// ============================================================================
// ACCORDION SECTION COMPONENT
// ============================================================================
interface AccordionSectionProps {
  title: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: React.ReactNode;
  accentColor?: string;
}

const AccordionSection: React.FC<AccordionSectionProps> = ({
  title, icon, isExpanded, onToggle, children, badge, accentColor = 'blue'
}) => {
  const gradientMap: Record<string, string> = {
    blue: 'from-blue-500 to-blue-600',
    indigo: 'from-indigo-500 to-purple-500',
    cyan: 'from-cyan-500 to-cyan-600',
    amber: 'from-amber-500 to-amber-600'
  };

  return (
    <div className={`border rounded-xl overflow-hidden transition-all duration-300 ${
      isExpanded ? 'border-slate-300 shadow-md' : 'border-slate-200'
    }`}>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-3.5 text-left transition-all cursor-pointer ${
          isExpanded 
            ? 'bg-gradient-to-r from-slate-50 to-white' 
            : 'bg-white hover:bg-slate-50'
        }`}
      >
        <div className="flex items-center gap-3 pointer-events-none">
          <div className={`w-1 h-5 rounded-full bg-gradient-to-b ${gradientMap[accentColor]}`} />
          <span className="text-slate-500">{icon}</span>
          <span className="font-semibold text-slate-800">{title}</span>
          {badge}
        </div>
        <div className={`transform transition-transform duration-200 pointer-events-none ${isExpanded ? 'rotate-180' : ''}`}>
          <ChevronDown size={18} className="text-slate-400" />
        </div>
      </button>
      <div className={`transition-all duration-300 ease-in-out ${
        isExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
      }`}>
        <div className="p-4 pt-2 border-t border-slate-100 bg-white">
          {children}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// BULK ENTRY ROW TYPE
// ============================================================================
interface BulkEntryRow {
  id: string;
  title: string;
  ownerId: string;
  priority: Priority;
  status: Status;
  eta: string;
  estimatedEffort: number;
  // Expandable fields
  l2_pillar: string;
  l3_responsibility: string;
  l4_target: string;
  secondaryOwner: string;
  isExpanded: boolean;
  // Trade-off fields
  hasTradeOff: boolean;
  tradeOffTargetId: string;
  tradeOffField: 'eta' | 'status' | 'priority';
  tradeOffValue: string;
}

// ============================================================================
// MAIN MODAL PROPS
// ============================================================================
interface InitiativeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (initiative: Initiative, tradeOff?: TradeOffAction) => void;
  currentUser: User;
  initiativeToEdit?: Initiative | null;
  rolePermissions: Record<Role, Record<PermissionKey, PermissionValue>>;
  config: AppConfig;
  users: User[];
  allInitiatives: Initiative[];
  onDelete?: (id: string) => void;
}

const InitiativeModal: React.FC<InitiativeModalProps> = ({
  isOpen, onClose, onSave, currentUser, initiativeToEdit, rolePermissions, config, users, allInitiatives, onDelete
}) => {
  const isEditMode = !!initiativeToEdit;
  const permissions = rolePermissions[currentUser.role];

  // ============================================================================
  // STATE
  // ============================================================================
  
  // Mode Toggle: 'single' or 'bulk'
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  
  // Single Mode Form State
  const [formData, setFormData] = useState<Partial<Initiative>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'history'>('details');
  const [newComment, setNewComment] = useState('');
  
  // Mention autocomplete state
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  
  // Track if asset class was manually changed (to prevent auto-override)
  const assetClassManuallySetRef = useRef<boolean>(false);

  // Accordion State
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    core: true,
    hierarchy: false,
    dependencies: false,
    effort: false,
    risk: false,
    tradeoff: false
  });


  // Bulk Mode State
  const [bulkRows, setBulkRows] = useState<BulkEntryRow[]>([]);
  const [bulkSharedSettings, setBulkSharedSettings] = useState({
    quarter: 'Q4 2025',
    l1_assetClass: AssetClass.PL
  });
  const [bulkErrors, setBulkErrors] = useState<Record<string, Record<string, string>>>({});

  // Trade Off State
  const [enableTradeOff, setEnableTradeOff] = useState(false);
  const [tradeOffData, setTradeOffData] = useState<Partial<TradeOffAction>>({ field: 'eta' });

  // Share/Export State
  const [_showShareMenu, setShowShareMenu] = useState(false);
  void _showShareMenu; // Reserved for future share menu UI
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<'slack' | 'notion' | null>(null);

  // BAU Task Management State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [effortOverride, setEffortOverride] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  const getDefaultFormData = useCallback(() => {
    const _canCreate = canCreateTasks(config, currentUser.role);
    void _canCreate; // Permission check reserved for future use
    
    const defaultWorkType = WorkType.Planned;
    
    const defaultAsset = AssetClass.PL;
    const defaultPillar = HIERARCHY[defaultAsset][0].name;
    const defaultResp = HIERARCHY[defaultAsset][0].responsibilities[0];

    return {
      initiativeType: InitiativeType.WP, // Default to WP
      status: Status.NotStarted,
      priority: Priority.P1,
      workType: defaultWorkType,
      l1_assetClass: defaultAsset,
      l2_pillar: defaultPillar,
      l3_responsibility: defaultResp,
      // Effort fields optional, defaults handled in calculations
      unplannedTags: [],
      quarter: 'Q4 2025',
      definitionOfDone: '',
      comments: [],
      tasks: []
    };
  }, [permissions]);

  const createEmptyBulkRow = useCallback((): BulkEntryRow => {
    const defaultPillar = HIERARCHY[bulkSharedSettings.l1_assetClass][0]?.name || '';
    const defaultResp = HIERARCHY[bulkSharedSettings.l1_assetClass][0]?.responsibilities[0] || '';
    
    return {
      id: generateId(),
      title: '',
      ownerId: '',
      priority: Priority.P1,
      status: Status.NotStarted,
      eta: '',
      estimatedEffort: 0,
      l2_pillar: defaultPillar,
      l3_responsibility: defaultResp,
      l4_target: '',
      secondaryOwner: '',
      isExpanded: false,
      // Trade-off defaults
      hasTradeOff: false,
      tradeOffTargetId: '',
      tradeOffField: 'eta',
      tradeOffValue: ''
    };
  }, [bulkSharedSettings.l1_assetClass]);

  useEffect(() => {
    if (isOpen) {
      if (initiativeToEdit) {
        setFormData({ 
          ...initiativeToEdit,
          // Ensure initiativeType is set (required field)
          initiativeType: initiativeToEdit.initiativeType || InitiativeType.WP
        });
        setMode('single'); // Always single mode when editing
        setTasks(initiativeToEdit.tasks || []);
        setEffortOverride(false); // Reset override when editing
        // Reset manual flag when editing (editing mode doesn't use auto-assignment)
        assetClassManuallySetRef.current = false;
      } else {
        const defaultData = getDefaultFormData();
        setFormData(defaultData);
        setTasks([]);
        setEffortOverride(false);
        // Reset manual flag for new initiatives
        assetClassManuallySetRef.current = false;
      }
      setErrors({});
      setActiveTab('details');
      setNewComment('');
      setShowShareMenu(false);
      setShowActionsMenu(false);
      setCopyFeedback(null);
      setEnableTradeOff(false);
      setTradeOffData({ field: 'eta' });
      setExpandedSections({ core: true, hierarchy: false, dependencies: false, effort: false, risk: false, tradeoff: false, tasks: false });
      
      // Initialize bulk mode with 2 empty rows
      setBulkRows([createEmptyBulkRow(), createEmptyBulkRow()]);
      setBulkErrors({});
    }
  }, [isOpen, initiativeToEdit, getDefaultFormData, createEmptyBulkRow]);

  // Close actions menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setShowActionsMenu(false);
      }
    };

    if (showActionsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showActionsMenu]);

  // Real-time asset class assignment based on selected owner's team
  useEffect(() => {
    // Only apply for new initiatives (not edit mode)
    if (isEditMode) return;
    
    // Only apply if owner is selected
    if (!formData.ownerId) {
      // Reset manual flag when owner is cleared
      assetClassManuallySetRef.current = false;
      return;
    }

    // Check if workflow is enabled
    const assetClassWorkflow = config.workflows?.find(
      w => w.name === 'Team-Based Asset Class Assignment' && w.enabled
    );

    if (!assetClassWorkflow) return;

    // Find the selected user
    const selectedUser = users.find(u => u.id === formData.ownerId);
    if (!selectedUser || !selectedUser.team) return;

    // Use shared utility to map team to asset class
    const mappedAssetClass = getAssetClassFromTeam(selectedUser.team);
    if (!mappedAssetClass) return;

    // Only auto-assign if asset class hasn't been manually set
    // Respect user's manual selection
    if (assetClassManuallySetRef.current) return;

    // Use functional setState to avoid stale closure issues
    setFormData(prev => {
      const currentAssetClass = prev.l1_assetClass || AssetClass.PL;
      
      // Only apply if different from current
      if (mappedAssetClass !== currentAssetClass) {
        const pillars = HIERARCHY[mappedAssetClass];
        const defaultPillar = pillars[0]?.name || '';
        const defaultResp = pillars[0]?.responsibilities[0] || '';

        return {
          ...prev,
          l1_assetClass: mappedAssetClass,
          l2_pillar: defaultPillar,
          l3_responsibility: defaultResp
        };
      }
      
      return prev;
    });
  }, [formData.ownerId, formData.l1_assetClass, isEditMode, config.workflows, users]);

  // ============================================================================
  // DERIVED DATA
  // ============================================================================
  
  const tradeOffCandidates = allInitiatives.filter(i => 
    i.status === Status.InProgress && i.id !== formData.id
  );

  const canEdit = (): boolean => {
    // #region agent log
    const canEditAll = canEditAllTasks(config, currentUser.role);
    const canEditOwn = canEditOwnTasks(config, currentUser.role);
    const ownerMatch = formData.ownerId === currentUser.id;
    const editTasksPermValue = config.rolePermissions?.[currentUser.role]?.editTasks;
    console.log('[DEBUG canEdit Modal]', { isEditMode, currentUserId: currentUser.id, currentUserRole: currentUser.role, formDataOwnerId: formData.ownerId, ownerMatch, canEditAll, canEditOwn, editTasksPermValue });
    fetch('http://127.0.0.1:7242/ingest/30bff00f-1252-4a6a-a1a1-ff6715802d11',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'InitiativeModal.tsx:canEdit',message:'Modal permission check',data:{isEditMode,currentUserId:currentUser.id,currentUserRole:currentUser.role,formDataOwnerId:formData.ownerId,ownerMatch,canEditAll,canEditOwn,editTasksPermValue},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B,C,E'})}).catch(()=>{});
    // #endregion
    if (isEditMode) {
      // Check if user can edit all tasks
      if (canEditAllTasks(config, currentUser.role)) return true;
      // Check if user can edit own tasks and this is their task
      if (formData.ownerId === currentUser.id && canEditOwnTasks(config, currentUser.role)) return true;
      return false;
    } else {
      // Creating new task - check if user can create tasks
      return canCreateTasks(config, currentUser.role);
    }
  };

  const isReadOnly = !canEdit();

  const canDelete = (): boolean => {
    // Only Admin or Director (Group Lead) can delete
    return currentUser.role === Role.Admin || currentUser.role === Role.DirectorGroup;
  };

  const handleDelete = () => {
    if (!initiativeToEdit || !onDelete) return;
    
    const confirmed = window.confirm(
      `Are you sure you want to delete "${initiativeToEdit.title}"?\n\nThis action cannot be undone.`
    );

    if (confirmed) {
      onDelete(initiativeToEdit.id);
      onClose();
    }
    setShowActionsMenu(false);
  };

  const availablePillars = formData.l1_assetClass ? HIERARCHY[formData.l1_assetClass] : [];
  const selectedPillarNode = availablePillars.find(p => p.name === formData.l2_pillar);
  const availableResponsibilities = selectedPillarNode ? selectedPillarNode.responsibilities : [];

  // BAU Initiative: Calculate effort from tasks
  const isBAU = formData.initiativeType === InitiativeType.BAU;
  const taskEstimatedEffortSum = tasks.reduce((sum, task) => sum + (task.estimatedEffort || 0), 0);
  const taskActualEffortSum = tasks.reduce((sum, task) => sum + (task.actualEffort || 0), 0);
  
  // Update formData.estimatedEffort and actualEffort when tasks change (if not overridden)
  useEffect(() => {
    if (isBAU && !effortOverride && tasks.length > 0) {
      setFormData(prev => ({ 
        ...prev, 
        estimatedEffort: taskEstimatedEffortSum,
        actualEffort: taskActualEffortSum
      }));
    }
  }, [tasks, taskEstimatedEffortSum, taskActualEffortSum, isBAU, effortOverride]);

  // Progress indicator for required fields
  const requiredFieldsCount = isBAU ? 5 : 6; // BAU doesn't require definitionOfDone
  const filledRequiredFields = [
    formData.title,
    formData.ownerId,
    formData.eta,
    formData.quarter,
    formData.estimatedEffort !== undefined && formData.estimatedEffort >= 0,
    !isBAU && formData.definitionOfDone && formData.definitionOfDone.trim()
  ].filter(Boolean).length;
  const progressPercent = (filledRequiredFields / requiredFieldsCount) * 100;

  // ============================================================================
  // HANDLERS - SINGLE MODE
  // ============================================================================

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleChange = (field: keyof Initiative, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      
      // When switching initiative type, handle tasks
      if (field === 'initiativeType') {
        if (value === InitiativeType.WP) {
          // Converting BAU to WP: remove tasks, keep effort
          updated.tasks = undefined;
          setTasks([]);
        } else if (value === InitiativeType.BAU) {
          // Converting WP to BAU: initialize empty tasks array
          updated.tasks = [];
          setTasks([]);
          setEffortOverride(false);
        }
      }
      
      return updated;
    });
    if (errors[field]) {
      setErrors(prev => {
        const newErr = { ...prev };
        delete newErr[field];
        return newErr;
      });
    }
  };

  const handleAssetClassChange = (newClass: AssetClass) => {
    // Mark that asset class was manually changed (prevents auto-override)
    assetClassManuallySetRef.current = true;
    
    const pillars = HIERARCHY[newClass];
    const defaultPillar = pillars[0]?.name || '';
    const defaultResp = pillars[0]?.responsibilities[0] || '';
    
    setFormData(prev => ({
      ...prev,
      l1_assetClass: newClass,
      l2_pillar: defaultPillar,
      l3_responsibility: defaultResp
    }));
  };

  const handlePillarChange = (newPillar: string) => {
    const assetClass = formData.l1_assetClass || AssetClass.PL;
    const pillars = HIERARCHY[assetClass];
    const selectedPillarNode = pillars.find(p => p.name === newPillar);
    const defaultResp = selectedPillarNode?.responsibilities[0] || '';

    setFormData(prev => ({
      ...prev,
      l2_pillar: newPillar,
      l3_responsibility: defaultResp
    }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    const isBAU = formData.initiativeType === InitiativeType.BAU;

    if (!formData.title) newErrors.title = "Title is required";
    if (!formData.ownerId) newErrors.ownerId = "Primary Owner is required";
    if (!formData.eta) newErrors.eta = "ETA is required";
    if (!formData.quarter) newErrors.quarter = "Quarter is required";
    // For BAU, effort comes from tasks; for WP, effort is required
    if (!isBAU && (formData.estimatedEffort === undefined || formData.estimatedEffort < 0)) {
      newErrors.estimatedEffort = "Valid effort required";
    }
    if (formData.estimatedEffort !== undefined && formData.estimatedEffort < 0) {
      newErrors.estimatedEffort = "Effort must be non-negative";
    }
    
    // Definition of Done only required for WP initiatives
    if (!isBAU && (!formData.definitionOfDone || !formData.definitionOfDone.trim())) {
      newErrors.definitionOfDone = "Definition of Done is required";
    }
    
    if (formData.workType === WorkType.Unplanned) {
      if (!formData.unplannedTags || formData.unplannedTags.length === 0) {
        newErrors.unplannedTags = "Unplanned work must have at least one risk/PM tag";
      }
    }

    const isAtRisk = formData.status === Status.AtRisk;
    if (isAtRisk && !formData.riskActionLog?.trim()) {
      newErrors.riskActionLog = "Risk/Action documentation is MANDATORY for At Risk items.";
    }

    // BAU initiative validation: validate tasks if they exist
    if (isBAU && tasks && tasks.length > 0) {
      // Validate each task
      tasks.forEach((task, index) => {
        if (task.estimatedEffort === undefined || task.estimatedEffort < 0) {
          newErrors[`task_${task.id}_estimatedEffort`] = `Task ${index + 1}: Planned effort is required`;
        }
        if (task.actualEffort === undefined || task.actualEffort < 0) {
          newErrors[`task_${task.id}_actualEffort`] = `Task ${index + 1}: Actual effort must be non-negative`;
        }
        if (!task.eta) {
          newErrors[`task_${task.id}_eta`] = `Task ${index + 1}: ETA is required`;
        }
        if (!task.ownerId) {
          newErrors[`task_${task.id}_owner`] = `Task ${index + 1}: Owner is required`;
        }
      });
    }

    if (enableTradeOff) {
      if (!tradeOffData.targetInitiativeId) newErrors.tradeOffTarget = "Select an initiative to trade-off";
      if (!tradeOffData.newValue) newErrors.tradeOffValue = "Define the new value";
    }

    setErrors(newErrors);
    
    // Auto-expand sections with errors
    if (newErrors.title || newErrors.ownerId || newErrors.quarter || newErrors.definitionOfDone) {
      setExpandedSections(prev => ({ ...prev, core: true }));
    }
    if (newErrors.estimatedEffort || newErrors.eta) {
      setExpandedSections(prev => ({ ...prev, effort: true }));
    }
    if (newErrors.riskActionLog) {
      setExpandedSections(prev => ({ ...prev, risk: true }));
    }
    if (newErrors.tasks || Object.keys(newErrors).some(k => k.startsWith('task_'))) {
      setExpandedSections(prev => ({ ...prev, tasks: true }));
    }
    if (newErrors.estimatedEffort || newErrors.actualEffort) {
      setExpandedSections(prev => ({ ...prev, effort: true }));
    }
    
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      const now = new Date().toISOString().split('T')[0];
      const isNew = !formData.id;
      const isBAU = formData.initiativeType === InitiativeType.BAU;
      
      const payload = {
        ...formData,
        lastUpdated: now,
        id: formData.id || generateInitiativeId(formData.quarter, allInitiatives),
        // Set originalEstimatedEffort only when creating new or when it changes
        originalEstimatedEffort: isNew ? (formData.estimatedEffort || 0) : formData.originalEstimatedEffort,
        originalEta: isNew ? (formData.eta || '') : formData.originalEta,
        // Include tasks for BAU initiatives
        tasks: isBAU ? tasks : undefined,
        // Ensure initiativeType is set (required field)
        initiativeType: formData.initiativeType || InitiativeType.WP,
        // Ensure effort fields have defaults
        estimatedEffort: formData.estimatedEffort || 0,
        actualEffort: formData.actualEffort || 0,
      } as Initiative;
      
      const tradeOffAction = enableTradeOff && tradeOffData.targetInitiativeId && tradeOffData.newValue
        ? tradeOffData as TradeOffAction
        : undefined;

      onSave(payload, tradeOffAction);
      onClose();
    }
  };

  // ============================================================================
  // HANDLERS - BULK MODE
  // ============================================================================

  const handleBulkRowChange = (rowId: string, field: keyof BulkEntryRow, value: any) => {
    setBulkRows(prev => prev.map(row => 
      row.id === rowId ? { ...row, [field]: value } : row
    ));
    
    // Clear error for this field
    if (bulkErrors[rowId]?.[field]) {
      setBulkErrors(prev => {
        const newErrors = { ...prev };
        if (newErrors[rowId]) {
          delete newErrors[rowId][field];
          if (Object.keys(newErrors[rowId]).length === 0) {
            delete newErrors[rowId];
          }
        }
        return newErrors;
      });
    }
  };

  const addBulkRow = () => {
    setBulkRows(prev => [...prev, createEmptyBulkRow()]);
  };

  const removeBulkRow = (rowId: string) => {
    if (bulkRows.length > 1) {
      setBulkRows(prev => prev.filter(row => row.id !== rowId));
    }
  };

  const duplicateBulkRow = (rowId: string) => {
    const rowToDuplicate = bulkRows.find(r => r.id === rowId);
    if (rowToDuplicate) {
      const newRow = { 
        ...rowToDuplicate, 
        id: generateId(), 
        title: `${rowToDuplicate.title} (copy)`,
        // Reset trade-off for duplicated row to avoid conflicts
        hasTradeOff: false,
        tradeOffTargetId: '',
        tradeOffField: 'eta' as const,
        tradeOffValue: ''
      };
      setBulkRows(prev => [...prev, newRow]);
    }
  };

  const toggleRowExpanded = (rowId: string) => {
    setBulkRows(prev => prev.map(row => 
      row.id === rowId ? { ...row, isExpanded: !row.isExpanded } : row
    ));
  };

  const validateBulkRows = (): boolean => {
    const newErrors: Record<string, Record<string, string>> = {};
    let isValid = true;

    bulkRows.forEach(row => {
      const rowErrors: Record<string, string> = {};
      
      if (!row.title.trim()) rowErrors.title = "Required";
      if (!row.ownerId) rowErrors.ownerId = "Required";
      if (!row.eta) rowErrors.eta = "Required";
      if (row.estimatedEffort === undefined || row.estimatedEffort < 0) rowErrors.estimatedEffort = "Required";
      
      if (Object.keys(rowErrors).length > 0) {
        newErrors[row.id] = rowErrors;
        isValid = false;
      }
    });

    setBulkErrors(newErrors);
    return isValid;
  };

  const handleBulkSubmit = () => {
    if (!validateBulkRows()) return;

    const now = new Date().toISOString().split('T')[0];
    
    // Track generated initiatives to ensure unique sequential IDs
    const generatedInitiatives: Initiative[] = [...allInitiatives];

    bulkRows.forEach(row => {
      const initiative: Initiative = {
        id: generateInitiativeId(bulkSharedSettings.quarter, generatedInitiatives),
        title: row.title,
        ownerId: row.ownerId,
        secondaryOwner: row.secondaryOwner || undefined,
        priority: row.priority,
        status: row.status,
        eta: row.eta,
        originalEta: row.eta,
        estimatedEffort: row.estimatedEffort,
        originalEstimatedEffort: row.estimatedEffort,
        initiativeType: InitiativeType.WP, // Bulk mode defaults to WP
        quarter: bulkSharedSettings.quarter,
        l1_assetClass: bulkSharedSettings.l1_assetClass,
        l2_pillar: row.l2_pillar,
        l3_responsibility: row.l3_responsibility,
        l4_target: row.l4_target,
        workType: WorkType.Planned, // Default to Planned
        lastUpdated: now,
        comments: [],
        history: []
      };

      // Add to generated list for next iteration
      generatedInitiatives.push(initiative);

      // Build trade-off action if enabled for this row
      const tradeOffAction: TradeOffAction | undefined = 
        row.hasTradeOff && row.tradeOffTargetId && row.tradeOffValue
          ? {
              targetInitiativeId: row.tradeOffTargetId,
              field: row.tradeOffField,
              newValue: row.tradeOffValue
            }
          : undefined;

      onSave(initiative, tradeOffAction);
    });

    onClose();
  };

  // Update bulk rows when shared asset class changes
  useEffect(() => {
    const defaultPillar = HIERARCHY[bulkSharedSettings.l1_assetClass][0]?.name || '';
    const defaultResp = HIERARCHY[bulkSharedSettings.l1_assetClass][0]?.responsibilities[0] || '';
    
    setBulkRows(prev => prev.map(row => ({
      ...row,
      l2_pillar: defaultPillar,
      l3_responsibility: defaultResp
    })));
  }, [bulkSharedSettings.l1_assetClass]);

  // ============================================================================
  // HANDLERS - TASK MANAGEMENT (BAU)
  // ============================================================================

  const createEmptyTask = useCallback((): Task => {
    return {
      id: generateId(),
      estimatedEffort: 0,
      actualEffort: 0,
      eta: '',
      ownerId: formData.ownerId || '',
      status: Status.NotStarted,
      tags: [],
      comments: []
    };
  }, [formData.ownerId]);

  const addTask = () => {
    setTasks(prev => [...prev, createEmptyTask()]);
    setExpandedSections(prev => ({ ...prev, tasks: true }));
  };

  const updateTask = (taskId: string, field: keyof Task, value: any) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId ? { ...task, [field]: value } : task
    ));
  };

  const deleteTask = (taskId: string) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
  };

  const duplicateTask = (taskId: string) => {
    const taskToDuplicate = tasks.find(t => t.id === taskId);
    if (taskToDuplicate) {
      const newTask: Task = {
        ...taskToDuplicate,
        id: generateId(),
        title: taskToDuplicate.title ? `${taskToDuplicate.title} (copy)` : undefined
      };
      setTasks(prev => [...prev, newTask]);
    }
  };

  // ============================================================================
  // HANDLERS - COMMENTS
  // ============================================================================

  // Filter users for mention dropdown
  const filteredMentionUsers = users.filter(user => {
    if (!mentionQuery) return true;
    const query = mentionQuery.toLowerCase();
    return (
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query)
    );
  }).slice(0, 5); // Limit to 5 suggestions

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    
    const mentionedUserIds = parseMentions(newComment, users);
    
    const comment = {
      id: generateId(),
      text: newComment,
      authorId: currentUser.id,
      timestamp: new Date().toISOString(),
      mentionedUserIds: mentionedUserIds.length > 0 ? mentionedUserIds : undefined
    };
    
    setFormData(prev => ({
      ...prev,
      comments: [...(prev.comments || []), comment]
    }));
    
    if (mentionedUserIds.length > 0 && initiativeToEdit && formData.id) {
      const initiative = { ...initiativeToEdit, ...formData } as Initiative;
      slackService.notifyTagging(comment, initiative, mentionedUserIds, users).catch(console.error);
    }
    
    setNewComment('');
    setShowMentionDropdown(false);
  };

  // Handle comment input change with mention detection
  const handleCommentInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    
    setNewComment(value);
    
    // Detect @ mention
    const textBeforeCursor = value.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atIndex !== -1) {
      const charBeforeAt = textBeforeCursor[atIndex - 1];
      if (atIndex === 0 || charBeforeAt === ' ' || charBeforeAt === '\n') {
        const queryAfterAt = textBeforeCursor.substring(atIndex + 1);
        
        if (!queryAfterAt.includes(' ')) {
          setMentionStartIndex(atIndex);
          setMentionQuery(queryAfterAt);
          setShowMentionDropdown(true);
          setSelectedMentionIndex(0);
          return;
        }
      }
    }
    
    setShowMentionDropdown(false);
    setMentionQuery('');
    setMentionStartIndex(-1);
  };

  // Insert mention into comment
  const insertMention = useCallback((user: User) => {
    const beforeMention = newComment.substring(0, mentionStartIndex);
    const afterMention = newComment.substring(mentionStartIndex + 1 + mentionQuery.length);
    
    const newValue = `${beforeMention}@${user.email}${afterMention ? ' ' + afterMention.trim() : ' '}`;
    
    setNewComment(newValue);
    setShowMentionDropdown(false);
    setMentionQuery('');
    setMentionStartIndex(-1);
    
    setTimeout(() => {
      if (commentInputRef.current) {
        commentInputRef.current.focus();
        const newCursorPos = beforeMention.length + user.email.length + 2;
        commentInputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }, [newComment, mentionStartIndex, mentionQuery]);

  // Handle keyboard navigation in mention dropdown
  const handleCommentKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showMentionDropdown && filteredMentionUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex(prev => 
          prev < filteredMentionUsers.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex(prev => 
          prev > 0 ? prev - 1 : filteredMentionUsers.length - 1
        );
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMentionUsers[selectedMentionIndex]);
      } else if (e.key === 'Escape') {
        setShowMentionDropdown(false);
      }
    } else if (e.key === 'Enter') {
      handleAddComment();
    }
  };

  // ============================================================================
  // HANDLERS - EXPORT
  // ============================================================================

  const handleCopy = async (platform: 'slack' | 'notion') => {
    const ownerName = getOwnerName(users, formData.ownerId || '');
    let text = '';

    if (platform === 'slack') {
      text = `*Initiative Update*\n` +
             `*Title:* ${formData.title}\n` +
             `*Owner:* ${ownerName}\n` +
             `*Status:* ${formData.status} ${formData.status === Status.AtRisk ? '(🚩 At Risk)' : ''}\n` +
             `*ETA:* ${formData.eta}\n` +
             `*Progress:* ${formData.actualEffort}/${formData.estimatedEffort} weeks\n` +
             `> ${formData.riskActionLog || 'No immediate risks flagged.'}`;
    } else {
      text = `# ${formData.title}\n\n` +
             `**Owner:** ${ownerName}\n` +
             `**Status:** ${formData.status}\n` +
             `**ETA:** ${formData.eta}\n` +
             `**Quarter:** ${formData.quarter}\n` +
             `---\n` +
             `**Description / Risks:**\n` +
             `${formData.riskActionLog || 'No immediate risks flagged.'}`;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(platform);
      setTimeout(() => {
        setCopyFeedback(null);
        setShowActionsMenu(false);
      }, 1500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  const validBulkRowsCount = bulkRows.filter(r => r.title.trim() && r.ownerId && r.eta).length;
  const tradeOffRowsCount = bulkRows.filter(r => r.hasTradeOff && r.tradeOffTargetId && r.tradeOffValue).length;

  return (
    <>
      {/* Backdrop overlay - optional, less prominent */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/20 transition-opacity duration-300"
          onClick={onClose}
        />
      )}
      
      {/* Right-side panel */}
      <div className={`fixed right-0 top-0 h-full z-50 transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      } ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div className={`bg-white h-full shadow-2xl overflow-hidden flex flex-col border-l border-slate-200 transition-all duration-300 ${
          mode === 'bulk' ? 'w-[900px] max-w-[95vw]' : 'w-[600px] max-w-[90vw]'
        }`}>
        
        {/* ================================================================ */}
        {/* HEADER */}
        {/* ================================================================ */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-800 to-slate-900">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                {isEditMode ? 'Edit Initiative' : 'New Initiative'}
                {isEditMode && formData.id && (
                  <span className="px-2 py-1 bg-slate-700 text-slate-200 text-xs font-mono font-semibold rounded">
                    {formData.id}
                  </span>
                )}
              </h2>
              {isReadOnly && (
                <span className="text-xs font-bold text-red-400 tracking-wider">Read only</span>
              )}
            </div>
            
            {/* Mode Toggle - only show when creating new */}
            {!isEditMode && !isReadOnly && (
              <div className="flex bg-slate-700/50 rounded-lg p-1 ml-4">
                <button
                  type="button"
                  onClick={() => setMode('single')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    mode === 'single' 
                      ? 'bg-white text-slate-800 shadow-sm' 
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Single
                </button>
                <button
                  type="button"
                  onClick={() => setMode('bulk')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    mode === 'bulk' 
                      ? 'bg-white text-slate-800 shadow-sm' 
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Bulk
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {mode === 'single' && (
              <div className="relative" ref={actionsMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowActionsMenu(!showActionsMenu)}
                  className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                  title="Actions"
                >
                  <MoreVertical size={18} />
                </button>

                {showActionsMenu && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                    {/* Share/Export Section */}
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500">
                      Export to clipboard
                    </div>
                    <button
                      onClick={() => {
                        handleCopy('slack');
                        setShowActionsMenu(false);
                      }}
                      className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2">
                        <Share2 size={16} className="text-slate-400" />
                        <span>Copy for Slack</span>
                      </div>
                      {copyFeedback === 'slack' ? <Check size={16} className="text-emerald-600"/> : <Copy size={16} className="text-slate-400 group-hover:text-slate-600"/>}
                    </button>
                    <div className="border-t border-slate-100"></div>
                    <button
                      onClick={() => {
                        handleCopy('notion');
                        setShowActionsMenu(false);
                      }}
                      className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2">
                        <Share2 size={16} className="text-slate-400" />
                        <span>Copy for Notion</span>
                      </div>
                      {copyFeedback === 'notion' ? <Check size={16} className="text-emerald-600"/> : <Copy size={16} className="text-slate-400 group-hover:text-slate-600"/>}
                    </button>
                    
                    {/* Delete Section - Only show if user can delete and in edit mode */}
                    {isEditMode && canDelete() && onDelete && (
                      <>
                        <div className="border-t border-slate-200 my-1"></div>
                        <button
                          onClick={handleDelete}
                          className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 group"
                        >
                          <Trash2 size={16} className="text-red-600" />
                          <span>Delete Initiative</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <button 
              onClick={onClose} 
              className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ================================================================ */}
        {/* TABS (Single Mode Only) */}
        {/* ================================================================ */}
        {mode === 'single' && (
          <div className="flex border-b border-slate-200 px-6 bg-slate-50/50">
            <button 
              onClick={() => setActiveTab('details')}
              className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all ${
                activeTab === 'details' 
                  ? 'border-blue-600 text-blue-600 bg-white' 
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileText size={16} /> Details
            </button>
            <button 
              onClick={() => setActiveTab('comments')}
              className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all ${
                activeTab === 'comments' 
                  ? 'border-blue-600 text-blue-600 bg-white' 
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <MessageSquare size={16} /> Comments 
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                activeTab === 'comments' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {formData.comments?.length || 0}
              </span>
            </button>
            {isEditMode && (
              <button 
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-all ${
                  activeTab === 'history' 
                    ? 'border-blue-600 text-blue-600 bg-white' 
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <History size={16} /> History
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  activeTab === 'history' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
                }`}>
                  {formData.history?.length || 0}
                </span>
              </button>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* BODY - SINGLE MODE */}
        {/* ================================================================ */}
        {mode === 'single' && activeTab === 'details' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {/* Progress Indicator */}
            <div className="px-6 pt-4 pb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-slate-500">
                  Required fields: {filledRequiredFields}/{requiredFieldsCount}
                </span>
                <span className="text-xs font-medium text-slate-500">{Math.round(progressPercent)}%</span>
              </div>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 pt-3 space-y-4">
              
              {/* ============================================ */}
              {/* CORE DETAILS SECTION - SPREADSHEET STYLE */}
              {/* ============================================ */}
              <AccordionSection
                title="Core Details"
                icon={<FileText size={16} />}
                isExpanded={expandedSections.core}
                onToggle={() => toggleSection('core')}
                accentColor="blue"
                badge={
                  (errors.title || errors.ownerId || errors.quarter || errors.definitionOfDone) && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full">
                      Required
                    </span>
                  )
                }
              >
                <div className="border border-slate-300 rounded-md overflow-hidden text-sm">
                  {/* Row 1: Title */}
                  <div className="grid grid-cols-[120px_1fr] border-b border-slate-200">
                    <div className="bg-slate-100 px-3 py-2 font-medium text-slate-600 border-r border-slate-200 flex items-center">
                      Title <span className="text-red-500 ml-0.5">*</span>
                    </div>
                    <div className="bg-white">
                      <input 
                        disabled={isReadOnly}
                        type="text" 
                        value={formData.title || ''} 
                        onChange={(e) => handleChange('title', e.target.value)}
                        placeholder="Enter initiative title..."
                        className={`w-full px-3 py-2 text-sm focus:outline-none focus:bg-blue-50 ${
                          errors.title ? 'bg-red-50' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {/* Row 1.5: Initiative Type (only when creating new) */}
                  {!isEditMode && (
                    <div className="grid grid-cols-[120px_1fr] border-b border-slate-200">
                      <div className="bg-slate-100 px-3 py-2 font-medium text-slate-600 border-r border-slate-200 flex items-center">
                        Type
                      </div>
                      <div className="bg-white">
                        <select 
                          disabled={isReadOnly}
                          value={formData.initiativeType || InitiativeType.WP} 
                          onChange={(e) => handleChange('initiativeType', e.target.value as InitiativeType)}
                          className="w-full px-3 py-2 text-sm focus:outline-none focus:bg-blue-50"
                        >
                          <option value={InitiativeType.WP}>WP (Work Plan)</option>
                          <option value={InitiativeType.BAU}>BAU (Business As Usual)</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* BAU Buffer Notice */}
                  {isBAU && (
                    <div className="bg-purple-50 border-b border-purple-200 px-3 py-2">
                      <div className="flex items-center gap-2 text-sm text-purple-800">
                        <AlertTriangle size={14} />
                        <span className="font-medium">All effort allocated to buffer</span>
                      </div>
                    </div>
                  )}

                  {/* Row 2: Owner | Secondary Owner */}
                  <div className="grid grid-cols-[120px_1fr_120px_1fr] border-b border-slate-200">
                    <div className="bg-slate-100 px-3 py-2 font-medium text-slate-600 border-r border-slate-200 flex items-center">
                      Owner <span className="text-red-500 ml-0.5">*</span>
                    </div>
                    <div className="bg-white border-r border-slate-200">
                      <select 
                        disabled={isReadOnly}
                        value={formData.ownerId || ''} 
                        onChange={(e) => handleChange('ownerId', e.target.value)}
                        className={`w-full px-3 py-2 text-sm focus:outline-none focus:bg-blue-50 ${
                          errors.ownerId ? 'bg-red-50' : ''
                        }`}
                      >
                        <option value="">Select...</option>
                        {users.filter(u => u.role === Role.TeamLead).map(u => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="bg-slate-100 px-3 py-2 font-medium text-slate-600 border-r border-slate-200 flex items-center">
                      Secondary
                    </div>
                    <div className="bg-white">
                      <input 
                        disabled={isReadOnly}
                        type="text"
                        value={formData.secondaryOwner || ''} 
                        onChange={(e) => handleChange('secondaryOwner', e.target.value)}
                        placeholder="Stakeholder name..."
                        className="w-full px-3 py-2 text-sm focus:outline-none focus:bg-blue-50"
                      />
                    </div>
                  </div>

                  {/* Row 3: Priority | Status */}
                  <div className="grid grid-cols-[120px_1fr_120px_1fr] border-b border-slate-200">
                    <div className="bg-slate-100 px-3 py-2 font-medium text-slate-600 border-r border-slate-200 flex items-center">
                      Priority
                    </div>
                    <div className="bg-white border-r border-slate-200">
                      <select 
                        disabled={isReadOnly}
                        value={formData.priority} 
                        onChange={(e) => handleChange('priority', e.target.value)}
                        className="w-full px-3 py-2 text-sm focus:outline-none focus:bg-blue-50"
                      >
                        {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="bg-slate-100 px-3 py-2 font-medium text-slate-600 border-r border-slate-200 flex items-center">
                      Status
                    </div>
                    <div className="bg-white">
                      <select 
                        disabled={isReadOnly}
                        value={formData.status} 
                        onChange={(e) => handleChange('status', e.target.value)}
                        className="w-full px-3 py-2 text-sm focus:outline-none focus:bg-blue-50"
                      >
                        {Object.values(Status).filter(s => s !== Status.Deleted).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Row 4: Quarter */}
                  <div className="grid grid-cols-[120px_1fr] border-b border-slate-200">
                    <div className="bg-slate-100 px-3 py-2 font-medium text-slate-600 border-r border-slate-200 flex items-center">
                      Quarter <span className="text-red-500 ml-0.5">*</span>
                    </div>
                    <div className="bg-white">
                      <select 
                        disabled={isReadOnly}
                        value={formData.quarter || ''} 
                        onChange={(e) => handleChange('quarter', e.target.value)}
                        className={`w-full px-3 py-2 text-sm focus:outline-none focus:bg-blue-50 ${
                          errors.quarter ? 'bg-red-50' : ''
                        }`}
                      >
                        <option value="">Select...</option>
                        {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Row 5: Definition of Done (not required for BAU) */}
                  {!isBAU && (
                    <div className={`grid grid-cols-[120px_1fr] ${formData.workType === WorkType.Unplanned ? 'border-b border-slate-200' : ''}`}>
                      <div className="bg-slate-100 px-3 py-2 font-medium text-slate-600 border-r border-slate-200 flex items-start pt-3">
                        Definition of Done <span className="text-red-500 ml-0.5">*</span>
                      </div>
                      <div className="bg-white">
                        <textarea
                          disabled={isReadOnly}
                          value={formData.definitionOfDone || ''}
                          onChange={(e) => handleChange('definitionOfDone', e.target.value)}
                          placeholder="Enter the definition of done criteria..."
                          rows={3}
                          className={`w-full px-3 py-2 text-sm focus:outline-none focus:bg-blue-50 resize-none ${
                            errors.definitionOfDone ? 'bg-red-50' : ''
                          }`}
                        />
                      </div>
                    </div>
                  )}

                  {/* Conditional: Unplanned Tags */}
                  {formData.workType === WorkType.Unplanned && (
                    <div className="grid grid-cols-[120px_1fr] bg-amber-50">
                      <div className="bg-amber-100 px-3 py-2 font-medium text-amber-800 border-r border-amber-200 flex items-center">
                        Tags <span className="text-red-500 ml-0.5">*</span>
                      </div>
                      <div className="px-3 py-2 flex items-center gap-4">
                        {[UnplannedTag.Unplanned, UnplannedTag.RiskItem, UnplannedTag.PMItem].map(tag => (
                          <label key={tag} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input 
                              type="checkbox"
                              disabled={isReadOnly}
                              checked={formData.unplannedTags?.includes(tag)}
                              onChange={(e) => {
                                const currentTags = formData.unplannedTags || [];
                                const newTags = e.target.checked 
                                  ? [...currentTags, tag]
                                  : currentTags.filter(t => t !== tag);
                                handleChange('unplannedTags', newTags);
                              }}
                              className="rounded text-amber-600 focus:ring-amber-500"
                            />
                            <span className="text-amber-800">{tag}</span>
                          </label>
                        ))}
                        {errors.unplannedTags && <span className="text-red-500 text-xs ml-2">{errors.unplannedTags}</span>}
                      </div>
                    </div>
                  )}
                </div>
              </AccordionSection>

              {/* ============================================ */}
              {/* HIERARCHY SECTION - SPREADSHEET STYLE */}
              {/* ============================================ */}
              <AccordionSection
                title="Hierarchy & Classification"
                icon={<Layers size={16} />}
                isExpanded={expandedSections.hierarchy}
                onToggle={() => toggleSection('hierarchy')}
                accentColor="indigo"
              >
                <div className="border border-slate-300 rounded-md overflow-hidden text-sm">
                  {/* Row 1: Asset Class | Pillar */}
                  <div className="grid grid-cols-[120px_1fr_120px_1fr] border-b border-slate-200">
                    <div className="bg-slate-100 px-3 py-2 font-medium text-slate-600 border-r border-slate-200 flex items-center">
                      L1 Asset
                    </div>
                    <div className="bg-white border-r border-slate-200">
                      <select 
                        disabled={isReadOnly}
                        value={formData.l1_assetClass} 
                        onChange={(e) => handleAssetClassChange(e.target.value as AssetClass)}
                        className="w-full px-3 py-2 text-sm focus:outline-none focus:bg-blue-50"
                      >
                        {Object.values(AssetClass).map(ac => <option key={ac} value={ac}>{ac}</option>)}
                      </select>
                    </div>
                    <div className="bg-slate-100 px-3 py-2 font-medium text-slate-600 border-r border-slate-200 flex items-center">
                      L2 Pillar
                    </div>
                    <div className="bg-white">
                      <select 
                        disabled={isReadOnly}
                        value={formData.l2_pillar || ''} 
                        onChange={(e) => handlePillarChange(e.target.value)}
                        className="w-full px-3 py-2 text-sm focus:outline-none focus:bg-blue-50"
                      >
                        {availablePillars.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Row 2: Responsibility | Target */}
                  <div className="grid grid-cols-[120px_1fr_120px_1fr]">
                    <div className="bg-slate-100 px-3 py-2 font-medium text-slate-600 border-r border-slate-200 flex items-center">
                      L3 Resp
                    </div>
                    <div className="bg-white border-r border-slate-200">
                      <select 
                        disabled={isReadOnly}
                        value={formData.l3_responsibility || ''} 
                        onChange={(e) => handleChange('l3_responsibility', e.target.value)}
                        className="w-full px-3 py-2 text-sm focus:outline-none focus:bg-blue-50"
                      >
                        {availableResponsibilities.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div className="bg-slate-100 px-3 py-2 font-medium text-slate-600 border-r border-slate-200 flex items-center">
                      L4 Target
                    </div>
                    <div className="bg-white">
                      <input 
                        disabled={isReadOnly}
                        type="text" 
                        value={formData.l4_target || ''} 
                        onChange={(e) => handleChange('l4_target', e.target.value)}
                        placeholder="e.g. Identify constraints"
                        className="w-full px-3 py-2 text-sm focus:outline-none focus:bg-blue-50"
                      />
                    </div>
                  </div>
                </div>
              </AccordionSection>

              {/* ============================================ */}
              {/* EXTERNAL TEAM DEPENDENCIES - SPREADSHEET STYLE */}
              {/* ============================================ */}
              <AccordionSection
                title="External Team Dependencies"
                icon={<Users size={16} />}
                isExpanded={expandedSections.dependencies}
                onToggle={() => toggleSection('dependencies')}
                accentColor="indigo"
                badge={
                  formData.dependencies && formData.dependencies.length > 0 && (
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 text-xs font-bold rounded-full">
                      {formData.dependencies.length}
                    </span>
                  )
                }
              >
                <div className="border border-slate-300 rounded-md overflow-hidden text-sm">
                  {/* Dependencies List */}
                  <div className="divide-y divide-slate-200">
                    {(formData.dependencies || []).map((dep, index) => (
                      <div key={index} className="grid grid-cols-[160px_1fr_140px] items-start">
                        {/* Team */}
                        <div className="bg-slate-50 px-3 py-2.5 font-medium text-slate-600 text-xs border-r border-slate-200 min-h-[80px] flex items-center">
                          {dep.team}
                        </div>
                        {/* Deliverable */}
                        <div className="bg-white px-3 py-2 border-r border-slate-200">
                          <textarea
                            disabled={isReadOnly}
                            value={dep.deliverable || ''}
                            onChange={(e) => {
                              const newDeps = [...(formData.dependencies || [])];
                              newDeps[index] = { ...newDeps[index], deliverable: e.target.value };
                              handleChange('dependencies', newDeps);
                            }}
                            placeholder={`What deliverable is required from ${dep.team}?`}
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 resize-none bg-white placeholder:text-slate-400"
                            rows={2}
                          />
                        </div>
                        {/* ETA */}
                        <div className="bg-white px-3 py-2">
                          <input
                            disabled={isReadOnly}
                            type="date"
                            value={dep.eta || ''}
                            onChange={(e) => {
                              const newDeps = [...(formData.dependencies || [])];
                              newDeps[index] = { ...newDeps[index], eta: e.target.value };
                              handleChange('dependencies', newDeps);
                            }}
                            placeholder="ETA"
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Add Dependency Button */}
                  {!isReadOnly && (
                    <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            const newDep: Dependency = {
                              team: e.target.value as DependencyTeam,
                              deliverable: '',
                              eta: ''
                            };
                            handleChange('dependencies', [...(formData.dependencies || []), newDep]);
                            e.target.value = '';
                          }
                        }}
                        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white"
                      >
                        <option value="">+ Add Dependency</option>
                        {DEPENDENCY_TEAM_CATEGORIES.flatMap(c => c.teams)
                          .filter(team => !formData.dependencies?.some(d => d.team === team))
                          .map(team => (
                            <option key={team} value={team}>{team}</option>
                          ))}
                      </select>
                    </div>
                  )}
                  
                  {/* Remove Dependency Buttons */}
                  {!isReadOnly && formData.dependencies && formData.dependencies.length > 0 && (
                    <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 flex flex-wrap gap-2">
                      {formData.dependencies.map((dep, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            const newDeps = formData.dependencies?.filter((_, i) => i !== index) || [];
                            handleChange('dependencies', newDeps.length > 0 ? newDeps : undefined);
                          }}
                          className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded border border-red-200 transition-colors"
                        >
                          Remove {dep.team}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </AccordionSection>

              {/* ============================================ */}
              {/* EFFORT & TIMELINE - SPREADSHEET STYLE */}
              {/* ============================================ */}
              <AccordionSection
                title="Effort & Timeline"
                icon={<Scale size={16} />}
                isExpanded={expandedSections.effort}
                onToggle={() => toggleSection('effort')}
                accentColor="cyan"
                badge={
                  (errors.estimatedEffort || errors.eta) && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full">
                      Required
                    </span>
                  )
                }
              >
                <div className="space-y-4">
                  {/* BAU: Effort calculation info */}
                  {isBAU && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-purple-700 font-medium">
                          Planned from tasks: <span className="font-mono font-bold">{taskEstimatedEffortSum.toFixed(1)}w</span>
                        </span>
                        <label className="flex items-center gap-2 text-sm text-purple-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={effortOverride}
                            onChange={(e) => {
                              setEffortOverride(e.target.checked);
                              if (!e.target.checked) {
                                setFormData(prev => ({ 
                                  ...prev, 
                                  estimatedEffort: taskEstimatedEffortSum,
                                  actualEffort: taskActualEffortSum
                                }));
                              }
                            }}
                            className="rounded text-purple-600 focus:ring-purple-500"
                          />
                          <span>Override</span>
                        </label>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-purple-700 font-medium">
                          Actual from tasks: <span className="font-mono font-bold">{taskActualEffortSum.toFixed(1)}w</span>
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* Effort Fields - 2 Column Layout */}
                  <div className="grid grid-cols-2 gap-4 max-w-md">
                    {/* Planned Effort */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Planned Effort (weeks) <span className="text-red-500">*</span>
                      </label>
                      {isBAU && !effortOverride ? (
                        <div className="px-3 py-2 text-base font-mono text-slate-700 bg-slate-100 border border-slate-300 rounded-lg">
                          {taskEstimatedEffortSum.toFixed(1)}w
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleChange('estimatedEffort', Math.max(0, Number(formData.estimatedEffort || 0) - 0.25))}
                            disabled={isReadOnly || (isBAU && !effortOverride)}
                            className="p-1 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed z-10"
                            title="Decrease by 0.25"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <input 
                            disabled={isReadOnly || (isBAU && !effortOverride)}
                            type="number"
                            min="0"
                            step="0.25"
                            value={formData.estimatedEffort || 0}
                            onChange={(e) => handleChange('estimatedEffort', parseFloat(e.target.value) || 0)}
                            className={`w-20 px-2 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                              errors.estimatedEffort ? 'bg-red-50 border-red-300' : 'bg-white border-slate-300'
                            }`}
                            placeholder="0.0"
                          />
                          <button
                            type="button"
                            onClick={() => handleChange('estimatedEffort', Number(formData.estimatedEffort || 0) + 0.25)}
                            disabled={isReadOnly || (isBAU && !effortOverride)}
                            className="p-1 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed z-10"
                            title="Increase by 0.25"
                          >
                            <ArrowUp size={14} />
                          </button>
                        </div>
                      )}
                      {errors.estimatedEffort && (
                        <p className="text-red-600 text-xs mt-1">{errors.estimatedEffort}</p>
                      )}
                    </div>

                    {/* Actual Effort */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Actual Effort (weeks)
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleChange('actualEffort', Math.max(0, Number(formData.actualEffort || 0) - 0.25))}
                          disabled={isReadOnly}
                          className="p-1 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed z-10"
                          title="Decrease by 0.25"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <input 
                          disabled={isReadOnly}
                          type="number"
                          min="0"
                          step="0.25"
                          value={formData.actualEffort || 0}
                          onChange={(e) => handleChange('actualEffort', parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-center bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          placeholder="0.0"
                        />
                        <button
                          type="button"
                          onClick={() => handleChange('actualEffort', Number(formData.actualEffort || 0) + 0.25)}
                          disabled={isReadOnly}
                          className="p-1 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed z-10"
                          title="Increase by 0.25"
                        >
                          <ArrowUp size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Completion & ETA - 2 Column Layout */}
                  <div className="grid grid-cols-2 gap-4 max-w-md">
                    {/* Completion Rate - Manual Input */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Completion Rate
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleChange('completionRate', Math.max(0, Number(formData.completionRate || 0) - 5))}
                          disabled={isReadOnly}
                          className="p-1 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed z-10"
                          title="Decrease by 5%"
                        >
                          <ArrowDown size={14} />
                        </button>
                        <div className="relative">
                          <input 
                            disabled={isReadOnly}
                            type="number"
                            min="0"
                            max="100"
                            step="5"
                            value={formData.completionRate || 0}
                            onChange={(e) => handleChange('completionRate', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                            className="w-20 px-2 py-2 pr-6 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-center bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            placeholder="0"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-500">%</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleChange('completionRate', Math.min(100, Number(formData.completionRate || 0) + 5))}
                          disabled={isReadOnly}
                          className="p-1 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed z-10"
                          title="Increase by 5%"
                        >
                          <ArrowUp size={14} />
                        </button>
                      </div>
                    </div>

                    {/* ETA */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        ETA <span className="text-red-500">*</span>
                      </label>
                      <input 
                        disabled={isReadOnly}
                        type="date"
                        value={formData.eta || ''}
                        onChange={(e) => handleChange('eta', e.target.value)}
                        className={`w-full max-w-[160px] px-2 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                          errors.eta ? 'bg-red-50 border-red-300' : 'bg-white border-slate-300'
                        }`}
                      />
                      {errors.eta && (
                        <p className="text-red-600 text-xs mt-1">{errors.eta}</p>
                      )}
                    </div>
                  </div>

                  {/* Original Values (if editing) */}
                  {isEditMode && formData.originalEstimatedEffort !== undefined && (
                    <div className="pt-2 border-t border-slate-200">
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span>
                          <span className="font-medium">Original Effort:</span> <span className="font-mono">{formData.originalEstimatedEffort}w</span>
                        </span>
                        {formData.originalEta && (
                          <span>
                            <span className="font-medium">Original ETA:</span> <span className="font-mono">{new Date(formData.originalEta).toLocaleDateString()}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </AccordionSection>

              {/* ============================================ */}
              {/* RISK SECTION - SPREADSHEET STYLE (Conditional) */}
              {/* ============================================ */}
              {formData.status === Status.AtRisk && (
                <AccordionSection
                  title="Risk Documentation"
                  icon={<AlertTriangle size={16} />}
                  isExpanded={expandedSections.risk || true}
                  onToggle={() => toggleSection('risk')}
                  accentColor="amber"
                  badge={
                    errors.riskActionLog && (
                      <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full">
                        Required
                      </span>
                    )
                  }
                >
                  <div className="border border-red-300 rounded-md overflow-hidden text-sm">
                    <div className="grid grid-cols-[120px_1fr]">
                      <div className="bg-red-100 px-3 py-2 font-medium text-red-800 border-r border-red-200 flex items-start pt-3">
                        Risk Log <span className="text-red-600 ml-0.5">*</span>
                      </div>
                      <div className="bg-red-50">
                        <textarea
                          disabled={isReadOnly}
                          value={formData.riskActionLog || ''}
                          onChange={(e) => handleChange('riskActionLog', e.target.value)}
                          placeholder="Describe the risk and mitigation plan..."
                          rows={3}
                          className={`w-full px-3 py-2 text-sm focus:outline-none focus:bg-red-100/50 bg-transparent resize-none ${
                            errors.riskActionLog ? 'bg-red-100' : ''
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                  {errors.riskActionLog && <p className="text-red-600 text-xs mt-1 font-medium">{errors.riskActionLog}</p>}
                </AccordionSection>
              )}

              {/* ============================================ */}
              {/* TRADE-OFF SECTION - SPREADSHEET STYLE */}
              {/* ============================================ */}
              {!isReadOnly && (
                <AccordionSection
                  title="Trade-off Tracking (Optional)"
                  icon={<Scale size={16} />}
                  isExpanded={expandedSections.tradeoff}
                  onToggle={() => toggleSection('tradeoff')}
                  accentColor="indigo"
                >
                  <div className="border border-slate-300 rounded-md overflow-hidden text-sm">
                    {/* Enable Row */}
                    <div className="grid grid-cols-[120px_1fr] border-b border-slate-200">
                      <div className="bg-slate-100 px-3 py-2 font-medium text-slate-600 border-r border-slate-200 flex items-center">
                        Enable
                      </div>
                      <div className="bg-white px-3 py-2 flex items-center">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox"
                            checked={enableTradeOff}
                            onChange={(e) => setEnableTradeOff(e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-slate-600">Track impact on another initiative</span>
                        </label>
                      </div>
                    </div>
                    
                    {enableTradeOff && (
                      <>
                        {/* Target Initiative Row */}
                        <div className="grid grid-cols-[120px_1fr] border-b border-slate-200">
                          <div className="bg-slate-100 px-3 py-2 font-medium text-slate-600 border-r border-slate-200 flex items-center">
                            Initiative
                          </div>
                          <div className="bg-white">
                            <select
                              value={tradeOffData.targetInitiativeId || ''}
                              onChange={(e) => setTradeOffData(prev => ({ ...prev, targetInitiativeId: e.target.value }))}
                              className="w-full px-3 py-2 text-sm focus:outline-none focus:bg-blue-50"
                            >
                              <option value="">Select initiative to impact...</option>
                              {tradeOffCandidates.map(i => (
                                <option key={i.id} value={i.id}>{i.title} ({users.find(u => u.id === i.ownerId)?.name})</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Field & Value Row */}
                        <div className="grid grid-cols-[120px_1fr_120px_1fr]">
                          <div className="bg-slate-100 px-3 py-2 font-medium text-slate-600 border-r border-slate-200 flex items-center">
                            Field
                          </div>
                          <div className="bg-white border-r border-slate-200">
                            <select
                              value={tradeOffData.field || 'eta'}
                              onChange={(e) => setTradeOffData(prev => ({ ...prev, field: e.target.value as any }))}
                              className="w-full px-3 py-2 text-sm focus:outline-none focus:bg-blue-50"
                            >
                              <option value="eta">ETA</option>
                              <option value="status">Status</option>
                              <option value="priority">Priority</option>
                            </select>
                          </div>
                          <div className="bg-slate-100 px-3 py-2 font-medium text-slate-600 border-r border-slate-200 flex items-center">
                            New Value
                          </div>
                          <div className="bg-white">
                            {tradeOffData.field === 'eta' ? (
                              <input 
                                type="date"
                                value={tradeOffData.newValue || ''}
                                onChange={(e) => setTradeOffData(prev => ({ ...prev, newValue: e.target.value }))}
                                className="w-full px-3 py-2 text-sm focus:outline-none focus:bg-blue-50 font-mono"
                              />
                            ) : tradeOffData.field === 'status' ? (
                              <select
                                value={tradeOffData.newValue || ''}
                                onChange={(e) => setTradeOffData(prev => ({ ...prev, newValue: e.target.value }))}
                                className="w-full px-3 py-2 text-sm focus:outline-none focus:bg-blue-50"
                              >
                                <option value="">Select...</option>
                                {Object.values(Status).filter(s => s !== Status.Deleted).map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            ) : (
                              <select
                                value={tradeOffData.newValue || ''}
                                onChange={(e) => setTradeOffData(prev => ({ ...prev, newValue: e.target.value }))}
                                className="w-full px-3 py-2 text-sm focus:outline-none focus:bg-blue-50"
                              >
                                <option value="">Select...</option>
                                {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  {errors.tradeOffTarget && <p className="text-red-500 text-xs mt-1">{errors.tradeOffTarget}</p>}
                  {errors.tradeOffValue && <p className="text-red-500 text-xs mt-1">{errors.tradeOffValue}</p>}
                </AccordionSection>
              )}

              {/* ============================================ */}
              {/* TASKS SECTION - BAU ONLY */}
              {/* ============================================ */}
              {isBAU && (
                <AccordionSection
                  title="Tasks"
                  icon={<Layers size={16} />}
                  isExpanded={expandedSections.tasks}
                  onToggle={() => toggleSection('tasks')}
                  accentColor="purple"
                  badge={
                    tasks.length > 0 && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-600 text-xs font-bold rounded-full">
                        {tasks.length}
                      </span>
                    )
                  }
                >
                  <div className="space-y-3">
                    {errors.tasks && (
                      <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-600">
                        {errors.tasks}
                      </div>
                    )}
                    
                    {/* Task List */}
                    <div className="space-y-2">
                      {tasks.map((task, index) => (
                        <div key={task.id} className="border border-slate-300 rounded-lg overflow-hidden">
                          {/* Task Header - Collapsible */}
                          <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedTasks(prev => {
                                    const newSet = new Set(prev);
                                    if (newSet.has(task.id)) {
                                      newSet.delete(task.id);
                                    } else {
                                      newSet.add(task.id);
                                    }
                                    return newSet;
                                  });
                                }}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                {expandedTasks.has(task.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                              <span className="text-sm font-medium text-slate-700">
                                {task.title || `Task ${index + 1}`}
                              </span>
                              <span className="text-xs font-mono flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded">
                                <span className="text-blue-600 font-semibold">{task.estimatedEffort || 0}</span>
                                <span className="text-slate-400">/</span>
                                <span className="text-slate-600">{task.actualEffort || 0}</span>
                                <span className="text-slate-400">w</span>
                              </span>
                              {task.tags && task.tags.length > 0 && (
                                <div className="flex gap-1">
                                  {task.tags.map(tag => (
                                    <span key={tag} className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => duplicateTask(task.id)}
                                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                                title="Duplicate task"
                              >
                                <Copy size={16} />
                              </button>
                              {tasks.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => deleteTask(task.id)}
                                  className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                                  title="Delete task"
                                >
                                  <X size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                          
                          {/* Task Details */}
                          {expandedTasks.has(task.id) && (
                            <div className="bg-white p-4 space-y-4">
                              {/* Delete button at top of expanded section */}
                              {tasks.length > 1 && (
                                <div className="flex justify-end pb-3 border-b border-slate-200">
                                  <button
                                    type="button"
                                    onClick={() => deleteTask(task.id)}
                                    className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-md transition-colors flex items-center gap-1.5"
                                  >
                                    <X size={14} />
                                    Delete Task
                                  </button>
                                </div>
                              )}
                              
                              {/* Task Title */}
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Task Title (optional)</label>
                                <input
                                  type="text"
                                  value={task.title || ''}
                                  onChange={(e) => updateTask(task.id, 'title', e.target.value || undefined)}
                                  placeholder={`Task ${index + 1}`}
                                  className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-purple-300"
                                />
                              </div>
                              
                              {/* Effort (Planned/Actual) | ETA | Owner | Status */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {/* Planned Effort */}
                                <div>
                                  <label className="block text-xs font-medium text-blue-600 mb-1">
                                    Planned <span className="text-red-500">*</span>
                                  </label>
                                  <div className="flex items-center gap-0.5 bg-blue-50 rounded-lg px-1.5 py-1 border border-blue-200">
                                    <button
                                      type="button"
                                      onClick={() => updateTask(task.id, 'estimatedEffort', Math.max(0, Number(task.estimatedEffort || 0) - 0.25))}
                                      className="p-1 hover:bg-blue-100 rounded text-blue-500 hover:text-blue-700 transition-colors"
                                      title="Decrease planned by 0.25"
                                    >
                                      <ArrowDown size={14} />
                                    </button>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.25"
                                      value={task.estimatedEffort || 0}
                                      onChange={(e) => updateTask(task.id, 'estimatedEffort', parseFloat(e.target.value) || 0)}
                                      className={`w-14 px-1.5 py-1 text-sm font-mono border rounded focus:outline-none focus:ring-2 focus:ring-blue-300 text-center bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                        errors[`task_${task.id}_estimatedEffort`] ? 'border-red-500 bg-red-50' : 'border-blue-300'
                                      }`}
                                      placeholder="0"
                                      title="Planned effort"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => updateTask(task.id, 'estimatedEffort', Number(task.estimatedEffort || 0) + 0.25)}
                                      className="p-1 hover:bg-blue-100 rounded text-blue-500 hover:text-blue-700 transition-colors"
                                      title="Increase planned by 0.25"
                                    >
                                      <ArrowUp size={14} />
                                    </button>
                                    <span className="text-xs text-blue-500 ml-0.5">w</span>
                                  </div>
                                  {errors[`task_${task.id}_estimatedEffort`] && (
                                    <p className="text-red-500 text-xs mt-0.5">{errors[`task_${task.id}_estimatedEffort`]}</p>
                                  )}
                                </div>
                                {/* Actual Effort */}
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">
                                    Actual
                                  </label>
                                  <div className="flex items-center gap-0.5 bg-slate-50 rounded-lg px-1.5 py-1 border border-slate-200">
                                    <button
                                      type="button"
                                      onClick={() => updateTask(task.id, 'actualEffort', Math.max(0, Number(task.actualEffort || 0) - 0.25))}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-700 transition-colors"
                                      title="Decrease actual by 0.25"
                                    >
                                      <ArrowDown size={14} />
                                    </button>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.25"
                                      value={task.actualEffort || 0}
                                      onChange={(e) => updateTask(task.id, 'actualEffort', parseFloat(e.target.value) || 0)}
                                      className={`w-14 px-1.5 py-1 text-sm font-mono border rounded focus:outline-none focus:ring-2 focus:ring-slate-300 text-center bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                        errors[`task_${task.id}_actualEffort`] ? 'border-red-500 bg-red-50' : 'border-slate-300'
                                      }`}
                                      placeholder="0"
                                      title="Actual effort"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => updateTask(task.id, 'actualEffort', Number(task.actualEffort || 0) + 0.25)}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-700 transition-colors"
                                      title="Increase actual by 0.25"
                                    >
                                      <ArrowUp size={14} />
                                    </button>
                                    <span className="text-xs text-slate-400 ml-0.5">w</span>
                                  </div>
                                  {errors[`task_${task.id}_actualEffort`] && (
                                    <p className="text-red-500 text-xs mt-0.5">{errors[`task_${task.id}_actualEffort`]}</p>
                                  )}
                                </div>
                              </div>
                              
                              {/* ETA | Owner | Status - Second Row */}
                              <div className="grid grid-cols-3 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">
                                    ETA <span className="text-red-500">*</span>
                                  </label>
                                  <input
                                    type="date"
                                    value={task.eta || ''}
                                    onChange={(e) => updateTask(task.id, 'eta', e.target.value)}
                                    className={`w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-purple-300 ${
                                      errors[`task_${task.id}_eta`] ? 'border-red-500 bg-red-50' : 'border-slate-200'
                                    }`}
                                  />
                                  {errors[`task_${task.id}_eta`] && (
                                    <p className="text-red-500 text-xs mt-0.5">{errors[`task_${task.id}_eta`]}</p>
                                  )}
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">
                                    Owner <span className="text-red-500">*</span>
                                  </label>
                                  <select
                                    value={task.ownerId}
                                    onChange={(e) => updateTask(task.id, 'ownerId', e.target.value)}
                                    className={`w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-purple-300 ${
                                      errors[`task_${task.id}_owner`] ? 'border-red-500 bg-red-50' : 'border-slate-200'
                                    }`}
                                  >
                                    <option value="">Select...</option>
                                    {users.filter(u => u.role === Role.TeamLead).map(u => (
                                      <option key={u.id} value={u.id}>{u.name}</option>
                                    ))}
                                  </select>
                                  {errors[`task_${task.id}_owner`] && (
                                    <p className="text-red-500 text-xs mt-0.5">{errors[`task_${task.id}_owner`]}</p>
                                  )}
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">
                                    Status
                                  </label>
                                  <select
                                    value={task.status}
                                    onChange={(e) => updateTask(task.id, 'status', e.target.value)}
                                    className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-purple-300"
                                  >
                                    {Object.values(Status).filter(s => s !== Status.Deleted).map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </div>
                              </div>
                              
                              {/* Tags */}
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Tags</label>
                                <div className="flex gap-3">
                                  {[UnplannedTag.Unplanned, UnplannedTag.RiskItem, UnplannedTag.PMItem].map(tag => (
                                    <label key={tag} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={task.tags?.includes(tag) || false}
                                        onChange={(e) => {
                                          const currentTags = task.tags || [];
                                          const newTags = e.target.checked
                                            ? [...currentTags, tag]
                                            : currentTags.filter(t => t !== tag);
                                          updateTask(task.id, 'tags', newTags);
                                        }}
                                        className="rounded text-purple-600 focus:ring-purple-500"
                                      />
                                      <span>{tag}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                              
                              {/* Task Comments */}
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">Comments</label>
                                <div className="space-y-2 max-h-32 overflow-y-auto">
                                  {(task.comments || []).map(comment => {
                                    const author = users.find(u => u.id === comment.authorId);
                                    return (
                                      <div key={comment.id} className="bg-slate-50 p-2 rounded text-xs">
                                        <div className="flex justify-between mb-1">
                                          <span className="font-medium text-slate-700">{author?.name || 'Unknown'}</span>
                                          <span className="text-slate-400">{new Date(comment.timestamp).toLocaleDateString()}</span>
                                        </div>
                                        <p className="text-slate-600">{comment.text}</p>
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="mt-2 flex gap-2">
                                  <input
                                    type="text"
                                    placeholder="Add comment..."
                                    className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-purple-300"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                        const newComment = {
                                          id: generateId(),
                                          text: e.currentTarget.value,
                                          authorId: currentUser.id,
                                          timestamp: new Date().toISOString()
                                        };
                                        const updatedComments = [...(task.comments || []), newComment];
                                        updateTask(task.id, 'comments', updatedComments);
                                        e.currentTarget.value = '';
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    {/* Add Task Button */}
                    <button
                      type="button"
                      onClick={addTask}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                    >
                      <Plus size={16} />
                      Add Task
                    </button>
                  </div>
                </AccordionSection>
              )}
            </form>
          </div>
        )}

        {/* ================================================================ */}
        {/* BODY - COMMENTS TAB */}
        {/* ================================================================ */}
        {mode === 'single' && activeTab === 'comments' && (
          <div className="flex-1 flex flex-col p-6 min-h-[400px]">
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {(!formData.comments || formData.comments.length === 0) ? (
                <div className="text-center text-slate-400 py-10">No comments yet. Start the conversation!</div>
              ) : (
                formData.comments.map(comment => {
                  const author = users.find(u => u.id === comment.authorId);
                  const mentionedUsers = comment.mentionedUserIds 
                    ? getMentionedUsers(comment.text, users).filter(u => 
                        comment.mentionedUserIds?.includes(u.id)
                      )
                    : [];
                  
                  const formatCommentText = (text: string) => {
                    const parts: React.ReactNode[] = [];
                    let lastIndex = 0;
                    
                    const emailPattern = /@([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
                    const matches = Array.from(text.matchAll(emailPattern));
                    
                    for (const match of matches) {
                      const matchIndex = match.index || 0;
                      const matchLength = match[0].length;
                      const email = match[1];
                      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
                      
                      if (matchIndex > lastIndex) {
                        parts.push(text.substring(lastIndex, matchIndex));
                      }
                      
                      if (user) {
                        parts.push(
                          <span key={matchIndex} className="font-semibold text-blue-600 bg-blue-50 px-1 rounded">
                            @{user.name}
                          </span>
                        );
                      } else {
                        parts.push(match[0]);
                      }
                      
                      lastIndex = matchIndex + matchLength;
                    }
                    
                    if (lastIndex < text.length) {
                      parts.push(text.substring(lastIndex));
                    }
                    
                    return parts.length > 0 ? parts : text;
                  };
                  
                  return (
                    <div key={comment.id} className="flex gap-3">
                      <img src={author?.avatar} alt={author?.name} className="w-8 h-8 rounded-full bg-slate-200" />
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-sm text-slate-800">{author?.name || 'Unknown'}</span>
                          <span className="text-xs text-slate-400">{new Date(comment.timestamp).toLocaleDateString()}</span>
                        </div>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">
                          {formatCommentText(comment.text)}
                        </p>
                        {mentionedUsers.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {mentionedUsers.map(user => (
                              <span key={user.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                                @{user.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input 
                    ref={commentInputRef}
                    type="text" 
                    value={newComment}
                    onChange={handleCommentInputChange}
                    onKeyDown={handleCommentKeyDown}
                    placeholder="Type a comment... (@ to mention)"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  
                  {/* Mention Autocomplete Dropdown */}
                  {showMentionDropdown && filteredMentionUsers.length > 0 && (
                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-50">
                      <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                        <span className="text-xs text-slate-500 font-medium tracking-wider">Mention someone</span>
                      </div>
                      {filteredMentionUsers.map((user, index) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => insertMention(user)}
                          onMouseEnter={() => setSelectedMentionIndex(index)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                            index === selectedMentionIndex
                              ? 'bg-blue-50 text-blue-700'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-xs font-bold text-slate-600 border border-slate-300 flex-shrink-0">
                            {user.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{user.name}</div>
                            <div className="text-xs text-slate-400 truncate">{user.email}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button 
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                  className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-2 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send size={18} />
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Type @ to mention someone
              </p>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* BODY - HISTORY TAB */}
        {/* ================================================================ */}
        {mode === 'single' && activeTab === 'history' && (
          <div className="flex-1 flex flex-col p-6 min-h-[400px]">
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {(!formData.history || formData.history.length === 0) ? (
                <div className="text-center text-slate-400 py-10">No change history recorded yet.</div>
              ) : (
                [...(formData.history || [])]
                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                  .map(change => (
                    <div key={change.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                        <History size={16} className="text-slate-500" />
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-sm text-slate-800">{change.field}</span>
                          <span className="text-xs text-slate-400">{new Date(change.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          <span className="text-red-600 line-through">{String(change.oldValue ?? 'N/A')}</span>
                          <span className="text-slate-400">→</span>
                          <span className="text-emerald-600 font-medium">{String(change.newValue ?? 'N/A')}</span>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          Changed by: <span className="font-medium">{change.changedBy}</span>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* BODY - BULK MODE */}
        {/* ================================================================ */}
        {mode === 'bulk' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {/* Shared Settings */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <Users size={16} className="text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">Shared Settings (applies to all)</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Quarter</label>
                  <select
                    value={bulkSharedSettings.quarter}
                    onChange={(e) => setBulkSharedSettings(prev => ({ ...prev, quarter: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Asset Class</label>
                  <select
                    value={bulkSharedSettings.l1_assetClass}
                    onChange={(e) => setBulkSharedSettings(prev => ({ ...prev, l1_assetClass: e.target.value as AssetClass }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.values(AssetClass).map(ac => <option key={ac} value={ac}>{ac}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Bulk Table */}
            <div className="p-4">
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {/* Table Header */}
                <div className="bg-slate-100 border-b border-slate-200">
                  <div className="grid grid-cols-[2fr_120px_70px_90px_110px_70px_50px] gap-2 px-3 py-2 text-xs font-semibold text-slate-600">
                    <div>Title *</div>
                    <div>Owner *</div>
                    <div>Priority</div>
                    <div>Status</div>
                    <div>ETA *</div>
                    <div>Effort</div>
                    <div></div>
                  </div>
                </div>

                {/* Table Rows */}
                <div className="divide-y divide-slate-100">
                  {bulkRows.map((row, index) => (
                    <div key={row.id}>
                      {/* Main Row */}
                      <div className="grid grid-cols-[2fr_120px_70px_90px_110px_70px_50px] gap-2 px-3 py-2 items-center hover:bg-slate-50">
                        <div>
                          <input
                            type="text"
                            value={row.title}
                            onChange={(e) => handleBulkRowChange(row.id, 'title', e.target.value)}
                            placeholder={`Initiative ${index + 1}...`}
                            className={`w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              bulkErrors[row.id]?.title ? 'border-red-500 bg-red-50' : 'border-slate-200'
                            }`}
                          />
                        </div>
                        <div>
                          <select
                            value={row.ownerId}
                            onChange={(e) => handleBulkRowChange(row.id, 'ownerId', e.target.value)}
                            className={`w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              bulkErrors[row.id]?.ownerId ? 'border-red-500 bg-red-50' : 'border-slate-200'
                            }`}
                          >
                            <option value="">Select...</option>
                            {users.filter(u => u.role === Role.TeamLead).map(u => (
                              <option key={u.id} value={u.id}>{u.name.split(' ')[0]}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <select
                            value={row.priority}
                            onChange={(e) => handleBulkRowChange(row.id, 'priority', e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div>
                          <select
                            value={row.status}
                            onChange={(e) => handleBulkRowChange(row.id, 'status', e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {Object.values(Status).filter(s => s !== Status.Deleted).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <input
                            type="date"
                            value={row.eta || ''}
                            onChange={(e) => handleBulkRowChange(row.id, 'eta', e.target.value)}
                            className={`w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              bulkErrors[row.id]?.eta ? 'border-red-500 bg-red-50' : 'border-slate-200'
                            }`}
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleBulkRowChange(row.id, 'estimatedEffort', Math.max(0, row.estimatedEffort - 0.25))}
                              className="p-1 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-colors"
                              title="Decrease by 0.25"
                            >
                              <ArrowDown size={12} />
                            </button>
                            <input
                              type="number"
                              min="0"
                              step="0.25"
                              value={row.estimatedEffort}
                              onChange={(e) => handleBulkRowChange(row.id, 'estimatedEffort', parseFloat(e.target.value) || 0)}
                              className={`flex-1 rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                bulkErrors[row.id]?.estimatedEffort ? 'border-red-500 bg-red-50' : 'border-slate-200'
                              }`}
                            />
                            <button
                              onClick={() => handleBulkRowChange(row.id, 'estimatedEffort', row.estimatedEffort + 0.25)}
                              className="p-1 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-colors"
                              title="Increase by 0.25"
                            >
                              <ArrowUp size={12} />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {/* Trade-off indicator badge */}
                          {row.hasTradeOff && row.tradeOffTargetId && (
                            <span 
                              className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center"
                              title="Has trade-off"
                            >
                              <Scale size={10} />
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleRowExpanded(row.id)}
                            className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600"
                            title="Expand row"
                          >
                            {row.isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                          <div className="relative group">
                            <button
                              type="button"
                              className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600"
                            >
                              <MoreVertical size={14} />
                            </button>
                            <div className="absolute right-0 top-full mt-1 w-32 bg-white rounded-lg shadow-lg border border-slate-200 z-10 hidden group-hover:block">
                              <button
                                onClick={() => duplicateBulkRow(row.id)}
                                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                              >
                                Duplicate
                              </button>
                              {bulkRows.length > 1 && (
                                <button
                                  onClick={() => removeBulkRow(row.id)}
                                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Row */}
                      {row.isExpanded && (
                        <div className="bg-slate-50 px-3 py-3 border-t border-slate-100 space-y-3">
                          {/* Hierarchy Fields */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">L2 Pillar</label>
                              <select
                                value={row.l2_pillar}
                                onChange={(e) => {
                                  const newPillar = e.target.value;
                                  const pillarNode = HIERARCHY[bulkSharedSettings.l1_assetClass].find(p => p.name === newPillar);
                                  handleBulkRowChange(row.id, 'l2_pillar', newPillar);
                                  handleBulkRowChange(row.id, 'l3_responsibility', pillarNode?.responsibilities[0] || '');
                                }}
                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                {HIERARCHY[bulkSharedSettings.l1_assetClass].map(p => (
                                  <option key={p.name} value={p.name}>{p.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">L3 Responsibility</label>
                              <select
                                value={row.l3_responsibility}
                                onChange={(e) => handleBulkRowChange(row.id, 'l3_responsibility', e.target.value)}
                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                {(HIERARCHY[bulkSharedSettings.l1_assetClass].find(p => p.name === row.l2_pillar)?.responsibilities || []).map(r => (
                                  <option key={r} value={r}>{r}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">L4 Target</label>
                              <input
                                type="text"
                                value={row.l4_target}
                                onChange={(e) => handleBulkRowChange(row.id, 'l4_target', e.target.value)}
                                placeholder="e.g. Identify constraints"
                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">Secondary Owner</label>
                              <input
                                type="text"
                                value={row.secondaryOwner}
                                onChange={(e) => handleBulkRowChange(row.id, 'secondaryOwner', e.target.value)}
                                placeholder="e.g. Stakeholder"
                                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          </div>

                          {/* Trade-off Section */}
                          <div className={`border rounded-lg p-3 transition-colors ${
                            row.hasTradeOff ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-white'
                          }`}>
                            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={row.hasTradeOff}
                                onChange={(e) => handleBulkRowChange(row.id, 'hasTradeOff', e.target.checked)}
                                className="rounded text-indigo-600 focus:ring-indigo-500"
                              />
                              <Scale size={12} className="text-indigo-500" />
                              <span>This initiative impacts another</span>
                            </label>

                            {row.hasTradeOff && (
                              <div className="mt-3 grid grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Impacted Initiative</label>
                                  <select
                                    value={row.tradeOffTargetId}
                                    onChange={(e) => handleBulkRowChange(row.id, 'tradeOffTargetId', e.target.value)}
                                    className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  >
                                    <option value="">Select...</option>
                                    {tradeOffCandidates.map(i => (
                                      <option key={i.id} value={i.id}>
                                        {i.title.length > 30 ? i.title.substring(0, 30) + '...' : i.title}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">Field</label>
                                  <select
                                    value={row.tradeOffField}
                                    onChange={(e) => {
                                      handleBulkRowChange(row.id, 'tradeOffField', e.target.value);
                                      handleBulkRowChange(row.id, 'tradeOffValue', ''); // Reset value when field changes
                                    }}
                                    className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  >
                                    <option value="eta">ETA</option>
                                    <option value="status">Status</option>
                                    <option value="priority">Priority</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-600 mb-1">New Value</label>
                                  {row.tradeOffField === 'eta' ? (
                                    <input
                                      type="date"
                                      value={row.tradeOffValue || ''}
                                      onChange={(e) => handleBulkRowChange(row.id, 'tradeOffValue', e.target.value)}
                                      className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                  ) : row.tradeOffField === 'status' ? (
                                    <select
                                      value={row.tradeOffValue}
                                      onChange={(e) => handleBulkRowChange(row.id, 'tradeOffValue', e.target.value)}
                                      className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                      <option value="">Select...</option>
                                      {Object.values(Status).filter(s => s !== Status.Deleted).map(s => (
                                        <option key={s} value={s}>{s}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <select
                                      value={row.tradeOffValue}
                                      onChange={(e) => handleBulkRowChange(row.id, 'tradeOffValue', e.target.value)}
                                      className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                      <option value="">Select...</option>
                                      {Object.values(Priority).map(p => (
                                        <option key={p} value={p}>{p}</option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Row Button */}
                <div className="px-4 py-3 border-t border-slate-200 bg-slate-50">
                  <button
                    type="button"
                    onClick={addBulkRow}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Plus size={16} />
                    Add Row
                  </button>
                </div>
              </div>

              <p className="text-xs text-slate-500 mt-3">
                Click the chevron to expand each row for additional fields (Pillar, Target, Trade-off tracking)
              </p>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* FOOTER */}
        {/* ================================================================ */}
        <div className="flex justify-between items-center gap-3 px-6 py-4 border-t border-slate-200 bg-gradient-to-t from-slate-50 to-white">
          <div className="text-sm text-slate-500">
            {mode === 'bulk' && (
              <div className="flex items-center gap-3">
                <span>{validBulkRowsCount} of {bulkRows.length} rows ready</span>
                {tradeOffRowsCount > 0 && (
                  <span className="flex items-center gap-1 text-indigo-600">
                    <Scale size={12} />
                    {tradeOffRowsCount} trade-off{tradeOffRowsCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button 
              type="button" 
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all border border-slate-200"
            >
              Cancel
            </button>
            {!isReadOnly && (
              mode === 'single' ? (
                activeTab === 'details' && (
                  <button 
                    type="button"
                    onClick={handleSubmit} 
                    className="px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-xl shadow-md hover:shadow-lg transition-all"
                  >
                    Save Initiative
                  </button>
                )
              ) : (
                <button 
                  type="button"
                  onClick={handleBulkSubmit} 
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-xl shadow-md hover:shadow-lg transition-all"
                >
                  Save All ({validBulkRowsCount})
                </button>
              )
            )}
          </div>
        </div>
        </div>
      </div>
    </>
  );
};

export default InitiativeModal;
