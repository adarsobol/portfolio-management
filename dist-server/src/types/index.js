// Data Hierarchy & Enums
// Dependency teams for cross-team dependencies
export var DependencyTeam;
(function (DependencyTeam) {
    DependencyTeam["RMResearch"] = "R&M - Research";
    DependencyTeam["RMData"] = "R&M - Data";
    DependencyTeam["RMInfra"] = "R&M - Infra";
    DependencyTeam["Product"] = "Product";
    DependencyTeam["CapitalMarkets"] = "Capital Markets";
    DependencyTeam["Partnerships"] = "Partnerships";
})(DependencyTeam || (DependencyTeam = {}));
export var Role;
(function (Role) {
    Role["Admin"] = "Admin";
    Role["SVP"] = "SVP";
    Role["VP"] = "VP";
    Role["DirectorDepartment"] = "Director (Department Management)";
    Role["DirectorGroup"] = "Director (Group Lead)";
    Role["TeamLead"] = "Team Lead";
    Role["PortfolioOps"] = "Portfolio Operations";
})(Role || (Role = {}));
export var WorkType;
(function (WorkType) {
    WorkType["Planned"] = "Planned Work";
    WorkType["Unplanned"] = "Unplanned Work";
})(WorkType || (WorkType = {}));
export var InitiativeType;
(function (InitiativeType) {
    InitiativeType["WP"] = "WP";
    InitiativeType["BAU"] = "BAU";
})(InitiativeType || (InitiativeType = {}));
export var Status;
(function (Status) {
    Status["NotStarted"] = "Not Started";
    Status["InProgress"] = "In Progress";
    Status["AtRisk"] = "At Risk";
    Status["Done"] = "Done";
    Status["Obsolete"] = "Obsolete";
    Status["Deleted"] = "Deleted";
})(Status || (Status = {}));
export var Priority;
(function (Priority) {
    Priority["P0"] = "P0";
    Priority["P1"] = "P1";
    Priority["P2"] = "P2";
})(Priority || (Priority = {}));
export var UnplannedTag;
(function (UnplannedTag) {
    UnplannedTag["Unplanned"] = "Unplanned";
    UnplannedTag["RiskItem"] = "Risk Item";
    UnplannedTag["PMItem"] = "PM Item";
    UnplannedTag["Both"] = "Both";
})(UnplannedTag || (UnplannedTag = {}));
export var AssetClass;
(function (AssetClass) {
    AssetClass["PL"] = "PL";
    AssetClass["Auto"] = "Auto";
    AssetClass["POS"] = "POS";
    AssetClass["Advisory"] = "Advisory";
    AssetClass["Production"] = "Production";
})(AssetClass || (AssetClass = {}));
// Workflow Types
export var WorkflowTrigger;
(function (WorkflowTrigger) {
    WorkflowTrigger["OnSchedule"] = "on_schedule";
    WorkflowTrigger["OnFieldChange"] = "on_field_change";
    WorkflowTrigger["OnStatusChange"] = "on_status_change";
    WorkflowTrigger["OnEtaChange"] = "on_eta_change";
    WorkflowTrigger["OnEffortChange"] = "on_effort_change";
    WorkflowTrigger["OnConditionMet"] = "on_condition_met";
    WorkflowTrigger["OnCreate"] = "on_create";
})(WorkflowTrigger || (WorkflowTrigger = {}));
export var WorkflowCondition;
(function (WorkflowCondition) {
    WorkflowCondition["DueDatePassed"] = "due_date_passed";
    WorkflowCondition["DueDateWithinDays"] = "due_date_within_days";
    WorkflowCondition["LastUpdatedOlderThan"] = "last_updated_older_than";
    WorkflowCondition["StatusEquals"] = "status_equals";
    WorkflowCondition["StatusNotEquals"] = "status_not_equals";
    WorkflowCondition["ActualEffortGreaterThan"] = "actual_effort_greater_than";
    WorkflowCondition["ActualEffortPercentageOfEstimated"] = "actual_effort_percentage";
    WorkflowCondition["EffortVarianceExceeds"] = "effort_variance_exceeds";
    WorkflowCondition["PriorityEquals"] = "priority_equals";
    WorkflowCondition["RiskActionLogEmpty"] = "risk_action_log_empty";
    WorkflowCondition["OwnerEquals"] = "owner_equals";
    WorkflowCondition["AssetClassEquals"] = "asset_class_equals";
    WorkflowCondition["IsAtRisk"] = "is_at_risk";
    WorkflowCondition["And"] = "and";
    WorkflowCondition["Or"] = "or";
})(WorkflowCondition || (WorkflowCondition = {}));
export var WorkflowAction;
(function (WorkflowAction) {
    WorkflowAction["SetStatus"] = "set_status";
    WorkflowAction["TransitionStatus"] = "transition_status";
    WorkflowAction["SetPriority"] = "set_priority";
    WorkflowAction["RequireRiskActionLog"] = "require_risk_action_log";
    WorkflowAction["SetAtRisk"] = "set_at_risk";
    WorkflowAction["NotifyOwner"] = "notify_owner";
    WorkflowAction["NotifySlackChannel"] = "notify_slack";
    WorkflowAction["CreateComment"] = "create_comment";
    WorkflowAction["UpdateEta"] = "update_eta";
    WorkflowAction["UpdateEffort"] = "update_effort";
    WorkflowAction["ExecuteMultiple"] = "execute_multiple";
    WorkflowAction["SetAssetClass"] = "set_asset_class";
})(WorkflowAction || (WorkflowAction = {}));
// Notification Types
export var NotificationType;
(function (NotificationType) {
    NotificationType["Delay"] = "delay";
    NotificationType["FieldChange"] = "field_change";
    NotificationType["StatusChange"] = "status_change";
    NotificationType["Mention"] = "mention";
    NotificationType["AtRisk"] = "at_risk";
    NotificationType["EtaChange"] = "eta_change";
    NotificationType["EffortChange"] = "effort_change";
    NotificationType["NewComment"] = "new_comment";
    NotificationType["WeeklyUpdateReminder"] = "weekly_update_reminder";
    NotificationType["OverlookedItem"] = "overlooked_item";
    NotificationType["WeeklyEffortExceeded"] = "weekly_effort_exceeded";
    NotificationType["EffortExceeded"] = "effort_exceeded";
    // Support ticket notifications
    NotificationType["SupportTicketNew"] = "support_ticket_new";
    NotificationType["SupportTicketReply"] = "support_ticket_reply";
    NotificationType["SupportTicketStatusChange"] = "support_ticket_status_change";
})(NotificationType || (NotificationType = {}));
// ============================================
// ERROR LOGGING & ACTIVITY LOGGING TYPES
// ============================================
export var LogSeverity;
(function (LogSeverity) {
    LogSeverity["DEBUG"] = "debug";
    LogSeverity["INFO"] = "info";
    LogSeverity["WARN"] = "warn";
    LogSeverity["ERROR"] = "error";
    LogSeverity["CRITICAL"] = "critical";
})(LogSeverity || (LogSeverity = {}));
export var LogCategory;
(function (LogCategory) {
    LogCategory["ERROR"] = "error";
    LogCategory["ACTIVITY"] = "activity";
    LogCategory["PERFORMANCE"] = "performance";
    LogCategory["SECURITY"] = "security";
    LogCategory["SYSTEM"] = "system";
})(LogCategory || (LogCategory = {}));
export var ActivityType;
(function (ActivityType) {
    ActivityType["LOGIN"] = "login";
    ActivityType["LOGOUT"] = "logout";
    ActivityType["CREATE_INITIATIVE"] = "create_initiative";
    ActivityType["UPDATE_INITIATIVE"] = "update_initiative";
    ActivityType["DELETE_INITIATIVE"] = "delete_initiative";
    ActivityType["CREATE_TASK"] = "create_task";
    ActivityType["UPDATE_TASK"] = "update_task";
    ActivityType["DELETE_TASK"] = "delete_task";
    ActivityType["EXPORT_DATA"] = "export_data";
    ActivityType["VIEW_CHANGE"] = "view_change";
    ActivityType["FILTER_CHANGE"] = "filter_change";
    ActivityType["SEARCH"] = "search";
    ActivityType["PERMISSION_CHANGE"] = "permission_change";
    ActivityType["CONFIG_CHANGE"] = "config_change";
    ActivityType["BACKUP_CREATE"] = "backup_create";
    ActivityType["BACKUP_RESTORE"] = "backup_restore";
    ActivityType["SNAPSHOT_CREATE"] = "snapshot_create";
    ActivityType["USER_CREATE"] = "user_create";
    ActivityType["USER_UPDATE"] = "user_update";
    ActivityType["USER_DELETE"] = "user_delete";
})(ActivityType || (ActivityType = {}));
// ============================================
// SUPPORT & FEEDBACK TYPES
// ============================================
export var SupportTicketStatus;
(function (SupportTicketStatus) {
    SupportTicketStatus["OPEN"] = "open";
    SupportTicketStatus["IN_PROGRESS"] = "in_progress";
    SupportTicketStatus["RESOLVED"] = "resolved";
    SupportTicketStatus["CLOSED"] = "closed";
})(SupportTicketStatus || (SupportTicketStatus = {}));
export var SupportTicketPriority;
(function (SupportTicketPriority) {
    SupportTicketPriority["LOW"] = "low";
    SupportTicketPriority["MEDIUM"] = "medium";
    SupportTicketPriority["HIGH"] = "high";
    SupportTicketPriority["URGENT"] = "urgent";
})(SupportTicketPriority || (SupportTicketPriority = {}));
// Default Production Teams
export const DEFAULT_PRODUCTION_TEAMS = [
    {
        id: 'team_prod_pl',
        name: 'Production - PL',
        color: '#3B82F6', // Blue
        assetClasses: ['PL', 'Personal Loans']
    },
    {
        id: 'team_prod_auto',
        name: 'Production - Auto',
        color: '#10B981', // Green
        assetClasses: ['Auto', 'Automobile']
    },
    {
        id: 'team_prod_qa',
        name: 'Production - QA',
        color: '#8B5CF6', // Purple
        assetClasses: [] // QA handles all asset classes based on issue type
    },
    {
        id: 'team_prod_bankops',
        name: 'Production - BankOps',
        color: '#F59E0B', // Orange/Amber
        assetClasses: [] // BankOps handles specific issue types
    }
];
// Default mapping rules
export const DEFAULT_TEAM_MAPPING_RULES = [
    // PL asset class mappings
    { id: 'rule_pl_policies', issueType: 'Policies', assetClass: 'PL', targetTeam: 'Production - PL' },
    { id: 'rule_pl_prm', issueType: 'Post Release Monitoring', assetClass: 'PL', targetTeam: 'Production - PL' },
    // Auto asset class mappings
    { id: 'rule_auto_policies', issueType: 'Policies', assetClass: 'Auto', targetTeam: 'Production - Auto' },
    { id: 'rule_auto_prm', issueType: 'Post Release Monitoring', assetClass: 'Auto', targetTeam: 'Production - Auto' },
    // QA handles specific issue types regardless of asset class
    { id: 'rule_qa_any', issueType: 'QA', assetClass: '*', targetTeam: 'Production - QA' },
    // BankOps handles bank-related issue types
    { id: 'rule_bankops_any', issueType: 'Bank Integration', assetClass: '*', targetTeam: 'Production - BankOps' },
];
