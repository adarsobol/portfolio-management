import { AssetClass, Initiative, Priority, Role, Status, UnplannedTag, User, WorkType, AppConfig, WorkflowTrigger, WorkflowCondition, WorkflowAction, DependencyTeam, InitiativeType, TaskManagementScope, PermissionKey, LegacyPermissionKey, PermissionValue, HierarchyNode } from '../types';
import { generateId } from '../utils';
import { getDefaultValueLists } from '../utils/valueLists';

// QUARTERS constant - deprecated, use getQuarters(config) instead
// Kept for backward compatibility during migration

// DEPENDENCY_TEAMS removed - use getDependencyTeams(config) from utils/valueLists instead

// Dependency team categories for grouped display
export const DEPENDENCY_TEAM_CATEGORIES: { name: string; color: string; teams: DependencyTeam[] }[] = [
  {
    name: 'R&M Teams',
    color: 'blue',
    teams: [DependencyTeam.RMResearch, DependencyTeam.RMData, DependencyTeam.RMInfra]
  },
  {
    name: 'Business Teams',
    color: 'purple',
    teams: [DependencyTeam.Product, DependencyTeam.CapitalMarkets, DependencyTeam.Partnerships]
  }
];

// Real Users from Spreadsheet
export const USERS: User[] = [
  // Leadership
  { id: 'u_ts', name: 'Tal Silberman', email: 'tal.silberman@pagaya.com', role: Role.VP, avatar: 'https://ui-avatars.com/api/?name=Tal+Silberman&background=4F46E5&color=fff' }, 

  // Directors (Department Management)
  { id: 'u_mg', name: 'Michael Gorkov', email: 'michael.gorkov@pagaya.com', role: Role.DirectorDepartment, avatar: 'https://ui-avatars.com/api/?name=Michael+Gorkov&background=0D8ABC&color=fff' },
  { id: 'u_ol', name: 'Omri Lerer', email: 'omri.lerer@pagaya.com', role: Role.DirectorDepartment, avatar: 'https://ui-avatars.com/api/?name=Omri+Lerer&background=0D8ABC&color=fff' },
  
  // Directors (Group Lead)
  { id: 'u_bk_dir', name: 'Biran Kedar', email: 'biran.kedar@pagaya.com', role: Role.DirectorGroup, avatar: 'https://ui-avatars.com/api/?name=Biran+Kedar&background=0D8ABC&color=fff' }, 
  { id: 'u_da_dir', name: 'Doron Ariav', email: 'doron.ariav@pagaya.com', role: Role.DirectorGroup, avatar: 'https://ui-avatars.com/api/?name=Doron+Ariav&background=0D8ABC&color=fff' }, 
  { id: 'u_ma', name: 'Matan Ats...', email: 'matan.ats@pagaya.com', role: Role.DirectorGroup, avatar: 'https://ui-avatars.com/api/?name=Matan+Ats&background=0D8ABC&color=fff' }, 

  // Team Leads
  { id: 'u_ah', name: 'Alon Howben', email: 'alon.howben@pagaya.com', role: Role.TeamLead, avatar: 'https://ui-avatars.com/api/?name=Alon+Howben&background=random' },
  { id: 'u_tm', name: 'Tal Michael', email: 'tal.michael@pagaya.com', role: Role.TeamLead, avatar: 'https://ui-avatars.com/api/?name=Tal+Michael&background=random' },
  { id: 'u_yk', name: 'Yarden Kally', email: 'yarden.kally@pagaya.com', role: Role.TeamLead, avatar: 'https://ui-avatars.com/api/?name=Yarden+Kally&background=random' },
  { id: 'u_tb', name: 'Tomer Belo', email: 'tomer.belo@pagaya.com', role: Role.TeamLead, avatar: 'https://ui-avatars.com/api/?name=Tomer+Belo&background=random' },
  { id: 'u_ns', name: 'Nadav Stut...', email: 'nadav.stut@pagaya.com', role: Role.TeamLead, avatar: 'https://ui-avatars.com/api/?name=Nadav+Stut&background=random' },
  { id: 'u_rg', name: 'Rotem Galili', email: 'rotem.galili@pagaya.com', role: Role.TeamLead, avatar: 'https://ui-avatars.com/api/?name=Rotem+Galili&background=random' },
  { id: 'u_bb', name: 'Benny Barki', email: 'benny.barki@pagaya.com', role: Role.TeamLead, avatar: 'https://ui-avatars.com/api/?name=Benny+Barki&background=random' },
  { id: 'u_dk', name: 'Dafna Koby', email: 'dafna.koby@pagaya.com', role: Role.TeamLead, avatar: 'https://ui-avatars.com/api/?name=Dafna+Koby&background=random' },
  { id: 'u_bk_tl', name: 'Biran Kedar (TL)', email: 'biran.kedar.tl@pagaya.com', role: Role.TeamLead, avatar: 'https://ui-avatars.com/api/?name=Biran+Kedar&background=random' },
  { id: 'u_da_tl', name: 'Doron Ariav (TL)', email: 'doron.ariav.tl@pagaya.com', role: Role.TeamLead, avatar: 'https://ui-avatars.com/api/?name=Doron+Ariav&background=random' },

  // Portfolio Operations
  { id: 'u_ne', name: 'Nofar Elis', email: 'nofar.elis@pagaya.com', role: Role.PortfolioOps, avatar: 'https://ui-avatars.com/api/?name=Nofar+Elis&background=F59E0B&color=fff' }, 
  { id: 'u_hg', name: 'Hazav Gefen', email: 'hazav.gefen@pagaya.com', role: Role.PortfolioOps, avatar: 'https://ui-avatars.com/api/?name=Hazav+Gefen&background=F59E0B&color=fff' }, 
  
  // Admin
  { id: 'u_as', name: 'Adar Sobol', email: 'adar.sobol@pagaya.com', role: Role.Admin, avatar: 'https://ui-avatars.com/api/?name=Adar+Sobol&background=10B981&color=fff' }, 
];

export const QUARTERS = [
  'Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025', 
  'Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026', 
  'Q1 2027', 'Q2 2027', 'Q3 2027', 'Q4 2027'
];

// PDF Hierarchy Data
// HierarchyNode is now exported from types/index.ts

/**
 * Map team name to corresponding AssetClass
 * Returns undefined if team doesn't map to an asset class
 */
export const getAssetClassFromTeam = (team: string | undefined): AssetClass | undefined => {
  if (!team) return undefined;
  
  const teamToAssetClass: Record<string, AssetClass> = {
    'PL': AssetClass.PL,
    'Auto': AssetClass.Auto,
    'POS': AssetClass.POS,
    'Advisory': AssetClass.Advisory,
  };
  
  return teamToAssetClass[team];
};

export const HIERARCHY: Record<AssetClass, HierarchyNode[]> = {
  [AssetClass.PL]: [
    {
      name: 'Portfolio Monitoring & Analytics',
      responsibilities: [
        'Monitoring KPIs (Constrains, Volume, Flow quality, Early DQs, IRR/Profit prediction)',
        'Monitoring of existing risks (Risk Budget) and experiments',
        'Analysis of new risks & opportunities'
      ]
    },
    {
      name: 'Prediction Tools',
      responsibilities: [
        'Create and integrate new prediction abilities',
        'Improving existing prediction abilities: PEB, Simulations, Forecast, Profitability, WAL'
      ]
    },
    {
      name: 'Portfolio Management',
      responsibilities: [
        'Maintaining portfolio constraints',
        'Profitability & CGL optimization',
        'Version post release',
        'Manage new partners ramp up',
        'Existing partners growth'
      ]
    },
    {
      name: 'Production Management',
      responsibilities: [
        'New partners onboarding',
        'Executing portfolio decisions',
        'Production technical operations (CRD, Allocation, etc)',
        'QA'
      ]
    }
  ],
  [AssetClass.Auto]: [
    {
      name: 'Portfolio Management',
      responsibilities: [
        'Maintaining portfolio constraints',
        'Profitability & CGL optimization',
        'Version post release',
        'Manage new partners ramp up',
        'Existing partners growth'
      ]
    },
    {
      name: 'Production Management',
      responsibilities: [
        'New partners onboarding',
        'Executing portfolio decisions'
      ]
    },
    {
      name: 'Portfolio Monitoring & Analytics',
      responsibilities: [
        'Monitoring KPIs (Constrains, Volume, Flow quality, Early DQs, IRR/Profit prediction)',
        'Monitoring of existing risks (Risk Budget) and experiments',
        'Analysis of new risks & opportunities'
      ]
    },
    {
      name: 'Prediction Tools',
      responsibilities: [
        'Create and integrate new prediction abilities',
        'Improving existing prediction abilities: PEB, Simulations, Forecast, Profitability, WAL'
      ]
    }
  ],
  [AssetClass.POS]: [
    {
      name: 'Portfolio Management',
      responsibilities: [
        'Maintaining portfolio constraints',
        'Profitability & CGL optimization',
        'Version post release',
        'Manage new partners ramp up',
        'Existing partners growth'
      ]
    },
    {
      name: 'Production Management',
      responsibilities: [
        'New partners onboarding',
        'Executing portfolio decisions',
        'Profitability framework'
      ]
    },
  ],
  [AssetClass.Advisory]: [
    {
      name: 'Capital Advisory',
      responsibilities: [
        'Deals pricing',
        'Deal Structure Optimization',
        'Prediction Tools',
        'Advisory'
      ]
    }
  ]
};

// Effort conversion constant
export const DAYS_PER_WEEK = 5; // Working days per week

const TODAY_OBJ = new Date();
const formatDate = (date: Date) => date.toISOString().split('T')[0];

const TODAY = formatDate(TODAY_OBJ);
const YESTERDAY = formatDate(new Date(TODAY_OBJ.getTime() - 1 * 24 * 60 * 60 * 1000));
const TWO_WEEKS_AGO = formatDate(new Date(TODAY_OBJ.getTime() - 15 * 24 * 60 * 60 * 1000));
const TOMORROW = formatDate(new Date(TODAY_OBJ.getTime() + 1 * 24 * 60 * 60 * 1000));
const NEXT_WEEK = formatDate(new Date(TODAY_OBJ.getTime() + 7 * 24 * 60 * 60 * 1000));
const TWO_WEEKS_FUTURE = formatDate(new Date(TODAY_OBJ.getTime() + 14 * 24 * 60 * 60 * 1000));
const NEXT_MONTH = formatDate(new Date(TODAY_OBJ.getTime() + 30 * 24 * 60 * 60 * 1000));

// Mock Initiatives Updated to match new Hierarchy and dynamic dates
export const INITIAL_INITIATIVES: Initiative[] = [
  {
    id: 'i1',
    l1_assetClass: AssetClass.PL,
    l2_pillar: 'Portfolio Monitoring & Analytics',
    l3_responsibility: 'Monitoring KPIs (Constrains, Volume, Flow quality, Early DQs, IRR/Profit prediction)',
    l4_target: 'Identify 100% of defined constraints',
    title: 'Develop Real-time PL Dashboard',
    ownerId: 'u_ah',
    quarter: 'Q4 2025',
    status: Status.InProgress,
    priority: Priority.P0,
    estimatedEffort: 12,
    originalEstimatedEffort: 12,
    actualEffort: 4,
    eta: NEXT_WEEK,
    originalEta: NEXT_WEEK,
    lastUpdated: TODAY,
    workType: WorkType.Planned,
    initiativeType: InitiativeType.WP,
    dependencies: [
      {
        team: DependencyTeam.RMData,
        deliverable: 'Requires data pipeline completion',
        eta: NEXT_WEEK
      },
      {
        team: DependencyTeam.RMInfra,
        deliverable: 'Pending infrastructure setup',
        eta: NEXT_WEEK
      }
    ],
    comments: [],
    history: []
  },
  {
    id: 'i2',
    l1_assetClass: AssetClass.Auto,
    l2_pillar: 'Prediction Tools',
    l3_responsibility: 'Improving existing prediction abilities: PEB, Simulations, Forecast, Profitability, WAL',
    l4_target: 'Reduce latency by 20%',
    title: 'Auto-Scaling Infrastructure Upgrade',
    ownerId: 'u_rg',
    secondaryOwner: 'Omri Lerer',
    quarter: 'Q4 2025',
    status: Status.AtRisk,
    priority: Priority.P1,
    estimatedEffort: 8,
    originalEstimatedEffort: 6, // Changed from 6
    actualEffort: 6,
    eta: TODAY,
    originalEta: TWO_WEEKS_AGO, // Changed from ago
    lastUpdated: TWO_WEEKS_AGO,
    workType: WorkType.Planned,
    initiativeType: InitiativeType.WP,
    riskActionLog: 'Vendor delivery delayed. Mitigating by using fallback servers.',
    comments: [
      { id: 'c1', text: 'Vendor says they will ship by Friday.', authorId: 'u_rg', timestamp: TWO_WEEKS_AGO }
    ],
    // Add history so "Previous Value" feature is visible
    history: [
      {
        id: 'h1',
        issueType: 'Initiative' as const,
        parentId: 'i2',
        initiativeId: 'i2',
        initiativeTitle: 'Auto-Scaling Infrastructure Upgrade',
        field: 'Effort',
        oldValue: 6,
        newValue: 8,
        changedBy: 'Rotem Galili',
        timestamp: TWO_WEEKS_AGO
      },
      {
        id: 'h2',
        issueType: 'Initiative' as const,
        parentId: 'i2',
        initiativeId: 'i2',
        initiativeTitle: 'Auto-Scaling Infrastructure Upgrade',
        field: 'ETA',
        oldValue: TWO_WEEKS_AGO,
        newValue: TODAY,
        changedBy: 'Rotem Galili',
        timestamp: TWO_WEEKS_AGO
      }
    ]
  },
  {
    id: 'i3',
    l1_assetClass: AssetClass.POS,
    l2_pillar: 'Production Management',
    l3_responsibility: 'New partners onboarding',
    l4_target: 'ISO 27001 Readiness',
    title: 'Emergency Patch for POS Terminals',
    ownerId: 'u_bk_tl',
    secondaryOwner: 'Hazav Gefen',
    quarter: 'Q4 2025',
    status: Status.InProgress,
    priority: Priority.P0,
    estimatedEffort: 2,
    originalEstimatedEffort: 2,
    actualEffort: 1,
    eta: TOMORROW, 
    originalEta: TOMORROW,
    lastUpdated: TODAY,
    workType: WorkType.Unplanned,
    initiativeType: InitiativeType.WP,
    unplannedTags: [UnplannedTag.RiskItem, UnplannedTag.PMItem],
    comments: [],
    history: []
  },
  {
    id: 'i4',
    l1_assetClass: AssetClass.Advisory,
    l2_pillar: 'Capital Advisory',
    l3_responsibility: 'Deals pricing',
    l4_target: 'Increase NPS',
    title: 'Q2 Pricing Review',
    ownerId: 'u_da_tl',
    quarter: 'Q2 2026',
    status: Status.NotStarted,
    priority: Priority.P2,
    estimatedEffort: 20,
    originalEstimatedEffort: 20,
    actualEffort: 0,
    eta: NEXT_MONTH, 
    originalEta: NEXT_MONTH,
    lastUpdated: TODAY,
    workType: WorkType.Planned,
    initiativeType: InitiativeType.WP,
    comments: [],
    history: []
  },
  {
    id: 'i5',
    l1_assetClass: AssetClass.PL,
    l2_pillar: 'Production Management',
    l3_responsibility: 'Production technical operations (CRD, Allocation, etc)',
    l4_target: 'Resolve Allocation Bug',
    title: 'Urgent Allocation Logic Fix',
    ownerId: 'u_ah',
    secondaryOwner: 'Michael Gorkov',
    quarter: 'Q4 2025',
    status: Status.InProgress,
    priority: Priority.P0,
    estimatedEffort: 3,
    originalEstimatedEffort: 3,
    actualEffort: 2,
    eta: TOMORROW,
    originalEta: TOMORROW,
    lastUpdated: YESTERDAY,
    workType: WorkType.Unplanned,
    initiativeType: InitiativeType.WP,
    unplannedTags: [UnplannedTag.RiskItem],
    comments: [],
    history: []
  },
  {
    id: 'i6',
    l1_assetClass: AssetClass.Auto,
    l2_pillar: 'Portfolio Management',
    l3_responsibility: 'Existing partners growth',
    l4_target: 'Onboard Partner X',
    title: 'Partner X Data Integration',
    ownerId: 'u_bb',
    quarter: 'Q3 2025',
    status: Status.Done,
    priority: Priority.P1,
    estimatedEffort: 6,
    originalEstimatedEffort: 6,
    actualEffort: 5.5,
    eta: YESTERDAY,
    originalEta: YESTERDAY,
    lastUpdated: TODAY,
    workType: WorkType.Planned,
    initiativeType: InitiativeType.WP,
    comments: [],
    history: []
  },
  {
    id: 'i7',
    l1_assetClass: AssetClass.POS,
    l2_pillar: 'Portfolio Management',
    l3_responsibility: 'Profitability & CGL optimization',
    l4_target: 'Optimize Yield',
    title: 'Q3 Yield Analysis Model',
    ownerId: 'u_bk_tl',
    secondaryOwner: 'Nofar Elis',
    quarter: 'Q3 2026',
    status: Status.NotStarted,
    priority: Priority.P0,
    estimatedEffort: 10,
    originalEstimatedEffort: 10,
    actualEffort: 0,
    eta: TWO_WEEKS_FUTURE,
    originalEta: TWO_WEEKS_FUTURE,
    lastUpdated: YESTERDAY,
    workType: WorkType.Planned,
    initiativeType: InitiativeType.WP,
    comments: [],
    history: []
  },
  {
    id: 'i8',
    l1_assetClass: AssetClass.Advisory,
    l2_pillar: 'Capital Advisory',
    l3_responsibility: 'Advisory',
    l4_target: 'Client Request',
    title: 'Ad-hoc Client Report Generation',
    ownerId: 'u_da_tl',
    quarter: 'Q4 2025',
    status: Status.Done,
    priority: Priority.P2,
    estimatedEffort: 1,
    originalEstimatedEffort: 1,
    actualEffort: 1.2,
    eta: TODAY,
    originalEta: TODAY,
    lastUpdated: TODAY,
    workType: WorkType.Unplanned,
    initiativeType: InitiativeType.WP,
    unplannedTags: [UnplannedTag.PMItem],
    comments: [],
    history: []
  },
  {
    id: 'i9',
    l1_assetClass: AssetClass.PL,
    l2_pillar: 'Prediction Tools',
    l3_responsibility: 'Create and integrate new prediction abilities',
    l4_target: 'New ML Model',
    title: 'ML Model V2 Integration',
    ownerId: 'u_tm',
    quarter: 'Q4 2025',
    status: Status.AtRisk,
    priority: Priority.P1,
    estimatedEffort: 15,
    originalEstimatedEffort: 15,
    actualEffort: 10,
    eta: NEXT_WEEK,
    originalEta: NEXT_WEEK,
    lastUpdated: YESTERDAY,
    workType: WorkType.Planned,
    initiativeType: InitiativeType.WP,
    riskActionLog: 'Data sets are incomplete. Pending Data Science team review.',
    dependencies: [
      {
        team: DependencyTeam.RMResearch,
        deliverable: 'Waiting for Research team model validation',
        eta: NEXT_WEEK
      }
    ],
    comments: [],
    history: []
  },
  {
    id: 'i10',
    l1_assetClass: AssetClass.Auto,
    l2_pillar: 'Portfolio Monitoring & Analytics',
    l3_responsibility: 'Monitoring of existing risks (Risk Budget) and experiments',
    l4_target: 'Risk Mitigation',
    title: 'Unexpected Volatility Investigation',
    ownerId: 'u_dk',
    secondaryOwner: 'Hazav Gefen',
    quarter: 'Q4 2025',
    status: Status.InProgress,
    priority: Priority.P0,
    estimatedEffort: 5,
    originalEstimatedEffort: 5,
    actualEffort: 1,
    eta: NEXT_WEEK,
    originalEta: NEXT_WEEK,
    lastUpdated: TODAY,
    workType: WorkType.Unplanned,
    initiativeType: InitiativeType.WP,
    unplannedTags: [UnplannedTag.RiskItem, UnplannedTag.PMItem],
    riskActionLog: 'Volatility exceeded thresholds. Immediate investigation required.',
    comments: [],
    history: []
  },
  {
    id: 'i11',
    l1_assetClass: AssetClass.PL,
    l2_pillar: 'Production Management',
    l3_responsibility: 'QA',
    l4_target: 'Regression Testing',
    title: 'End of Quarter Regression',
    ownerId: 'u_ns',
    quarter: 'Q4 2025',
    status: Status.NotStarted,
    priority: Priority.P2,
    estimatedEffort: 4,
    originalEstimatedEffort: 4,
    actualEffort: 0,
    eta: TWO_WEEKS_FUTURE,
    originalEta: TWO_WEEKS_FUTURE,
    lastUpdated: YESTERDAY,
    workType: WorkType.Planned,
    initiativeType: InitiativeType.WP,
    comments: [],
    history: []
  },
  // BAU Initiative Example
  {
    id: 'i_bau_example',
    initiativeType: InitiativeType.BAU,
    title: 'BAU Support & Maintenance',
    ownerId: 'u_ah',
    quarter: 'Q4 2025',
    status: Status.InProgress,
    priority: Priority.P1,
    estimatedEffort: 4.5,
    actualEffort: 2.0,
    eta: NEXT_WEEK,
    originalEta: NEXT_WEEK,
    lastUpdated: TODAY,
    workType: WorkType.Planned,
    l1_assetClass: AssetClass.PL,
    l2_pillar: 'Data Infrastructure',
    l3_responsibility: 'Data Quality',
    l4_target: 'Maintain data pipelines',
    tasks: [
      {
        id: 'task_bau_1',
        title: 'Fix data pipeline errors',
        estimatedEffort: 1.5,
        eta: TOMORROW,
        ownerId: 'u_ah',
        status: Status.InProgress,
        tags: [UnplannedTag.RiskItem],
        comments: []
      },
      {
        id: 'task_bau_2',
        title: 'Update documentation',
        estimatedEffort: 1.0,
        eta: NEXT_WEEK,
        ownerId: 'u_ah',
        status: Status.NotStarted,
        tags: [UnplannedTag.PMItem],
        comments: []
      },
      {
        id: 'task_bau_3',
        title: 'Monitor system health',
        estimatedEffort: 2.0,
        eta: NEXT_WEEK,
        ownerId: 'u_ah',
        status: Status.InProgress,
        tags: [],
        comments: []
      }
    ],
    comments: [],
    history: []
  },
  // Simulated BAU Initiative
  {
    id: 'i_bau_simulated',
    initiativeType: InitiativeType.BAU,
    title: 'Ongoing Portfolio Operations & Monitoring',
    ownerId: 'u_tm',
    secondaryOwner: 'Nofar Elis',
    quarter: 'Q4 2025',
    status: Status.InProgress,
    priority: Priority.P1,
    estimatedEffort: 6.0,
    originalEstimatedEffort: 6.0,
    actualEffort: 3.5,
    eta: TWO_WEEKS_FUTURE,
    originalEta: TWO_WEEKS_FUTURE,
    lastUpdated: TODAY,
    workType: WorkType.Planned,
    l1_assetClass: AssetClass.PL,
    l2_pillar: 'Portfolio Monitoring & Analytics',
    l3_responsibility: 'Monitoring KPIs (Constrains, Volume, Flow quality, Early DQs, IRR/Profit prediction)',
    l4_target: 'Maintain operational excellence',
    tasks: [
      {
        id: 'task_bau_sim_1',
        title: 'Daily KPI monitoring and reporting',
        estimatedEffort: 1.5,
        eta: NEXT_WEEK,
        ownerId: 'u_tm',
        status: Status.InProgress,
        tags: [],
        comments: []
      },
      {
        id: 'task_bau_sim_2',
        title: 'Weekly portfolio health review',
        estimatedEffort: 1.0,
        eta: NEXT_WEEK,
        ownerId: 'u_tm',
        status: Status.InProgress,
        tags: [UnplannedTag.PMItem],
        comments: []
      },
      {
        id: 'task_bau_sim_3',
        title: 'Monthly constraint analysis',
        estimatedEffort: 2.0,
        eta: TWO_WEEKS_FUTURE,
        ownerId: 'u_tm',
        status: Status.NotStarted,
        tags: [],
        comments: []
      },
      {
        id: 'task_bau_sim_4',
        title: 'Quarterly risk assessment review',
        estimatedEffort: 1.5,
        eta: TWO_WEEKS_FUTURE,
        ownerId: 'u_tm',
        status: Status.NotStarted,
        tags: [UnplannedTag.RiskItem],
        comments: []
      }
    ],
    comments: [],
    history: []
  },
];

/**
 * Migrates legacy permission structure to new permission structure
 * Converts old boolean-based permissions to new tab-based and task-based permissions
 */
export function migratePermissions(
  legacyPermissions: Record<Role, Record<LegacyPermissionKey, boolean>>
): Record<Role, Record<PermissionKey, PermissionValue>> {
  const newPermissions: Record<Role, Record<PermissionKey, PermissionValue>> = {} as any;

  for (const role of Object.values(Role)) {
    const legacy = legacyPermissions[role] || {};
    const newPerms: Record<PermissionKey, PermissionValue> = {
      // Tab/View access - map from legacy permissions (edit = full access)
      accessAllTasks: (legacy.createPlanned || legacy.createUnplanned || legacy.editOwn || legacy.editAll) 
        ? (legacy.editAll || legacy.editOwn ? 'edit' : 'view')
        : 'none',
      accessDependencies: (legacy.editAll || legacy.editOwn) ? 'edit' : 'view',
      accessTimeline: (legacy.editAll || legacy.editOwn) ? 'edit' : 'view',
      accessWorkflows: legacy.createWorkflows 
        ? (legacy.manageWorkflows ? 'edit' : 'view')
        : 'none',
      accessWorkplanHealth: legacy.accessWorkplanHealth ? 'edit' : 'none',
      
      // Task management
      createNewTasks: (legacy.createPlanned || legacy.createUnplanned) ? 'yes' : 'no' as TaskManagementScope,
      editTasks: legacy.editAll ? 'yes' : (legacy.editOwn ? 'own' : 'no') as TaskManagementScope,
      deleteTasks: 'no' as TaskManagementScope, // Legacy didn't have explicit delete permission
      
      // Admin and workflows
      accessAdmin: legacy.accessAdmin ? 'yes' : 'no' as TaskManagementScope,
      manageWorkflows: legacy.manageWorkflows ? 'yes' : 'no' as TaskManagementScope
    };

    newPermissions[role] = newPerms;
  }

  return newPermissions;
}

export const INITIAL_CONFIG: AppConfig = {
  bauBufferSuggestion: 15,
  // Team capacities are per quarter (weeks per quarter)
  teamCapacities: {
    'u_ah': 40,
    'u_tm': 40,
    'u_yk': 40,
    'u_tb': 40,
    'u_ns': 40,
    'u_rg': 40,
    'u_bb': 40,
    'u_dk': 40,
    'u_bk_tl': 20,
    'u_da_tl': 20,
  },
  // Team capacity adjustments are per quarter (weeks per quarter, deducted from base capacity)
  teamCapacityAdjustments: {},
  // Team buffers are per quarter (weeks per quarter reserved for BAU/unplanned work)
  teamBuffers: {
    'u_ah': 6,
    'u_tm': 6,
    'u_rg': 5,
    'u_bb': 4,
    'u_dk': 5,
  },
  healthHistory: [
    // Sample historical health data for demo purposes
    { id: 'hs1', date: new Date(Date.now() - 7 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], healthScore: 82, scheduleScore: 85, effortScore: 78, riskScore: 88, complianceScore: 75, initiativeCount: 9, atRiskCount: 1, completedCount: 1, totalEffort: 78, bufferUsed: 2, bufferTotal: 26 },
    { id: 'hs2', date: new Date(Date.now() - 6 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], healthScore: 79, scheduleScore: 80, effortScore: 75, riskScore: 85, complianceScore: 78, initiativeCount: 10, atRiskCount: 1, completedCount: 1, totalEffort: 82, bufferUsed: 4, bufferTotal: 26 },
    { id: 'hs3', date: new Date(Date.now() - 5 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], healthScore: 75, scheduleScore: 72, effortScore: 80, riskScore: 78, complianceScore: 70, initiativeCount: 10, atRiskCount: 2, completedCount: 1, totalEffort: 85, bufferUsed: 6, bufferTotal: 26 },
    { id: 'hs4', date: new Date(Date.now() - 4 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], healthScore: 73, scheduleScore: 70, effortScore: 78, riskScore: 75, complianceScore: 68, initiativeCount: 11, atRiskCount: 2, completedCount: 1, totalEffort: 86, bufferUsed: 8, bufferTotal: 26 },
    { id: 'hs5', date: new Date(Date.now() - 3 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], healthScore: 70, scheduleScore: 68, effortScore: 72, riskScore: 72, complianceScore: 70, initiativeCount: 11, atRiskCount: 2, completedCount: 2, totalEffort: 86, bufferUsed: 10, bufferTotal: 26 },
    { id: 'hs6', date: new Date(Date.now() - 2 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], healthScore: 72, scheduleScore: 70, effortScore: 75, riskScore: 74, complianceScore: 72, initiativeCount: 11, atRiskCount: 2, completedCount: 2, totalEffort: 86, bufferUsed: 11, bufferTotal: 26 },
    { id: 'hs7', date: new Date(Date.now() - 1 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], healthScore: 74, scheduleScore: 72, effortScore: 76, riskScore: 76, complianceScore: 75, initiativeCount: 11, atRiskCount: 2, completedCount: 2, totalEffort: 86, bufferUsed: 12, bufferTotal: 26 },
    { id: 'hs8', date: new Date().toISOString().split('T')[0], healthScore: 76, scheduleScore: 74, effortScore: 78, riskScore: 78, complianceScore: 78, initiativeCount: 11, atRiskCount: 2, completedCount: 2, totalEffort: 86, bufferUsed: 12.2, bufferTotal: 26 },
  ],
  slack: {
    enabled: false,
    webhookUrl: '' // Use SLACK_WEBHOOK_URL environment variable instead
  },
  rolePermissions: {
    [Role.Admin]: {
      accessAllTasks: 'edit',
      accessDependencies: 'edit',
      accessTimeline: 'edit',
      accessWorkflows: 'edit',
      accessWorkplanHealth: 'edit',
      createNewTasks: 'yes',
      editTasks: 'yes',
      deleteTasks: 'yes',
      accessAdmin: 'yes',
      manageWorkflows: 'yes'
    },
    [Role.SVP]: {
      accessAllTasks: 'edit',
      accessDependencies: 'edit',
      accessTimeline: 'edit',
      accessWorkflows: 'edit',
      accessWorkplanHealth: 'edit',
      createNewTasks: 'yes',
      editTasks: 'yes',
      deleteTasks: 'yes',
      accessAdmin: 'yes',
      manageWorkflows: 'yes'
    },
    [Role.VP]: {
      accessAllTasks: 'edit',
      accessDependencies: 'edit',
      accessTimeline: 'edit',
      accessWorkflows: 'edit',
      accessWorkplanHealth: 'edit',
      createNewTasks: 'yes',
      editTasks: 'yes',
      deleteTasks: 'no',
      accessAdmin: 'no',
      manageWorkflows: 'yes'
    },
    [Role.DirectorDepartment]: {
      accessAllTasks: 'edit',
      accessDependencies: 'edit',
      accessTimeline: 'edit',
      accessWorkflows: 'edit',
      accessWorkplanHealth: 'edit',
      createNewTasks: 'yes',
      editTasks: 'yes',
      deleteTasks: 'no',
      accessAdmin: 'no',
      manageWorkflows: 'yes'
    },
    [Role.DirectorGroup]: {
      accessAllTasks: 'edit',
      accessDependencies: 'edit',
      accessTimeline: 'edit',
      accessWorkflows: 'view',
      accessWorkplanHealth: 'edit',
      createNewTasks: 'yes',
      editTasks: 'own',
      deleteTasks: 'yes',
      accessAdmin: 'no',
      manageWorkflows: 'no'
    },
    [Role.TeamLead]: {
      accessAllTasks: 'edit',
      accessDependencies: 'view',
      accessTimeline: 'view',
      accessWorkflows: 'view',
      accessWorkplanHealth: 'none',
      createNewTasks: 'yes',
      editTasks: 'own',
      deleteTasks: 'own', // Team Leads can delete their own initiatives
      accessAdmin: 'no',
      manageWorkflows: 'no'
    },
    [Role.PortfolioOps]: {
      accessAllTasks: 'edit',
      accessDependencies: 'view',
      accessTimeline: 'view',
      accessWorkflows: 'edit',
      accessWorkplanHealth: 'edit',
      createNewTasks: 'yes',
      editTasks: 'own',
      deleteTasks: 'no',
      accessAdmin: 'no',
      manageWorkflows: 'yes'
    },
  },
  workflows: [
    {
      id: generateId(),
      name: 'Auto At-Risk Detection',
      description: 'Automatically mark initiatives as at risk when due date has passed',
      enabled: true,
      trigger: WorkflowTrigger.OnSchedule,
      triggerConfig: { schedule: 'daily', time: '09:00' },
      condition: {
        type: WorkflowCondition.And,
        children: [
          { type: WorkflowCondition.DueDatePassed },
          { type: WorkflowCondition.StatusNotEquals, value: Status.Done },
          { type: WorkflowCondition.StatusNotEquals, value: Status.AtRisk },
        ],
      },
      action: {
        type: WorkflowAction.SetStatus,
        value: Status.AtRisk,
      },
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      runCount: 0,
      executionLog: [],
      system: true,
      readOnly: true,
    },
    {
      id: generateId(),
      name: 'Effort-Based Status Transition',
      description: 'Transition to In Progress when actual effort is logged',
      enabled: true,
      trigger: WorkflowTrigger.OnEffortChange,
      condition: {
        type: WorkflowCondition.And,
        children: [
          { type: WorkflowCondition.ActualEffortGreaterThan, value: 0 },
          { type: WorkflowCondition.StatusEquals, value: Status.NotStarted },
        ],
      },
      action: {
        type: WorkflowAction.SetStatus,
        value: Status.InProgress,
      },
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      runCount: 0,
      executionLog: [],
      system: true,
      readOnly: true,
    },
    {
      id: generateId(),
      name: 'Weekly Update Reminder',
      description: 'Remind team leads to update their initiatives by Thursday EoD',
      enabled: true,
      trigger: WorkflowTrigger.OnSchedule,
      triggerConfig: { schedule: 'weekly', time: '17:00' }, // Thursday 5 PM
      condition: {
        type: WorkflowCondition.And,
        children: [
          { type: WorkflowCondition.LastUpdatedOlderThan, days: 7 },
          { type: WorkflowCondition.StatusNotEquals, value: Status.Done },
        ],
      },
      action: {
        type: WorkflowAction.NotifyOwner,
        message: 'Please update your initiative status, effort, and ETA by Thursday EoD as part of the weekly update routine.',
      },
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      runCount: 0,
      executionLog: [],
      system: true,
      readOnly: true,
    },
    {
      id: generateId(),
      name: 'Team-Based Asset Class Assignment',
      description: 'Automatically assign asset class based on creator team when new initiatives are created (PL, Auto, POS, Advisory teams only)',
      enabled: true,
      trigger: WorkflowTrigger.OnCreate,
      action: {
        type: WorkflowAction.SetAssetClass,
      },
      createdBy: 'system',
      createdAt: new Date().toISOString(),
      runCount: 0,
      executionLog: [],
      system: true,
      readOnly: true,
    },
  ],
  weeklyEffortValidation: {
    enabled: true,
    thresholdPercent: 15
  },
  valueLists: getDefaultValueLists(),
  valueListsMigrated: false
};
