// Data Hierarchy & Enums

// View types for navigation
export type ViewType = 'all' | 'resources' | 'timeline' | 'admin' | 'workflows' | 'dependencies';

// Dependency teams for cross-team dependencies
export enum DependencyTeam {
  RMResearch = 'R&M - Research',
  RMData = 'R&M - Data',
  RMInfra = 'R&M - Infra',
  Product = 'Product',
  CapitalMarkets = 'Capital Markets',
  Partnerships = 'Partnerships'
}

// Value types that can be stored in change records
export type InitiativeFieldValue = string | number | boolean | Status | Priority | WorkType | InitiativeType | UnplannedTag[] | DependencyTeam[] | Dependency[] | Task[] | string[] | undefined | null;

export enum Role {
  Admin = 'Admin',
  SVP = 'SVP',
  VP = 'VP',
  DirectorDepartment = 'Director (Department Management)',
  DirectorGroup = 'Director (Group Lead)',
  TeamLead = 'Team Lead',
  PortfolioOps = 'Portfolio Operations'
}

export enum WorkType {
  Planned = 'Planned Work',
  Unplanned = 'Unplanned Work'
}

export enum InitiativeType {
  WP = 'WP',
  BAU = 'BAU'
}

export enum Status {
  NotStarted = 'Not Started',
  InProgress = 'In Progress',
  AtRisk = 'At Risk',
  Done = 'Done',
  Obsolete = 'Obsolete'
}

export enum Priority {
  P0 = 'P0',
  P1 = 'P1',
  P2 = 'P2'
}

export enum UnplannedTag {
  Unplanned = 'Unplanned',
  RiskItem = 'Risk Item',
  PMItem = 'PM Item',
  Both = 'Both'
}

export enum AssetClass {
  PL = 'PL',
  Auto = 'Auto',
  POS = 'POS',
  Advisory = 'Advisory'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar: string;
  team?: string; // Team/department assignment
}

export interface Comment {
  id: string;
  text: string;
  authorId: string;
  timestamp: string; // ISO String
  mentionedUserIds?: string[]; // Array of user IDs mentioned in the comment
}

export interface Task {
  id: string;
  title?: string; // Optional title for display
  estimatedEffort?: number; // Planned effort in weeks (defaults to 0)
  actualEffort?: number; // Actual effort consumed in weeks (defaults to 0)
  eta: string; // ISO date string
  ownerId: string; // Team Lead ID
  status: Status; // NotStarted/InProgress/Done
  tags?: UnplannedTag[]; // PM Item, Risk Item, Both
  comments?: Comment[];
}

export interface Dependency {
  team: DependencyTeam;
  deliverable: string; // What deliverable is required from the team
  eta: string; // ETA for the dependency deliverable (ISO Date String)
}

export interface ChangeRecord {
  id: string;
  initiativeId: string;
  initiativeTitle: string;
  field: string;
  oldValue: InitiativeFieldValue;
  newValue: InitiativeFieldValue;
  changedBy: string; // User Name
  timestamp: string; // ISO String
}

// Interface for the Trade Off action from the modal
export interface TradeOffAction {
  targetInitiativeId: string;
  field: 'status' | 'eta' | 'priority';
  newValue: string;
}

// The Flattened Initiative Model (Contains L1-L4 references)
export interface Initiative {
  id: string;
  // Initiative Type (required, defaults to WP)
  initiativeType: InitiativeType; // WP or BAU
  
  // L1-L4 Hierarchy
  l1_assetClass: AssetClass;
  l2_pillar: string;
  l3_responsibility: string;
  l4_target: string;
  
  // L5 Initiative Details
  title: string;
  ownerId: string; // Links to a User (Team Lead)
  secondaryOwner?: string; // Open text for stakeholder/support
  quarter: string; // e.g., "Q4 2024"
  status: Status;
  priority: Priority;
  
  // Effort Metrics (optional, default to 0)
  estimatedEffort?: number; // Current Plan (Staff Weeks), defaults to 0
  actualEffort?: number; // Consumed (Staff Weeks), defaults to 0
  originalEstimatedEffort?: number; // Baseline Plan (Staff Weeks), only tracked when changed
  
  // Time Metrics
  eta?: string; // Current ETA (ISO Date String)
  originalEta?: string; // Baseline ETA (ISO Date String), only tracked when changed
  lastUpdated: string; // ISO Date String
  lastWeeklyUpdate?: string; // Last Thursday EoD update (ISO Date String) for weekly routine tracking
  
  // External Team Dependencies
  dependencies?: Dependency[]; // External team dependencies with deliverable and ETA
  
  // Workflow specifics
  workType: WorkType;
  unplannedTags?: UnplannedTag[]; // Only for Unplanned
  riskActionLog?: string; // Mandatory if Delayed or At Risk
  definitionOfDone?: string; // Definition of Done criteria (required for WP)
  comments?: Comment[];
  
  // BAU-specific: Tasks (only for BAU initiatives, required for BAU)
  tasks?: Task[];
  
  // Audit Trail (Local history, though global log exists too)
  history?: ChangeRecord[];
  
  // Overlooked Items Tracking
  overlookedCount?: number; // Number of times ETA has been pushed back
  lastDelayDate?: string; // Date of last ETA delay (ISO Date String)
  
  // Removed: completionRate - calculate from actualEffort / estimatedEffort when needed
}

// Legacy permission keys (for backward compatibility)
export type LegacyPermissionKey = 
  | 'createPlanned'
  | 'createUnplanned'
  | 'editOwn'
  | 'editAll'
  | 'editUnplanned'
  | 'accessAdmin'
  | 'accessWorkplanHealth'
  | 'manageCapacity'
  | 'manageWorkflows'
  | 'createWorkflows';

// Tab/View access levels (edit includes full access)
export type TabAccessLevel = 'none' | 'view' | 'edit';

// Task management scope levels
export type TaskManagementScope = 'no' | 'yes' | 'own';

// New permission structure
export type PermissionKey = 
  // Tab/View access permissions (dropdown: none, view, edit, full)
  | 'accessAllTasks'           // All Tasks tab access
  | 'accessDependencies'      // Dependencies tab access
  | 'accessTimeline'          // Timeline tab access
  | 'accessWorkflows'         // Workflows tab access
  | 'accessWorkplanHealth'    // Workplan Health tab access
  // Task management permissions
  | 'createNewTasks'          // Create new tasks scope: no | yes | own
  | 'editTasks'               // Edit tasks scope: no | yes | own
  | 'deleteTasks'             // Delete tasks scope: no | yes | own
  // Admin and workflows (boolean: yes/no)
  | 'accessAdmin'             // Admin access
  | 'manageWorkflows';        // Manage workflows (add/edit/delete)

// Permission value can be TabAccessLevel for tab permissions or TaskManagementScope for task management
export type PermissionValue = TabAccessLevel | TaskManagementScope;

export interface AppConfig {
  bauBufferSuggestion: number; // Percentage
  teamCapacities: Record<string, number>; // ownerId -> capacity (weeks)
  teamBuffers: Record<string, number>; // ownerId -> buffer weeks (reserved for BAU/unplanned)
  // Support both old and new permission structures for migration
  rolePermissions: Record<Role, Record<PermissionKey, PermissionValue>>;
  // Legacy permissions for backward compatibility (will be migrated)
  legacyRolePermissions?: Record<Role, Record<LegacyPermissionKey, boolean>>;
  slack?: {
    webhookUrl?: string;
    enabled: boolean;
  };
  workflows?: Workflow[];
  healthHistory?: HealthSnapshot[]; // Weekly health score snapshots for trend tracking
}

export interface Snapshot {
  id: string;
  name: string;
  timestamp: string;
  data: Initiative[];
  config: AppConfig;
  createdBy: string;
}

// Health Score History for trend tracking
export interface HealthSnapshot {
  id: string;
  date: string; // ISO date string
  healthScore: number;
  scheduleScore: number;
  effortScore: number;
  riskScore: number;
  complianceScore: number;
  initiativeCount: number;
  atRiskCount: number;
  completedCount: number;
  totalEffort: number;
  bufferUsed: number;
  bufferTotal: number;
}

// Workflow Types
export enum WorkflowTrigger {
  OnSchedule = 'on_schedule',
  OnFieldChange = 'on_field_change',
  OnStatusChange = 'on_status_change',
  OnEtaChange = 'on_eta_change',
  OnEffortChange = 'on_effort_change',
  OnConditionMet = 'on_condition_met',
}

export enum WorkflowCondition {
  DueDatePassed = 'due_date_passed',
  DueDateWithinDays = 'due_date_within_days',
  LastUpdatedOlderThan = 'last_updated_older_than',
  StatusEquals = 'status_equals',
  StatusNotEquals = 'status_not_equals',
  ActualEffortGreaterThan = 'actual_effort_greater_than',
  ActualEffortPercentageOfEstimated = 'actual_effort_percentage',
  EffortVarianceExceeds = 'effort_variance_exceeds',
  PriorityEquals = 'priority_equals',
  RiskActionLogEmpty = 'risk_action_log_empty',
  OwnerEquals = 'owner_equals',
  AssetClassEquals = 'asset_class_equals',
  IsAtRisk = 'is_at_risk',
  And = 'and',
  Or = 'or',
}

export enum WorkflowAction {
  SetStatus = 'set_status',
  TransitionStatus = 'transition_status',
  SetPriority = 'set_priority',
  RequireRiskActionLog = 'require_risk_action_log',
  SetAtRisk = 'set_at_risk',
  NotifyOwner = 'notify_owner',
  NotifySlackChannel = 'notify_slack',
  CreateComment = 'create_comment',
  UpdateEta = 'update_eta',
  UpdateEffort = 'update_effort',
  ExecuteMultiple = 'execute_multiple',
}

export interface WorkflowConditionConfig {
  type: WorkflowCondition;
  field?: string;
  value?: any;
  days?: number;
  percentage?: number;
  children?: WorkflowConditionConfig[];
}

export interface WorkflowActionConfig {
  type: WorkflowAction;
  value?: any;
  channel?: string;
  message?: string;
  actions?: WorkflowActionConfig[];
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  trigger: WorkflowTrigger;
  triggerConfig?: {
    schedule?: 'daily' | 'weekly' | 'hourly';
    fields?: string[];
    time?: string; // e.g., "09:00"
  };
  condition?: WorkflowConditionConfig;
  action: WorkflowActionConfig;
  scope?: {
    assetClasses?: AssetClass[];
    workTypes?: WorkType[];
    owners?: string[];
  };
  createdBy: string;
  createdAt: string;
  lastRun?: string;
  runCount: number;
  executionLog?: WorkflowExecutionLog[];
  system?: boolean; // True for system rules, false/undefined for custom workflows
  readOnly?: boolean; // True for system rules that cannot be edited/deleted
}

export interface WorkflowExecutionLog {
  id: string;
  workflowId: string;
  timestamp: string;
  initiativesAffected: string[];
  actionsTaken: string[];
  errors?: string[];
}

// Notification Types
export enum NotificationType {
  Delay = 'delay',
  FieldChange = 'field_change',
  StatusChange = 'status_change',
  Mention = 'mention',
  AtRisk = 'at_risk',
  EtaChange = 'eta_change',
  EffortChange = 'effort_change',
  NewComment = 'new_comment',
  WeeklyUpdateReminder = 'weekly_update_reminder',
  OverlookedItem = 'overlooked_item',
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  initiativeId: string;
  initiativeTitle: string;
  timestamp: string; // ISO String
  read: boolean;
  userId?: string; // If notification is user-specific (e.g., mentions)
  metadata?: Record<string, any>; // Additional data (e.g., field name, old/new values, ownerId for owner notifications)
}

// Track when user last viewed comments on each initiative
export interface UserCommentReadState {
  [initiativeId: string]: string; // ISO timestamp of last view
}
