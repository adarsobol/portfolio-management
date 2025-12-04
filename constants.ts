
import { AssetClass, Initiative, Priority, Role, Status, UnplannedTag, User, WorkType, AppConfig } from './types';

// Real Users from Spreadsheet
export const USERS: User[] = [
  // Directors (Group Leads)
  { id: 'u_mg', name: 'Michael Gorkov', email: 'michael.gorkov@pagaya.com', role: Role.GroupLead, avatar: 'https://ui-avatars.com/api/?name=Michael+Gorkov&background=0D8ABC&color=fff' },
  { id: 'u_ol', name: 'Omri Lerer', email: 'omri.lerer@pagaya.com', role: Role.GroupLead, avatar: 'https://ui-avatars.com/api/?name=Omri+Lerer&background=0D8ABC&color=fff' },
  { id: 'u_bk_dir', name: 'Biran Kedar', email: 'biran.kedar@pagaya.com', role: Role.GroupLead, avatar: 'https://ui-avatars.com/api/?name=Biran+Kedar&background=0D8ABC&color=fff' }, 
  { id: 'u_da_dir', name: 'Doron Ariav', email: 'doron.ariav@pagaya.com', role: Role.GroupLead, avatar: 'https://ui-avatars.com/api/?name=Doron+Ariav&background=0D8ABC&color=fff' }, 

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

  // Portfolio Ops & Leadership
  { id: 'u_ne', name: 'Nofar Elis', email: 'nofar.elis@pagaya.com', role: Role.PortfolioOps, avatar: 'https://ui-avatars.com/api/?name=Nofar+Elis&background=F59E0B&color=fff' }, 
  { id: 'u_as', name: 'Adar Sobol', email: 'adar.sobol@pagaya.com', role: Role.Admin, avatar: 'https://ui-avatars.com/api/?name=Adar+Sobol&background=10B981&color=fff' }, 
  { id: 'u_hg', name: 'Hazav Gefen', email: 'hazav.gefen@pagaya.com', role: Role.PortfolioOps, avatar: 'https://ui-avatars.com/api/?name=Hazav+Gefen&background=F59E0B&color=fff' }, 
  { id: 'u_ma', name: 'Matan Ats...', email: 'matan.ats@pagaya.com', role: Role.GroupLead, avatar: 'https://ui-avatars.com/api/?name=Matan+Ats&background=0D8ABC&color=fff' }, 
  { id: 'u_ts', name: 'Tal Silberman', email: 'tal.silberman@pagaya.com', role: Role.VP, avatar: 'https://ui-avatars.com/api/?name=Tal+Silberman&background=4F46E5&color=fff' }, 
];

export const QUARTERS = [
  'Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025', 
  'Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026', 
  'Q1 2027', 'Q2 2027', 'Q3 2027', 'Q4 2027'
];

// PDF Hierarchy Data
export interface HierarchyNode {
  name: string;
  responsibilities: string[];
}

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
    isAtRisk: false,
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
    status: Status.Delayed,
    priority: Priority.P1,
    estimatedEffort: 8,
    originalEstimatedEffort: 6, // Changed from 6
    actualEffort: 6,
    eta: TODAY,
    originalEta: TWO_WEEKS_AGO, // Changed from ago
    lastUpdated: TWO_WEEKS_AGO,
    workType: WorkType.Planned,
    isAtRisk: true,
    riskActionLog: 'Vendor delivery delayed. Mitigating by using fallback servers.',
    comments: [
      { id: 'c1', text: 'Vendor says they will ship by Friday.', authorId: 'u_rg', timestamp: TWO_WEEKS_AGO }
    ],
    // Add history so "Previous Value" feature is visible
    history: [
      {
        id: 'h1',
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
    unplannedTags: [UnplannedTag.RiskItem, UnplannedTag.PMItem],
    isAtRisk: false,
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
    status: Status.Planned,
    priority: Priority.P2,
    estimatedEffort: 20,
    originalEstimatedEffort: 20,
    actualEffort: 0,
    eta: NEXT_MONTH, 
    originalEta: NEXT_MONTH,
    lastUpdated: TODAY,
    workType: WorkType.Planned,
    isAtRisk: false,
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
    unplannedTags: [UnplannedTag.RiskItem],
    isAtRisk: false,
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
    status: Status.Complete,
    priority: Priority.P1,
    estimatedEffort: 6,
    originalEstimatedEffort: 6,
    actualEffort: 5.5,
    eta: YESTERDAY,
    originalEta: YESTERDAY,
    lastUpdated: TODAY,
    workType: WorkType.Planned,
    isAtRisk: false,
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
    status: Status.Planned,
    priority: Priority.P0,
    estimatedEffort: 10,
    originalEstimatedEffort: 10,
    actualEffort: 0,
    eta: TWO_WEEKS_FUTURE,
    originalEta: TWO_WEEKS_FUTURE,
    lastUpdated: YESTERDAY,
    workType: WorkType.Planned,
    isAtRisk: false,
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
    status: Status.Complete,
    priority: Priority.P2,
    estimatedEffort: 1,
    originalEstimatedEffort: 1,
    actualEffort: 1.2,
    eta: TODAY,
    originalEta: TODAY,
    lastUpdated: TODAY,
    workType: WorkType.Unplanned,
    unplannedTags: [UnplannedTag.PMItem],
    isAtRisk: false,
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
    status: Status.Delayed,
    priority: Priority.P1,
    estimatedEffort: 15,
    originalEstimatedEffort: 15,
    actualEffort: 10,
    eta: NEXT_WEEK,
    originalEta: NEXT_WEEK,
    lastUpdated: YESTERDAY,
    workType: WorkType.Planned,
    isAtRisk: true,
    riskActionLog: 'Data sets are incomplete. Pending Data Science team review.',
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
    unplannedTags: [UnplannedTag.RiskItem, UnplannedTag.PMItem],
    isAtRisk: true,
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
    status: Status.Planned,
    priority: Priority.P2,
    estimatedEffort: 4,
    originalEstimatedEffort: 4,
    actualEffort: 0,
    eta: TWO_WEEKS_FUTURE,
    originalEta: TWO_WEEKS_FUTURE,
    lastUpdated: YESTERDAY,
    workType: WorkType.Planned,
    isAtRisk: false,
    comments: [],
    history: []
  },
];

export const INITIAL_CONFIG: AppConfig = {
  bauBufferSuggestion: 15,
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
  rolePermissions: {
    [Role.Admin]: {
      createPlanned: true,
      createUnplanned: true,
      editOwn: true,
      editAll: true,
      editUnplanned: true,
      accessAdmin: true,
      manageCapacity: true
    },
    [Role.TeamLead]: {
      createPlanned: true,
      createUnplanned: false,
      editOwn: true,
      editAll: false,
      editUnplanned: false,
      accessAdmin: false,
      manageCapacity: false
    },
    [Role.PortfolioOps]: {
      createPlanned: false,
      createUnplanned: true,
      editOwn: true,
      editAll: false,
      editUnplanned: true,
      accessAdmin: false,
      manageCapacity: false
    },
    [Role.GroupLead]: {
      createPlanned: false,
      createUnplanned: false,
      editOwn: false,
      editAll: false,
      editUnplanned: false,
      accessAdmin: false,
      manageCapacity: false
    },
    [Role.VP]: {
      createPlanned: false,
      createUnplanned: false,
      editOwn: false,
      editAll: false,
      editUnplanned: false,
      accessAdmin: false,
      manageCapacity: false
    }
  }
};
