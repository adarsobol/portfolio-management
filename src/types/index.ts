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
export type InitiativeFieldValue = string | number | boolean | Status | Priority | WorkType | UnplannedTag[] | DependencyTeam[] | Dependency[] | string[] | undefined;

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

export enum Status {
  NotStarted = 'Not Started',
  InProgress = 'In Progress',
  AtRisk = 'At Risk',
  Done = 'Done'
}

export enum Priority {
  P0 = 'P0',
  P1 = 'P1',
  P2 = 'P2'
}

export enum UnplannedTag {
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
  
  // Effort Metrics
  estimatedEffort: number; // Current Plan (Staff Weeks)
  originalEstimatedEffort: number; // Baseline Plan (Staff Weeks)
  actualEffort: number; // Consumed (Staff Weeks)
  
  // Time Metrics
  eta: string; // Current ETA (ISO Date String)
  originalEta: string; // Baseline ETA (ISO Date String)
  lastUpdated: string; // ISO Date String
  
  // External Team Dependencies
  dependencies?: Dependency[]; // External team dependencies with deliverable and ETA
  
  // Workflow specifics
  workType: WorkType;
  unplannedTags?: UnplannedTag[]; // Only for Unplanned
  riskActionLog?: string; // Mandatory if Delayed or At Risk
  comments?: Comment[];
  
  // Completion tracking
  completionRate?: number; // Percentage (0-100)
  
  // Audit Trail (Local history, though global log exists too)
  history?: ChangeRecord[];
}

export type PermissionKey = 
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

export interface AppConfig {
  bauBufferSuggestion: number; // Percentage
  teamCapacities: Record<string, number>; // ownerId -> capacity (weeks)
  teamBuffers: Record<string, number>; // ownerId -> buffer weeks (reserved for BAU/unplanned)
  rolePermissions: Record<Role, Record<PermissionKey, boolean>>;
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
