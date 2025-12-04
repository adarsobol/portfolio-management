
// Data Hierarchy & Enums

export enum Role {
  Admin = 'Admin',
  TeamLead = 'Team Lead',
  GroupLead = 'Group Lead (Director)',
  PortfolioOps = 'Portfolio Ops',
  VP = 'VP'
}

export enum WorkType {
  Planned = 'Planned Work',
  Unplanned = 'Unplanned Work'
}

export enum Status {
  Planned = 'Planned',
  InProgress = 'In Progress',
  Delayed = 'Delayed',
  Complete = 'Complete'
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
}

export interface Comment {
  id: string;
  text: string;
  authorId: string;
  timestamp: string; // ISO String
}

export interface ChangeRecord {
  id: string;
  initiativeId: string;
  initiativeTitle: string;
  field: string;
  oldValue: any;
  newValue: any;
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
  
  dependencies?: string;
  
  // Workflow specifics
  workType: WorkType;
  unplannedTags?: UnplannedTag[]; // Only for Unplanned
  riskActionLog?: string; // Mandatory if Delayed or At Risk
  isAtRisk: boolean; // Manual toggle for "At Risk" even if not delayed
  comments?: Comment[];
  
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
  | 'manageCapacity';

export interface AppConfig {
  bauBufferSuggestion: number; // Percentage
  teamCapacities: Record<string, number>; // ownerId -> capacity (weeks)
  rolePermissions: Record<Role, Record<PermissionKey, boolean>>;
}

export interface Snapshot {
  id: string;
  name: string;
  timestamp: string;
  data: Initiative[];
  config: AppConfig;
  createdBy: string;
}
