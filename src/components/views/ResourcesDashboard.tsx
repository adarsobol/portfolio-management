import React, { useMemo, useState, useRef } from 'react';
import { 
  Activity, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Clock, 
  FileEdit,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Gauge,
  Info,
  X,
  HelpCircle,
  History,
  Shield
} from 'lucide-react';
import { Initiative, AppConfig, User, Status, Priority } from '../../types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
  LineChart, Line, CartesianGrid, Legend, AreaChart, Area, ReferenceLine
} from 'recharts';
import { useEdgeScrolling } from '../../hooks';

interface WorkplanHealthDashboardProps {
  filteredInitiatives: Initiative[];
  config: AppConfig;
  users: User[];
}

// Helper to calculate days between two dates
const daysBetween = (date1: string, date2: string): number => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

// Health score color helper
const getHealthColor = (score: number): string => {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-500';
  return 'text-red-500';
};

const getHealthBg = (score: number): string => {
  if (score >= 80) return 'bg-emerald-50';
  if (score >= 60) return 'bg-amber-50';
  return 'bg-red-50';
};

const getHealthBarColor = (score: number): string => {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-amber-500';
  return 'bg-red-500';
};

// Traffic light indicator component
const TrafficLight: React.FC<{ status: 'good' | 'warning' | 'critical' }> = ({ status }) => {
  const colors = {
    good: 'bg-emerald-500',
    warning: 'bg-amber-400',
    critical: 'bg-red-500'
  };
  return <div className={`w-2.5 h-2.5 rounded-full ${colors[status]}`} />;
};

// Metric tooltip definitions
const METRIC_TOOLTIPS: Record<string, { title: string; description: string; formula?: string; thresholds?: string }> = {
  healthScore: {
    title: 'Overall Health Score',
    description: 'A composite score (0-100) measuring the overall health of your workplan based on four weighted factors.',
    formula: '(Schedule × 35%) + (Effort × 25%) + (Risk × 25%) + (Compliance × 15%)',
    thresholds: 'Green: 80+  |  Amber: 60-79  |  Red: <60'
  },
  avgDelay: {
    title: 'Average Delay',
    description: 'Mean number of days between current ETA and original baseline ETA across all initiatives.',
    formula: 'Σ(Current ETA - Original ETA) / Number of Items',
    thresholds: 'Green: ≤0 days  |  Amber: 1-7 days  |  Red: >7 days'
  },
  onTimeRate: {
    title: 'On-Time Rate',
    description: 'Percentage of initiatives where the current ETA is on or before the original planned ETA.',
    formula: '(Items with Current ETA ≤ Original ETA / Total Items) × 100',
    thresholds: 'Green: ≥80%  |  Amber: 60-79%  |  Red: <60%'
  },
  etaSlippage: {
    title: 'ETA Slippage Count',
    description: 'Number of initiatives where the ETA has changed from the original baseline, indicating re-planning activity.',
    formula: 'Count of items where Current ETA ≠ Original ETA',
    thresholds: 'Green: 0 items  |  Amber: 1-3 items  |  Red: >3 items'
  },
  effortVariance: {
    title: 'Effort Variance',
    description: 'Percentage change in estimated effort compared to the original baseline. Indicates scope creep or reduction.',
    formula: '((Current Est - Original Est) / Original Est) × 100',
    thresholds: 'Green: ±10%  |  Amber: ±11-25%  |  Red: >±25%'
  },
  netScopeChange: {
    title: 'Net Scope Change',
    description: 'Absolute difference in total estimated effort (in weeks) between current plan and original baseline.',
    formula: 'Σ Current Estimated Effort - Σ Original Estimated Effort',
    thresholds: 'Positive = scope increased, Negative = scope reduced'
  },
  estimationAccuracy: {
    title: 'Estimation Accuracy',
    description: 'How accurate original estimates were compared to actual effort for completed items. Higher is better.',
    formula: 'Average of (Original Est / Actual Effort) × 100 for completed items',
    thresholds: 'Green: ≥90%  |  Amber: 70-89%  |  Red: <70%'
  },
  totalChanges: {
    title: 'Total Changes',
    description: 'Sum of all recorded field changes (ETA, Effort, Status, etc.) across all initiatives in the change history.',
    formula: 'Count of all ChangeRecord entries',
    thresholds: 'Informational metric - higher indicates more volatility'
  },
  changeFrequency: {
    title: 'Change Frequency',
    description: 'Average number of changes per initiative. Indicates how often items are being modified.',
    formula: 'Total Changes / Number of Initiatives',
    thresholds: 'Informational metric'
  },
  recentChanges: {
    title: 'Recent Changes',
    description: 'Number of changes made in the last 7 days. Shows current activity level.',
    formula: 'Count of changes where timestamp ≥ (today - 7 days)',
    thresholds: 'Informational metric'
  },
  atRiskDelayed: {
    title: 'At-Risk & Delayed',
    description: 'Count of initiatives currently marked as "At Risk" or "Delayed" status.',
    formula: 'Count where Status = "At Risk" or "Delayed"',
    thresholds: 'Lower is better - these require immediate attention'
  },
  riskLogCompliance: {
    title: 'Risk Log Compliance',
    description: 'Percentage of at-risk or delayed items that have documented risk action logs explaining the situation.',
    formula: '(Items with Risk Action Log / At-Risk or Delayed Items) × 100',
    thresholds: 'Green: ≥80%  |  Amber: 60-79%  |  Red: <60%'
  },
  staleItems: {
    title: 'Stale Items',
    description: 'Initiatives not updated in the last 14 days (excluding completed items). May indicate neglected work.',
    formula: 'Count where lastUpdated < (today - 14 days) AND status ≠ Complete',
    thresholds: 'Green: 0 items  |  Amber/Red: Any stale items need review'
  },
  avgCompletionRate: {
    title: 'Average Completion Rate',
    description: 'Mean completion percentage across all active (non-done) initiatives. Indicates overall progress towards delivery.',
    formula: 'Σ(Completion Rate) / Count of Active Initiatives',
    thresholds: 'Green: ≥70%  |  Amber: 40-69%  |  Red: <40%'
  },
  lowCompletionItems: {
    title: 'Low Completion Items',
    description: 'Active initiatives with completion rate below 30%. These items may need attention or resources.',
    formula: 'Count where completionRate < 30% AND status ≠ Done',
    thresholds: 'Green: 0 items  |  Amber/Red: Any items need review'
  }
};

// Metric Tooltip Component
const MetricTooltip: React.FC<{ 
  metricKey: string; 
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}> = ({ metricKey, children, position = 'top' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const tooltip = METRIC_TOOLTIPS[metricKey];

  if (!tooltip) return <>{children}</>;

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  };

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div className={`absolute z-50 ${positionClasses[position]} w-72 pointer-events-none`}>
          <div className="bg-slate-900 text-white p-4 rounded-lg shadow-xl text-left">
            <div className="flex items-center gap-2 mb-2">
              <HelpCircle className="w-4 h-4 text-blue-400" />
              <h4 className="font-semibold text-sm">{tooltip.title}</h4>
            </div>
            <p className="text-xs text-slate-300 mb-2">{tooltip.description}</p>
            {tooltip.formula && (
              <div className="bg-slate-800 rounded px-2 py-1.5 mb-2">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Formula</p>
                <code className="text-xs text-blue-300 font-mono">{tooltip.formula}</code>
              </div>
            )}
            {tooltip.thresholds && (
              <div className="text-[10px] text-slate-400">
                <span className="uppercase tracking-wider">Thresholds: </span>
                <span className="text-slate-300">{tooltip.thresholds}</span>
              </div>
            )}
            {/* Arrow */}
            <div className={`absolute w-2 h-2 bg-slate-900 transform rotate-45 ${
              position === 'top' ? 'top-full left-1/2 -translate-x-1/2 -mt-1' :
              position === 'bottom' ? 'bottom-full left-1/2 -translate-x-1/2 -mb-1' :
              position === 'left' ? 'left-full top-1/2 -translate-y-1/2 -ml-1' :
              'right-full top-1/2 -translate-y-1/2 -mr-1'
            }`} />
          </div>
        </div>
      )}
    </div>
  );
};

// Info Modal Component
const InfoModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-slate-900/60 transition-opacity" onClick={onClose} />
        
        {/* Modal */}
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Info className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Workplan Health Metrics Guide</h2>
                <p className="text-sm text-slate-400">Understanding your dashboard metrics</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(85vh-80px)] p-6">
            {/* Health Score Section */}
            <div className="mb-8">
              <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Gauge className="w-5 h-5 text-blue-600" />
                Overall Health Score
              </h3>
              <div className="bg-slate-50 rounded-xl p-4 mb-4">
                <p className="text-sm text-slate-600 mb-3">
                  The health score is a weighted composite metric (0-100) that summarizes the overall state of your workplan. 
                  It combines four key dimensions:
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-sm"><strong>Schedule (35%)</strong> - ETA adherence</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-sm"><strong>Effort (25%)</strong> - Scope stability</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-sm"><strong>Risk (25%)</strong> - Issue count</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-purple-500" />
                    <span className="text-sm"><strong>Compliance (15%)</strong> - Documentation</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded bg-emerald-500" />
                  <span>80+ = Healthy</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded bg-amber-500" />
                  <span>60-79 = Needs Attention</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded bg-red-500" />
                  <span>&lt;60 = Critical</span>
                </div>
              </div>
            </div>

            {/* Schedule Health */}
            <div className="mb-8">
              <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-600" />
                Schedule Health Metrics
              </h3>
              <div className="space-y-3">
                {['avgDelay', 'onTimeRate', 'etaSlippage'].map(key => (
                  <div key={key} className="bg-slate-50 rounded-lg p-3">
                    <h4 className="font-semibold text-slate-700 text-sm">{METRIC_TOOLTIPS[key].title}</h4>
                    <p className="text-xs text-slate-500 mt-1">{METRIC_TOOLTIPS[key].description}</p>
                    <div className="flex gap-4 mt-2 text-xs">
                      <span className="text-slate-400">Formula: <code className="text-blue-600">{METRIC_TOOLTIPS[key].formula}</code></span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      Thresholds: <span className="text-slate-600">{METRIC_TOOLTIPS[key].thresholds}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Effort Health */}
            <div className="mb-8">
              <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Effort Health Metrics
              </h3>
              <div className="space-y-3">
                {['effortVariance', 'netScopeChange', 'estimationAccuracy'].map(key => (
                  <div key={key} className="bg-slate-50 rounded-lg p-3">
                    <h4 className="font-semibold text-slate-700 text-sm">{METRIC_TOOLTIPS[key].title}</h4>
                    <p className="text-xs text-slate-500 mt-1">{METRIC_TOOLTIPS[key].description}</p>
                    <div className="flex gap-4 mt-2 text-xs">
                      <span className="text-slate-400">Formula: <code className="text-blue-600">{METRIC_TOOLTIPS[key].formula}</code></span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      Thresholds: <span className="text-slate-600">{METRIC_TOOLTIPS[key].thresholds}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Change Activity */}
            <div className="mb-8">
              <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                <FileEdit className="w-5 h-5 text-amber-600" />
                Change Activity Metrics
              </h3>
              <div className="space-y-3">
                {['totalChanges', 'changeFrequency', 'recentChanges'].map(key => (
                  <div key={key} className="bg-slate-50 rounded-lg p-3">
                    <h4 className="font-semibold text-slate-700 text-sm">{METRIC_TOOLTIPS[key].title}</h4>
                    <p className="text-xs text-slate-500 mt-1">{METRIC_TOOLTIPS[key].description}</p>
                    <div className="flex gap-4 mt-2 text-xs">
                      <span className="text-slate-400">Formula: <code className="text-blue-600">{METRIC_TOOLTIPS[key].formula}</code></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Status & Completion Metrics */}
            <div className="mb-8">
              <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                Status & Completion Metrics
              </h3>
              <div className="space-y-3">
                {['atRiskDelayed', 'avgCompletionRate', 'lowCompletionItems', 'staleItems'].map(key => (
                  <div key={key} className="bg-slate-50 rounded-lg p-3">
                    <h4 className="font-semibold text-slate-700 text-sm">{METRIC_TOOLTIPS[key].title}</h4>
                    <p className="text-xs text-slate-500 mt-1">{METRIC_TOOLTIPS[key].description}</p>
                    <div className="flex gap-4 mt-2 text-xs">
                      <span className="text-slate-400">Formula: <code className="text-blue-600">{METRIC_TOOLTIPS[key].formula}</code></span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      Thresholds: <span className="text-slate-600">{METRIC_TOOLTIPS[key].thresholds}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Best Practices */}
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <h3 className="text-lg font-bold text-blue-800 mb-3">Best Practices</h3>
              <ul className="space-y-2 text-sm text-blue-700">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-blue-500 flex-shrink-0" />
                  <span>Review the dashboard weekly to catch issues early</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-blue-500 flex-shrink-0" />
                  <span>Update initiatives regularly to avoid stale items</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-blue-500 flex-shrink-0" />
                  <span>Always document risk action logs when marking items as At Risk or Delayed</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-blue-500 flex-shrink-0" />
                  <span>Keep effort variance within ±10% to maintain predictable delivery</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-blue-500 flex-shrink-0" />
                  <span>Address items in the "Most Delayed" table as priority</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ResourcesDashboard: React.FC<WorkplanHealthDashboardProps> = ({
  filteredInitiatives,
  config,
  users
}) => {
  // Ref for horizontal scrolling table container
  const delayedTableRef = useRef<HTMLDivElement>(null);
  
  // Enable edge scrolling for horizontal scrolling
  useEdgeScrolling(delayedTableRef, {
    threshold: 50,
    maxSpeed: 10,
    horizontal: true,
    vertical: false,
  });
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

  // Enhanced health color helpers with gradients
  const _getHealthGradient = (score: number): string => {
    if (score >= 80) return 'from-emerald-400 to-emerald-500';
    if (score >= 60) return 'from-amber-400 to-amber-500';
    return 'from-red-400 to-red-500';
  };
  void _getHealthGradient; // Reserved for future use

  const healthMetrics = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // === SCHEDULE HEALTH ===
    const initiativesWithEta = filteredInitiatives.filter(i => i.eta && i.originalEta);
    
    const delayDays = initiativesWithEta.map(i => daysBetween(i.originalEta, i.eta));
    const avgDelay = delayDays.length > 0 
      ? Math.round(delayDays.reduce((a, b) => a + b, 0) / delayDays.length)
      : 0;
    
    const onTimeCount = initiativesWithEta.filter(i => i.eta <= i.originalEta).length;
    const onTimeRate = initiativesWithEta.length > 0 
      ? Math.round((onTimeCount / initiativesWithEta.length) * 100)
      : 100;

    const etaSlippageCount = initiativesWithEta.filter(i => i.eta !== i.originalEta).length;

    // Most delayed items
    const mostDelayed = [...filteredInitiatives]
      .filter(i => i.eta && i.originalEta)
      .map(i => ({ ...i, delayDays: daysBetween(i.originalEta, i.eta) }))
      .filter(i => i.delayDays > 0)
      .sort((a, b) => b.delayDays - a.delayDays)
      .slice(0, 5);

    // === EFFORT HEALTH ===
    const totalCurrentEffort = filteredInitiatives.reduce((sum, i) => sum + i.estimatedEffort, 0);
    const totalOriginalEffort = filteredInitiatives.reduce((sum, i) => sum + i.originalEstimatedEffort, 0);
    
    const effortVariance = totalOriginalEffort > 0 
      ? Math.round(((totalCurrentEffort - totalOriginalEffort) / totalOriginalEffort) * 100)
      : 0;

    const netScopeChange = totalCurrentEffort - totalOriginalEffort;

    // Estimation accuracy for completed items
    const completedItems = filteredInitiatives.filter(i => i.status === Status.Done && i.actualEffort > 0);
    const estimationAccuracy = completedItems.length > 0
      ? Math.round(
          (completedItems.reduce((sum, i) => sum + (i.originalEstimatedEffort / i.actualEffort), 0) / completedItems.length) * 100
        )
      : 100;

    // === CHANGE ACTIVITY ===
    const allChanges = filteredInitiatives.flatMap(i => i.history || []);
    const totalChanges = allChanges.length;
    const changeFrequency = filteredInitiatives.length > 0 
      ? (totalChanges / filteredInitiatives.length).toFixed(1)
      : '0';

    const recentChanges = allChanges.filter(c => new Date(c.timestamp) >= sevenDaysAgo).length;

    // Most volatile items
    const mostVolatile = [...filteredInitiatives]
      .map(i => ({ ...i, changeCount: (i.history || []).length }))
      .filter(i => i.changeCount > 0)
      .sort((a, b) => b.changeCount - a.changeCount)
      .slice(0, 5);

    // Change distribution by type
    const changesByField: Record<string, number> = {};
    allChanges.forEach(c => {
      changesByField[c.field] = (changesByField[c.field] || 0) + 1;
    });

    // === RISK INDICATORS & STATUS COUNTS ===
    const statusCounts = {
      notStarted: filteredInitiatives.filter(i => i.status === Status.NotStarted).length,
      inProgress: filteredInitiatives.filter(i => i.status === Status.InProgress).length,
      atRisk: filteredInitiatives.filter(i => i.status === Status.AtRisk).length,
      done: filteredInitiatives.filter(i => i.status === Status.Done).length,
    };

    const atRiskCount = statusCounts.atRisk;

    const riskItems = filteredInitiatives.filter(
      i => i.status === Status.AtRisk
    );
    const itemsWithRiskLog = riskItems.filter(i => i.riskActionLog && i.riskActionLog.trim().length > 0);
    const riskLogCompliance = riskItems.length > 0 
      ? Math.round((itemsWithRiskLog.length / riskItems.length) * 100)
      : 100;

    const staleItems = filteredInitiatives.filter(i => {
      const lastUpdate = new Date(i.lastUpdated);
      return lastUpdate < fourteenDaysAgo && i.status !== Status.Done;
    });

    // === COMPLETION RATE METRICS ===
    const activeInitiatives = filteredInitiatives.filter(i => i.status !== Status.Done);
    const initiativesWithCompletionRate = activeInitiatives.filter(i => i.completionRate !== undefined);
    
    const avgCompletionRate = initiativesWithCompletionRate.length > 0
      ? Math.round(initiativesWithCompletionRate.reduce((sum, i) => sum + (i.completionRate || 0), 0) / initiativesWithCompletionRate.length)
      : 0;
    
    const lowCompletionCount = activeInitiatives.filter(i => (i.completionRate || 0) < 30).length;

    // === PLANNING QUALITY ===
    // Delay distribution for histogram
    const delayBuckets = [
      { name: 'On Time', range: '≤0', count: 0, color: '#10b981' },
      { name: '1-7 days', range: '1-7', count: 0, color: '#f59e0b' },
      { name: '8-14 days', range: '8-14', count: 0, color: '#f97316' },
      { name: '15-30 days', range: '15-30', count: 0, color: '#ef4444' },
      { name: '30+ days', range: '30+', count: 0, color: '#dc2626' },
    ];

    initiativesWithEta.forEach(i => {
      const delay = daysBetween(i.originalEta, i.eta);
      if (delay <= 0) delayBuckets[0].count++;
      else if (delay <= 7) delayBuckets[1].count++;
      else if (delay <= 14) delayBuckets[2].count++;
      else if (delay <= 30) delayBuckets[3].count++;
      else delayBuckets[4].count++;
    });

    // Priority distribution
    const priorityData = [
      { name: 'P0', value: filteredInitiatives.filter(i => i.priority === Priority.P0).length, color: '#ef4444' },
      { name: 'P1', value: filteredInitiatives.filter(i => i.priority === Priority.P1).length, color: '#f59e0b' },
      { name: 'P2', value: filteredInitiatives.filter(i => i.priority === Priority.P2).length, color: '#3b82f6' },
    ];

    // === OVERALL HEALTH SCORE ===
    // Weighted average of key metrics
    const scheduleScore = Math.max(0, 100 - Math.abs(avgDelay) * 2);
    const effortScore = Math.max(0, 100 - Math.abs(effortVariance));
    const riskScore = filteredInitiatives.length > 0 
      ? Math.max(0, 100 - (atRiskCount / filteredInitiatives.length) * 200)
      : 100;
    const complianceScore = riskLogCompliance;

    const overallHealth = Math.round(
      (scheduleScore * 0.35) + (effortScore * 0.25) + (riskScore * 0.25) + (complianceScore * 0.15)
    );

    return {
      // Schedule
      avgDelay,
      onTimeRate,
      etaSlippageCount,
      mostDelayed,
      // Effort
      effortVariance,
      netScopeChange,
      estimationAccuracy,
      totalCurrentEffort,
      totalOriginalEffort,
      // Changes
      totalChanges,
      changeFrequency,
      recentChanges,
      mostVolatile,
      changesByField,
      // Risk & Status
      atRiskCount,
      riskLogCompliance,
      staleItems,
      riskItems,
      statusCounts,
      avgCompletionRate,
      lowCompletionCount,
      // Planning
      delayBuckets,
      priorityData,
      // Overall
      overallHealth,
      scheduleScore,
      effortScore,
      riskScore,
      initiativeCount: filteredInitiatives.length,
      // Baseline Variance
      varianceItems: filteredInitiatives.filter(i => 
        i.estimatedEffort !== i.originalEstimatedEffort || i.eta !== i.originalEta
      ),
    };
  }, [filteredInitiatives]);

  // Health Score History data (from config or mock)
  const healthHistory = useMemo(() => {
    const history = config.healthHistory || [];
    return history.map(h => ({
      ...h,
      date: new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }));
  }, [config.healthHistory]);

  // Burndown/Burnup data
  const burndownData = useMemo(() => {
    const totalPlannedEffort = filteredInitiatives.reduce((sum, i) => sum + i.estimatedEffort, 0);
    const totalActualEffort = filteredInitiatives.reduce((sum, i) => sum + i.actualEffort, 0);
    const completedEffort = filteredInitiatives
      .filter(i => i.status === Status.Done)
      .reduce((sum, i) => sum + i.actualEffort, 0);
    
    // Create weekly data points based on history
    const weeks: { week: string; planned: number; remaining: number; completed: number; actual: number }[] = [];
    
    // Get last 8 weeks
    for (let i = 7; i >= 0; i--) {
      const weekDate = new Date();
      weekDate.setDate(weekDate.getDate() - (i * 7));
      const weekLabel = weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      // Simulate progress over time (in real app, this would come from historical data)
      const progressFactor = (8 - i) / 8;
      weeks.push({
        week: weekLabel,
        planned: totalPlannedEffort,
        remaining: Math.round(totalPlannedEffort * (1 - progressFactor * 0.7) * 10) / 10,
        completed: Math.round(completedEffort * progressFactor * 10) / 10,
        actual: Math.round(totalActualEffort * progressFactor * 10) / 10
      });
    }
    
    return {
      weeks,
      totalPlanned: totalPlannedEffort,
      totalActual: totalActualEffort,
      completed: completedEffort,
      remaining: totalPlannedEffort - completedEffort
    };
  }, [filteredInitiatives]);

  // Buffer Usage Trend data
  const bufferTrendData = useMemo(() => {
    const history = config.healthHistory || [];
    return history.map(h => ({
      date: new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      used: h.bufferUsed,
      total: h.bufferTotal,
      remaining: h.bufferTotal - h.bufferUsed,
      percentUsed: h.bufferTotal > 0 ? Math.round((h.bufferUsed / h.bufferTotal) * 100) : 0
    }));
  }, [config.healthHistory]);

  const getOwnerName = (ownerId: string) => users.find(u => u.id === ownerId)?.name || 'Unknown';

  return (
    <div className="space-y-6">
      {/* Info Modal */}
      <InfoModal isOpen={isInfoModalOpen} onClose={() => setIsInfoModalOpen(false)} />

      {/* Header with Overall Health Score */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-850 to-slate-900 px-8 py-6 rounded-2xl shadow-xl border border-slate-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <MetricTooltip metricKey="healthScore" position="right">
              <div className={`p-3 rounded-xl ${getHealthBg(healthMetrics.overallHealth)} cursor-help`}>
                <Gauge className={`w-8 h-8 ${getHealthColor(healthMetrics.overallHealth)}`} />
              </div>
            </MetricTooltip>
            <div>
              <h2 className="text-xl font-bold text-white">Workplan Health Overview</h2>
              <p className="text-slate-400 text-sm">
                Analyzing {healthMetrics.initiativeCount} initiatives
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsInfoModalOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors text-sm"
            >
              <Info className="w-4 h-4" />
              <span>View All Metrics</span>
            </button>
            <MetricTooltip metricKey="healthScore" position="left">
              <div className="text-right cursor-help">
                <div className="flex items-baseline gap-2">
                  <span className={`text-5xl font-black ${getHealthColor(healthMetrics.overallHealth)}`}>
                    {healthMetrics.overallHealth}
                  </span>
                  <span className="text-slate-400 text-lg">/100</span>
                </div>
                <p className="text-slate-500 text-xs uppercase tracking-wider mt-1">Health Score</p>
              </div>
            </MetricTooltip>
          </div>
        </div>
        {/* Score Breakdown Bar */}
        <div className="mt-4 flex gap-1 h-2 rounded-full overflow-hidden bg-slate-700">
          <div 
            className="bg-emerald-500 transition-all duration-500" 
            style={{ width: `${healthMetrics.scheduleScore * 0.35}%` }} 
            title="Schedule Health"
          />
          <div 
            className="bg-blue-500 transition-all duration-500" 
            style={{ width: `${healthMetrics.effortScore * 0.25}%` }} 
            title="Effort Health"
          />
          <div 
            className="bg-amber-500 transition-all duration-500" 
            style={{ width: `${healthMetrics.riskScore * 0.25}%` }} 
            title="Risk Score"
          />
          <div 
            className="bg-purple-500 transition-all duration-500" 
            style={{ width: `${healthMetrics.riskLogCompliance * 0.15}%` }} 
            title="Compliance"
          />
        </div>
        <div className="mt-2 flex gap-6 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Schedule 35%</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /> Effort 25%</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Risk 25%</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500" /> Compliance 15%</span>
        </div>
      </div>

      {/* Schedule Health Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <MetricTooltip metricKey="avgDelay" position="bottom">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm cursor-help hover:shadow-md hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Avg Delay</p>
              </div>
              <TrafficLight status={healthMetrics.avgDelay <= 0 ? 'good' : healthMetrics.avgDelay <= 7 ? 'warning' : 'critical'} />
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl font-black ${healthMetrics.avgDelay <= 0 ? 'text-emerald-600' : healthMetrics.avgDelay <= 7 ? 'text-amber-500' : 'text-red-500'}`}>
                {healthMetrics.avgDelay > 0 ? '+' : ''}{healthMetrics.avgDelay}
              </span>
              <span className="text-slate-400 text-sm">days</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {healthMetrics.avgDelay <= 0 ? 'Ahead of schedule' : 'Behind original ETAs'}
            </p>
          </div>
        </MetricTooltip>

        <MetricTooltip metricKey="onTimeRate" position="bottom">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm cursor-help hover:shadow-md hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-slate-400" />
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">On-Time Rate</p>
              </div>
              <TrafficLight status={healthMetrics.onTimeRate >= 80 ? 'good' : healthMetrics.onTimeRate >= 60 ? 'warning' : 'critical'} />
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl font-black ${healthMetrics.onTimeRate >= 80 ? 'text-emerald-600' : healthMetrics.onTimeRate >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                {healthMetrics.onTimeRate}%
              </span>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${getHealthBarColor(healthMetrics.onTimeRate)}`}
                style={{ width: `${healthMetrics.onTimeRate}%` }}
              />
            </div>
          </div>
        </MetricTooltip>

        <MetricTooltip metricKey="etaSlippage" position="bottom">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm cursor-help hover:shadow-md hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">ETA Slippage</p>
              </div>
              <TrafficLight status={healthMetrics.etaSlippageCount === 0 ? 'good' : healthMetrics.etaSlippageCount <= 3 ? 'warning' : 'critical'} />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-slate-800">{healthMetrics.etaSlippageCount}</span>
              <span className="text-slate-400 text-sm">items</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">with ETA changes from baseline</p>
          </div>
        </MetricTooltip>
      </div>

      {/* Effort Health Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <MetricTooltip metricKey="effortVariance" position="bottom">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm cursor-help hover:shadow-md hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {healthMetrics.effortVariance >= 0 
                  ? <TrendingUp className="w-4 h-4 text-slate-400" />
                  : <TrendingDown className="w-4 h-4 text-slate-400" />
                }
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Effort Variance</p>
              </div>
              <TrafficLight status={Math.abs(healthMetrics.effortVariance) <= 10 ? 'good' : Math.abs(healthMetrics.effortVariance) <= 25 ? 'warning' : 'critical'} />
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl font-black ${Math.abs(healthMetrics.effortVariance) <= 10 ? 'text-emerald-600' : Math.abs(healthMetrics.effortVariance) <= 25 ? 'text-amber-500' : 'text-red-500'}`}>
                {healthMetrics.effortVariance > 0 ? '+' : ''}{healthMetrics.effortVariance}%
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {healthMetrics.effortVariance > 0 ? 'Scope increased from baseline' : healthMetrics.effortVariance < 0 ? 'Scope reduced from baseline' : 'On target'}
            </p>
          </div>
        </MetricTooltip>

        <MetricTooltip metricKey="netScopeChange" position="bottom">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm cursor-help hover:shadow-md hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-slate-400" />
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Net Scope Change</p>
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl font-black ${healthMetrics.netScopeChange === 0 ? 'text-slate-800' : healthMetrics.netScopeChange > 0 ? 'text-amber-500' : 'text-emerald-600'}`}>
                {healthMetrics.netScopeChange > 0 ? '+' : ''}{healthMetrics.netScopeChange}
              </span>
              <span className="text-slate-400 text-sm">weeks</span>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {healthMetrics.totalCurrentEffort}w current vs {healthMetrics.totalOriginalEffort}w original
            </p>
          </div>
        </MetricTooltip>

        <MetricTooltip metricKey="estimationAccuracy" position="bottom">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm cursor-help hover:shadow-md hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-slate-400" />
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Est. Accuracy</p>
              </div>
              <TrafficLight status={healthMetrics.estimationAccuracy >= 90 ? 'good' : healthMetrics.estimationAccuracy >= 70 ? 'warning' : 'critical'} />
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl font-black ${healthMetrics.estimationAccuracy >= 90 ? 'text-emerald-600' : healthMetrics.estimationAccuracy >= 70 ? 'text-amber-500' : 'text-red-500'}`}>
                {healthMetrics.estimationAccuracy}%
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2">Based on completed items</p>
          </div>
        </MetricTooltip>
      </div>

      {/* Change Activity & Risk Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Change Activity */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <FileEdit className="w-4 h-4" />
              Change Activity
            </h3>
            <span className="text-xs text-slate-400">{healthMetrics.totalChanges} total changes</span>
          </div>
          
          <div className="grid grid-cols-3 gap-4 mb-5">
            <MetricTooltip metricKey="totalChanges" position="bottom">
              <div className="text-center p-3 bg-slate-50 rounded-lg cursor-help hover:bg-slate-100 transition-colors">
                <div className="text-2xl font-bold text-slate-800">{healthMetrics.totalChanges}</div>
                <div className="text-xs text-slate-500">Total</div>
              </div>
            </MetricTooltip>
            <MetricTooltip metricKey="changeFrequency" position="bottom">
              <div className="text-center p-3 bg-blue-50 rounded-lg cursor-help hover:bg-blue-100 transition-colors">
                <div className="text-2xl font-bold text-blue-600">{healthMetrics.changeFrequency}</div>
                <div className="text-xs text-slate-500">Per Item</div>
              </div>
            </MetricTooltip>
            <MetricTooltip metricKey="recentChanges" position="bottom">
              <div className="text-center p-3 bg-emerald-50 rounded-lg cursor-help hover:bg-emerald-100 transition-colors">
                <div className="text-2xl font-bold text-emerald-600">{healthMetrics.recentChanges}</div>
                <div className="text-xs text-slate-500">Last 7 Days</div>
              </div>
            </MetricTooltip>
          </div>

          {healthMetrics.mostVolatile.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">Most Volatile Items</p>
              <div className="space-y-2">
                {healthMetrics.mostVolatile.map((item, idx) => (
                  <div key={item.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-4">{idx + 1}.</span>
                      <span className="text-sm text-slate-700 truncate max-w-[200px]">{item.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                        {item.changeCount} changes
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Status & Completion Health */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Status & Completion
            </h3>
          </div>
          
          {/* Status Distribution */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100">
              <div className="flex items-center justify-between">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="text-lg font-bold text-slate-600">{healthMetrics.statusCounts.notStarted}</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Not Started</div>
            </div>
            <div className="p-2.5 bg-blue-50 rounded-lg border border-blue-100">
              <div className="flex items-center justify-between">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-lg font-bold text-blue-600">{healthMetrics.statusCounts.inProgress}</span>
              </div>
              <div className="text-[10px] text-blue-600 mt-1">In Progress</div>
            </div>
            <div className="p-2.5 bg-red-50 rounded-lg border border-red-100">
              <div className="flex items-center justify-between">
                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                <span className="text-lg font-bold text-red-600">{healthMetrics.statusCounts.atRisk}</span>
              </div>
              <div className="text-[10px] text-red-600 mt-1">At Risk</div>
            </div>
            <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-100">
              <div className="flex items-center justify-between">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-lg font-bold text-emerald-600">{healthMetrics.statusCounts.done}</span>
              </div>
              <div className="text-[10px] text-emerald-600 mt-1">Done</div>
            </div>
          </div>

          {/* Completion Rate */}
          <div className="mb-4">
            <MetricTooltip metricKey="avgCompletionRate" position="top">
              <div className="cursor-help">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-500">Avg. Completion Rate</span>
                  <span className={`text-xs font-semibold ${healthMetrics.avgCompletionRate >= 70 ? 'text-emerald-600' : healthMetrics.avgCompletionRate >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                    {healthMetrics.avgCompletionRate}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${healthMetrics.avgCompletionRate >= 70 ? 'bg-emerald-500' : healthMetrics.avgCompletionRate >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${healthMetrics.avgCompletionRate}%` }}
                  />
                </div>
              </div>
            </MetricTooltip>
          </div>

          {/* Low Completion Items & Stale Items */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <MetricTooltip metricKey="lowCompletionItems" position="top">
              <div className="flex items-center justify-between cursor-help">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-amber-500" />
                  <span className="text-sm text-slate-600">Low Completion (&lt;30%)</span>
                </div>
                <span className={`text-sm font-bold ${healthMetrics.lowCompletionCount === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {healthMetrics.lowCompletionCount}
                </span>
              </div>
            </MetricTooltip>

            <MetricTooltip metricKey="staleItems" position="top">
              <div className="flex items-center justify-between cursor-help">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-600">Stale (14+ days)</span>
                </div>
                <span className={`text-sm font-bold ${healthMetrics.staleItems.length === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {healthMetrics.staleItems.length}
                </span>
              </div>
            </MetricTooltip>
          </div>
        </div>
      </div>

      {/* Health Score History Chart */}
      {healthHistory.length > 0 && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-500" />
              Health Score Trend
            </h3>
            <span className="text-xs text-slate-400">Last {healthHistory.length} snapshots</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={healthHistory} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number, name: string) => [`${value}`, name.replace('Score', ' Score')]}
                />
                <Legend />
                <ReferenceLine y={80} stroke="#10b981" strokeDasharray="5 5" label={{ value: 'Good', fill: '#10b981', fontSize: 10 }} />
                <ReferenceLine y={60} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: 'Warning', fill: '#f59e0b', fontSize: 10 }} />
                <Line 
                  type="monotone" 
                  dataKey="healthScore" 
                  name="Overall Health"
                  stroke="#6366f1" 
                  strokeWidth={3}
                  dot={{ fill: '#6366f1', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="scheduleScore" 
                  name="Schedule"
                  stroke="#10b981" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: '#10b981', strokeWidth: 1, r: 3 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="effortScore" 
                  name="Effort"
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: '#3b82f6', strokeWidth: 1, r: 3 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="riskScore" 
                  name="Risk"
                  stroke="#f59e0b" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={{ fill: '#f59e0b', strokeWidth: 1, r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Burndown/Burnup Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Burndown Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-blue-500" />
              Effort Burndown
            </h3>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-slate-500">Total: <span className="font-bold text-slate-700">{burndownData.totalPlanned}w</span></span>
              <span className="text-slate-500">Remaining: <span className="font-bold text-amber-600">{burndownData.remaining}w</span></span>
            </div>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={burndownData.weeks} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`${value}w`, '']}
                />
                <ReferenceLine y={burndownData.totalPlanned} stroke="#94a3b8" strokeDasharray="5 5" />
                <Area 
                  type="monotone" 
                  dataKey="remaining" 
                  name="Remaining"
                  stroke="#f59e0b" 
                  fill="#fef3c7"
                  strokeWidth={2}
                />
                <Area 
                  type="monotone" 
                  dataKey="actual" 
                  name="Actual Consumed"
                  stroke="#3b82f6" 
                  fill="#dbeafe"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-200 border border-amber-400" />
              Remaining Effort
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-blue-200 border border-blue-400" />
              Actual Consumed
            </span>
          </div>
        </div>

        {/* Burnup Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              Effort Burnup
            </h3>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-slate-500">Completed: <span className="font-bold text-emerald-600">{burndownData.completed}w</span></span>
            </div>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={burndownData.weeks} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`${value}w`, '']}
                />
                <ReferenceLine y={burndownData.totalPlanned} stroke="#94a3b8" strokeDasharray="5 5" label={{ value: 'Target', fill: '#94a3b8', fontSize: 10 }} />
                <Area 
                  type="monotone" 
                  dataKey="completed" 
                  name="Completed"
                  stroke="#10b981" 
                  fill="#d1fae5"
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="planned" 
                  name="Planned Scope"
                  stroke="#6366f1" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-200 border border-emerald-400" />
              Completed Work
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-indigo-500" style={{ borderStyle: 'dashed' }} />
              Planned Scope
            </span>
          </div>
        </div>
      </div>

      {/* Buffer Usage Trend */}
      {bufferTrendData.length > 0 && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Shield className="w-4 h-4 text-purple-500" />
              BAU Buffer Usage Trend
            </h3>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-slate-500">Latest: <span className="font-bold text-purple-600">{bufferTrendData[bufferTrendData.length - 1]?.percentUsed || 0}% used</span></span>
            </div>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bufferTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number, name: string) => {
                    if (name === 'used') return [`${value}w used`, 'Buffer Used'];
                    if (name === 'remaining') return [`${value}w left`, 'Buffer Remaining'];
                    return [`${value}w`, name];
                  }}
                />
                <ReferenceLine y={bufferTrendData[0]?.total || 0} stroke="#94a3b8" strokeDasharray="5 5" label={{ value: 'Total Allocated', fill: '#94a3b8', fontSize: 10, position: 'right' }} />
                <Area 
                  type="monotone" 
                  dataKey="used" 
                  name="used"
                  stroke="#a855f7" 
                  fill="#f3e8ff"
                  strokeWidth={2}
                  stackId="1"
                />
                <Area 
                  type="monotone" 
                  dataKey="remaining" 
                  name="remaining"
                  stroke="#10b981" 
                  fill="#d1fae5"
                  strokeWidth={2}
                  stackId="1"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-purple-200 border border-purple-400" />
              Buffer Used
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-200 border border-emerald-400" />
              Buffer Remaining
            </span>
          </div>
        </div>
      )}

      {/* Planning Quality Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Delay Distribution */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-4 bg-gradient-to-b from-emerald-500 to-red-500 rounded-full"></span>
            Delay Distribution
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={healthMetrics.delayBuckets} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`${value} items`, 'Count']}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {healthMetrics.delayBuckets.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Priority Distribution */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-4 bg-gradient-to-b from-red-500 via-amber-500 to-blue-500 rounded-full"></span>
            Priority Distribution
          </h3>
          <div className="h-48 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={healthMetrics.priorityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                  labelLine={false}
                >
                  {healthMetrics.priorityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-2">
            {healthMetrics.priorityData.map(p => (
              <div key={p.name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="text-xs text-slate-600">{p.name}: {p.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Most Delayed Items Table */}
      {healthMetrics.mostDelayed.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-red-50 to-amber-50 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Most Delayed Items
            </h3>
          </div>
          <div ref={delayedTableRef} className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-b from-slate-50 to-white border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Initiative</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Owner</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Original ETA</th>
                  <th className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Current ETA</th>
                  <th className="text-right py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Days Delayed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {healthMetrics.mostDelayed.map((item) => (
                  <tr key={item.id} className="hover:bg-red-50/30 transition-colors">
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-800">{item.title}</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{getOwnerName(item.ownerId)}</td>
                    <td className="py-3.5 px-4 text-slate-500 font-mono text-xs">{item.originalEta}</td>
                    <td className="py-3.5 px-4 text-slate-500 font-mono text-xs">{item.eta}</td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-gradient-to-r from-red-500 to-red-600 text-white shadow-sm">
                        +{item.delayDays}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Baseline Variance Report */}
      {healthMetrics.varianceItems.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-600" /> Baseline Variance Report
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Initiatives that have deviated from their original planning baseline.
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-sm">
              <thead className="bg-gradient-to-b from-slate-50 to-white sticky top-0 shadow-sm">
                <tr>
                  <th className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">Initiative</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">Original Effort</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">Current Effort</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">Variance</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">Original ETA</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">Current ETA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {healthMetrics.varianceItems.map(item => {
                  const effortDiff = item.estimatedEffort - item.originalEstimatedEffort;
                  return (
                    <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3 font-semibold truncate max-w-[200px] text-slate-800" title={item.title}>
                        {item.title}
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{item.originalEstimatedEffort}w</td>
                      <td className="px-4 py-3 font-semibold text-slate-700 font-mono text-xs">{item.estimatedEffort}w</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ${
                          effortDiff > 0 ? 'bg-red-100 text-red-700' : effortDiff < 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {effortDiff > 0 ? '+' : ''}{effortDiff}w
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{item.originalEta}</td>
                      <td className={`px-4 py-3 font-mono text-xs ${
                        item.eta !== item.originalEta ? 'text-blue-600 font-semibold' : 'text-slate-500'
                      }`}>
                        {item.eta}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
