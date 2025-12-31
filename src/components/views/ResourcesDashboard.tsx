import React, { useMemo, useState, useRef, useCallback, memo, useEffect } from 'react';
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
import { Initiative, AppConfig, User, Status } from '../../types';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  CartesianGrid, AreaChart, Area, ReferenceLine
} from 'recharts';
import { useDebounce, useIntersectionObserver } from '../../hooks';
import { calculateCompletionRate, metricsCache, paginate } from '../../utils';

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

// === CALCULATION HELPERS (Split for better memoization) ===

function calculateScheduleMetrics(initiatives: Initiative[]) {
  const initiativesWithEta = initiatives.filter(i => i.eta && i.originalEta);
  
  const delayDays = initiativesWithEta.map(i => daysBetween(i.originalEta!, i.eta!));
  const avgDelay = delayDays.length > 0 
    ? Math.round(delayDays.reduce((a, b) => a + b, 0) / delayDays.length)
    : 0;
  
  const onTimeCount = initiativesWithEta.filter(i => i.eta! <= i.originalEta!).length;
  const onTimeRate = initiativesWithEta.length > 0 
    ? Math.round((onTimeCount / initiativesWithEta.length) * 100)
    : 100;

  const etaSlippageCount = initiativesWithEta.filter(i => i.eta !== i.originalEta).length;

  // Most delayed items
  const mostDelayed = [...initiatives]
    .filter(i => i.eta && i.originalEta)
    .map(i => ({ ...i, delayDays: daysBetween(i.originalEta!, i.eta!) }))
    .filter(i => i.delayDays > 0)
    .sort((a, b) => b.delayDays - a.delayDays)
    .slice(0, 5);

  return { avgDelay, onTimeRate, etaSlippageCount, mostDelayed };
}

function calculateEffortMetrics(initiatives: Initiative[]) {
  const totalCurrentEffort = initiatives.reduce((sum, i) => {
    const effort = Number(i.estimatedEffort) || 0;
    return sum + (isNaN(effort) ? 0 : effort);
  }, 0);
  const totalOriginalEffort = initiatives.reduce((sum, i) => {
    const effort = Number(i.originalEstimatedEffort) || 0;
    return sum + (isNaN(effort) ? 0 : effort);
  }, 0);
  
  const effortVariance = totalOriginalEffort > 0 
    ? Math.round(((totalCurrentEffort - totalOriginalEffort) / totalOriginalEffort) * 100)
    : 0;

  const netScopeChange = isNaN(totalCurrentEffort) || isNaN(totalOriginalEffort) 
    ? 0 
    : totalCurrentEffort - totalOriginalEffort;

  // Estimation accuracy for completed items
  // Measures how close estimates were to actuals (100% = perfect, lower = less accurate)
  // Formula: min(Original, Actual) / max(Original, Actual) × 100
  // This gives 100% when they match, and decreases as they diverge
  const completedItems = initiatives.filter(i => 
    i.status === Status.Done && 
    i.actualEffort && 
    i.actualEffort > 0 &&
    i.originalEstimatedEffort && 
    i.originalEstimatedEffort > 0
  );
  
  const estimationAccuracy = completedItems.length > 0
    ? Math.round(
        (completedItems.reduce((sum, i) => {
          const original = i.originalEstimatedEffort!;
          const actual = i.actualEffort!;
          const min = Math.min(original, actual);
          const max = Math.max(original, actual);
          return sum + (min / max) * 100;
        }, 0) / completedItems.length)
      )
    : 100;

  return {
    effortVariance,
    netScopeChange,
    estimationAccuracy,
    totalCurrentEffort,
    totalOriginalEffort,
  };
}

function calculateObsoleteEffortMetrics(initiatives: Initiative[]) {
  // Get all obsolete initiatives
  const obsoleteInitiatives = initiatives.filter(i => i.status === Status.Obsolete);
  
  // Calculate effort for obsolete initiatives
  const obsoleteEstimatedEffort = obsoleteInitiatives.reduce((sum, i) => {
    const effort = Number(i.estimatedEffort) || 0;
    return sum + (isNaN(effort) ? 0 : effort);
  }, 0);
  
  const obsoleteActualEffort = obsoleteInitiatives.reduce((sum, i) => {
    const effort = Number(i.actualEffort) || 0;
    return sum + (isNaN(effort) ? 0 : effort);
  }, 0);

  // Calculate effort for obsolete tasks within initiatives
  let obsoleteTaskEstimatedEffort = 0;
  let obsoleteTaskActualEffort = 0;
  
  initiatives.forEach(initiative => {
    if (initiative.tasks) {
      initiative.tasks.forEach(task => {
        if (task.status === Status.Obsolete) {
          obsoleteTaskEstimatedEffort += Number(task.estimatedEffort) || 0;
          obsoleteTaskActualEffort += Number(task.actualEffort) || 0;
        }
      });
    }
  });

  const totalObsoleteEstimatedEffort = obsoleteEstimatedEffort + obsoleteTaskEstimatedEffort;
  const totalObsoleteActualEffort = obsoleteActualEffort + obsoleteTaskActualEffort;

  return {
    obsoleteInitiatives,
    obsoleteEstimatedEffort,
    obsoleteActualEffort,
    obsoleteTaskEstimatedEffort,
    obsoleteTaskActualEffort,
    totalObsoleteEstimatedEffort,
    totalObsoleteActualEffort,
    obsoleteCount: obsoleteInitiatives.length,
  };
}

function calculateChangeMetrics(initiatives: Initiative[]) {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const allChanges = initiatives.flatMap(i => i.history || []);
  const totalChanges = allChanges.length;
  const changeFrequency = initiatives.length > 0 
    ? (totalChanges / initiatives.length).toFixed(1)
    : '0';

  const recentChanges = allChanges.filter(c => new Date(c.timestamp) >= sevenDaysAgo).length;

  // Most volatile items
  const mostVolatile = [...initiatives]
    .map(i => ({ ...i, changeCount: (i.history || []).length }))
    .filter(i => i.changeCount > 0)
    .sort((a, b) => b.changeCount - a.changeCount)
    .slice(0, 5);

  // Change distribution by type
  const changesByField: Record<string, number> = {};
  allChanges.forEach(c => {
    changesByField[c.field] = (changesByField[c.field] || 0) + 1;
  });

  return { totalChanges, changeFrequency, recentChanges, mostVolatile, changesByField };
}

function calculateRiskMetrics(initiatives: Initiative[]) {
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const statusCounts = {
    notStarted: initiatives.filter(i => i.status === Status.NotStarted).length,
    inProgress: initiatives.filter(i => i.status === Status.InProgress).length,
    atRisk: initiatives.filter(i => i.status === Status.AtRisk).length,
    done: initiatives.filter(i => i.status === Status.Done).length,
    obsolete: initiatives.filter(i => i.status === Status.Obsolete).length,
  };

  const atRiskCount = statusCounts.atRisk;

  const riskItems = initiatives.filter(i => i.status === Status.AtRisk);
  const itemsWithRiskLog = riskItems.filter(i => i.riskActionLog && i.riskActionLog.trim().length > 0);
  const riskLogCompliance = riskItems.length > 0 
    ? Math.round((itemsWithRiskLog.length / riskItems.length) * 100)
    : 100;

  const staleItems = initiatives.filter(i => {
    const lastUpdate = new Date(i.lastUpdated);
    return lastUpdate < fourteenDaysAgo && i.status !== Status.Done && i.status !== Status.Obsolete;
  });

  // Stale weekly updates: items not updated since last Thursday
  const dayOfWeek = now.getDay();
  const daysSinceThursday = dayOfWeek >= 4 ? dayOfWeek - 4 : (7 - 4) + dayOfWeek;
  const lastThursday = new Date(now.getTime() - daysSinceThursday * 24 * 60 * 60 * 1000);
  lastThursday.setHours(23, 59, 59, 999);
  
  const staleWeeklyUpdates = initiatives.filter(i => {
    if (i.status === Status.Done || i.status === Status.Obsolete) return false;
    if (!i.lastWeeklyUpdate) return true;
    const lastUpdate = new Date(i.lastWeeklyUpdate);
    return lastUpdate < lastThursday;
  });

  // Overlooked items
  const overlookedItems = initiatives.filter(i => 
    (i.overlookedCount || 0) > 2 && i.status !== Status.Done && i.status !== Status.Obsolete
  );

  // Baseline variance items - enhanced logic
  const varianceItems = initiatives
    .filter(i => {
      // Filter for significant variances: >10% effort change or >7 days ETA change
      const hasEffortVariance = i.estimatedEffort !== i.originalEstimatedEffort;
      const hasEtaVariance = i.eta !== i.originalEta;
      
      if (!hasEffortVariance && !hasEtaVariance) return false;
      
      // Check if effort variance is significant (>10%)
      if (hasEffortVariance && i.originalEstimatedEffort && i.originalEstimatedEffort > 0) {
        const effortPercentChange = Math.abs((i.estimatedEffort || 0) - i.originalEstimatedEffort) / i.originalEstimatedEffort * 100;
        if (effortPercentChange > 10) return true;
      }
      
      // Check if ETA variance is significant (>7 days)
      if (hasEtaVariance && i.originalEta && i.eta) {
        const etaDaysDiff = Math.abs(daysBetween(i.originalEta, i.eta));
        if (etaDaysDiff > 7) return true;
      }
      
      // Include if either variance exists (even if not "significant" by thresholds)
      return hasEffortVariance || hasEtaVariance;
    })
    .map(i => {
      // Calculate variance metrics for sorting
      const effortDiff = (i.estimatedEffort || 0) - (i.originalEstimatedEffort || 0);
      const effortPercentChange = i.originalEstimatedEffort && i.originalEstimatedEffort > 0
        ? Math.abs(effortDiff / i.originalEstimatedEffort * 100)
        : 0;
      const etaDaysDiff = (i.originalEta && i.eta) ? Math.abs(daysBetween(i.originalEta, i.eta)) : 0;
      
      // Calculate combined variance score for sorting (weighted)
      const varianceScore = (effortPercentChange * 0.6) + (etaDaysDiff * 0.4);
      
      return {
        ...i,
        effortDiff,
        effortPercentChange,
        etaDaysDiff,
        varianceScore
      };
    })
    .sort((a, b) => b.varianceScore - a.varianceScore); // Sort by largest variance first

  return {
    atRiskCount,
    riskLogCompliance,
    staleItems,
    riskItems,
    statusCounts,
    staleWeeklyUpdates,
    overlookedItems,
    varianceItems,
  };
}

function calculateCompletionMetrics(initiatives: Initiative[]) {
  const activeInitiatives = initiatives.filter(i => i.status !== Status.Done);
  
  const completionRates = activeInitiatives.map(i => calculateCompletionRate(i.actualEffort, i.estimatedEffort));
  const avgCompletionRate = completionRates.length > 0
    ? Math.round(completionRates.reduce((sum, rate) => sum + rate, 0) / completionRates.length)
    : 0;
  
  const lowCompletionCount = completionRates.filter(rate => rate < 30).length;

  return { avgCompletionRate, lowCompletionCount };
}

function calculateDelayDistribution(initiatives: Initiative[]) {
  const initiativesWithEta = initiatives.filter(i => i.eta && i.originalEta);
  
  const delayBuckets = [
    { name: 'On Time', range: '≤0', count: 0, color: '#10b981' },
    { name: '1-7 days', range: '1-7', count: 0, color: '#f59e0b' },
    { name: '8-14 days', range: '8-14', count: 0, color: '#f97316' },
    { name: '15-30 days', range: '15-30', count: 0, color: '#ef4444' },
    { name: '30+ days', range: '30+', count: 0, color: '#dc2626' },
  ];

  initiativesWithEta.forEach(i => {
    const delay = daysBetween(i.originalEta!, i.eta!);
    if (delay <= 0) delayBuckets[0].count++;
    else if (delay <= 7) delayBuckets[1].count++;
    else if (delay <= 14) delayBuckets[2].count++;
    else if (delay <= 30) delayBuckets[3].count++;
    else delayBuckets[4].count++;
  });

  return delayBuckets;
}

function calculateCompletionTimeDistribution(initiatives: Initiative[]) {
  // Filter for completed initiatives with createdAt
  const completedInitiatives = initiatives.filter(
    i => i.status === Status.Done && i.createdAt
  );

  if (completedInitiatives.length === 0) {
    return {
      buckets: [
        { name: '0-7 days', range: '0-7', count: 0, color: '#10b981' },
        { name: '8-14 days', range: '8-14', count: 0, color: '#fbbf24' },
        { name: '15-30 days', range: '15-30', count: 0, color: '#f97316' },
        { name: '31-60 days', range: '31-60', count: 0, color: '#ef4444' },
        { name: '60+ days', range: '60+', count: 0, color: '#dc2626' },
      ],
      avgCompletionDays: 0,
      medianCompletionDays: 0,
      totalCompleted: 0,
    };
  }

  const completionTimes: number[] = [];

  completedInitiatives.forEach(i => {
    let completionDate: string | null = null;

    // Try to find when status changed to Done in history
    if (i.history && i.history.length > 0) {
      const doneChange = i.history.find(
        change => change.field === 'Status' && change.newValue === Status.Done
      );
      if (doneChange) {
        completionDate = doneChange.timestamp;
      }
    }

    // Fallback to lastUpdated if no history record found
    if (!completionDate) {
      completionDate = i.lastUpdated;
    }

    if (completionDate && i.createdAt) {
      try {
        const days = daysBetween(i.createdAt, completionDate);
        if (days >= 0) {
          completionTimes.push(days);
        }
      } catch {
        // Skip invalid dates
      }
    }
  });

  // Create distribution buckets
  const buckets = [
    { name: '0-7 days', range: '0-7', count: 0, color: '#10b981' },
    { name: '8-14 days', range: '8-14', count: 0, color: '#fbbf24' },
    { name: '15-30 days', range: '15-30', count: 0, color: '#f97316' },
    { name: '31-60 days', range: '31-60', count: 0, color: '#ef4444' },
    { name: '60+ days', range: '60+', count: 0, color: '#dc2626' },
  ];

  completionTimes.forEach(days => {
    if (days <= 7) buckets[0].count++;
    else if (days <= 14) buckets[1].count++;
    else if (days <= 30) buckets[2].count++;
    else if (days <= 60) buckets[3].count++;
    else buckets[4].count++;
  });

  // Calculate average and median
  const avgCompletionDays = completionTimes.length > 0
    ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length)
    : 0;

  const sortedTimes = [...completionTimes].sort((a, b) => a - b);
  const medianCompletionDays = sortedTimes.length > 0
    ? sortedTimes[Math.floor(sortedTimes.length / 2)]
    : 0;

  return {
    buckets,
    avgCompletionDays,
    medianCompletionDays,
    totalCompleted: completedInitiatives.length,
  };
}

// Health score color helper
const _getHealthColor = (score: number): string => {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-500';
  return 'text-red-500';
};
void _getHealthColor; // Reserved for health score styling

const _getHealthBg = (score: number): string => {
  if (score >= 80) return 'bg-emerald-50';
  if (score >= 60) return 'bg-amber-50';
  return 'bg-red-50';
};
void _getHealthBg; // Reserved for health background styling

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

// Memoized table row components for performance
const DelayedItemRow = memo<{ item: Initiative & { delayDays: number }; getOwnerName: (id: string) => string }>(
  ({ item, getOwnerName }) => (
    <tr className="hover:bg-red-50/30 transition-colors">
      <td className="py-2 px-3">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-mono font-semibold rounded flex-shrink-0">
            {item.id}
          </span>
          <span className="font-semibold text-slate-800">{item.title}</span>
        </div>
      </td>
      <td className="py-2 px-3 text-slate-600 text-xs">{getOwnerName(item.ownerId)}</td>
      <td className="py-2 px-3 text-slate-500 font-mono text-xs">{item.originalEta}</td>
      <td className="py-2 px-3 text-slate-500 font-mono text-xs">{item.eta}</td>
      <td className="py-2 px-3 text-right">
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-gradient-to-r from-red-500 to-red-600 text-white shadow-sm">
          +{item.delayDays}d
        </span>
      </td>
    </tr>
  )
);
DelayedItemRow.displayName = 'DelayedItemRow';

const StaleUpdateRow = memo<{ item: Initiative; getOwnerName: (id: string) => string }>(
  ({ item, getOwnerName }) => (
    <tr className="hover:bg-amber-50/30 transition-colors">
      <td className="px-3 py-2 font-semibold truncate max-w-[200px] text-slate-800 text-xs" title={item.title}>
        {item.title}
      </td>
      <td className="px-3 py-2 text-slate-600 text-xs">{getOwnerName(item.ownerId)}</td>
      <td className="px-3 py-2 text-slate-500 font-mono text-xs">{item.lastUpdated}</td>
      <td className="px-3 py-2 text-slate-500 font-mono text-xs">{item.lastWeeklyUpdate || 'Never'}</td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ${
          item.status === Status.AtRisk ? 'bg-red-100 text-red-700' :
          item.status === Status.InProgress ? 'bg-blue-100 text-blue-700' :
          'bg-slate-100 text-slate-600'
        }`}>
          {item.status}
        </span>
      </td>
    </tr>
  )
);
StaleUpdateRow.displayName = 'StaleUpdateRow';

const OverlookedItemRow = memo<{ item: Initiative; getOwnerName: (id: string) => string }>(
  ({ item, getOwnerName }) => (
    <tr className="hover:bg-red-50/30 transition-colors">
      <td className="px-3 py-2 font-semibold truncate max-w-[200px] text-slate-800 text-xs" title={item.title}>
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-mono font-semibold rounded flex-shrink-0">
            {item.id}
          </span>
          <span>{item.title}</span>
        </div>
      </td>
      <td className="px-3 py-2 text-slate-600 text-xs">{getOwnerName(item.ownerId)}</td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-gradient-to-r from-red-500 to-red-600 text-white shadow-sm">
          {item.overlookedCount}x
        </span>
      </td>
      <td className="px-3 py-2 text-slate-500 font-mono text-xs">{item.lastDelayDate || 'N/A'}</td>
      <td className="px-3 py-2 text-slate-500 font-mono text-xs">{item.eta || 'N/A'}</td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ${
          item.status === Status.AtRisk ? 'bg-red-100 text-red-700' :
          item.status === Status.InProgress ? 'bg-blue-100 text-blue-700' :
          'bg-slate-100 text-slate-600'
        }`}>
          {item.status}
        </span>
      </td>
    </tr>
  )
);
OverlookedItemRow.displayName = 'OverlookedItemRow';

const VarianceItemRow = memo<{ item: Initiative & { effortDiff?: number; effortPercentChange?: number; etaDaysDiff?: number } }>(
  ({ item }) => {
    const effortDiff = item.effortDiff ?? ((item.estimatedEffort || 0) - (item.originalEstimatedEffort || 0));
    const effortPercentChange = item.effortPercentChange ?? (item.originalEstimatedEffort && item.originalEstimatedEffort > 0
      ? Math.abs(effortDiff / item.originalEstimatedEffort * 100)
      : 0);
    const etaDaysDiff = item.etaDaysDiff ?? (item.originalEta && item.eta ? Math.abs(daysBetween(item.originalEta, item.eta)) : 0);
    
    // Determine variance severity
    const isSignificantEffort = effortPercentChange > 10;
    const isSignificantEta = etaDaysDiff > 7;
    
    return (
      <tr className="hover:bg-blue-50/30 transition-colors">
        <td className="px-3 py-2 font-semibold truncate max-w-[200px] text-slate-800 text-xs" title={item.title}>
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-mono font-semibold rounded flex-shrink-0">
              {item.id}
            </span>
            <span className="text-xs">{item.title}</span>
            {(isSignificantEffort || isSignificantEta) && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" title="Significant variance" />
            )}
          </div>
        </td>
        <td className="px-3 py-2 text-slate-500 font-mono text-xs">{item.originalEstimatedEffort || 0}w</td>
        <td className="px-3 py-2 font-semibold text-slate-700 font-mono text-xs">{item.estimatedEffort || 0}w</td>
        <td className="px-3 py-2">
          <div className="flex flex-col gap-0.5">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ${
              effortDiff > 0 ? 'bg-red-100 text-red-700' : effortDiff < 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}>
              {effortDiff > 0 ? '+' : ''}{effortDiff}w
            </span>
            {item.originalEstimatedEffort && item.originalEstimatedEffort > 0 && (
              <span className={`text-[9px] ${isSignificantEffort ? 'font-bold text-amber-600' : 'text-slate-500'}`}>
                {effortPercentChange.toFixed(0)}%
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2 text-slate-500 font-mono text-xs">{item.originalEta || 'N/A'}</td>
        <td className={`px-3 py-2 font-mono text-xs ${
          item.eta !== item.originalEta 
            ? (isSignificantEta ? 'text-red-600 font-bold' : 'text-blue-600 font-semibold')
            : 'text-slate-500'
        }`}>
          {item.eta || 'N/A'}
          {isSignificantEta && item.eta && item.originalEta && (
            <span className="ml-1 text-[9px] text-red-600">({etaDaysDiff > 0 ? '+' : ''}{etaDaysDiff}d)</span>
          )}
        </td>
      </tr>
    );
  }
);
VarianceItemRow.displayName = 'VarianceItemRow';

// Interpretation helper functions
const getPercentageInterpretation = (value: number, thresholds: { good: number; warning: number }): string | null => {
  if (value >= thresholds.good) {
    return `Excellent - ${value}% is in the healthy range.`;
  } else if (value >= thresholds.warning) {
    return `Good - ${value}% is acceptable but could be improved.`;
  } else {
    return `Needs attention - ${value}% is below target.`;
  }
};

const getCountInterpretation = (value: number, isLowerBetter: boolean = false): string | null => {
  if (isLowerBetter) {
    if (value === 0) {
      return 'Perfect - no issues found.';
    } else if (value <= 2) {
      return `Good - only ${value} item${value === 1 ? '' : 's'} need attention.`;
    } else {
      return `Needs attention - ${value} items require action.`;
    }
  } else {
    if (value === 0) {
      return 'No activity recorded.';
    } else {
      return `Current value: ${value}.`;
    }
  }
};

const getDelayInterpretation = (value: number): string | null => {
  if (value <= 0) {
    return 'On schedule or ahead - no delays.';
  } else if (value <= 7) {
    return `Minor delay - average of ${value} days behind schedule.`;
  } else if (value <= 14) {
    return `Moderate delay - average of ${value} days behind schedule.`;
  } else {
    return `Significant delay - average of ${value} days behind schedule.`;
  }
};

const getVarianceInterpretation = (value: number): string | null => {
  const absValue = Math.abs(value);
  if (absValue <= 10) {
    return value > 0 
      ? `Minimal scope increase - ${value}% variance is within acceptable range.`
      : `Minimal scope reduction - ${Math.abs(value)}% variance is within acceptable range.`;
  } else if (absValue <= 25) {
    return value > 0
      ? `Moderate scope increase - ${value}% variance indicates some scope creep.`
      : `Moderate scope reduction - ${Math.abs(value)}% variance indicates scope reduction.`;
  } else {
    return value > 0
      ? `Significant scope increase - ${value}% variance indicates major scope creep.`
      : `Significant scope reduction - ${Math.abs(value)}% variance indicates major scope reduction.`;
  }
};

const getScopeChangeInterpretation = (value: number): string | null => {
  if (value === 0) {
    return 'No scope change - plan matches original baseline.';
  } else if (value > 0) {
    return `Scope increased by ${value} weeks from original plan.`;
  } else {
    return `Scope reduced by ${Math.abs(value)} weeks from original plan.`;
  }
};

const getHealthScoreInterpretation = (value: number): string | null => {
  if (value >= 80) {
    return 'Excellent health - workplan is in great shape.';
  } else if (value >= 60) {
    return 'Good health - workplan is generally healthy but has some areas to improve.';
  } else {
    return 'Needs attention - workplan has significant issues requiring immediate action.';
  }
};

// Metric tooltip type definition
interface MetricTooltipConfig {
  title: string;
  description: string;
  calculation?: string;
  formula?: string; // Alternative name for calculation
  calculationExample?: string;
  interpretationFn?: (value: number) => string | null;
  thresholds?: string;
}

// Metric tooltip definitions
const METRIC_TOOLTIPS: Record<string, MetricTooltipConfig> = {
  healthScore: {
    title: 'Overall Health Score',
    description: 'A composite score (0-100) measuring the overall health of your workplan based on four weighted factors.',
    calculation: 'Weighted average of Schedule (35%), Effort (25%), Risk (25%), and Compliance (15%) scores.',
    interpretationFn: getHealthScoreInterpretation,
    thresholds: 'Green: 80+  |  Amber: 60-79  |  Red: <60'
  },
  avgDelay: {
    title: 'Average Delay',
    description: 'Mean number of days between current ETA and original baseline ETA across all initiatives.',
    calculation: 'Average of (Current ETA - Original ETA) for all initiatives with both dates.',
    calculationExample: 'If 3 items are delayed by 5, 10, and 15 days → (5+10+15)÷3 = 10 days',
    interpretationFn: getDelayInterpretation,
    thresholds: 'Green: ≤0 days  |  Amber: 1-7 days  |  Red: >7 days'
  },
  onTimeRate: {
    title: 'On-Time Rate',
    description: 'Percentage of initiatives where the current ETA is on or before the original planned ETA.',
    calculation: 'Count of items with Current ETA ≤ Original ETA, divided by total items, multiplied by 100.',
    calculationExample: 'If 8 out of 10 items are on time → 8÷10×100 = 80%',
    interpretationFn: (value) => getPercentageInterpretation(value, { good: 80, warning: 60 }),
    thresholds: 'Green: ≥80%  |  Amber: 60-79%  |  Red: <60%'
  },
  etaSlippage: {
    title: 'ETA Slippage Count',
    description: 'Number of initiatives where the ETA has changed from the original baseline, indicating re-planning activity.',
    calculation: 'Count of items where Current ETA differs from Original ETA.',
    interpretationFn: (value) => getCountInterpretation(value, true),
    thresholds: 'Green: 0 items  |  Amber: 1-3 items  |  Red: >3 items'
  },
  effortVariance: {
    title: 'Effort Variance',
    description: 'Percentage change in estimated effort compared to the original baseline. Indicates scope creep or reduction.',
    calculation: 'Difference between current and original effort estimates, divided by original effort, multiplied by 100.',
    calculationExample: 'Original 10w, Current 12w → (12-10)÷10×100 = +20%',
    interpretationFn: getVarianceInterpretation,
    thresholds: 'Green: ±10%  |  Amber: ±11-25%  |  Red: >±25%'
  },
  netScopeChange: {
    title: 'Net Scope Change',
    description: 'Absolute difference in total estimated effort (in weeks) between current plan and original baseline.',
    calculation: 'Sum of all current effort estimates minus sum of all original effort estimates.',
    calculationExample: 'Total current: 50w, Total original: 45w → 50-45 = +5 weeks',
    interpretationFn: getScopeChangeInterpretation,
    thresholds: 'Positive = scope increased, Negative = scope reduced'
  },
  estimationAccuracy: {
    title: 'Estimation Accuracy',
    description: 'How close your original estimates were to actual effort (completed items only).',
    calculation: 'For each completed item, divide the smaller effort (estimate or actual) by the larger one, then average all items.',
    calculationExample: 'Estimate 10w, Actual 5w → 5÷10 = 50%',
    interpretationFn: (value) => {
      if (value >= 90) {
        return 'Excellent accuracy - estimates are very close to actual effort.';
      } else if (value >= 70) {
        return 'Good accuracy - estimates are reasonably close to actual effort.';
      } else if (value >= 50) {
        const ratio = (100 / value).toFixed(1);
        return `Fair accuracy - estimates are off by about ${ratio}x on average.`;
      } else {
        const ratio = (100 / value).toFixed(1);
        return `Poor accuracy - estimates are off by about ${ratio}x on average.`;
      }
    },
    thresholds: 'Green: ≥90%  |  Amber: 70-89%  |  Red: <70%'
  },
  totalChanges: {
    title: 'Total Changes',
    description: 'Sum of all recorded field changes (ETA, Effort, Status, etc.) across all initiatives.',
    calculation: 'Count of all ChangeRecord entries in the history.',
    thresholds: 'Informational metric - higher indicates more volatility'
  },
  changeFrequency: {
    title: 'Change Frequency',
    description: 'Average number of changes per initiative. Indicates how often items are being modified.',
    calculation: 'Total changes divided by number of initiatives.',
    calculationExample: '50 total changes across 10 initiatives → 50÷10 = 5.0 per item',
    thresholds: 'Informational metric'
  },
  recentChanges: {
    title: 'Recent Changes',
    description: 'Number of changes made in the last 7 days. Shows current activity level.',
    calculation: 'Count of changes where timestamp is within the last 7 days.',
    thresholds: 'Informational metric'
  },
  atRiskDelayed: {
    title: 'At-Risk & Delayed',
    description: 'Count of initiatives currently marked as "At Risk" status.',
    calculation: 'Count of items where Status = "At Risk".',
    interpretationFn: (value) => getCountInterpretation(value, true),
    thresholds: 'Lower is better - these require immediate attention'
  },
  riskLogCompliance: {
    title: 'Risk Log Compliance',
    description: 'Percentage of at-risk items that have documented risk action logs explaining the situation.',
    calculation: 'Items with risk action logs divided by total at-risk items, multiplied by 100.',
    calculationExample: '8 items with logs out of 10 at-risk → 8÷10×100 = 80%',
    interpretationFn: (value) => getPercentageInterpretation(value, { good: 80, warning: 60 }),
    thresholds: 'Green: ≥80%  |  Amber: 60-79%  |  Red: <60%'
  },
  staleItems: {
    title: 'Stale Items',
    description: 'Initiatives not updated in the last 14 days (excluding completed items). May indicate neglected work.',
    calculation: 'Count of items where lastUpdated is more than 14 days ago and status is not Done.',
    interpretationFn: (value) => getCountInterpretation(value, true),
    thresholds: 'Green: 0 items  |  Amber/Red: Any stale items need review'
  },
  avgCompletionRate: {
    title: 'Average Completion Rate',
    description: 'Mean completion percentage across all active (non-done) initiatives. Indicates overall progress towards delivery.',
    calculation: 'Sum of all completion rates divided by count of active initiatives.',
    calculationExample: '3 items at 50%, 60%, 80% → (50+60+80)÷3 = 63%',
    interpretationFn: (value) => getPercentageInterpretation(value, { good: 70, warning: 40 }),
    thresholds: 'Green: ≥70%  |  Amber: 40-69%  |  Red: <40%'
  },
  lowCompletionItems: {
    title: 'Low Completion Items',
    description: 'Active initiatives with completion rate below 30%. These items may need attention or resources.',
    calculation: 'Count of active items where completion rate is less than 30%.',
    interpretationFn: (value) => getCountInterpretation(value, true),
    thresholds: 'Green: 0 items  |  Amber/Red: Any items need review'
  }
};

// Metric Tooltip Component
const MetricTooltip: React.FC<{ 
  metricKey: string; 
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  value?: number; // Optional value for dynamic interpretations
  hideExternalIcon?: boolean; // Hide the external help icon when card has internal one
}> = ({ metricKey, children, position = 'top', value, hideExternalIcon = false }) => {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltip = METRIC_TOOLTIPS[metricKey];

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!isVisible) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setIsVisible(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isVisible]);

  if (!tooltip) return <>{children}</>;

  // Generate interpretation using the function from tooltip config
  const interpretation = value !== undefined && tooltip.interpretationFn 
    ? tooltip.interpretationFn(value)
    : null;
  
  // Determine interpretation color based on value and thresholds
  const getInterpretationColor = (): { bg: string; border: string; text: string } => {
    if (!value || value === undefined) {
      return { bg: 'bg-slate-800/30', border: 'border-slate-700/50', text: 'text-slate-200' };
    }
    
    // Percentage-based metrics (0-100)
    if (metricKey === 'healthScore' || metricKey === 'onTimeRate' || metricKey === 'estimationAccuracy' || 
        metricKey === 'riskLogCompliance' || metricKey === 'avgCompletionRate') {
      if (value >= 80) return { bg: 'bg-emerald-900/30', border: 'border-emerald-700/50', text: 'text-emerald-100' };
      if (value >= 60) return { bg: 'bg-blue-900/30', border: 'border-blue-700/50', text: 'text-blue-100' };
      if (value >= 40) return { bg: 'bg-amber-900/30', border: 'border-amber-700/50', text: 'text-amber-100' };
      return { bg: 'bg-red-900/30', border: 'border-red-700/50', text: 'text-red-100' };
    }
    
    // Count-based metrics (lower is better)
    if (metricKey === 'etaSlippage' || metricKey === 'atRiskDelayed' || metricKey === 'staleItems' || 
        metricKey === 'lowCompletionItems') {
      if (value === 0) return { bg: 'bg-emerald-900/30', border: 'border-emerald-700/50', text: 'text-emerald-100' };
      if (value <= 2) return { bg: 'bg-amber-900/30', border: 'border-amber-700/50', text: 'text-amber-100' };
      return { bg: 'bg-red-900/30', border: 'border-red-700/50', text: 'text-red-100' };
    }
    
    // Delay-based (lower is better, can be negative)
    if (metricKey === 'avgDelay') {
      if (value <= 0) return { bg: 'bg-emerald-900/30', border: 'border-emerald-700/50', text: 'text-emerald-100' };
      if (value <= 7) return { bg: 'bg-amber-900/30', border: 'border-amber-700/50', text: 'text-amber-100' };
      return { bg: 'bg-red-900/30', border: 'border-red-700/50', text: 'text-red-100' };
    }
    
    // Variance-based (absolute value matters)
    if (metricKey === 'effortVariance') {
      const absValue = Math.abs(value);
      if (absValue <= 10) return { bg: 'bg-emerald-900/30', border: 'border-emerald-700/50', text: 'text-emerald-100' };
      if (absValue <= 25) return { bg: 'bg-amber-900/30', border: 'border-amber-700/50', text: 'text-amber-100' };
      return { bg: 'bg-red-900/30', border: 'border-red-700/50', text: 'text-red-100' };
    }
    
    // Default
    return { bg: 'bg-slate-800/30', border: 'border-slate-700/50', text: 'text-slate-200' };
  };
  
  const colorClasses = getInterpretationColor();

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  };

  return (
    <div className="relative inline-flex items-start gap-1" ref={tooltipRef} onClick={hideExternalIcon ? () => setIsVisible(!isVisible) : undefined}>
      {children}
      {!hideExternalIcon && (
        <button
          type="button"
          onClick={() => setIsVisible(!isVisible)}
          className="mt-1 p-0.5 rounded-full hover:bg-slate-200 transition-colors flex-shrink-0"
          aria-label={`Info about ${tooltip.title}`}
        >
          <HelpCircle className={`w-3.5 h-3.5 ${isVisible ? 'text-blue-500' : 'text-slate-400'} hover:text-blue-500 transition-colors`} />
        </button>
      )}
      {isVisible && (
        <div className={`absolute z-50 ${positionClasses[position]} w-80`}>
          <div className="bg-slate-900 text-white p-4 rounded-lg shadow-xl text-left">
            <div className="flex items-center gap-2 mb-2">
              <HelpCircle className="w-4 h-4 text-blue-400" />
              <h4 className="font-semibold text-sm">{tooltip.title}</h4>
            </div>
            <p className="text-xs text-slate-300 mb-3">{tooltip.description}</p>
            
            {interpretation && (
              <div className={`rounded px-3 py-2 mb-3 ${colorClasses.bg} border ${colorClasses.border}`}>
                <p className={`text-xs ${colorClasses.text}`}>{interpretation}</p>
              </div>
            )}
            
            {tooltip.calculation && (
              <div className="bg-slate-800 rounded px-3 py-2 mb-3">
                <p className="text-[10px] text-slate-400 mb-1.5">Calculation:</p>
                <p className="text-xs text-slate-200">{tooltip.calculation}</p>
                {tooltip.calculationExample && (
                  <>
                    <p className="text-[10px] text-slate-400 mt-2 mb-1">Example:</p>
                    <p className="text-xs text-slate-200">{tooltip.calculationExample}</p>
                  </>
                )}
              </div>
            )}
            
            {tooltip.thresholds && (
              <div className="pt-2 border-t border-slate-700">
                <p className="text-xs text-slate-300">{tooltip.thresholds}</p>
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

// Changes List Modal Component
const ChangesListModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  initiatives: Initiative[];
}> = ({ isOpen, onClose, initiatives }) => {
  if (!isOpen) return null;

  // Aggregate all changes from all initiatives
  const allChanges = initiatives
    .flatMap(i => (i.history || []).map(change => ({ ...change, initiativeId: i.id, initiativeTitle: i.title })))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-slate-900/60 transition-opacity" onClick={onClose} />
        
        {/* Modal */}
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-800 to-blue-900 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <FileEdit className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">All Changes</h2>
                <p className="text-sm text-slate-400">{allChanges.length} total changes</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-300" />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(85vh-80px)] p-6">
            {allChanges.length === 0 ? (
              <div className="text-center text-slate-400 py-10">No changes recorded yet.</div>
            ) : (
              <div className="space-y-4">
                {allChanges.map((change, idx) => (
                  <div key={change.id || idx} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                      <History size={16} className="text-slate-500" />
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-800">{change.field}</span>
                          <span className="text-xs text-slate-500 px-2 py-0.5 bg-slate-200 rounded">
                            {change.initiativeTitle}
                          </span>
                        </div>
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
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Item Changes Modal Component - Shows changes for a single initiative
const ItemChangesModal: React.FC<{ 
  isOpen: boolean; 
  onClose: () => void; 
  item: Initiative | null;
}> = ({ isOpen, onClose, item }) => {
  if (!isOpen || !item) return null;

  const changes = (item.history || []).sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-slate-900/40 transition-opacity" onClick={onClose} />
        
        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-lg max-w-xl w-full max-h-[85vh] overflow-hidden border border-slate-200">
          {/* Header */}
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileEdit className="w-4 h-4 text-slate-600" />
              <div>
                <h2 className="text-sm font-semibold text-slate-800">{item.title}</h2>
                <p className="text-xs text-slate-500">
                  {item.id} • {changes.length} {changes.length === 1 ? 'change' : 'changes'}
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200 rounded transition-colors"
            >
              <X className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(85vh-80px)] p-3">
            {changes.length === 0 ? (
              <div className="text-center text-slate-400 py-10">No changes recorded for this item yet.</div>
            ) : (
              <div className="space-y-1">
                {changes.map((change, idx) => (
                  <div 
                    key={change.id || idx} 
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 transition-colors"
                  >
                    <History size={12} className="text-slate-400 flex-shrink-0" />
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="font-medium text-xs text-slate-700 flex-shrink-0">{change.field}</span>
                      <span className="text-xs text-red-500 line-through">{String(change.oldValue ?? 'N/A')}</span>
                      <span className="text-xs text-slate-300">→</span>
                      <span className="text-xs text-emerald-600">{String(change.newValue ?? 'N/A')}</span>
                      <span className="text-xs text-slate-400">
                        by {change.changedBy}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {new Date(change.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
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

const ResourcesDashboardComponent: React.FC<WorkplanHealthDashboardProps> = ({
  filteredInitiatives,
  config,
  users
}) => {
  // Ref for horizontal scrolling table container
  const delayedTableRef = useRef<HTMLDivElement>(null);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [showChangesListModal, setShowChangesListModal] = useState(false);
  const [selectedItemForChanges, setSelectedItemForChanges] = useState<Initiative | null>(null);
  
  // Lazy evaluation: Track which sections are visible/expanded
  const [showBurndownChart, setShowBurndownChart] = useState(false);
  const [showBufferChart, setShowBufferChart] = useState(false);
  const [showDelayChart, setShowDelayChart] = useState(false);
  const [showCompletionTimeChart, setShowCompletionTimeChart] = useState(false);
  
  // Pagination state for tables
  const [delayedPage, setDelayedPage] = useState(1);
  const [overlookedPage, setOverlookedPage] = useState(1);
  const [variancePage, setVariancePage] = useState(1);
  const PAGE_SIZE = 50;

  // Chart lazy loading with Intersection Observer
  const [burndownRef, isBurndownVisible] = useIntersectionObserver({ threshold: 0.1 });
  const [bufferRef, isBufferVisible] = useIntersectionObserver({ threshold: 0.1 });
  const [delayRef, isDelayVisible] = useIntersectionObserver({ threshold: 0.1 });
  const [completionTimeRef, isCompletionTimeVisible] = useIntersectionObserver({ threshold: 0.1 });

  // Calculate total completed count independently (always runs, not lazy-loaded)
  // This is needed to determine if the chart section should render
  const totalCompletedCount = useMemo(() => {
    return filteredInitiatives.filter(
      i => i.status === Status.Done && i.createdAt
    ).length;
  }, [filteredInitiatives]);

  // Update visibility states when charts come into view
  React.useEffect(() => {
    if (isBurndownVisible) setShowBurndownChart(true);
  }, [isBurndownVisible]);

  React.useEffect(() => {
    if (isBufferVisible) setShowBufferChart(true);
  }, [isBufferVisible]);

  React.useEffect(() => {
    if (isDelayVisible) setShowDelayChart(true);
  }, [isDelayVisible]);

  React.useEffect(() => {
    if (isCompletionTimeVisible) setShowCompletionTimeChart(true);
  }, [isCompletionTimeVisible]);

  // Auto-show completion time chart if there are completed items
  React.useEffect(() => {
    if (totalCompletedCount > 0) {
      setShowCompletionTimeChart(true);
    }
  }, [totalCompletedCount]);

  // Invalidate cache when initiatives change significantly
  React.useEffect(() => {
    // Cleanup expired cache entries periodically
    const interval = setInterval(() => {
      metricsCache.cleanup();
    }, 60000); // Every minute

    return () => clearInterval(interval);
  }, []);

  // Enhanced health color helpers with gradients
  const _getHealthGradient = (score: number): string => {
    if (score >= 80) return 'from-emerald-400 to-emerald-500';
    if (score >= 60) return 'from-amber-400 to-amber-500';
    return 'from-red-400 to-red-500';
  };
  void _getHealthGradient; // Reserved for future use

  // Generate stable cache key (only length + hash of IDs for better cache hits)
  const cacheKey = useMemo(() => {
    // Create a simple hash from initiative IDs for cache key stability
    const idsHash = filteredInitiatives
      .map(i => i.id)
      .sort()
      .join('')
      .split('')
      .reduce((acc, char) => {
        const hash = ((acc << 5) - acc) + char.charCodeAt(0);
        return hash & hash;
      }, 0);
    return `health-${filteredInitiatives.length}-${Math.abs(idsHash)}`;
  }, [filteredInitiatives]);

  // === SPLIT MEMOS: Schedule Metrics (only recalc when schedule-relevant fields change) ===
  const scheduleMetrics = useMemo(() => {
    // Only depend on initiatives with ETA data for schedule calculations
    const scheduleRelevant = filteredInitiatives.filter(i => i.eta && i.originalEta);
    const scheduleKey = `${cacheKey}-schedule-${scheduleRelevant.length}`;
    const cached = metricsCache.get<ReturnType<typeof calculateScheduleMetrics>>(scheduleKey);
    if (cached) return cached;

    const result = calculateScheduleMetrics(filteredInitiatives);
    metricsCache.set(scheduleKey, result, 300000); // 5 min cache
    return result;
  }, [filteredInitiatives, cacheKey]);

  // === SPLIT MEMOS: Effort Metrics (only recalc when effort fields change) ===
  const effortMetrics = useMemo(() => {
    // Create stable key based on effort-related data
    const effortHash = filteredInitiatives
      .reduce((sum, i) => sum + (i.estimatedEffort || 0) + (i.originalEstimatedEffort || 0), 0);
    const effortKey = `${cacheKey}-effort-${effortHash}`;
    const cached = metricsCache.get<ReturnType<typeof calculateEffortMetrics>>(effortKey);
    if (cached) return cached;

    const result = calculateEffortMetrics(filteredInitiatives);
    metricsCache.set(effortKey, result, 300000);
    return result;
  }, [filteredInitiatives, cacheKey]);

  // === SPLIT MEMOS: Change Activity Metrics ===
  const changeMetrics = useMemo(() => {
    // Only recalc if history actually changed
    const totalChanges = filteredInitiatives.reduce((sum, i) => sum + (i.history?.length || 0), 0);
    const changeKey = `${cacheKey}-change-${totalChanges}`;
    const cached = metricsCache.get<ReturnType<typeof calculateChangeMetrics>>(changeKey);
    if (cached) return cached;

    const result = calculateChangeMetrics(filteredInitiatives);
    metricsCache.set(changeKey, result, 300000);
    return result;
  }, [filteredInitiatives, cacheKey]);

  // === SPLIT MEMOS: Risk & Status Metrics ===
  const riskMetrics = useMemo(() => {
    // Create key based on status distribution
    const statusHash = filteredInitiatives
      .map(i => i.status)
      .join('');
    const riskKey = `${cacheKey}-risk-${statusHash.length}`;
    const cached = metricsCache.get<ReturnType<typeof calculateRiskMetrics>>(riskKey);
    if (cached) return cached;

    const result = calculateRiskMetrics(filteredInitiatives);
    metricsCache.set(riskKey, result, 300000);
    return result;
  }, [filteredInitiatives, cacheKey]);

  // === SPLIT MEMOS: Completion Metrics ===
  const completionMetrics = useMemo(() => {
    const completionKey = `${cacheKey}-completion`;
    const cached = metricsCache.get<ReturnType<typeof calculateCompletionMetrics>>(completionKey);
    if (cached) return cached;

    const result = calculateCompletionMetrics(filteredInitiatives);
    metricsCache.set(completionKey, result, 300000);
    return result;
  }, [filteredInitiatives, cacheKey]);

  // === SPLIT MEMOS: Obsolete Effort Metrics ===
  const obsoleteEffortMetrics = useMemo(() => {
    const obsoleteHash = filteredInitiatives
      .filter(i => i.status === Status.Obsolete)
      .reduce((sum, i) => sum + (i.estimatedEffort || 0) + (i.actualEffort || 0), 0);
    const obsoleteKey = `${cacheKey}-obsolete-${obsoleteHash}`;
    const cached = metricsCache.get<ReturnType<typeof calculateObsoleteEffortMetrics>>(obsoleteKey);
    if (cached) return cached;

    const result = calculateObsoleteEffortMetrics(filteredInitiatives);
    metricsCache.set(obsoleteKey, result, 300000);
    return result;
  }, [filteredInitiatives, cacheKey]);

  // Debounced delay distribution calculation (expensive operation)
  const debouncedInitiatives = useDebounce(filteredInitiatives, 300);
  const delayDistribution = useMemo(() => {
    if (!showDelayChart) return []; // Lazy evaluation
    
    const cacheKey_delay = `${cacheKey}-delay-dist`;
    const cached = metricsCache.get<ReturnType<typeof calculateDelayDistribution>>(cacheKey_delay);
    if (cached) return cached;

    const result = calculateDelayDistribution(debouncedInitiatives);
    metricsCache.set(cacheKey_delay, result, 60000); // 1 minute TTL for this expensive calc
    return result;
  }, [debouncedInitiatives, cacheKey, showDelayChart]);

  // Completion time distribution calculation (always calculate if there are completed items)
  const completionTimeDistribution = useMemo(() => {
    // Always calculate if there are completed items, regardless of chart visibility
    // This ensures the data is available when the chart section becomes visible
    if (totalCompletedCount === 0) {
      return {
        buckets: [],
        avgCompletionDays: 0,
        medianCompletionDays: 0,
        totalCompleted: 0,
      };
    }
    
    const cacheKey_completion = `${cacheKey}-completion-time-dist`;
    const cached = metricsCache.get<ReturnType<typeof calculateCompletionTimeDistribution>>(cacheKey_completion);
    if (cached) return cached;

    const result = calculateCompletionTimeDistribution(debouncedInitiatives);
    metricsCache.set(cacheKey_completion, result, 60000); // 1 minute TTL
    return result;
  }, [debouncedInitiatives, cacheKey, totalCompletedCount]);

  // Combine all metrics
  const healthMetrics = useMemo(() => {
    // Calculate health scores
    const scheduleScore = Math.max(0, 100 - Math.abs(scheduleMetrics.avgDelay) * 2);
    const effortScore = Math.max(0, 100 - Math.abs(effortMetrics.effortVariance));
    const riskScore = filteredInitiatives.length > 0 
      ? Math.max(0, 100 - (riskMetrics.atRiskCount / filteredInitiatives.length) * 200)
      : 100;
    const complianceScore = riskMetrics.riskLogCompliance;

    const overallHealth = Math.round(
      (scheduleScore * 0.35) + (effortScore * 0.25) + (riskScore * 0.25) + (complianceScore * 0.15)
    );

    return {
      // Schedule
      ...scheduleMetrics,
      // Effort
      ...effortMetrics,
      // Changes
      ...changeMetrics,
      // Risk & Status
      ...riskMetrics,
      // Completion
      ...completionMetrics,
      // Obsolete Effort
      ...obsoleteEffortMetrics,
      // Planning
      delayBuckets: delayDistribution,
      // Completion Time Distribution
      completionTimeBuckets: completionTimeDistribution.buckets,
      avgCompletionDays: completionTimeDistribution.avgCompletionDays,
      medianCompletionDays: completionTimeDistribution.medianCompletionDays,
      totalCompleted: completionTimeDistribution.totalCompleted,
      // Overall
      overallHealth,
      scheduleScore,
      effortScore,
      riskScore,
      initiativeCount: filteredInitiatives.length,
    };
  }, [scheduleMetrics, effortMetrics, changeMetrics, riskMetrics, completionMetrics, obsoleteEffortMetrics, delayDistribution, completionTimeDistribution, filteredInitiatives.length]);

  // Health Score History data (from config or mock)
  // Note: Preserved for future use in health trend visualization
  const _healthHistory = useMemo(() => {
    const history = config.healthHistory || [];
    return history.map(h => ({
      ...h,
      date: new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }));
  }, [config.healthHistory]);
  void _healthHistory; // Suppress unused variable warning

  // Burndown/Burnup data (lazy evaluation - only calculate when chart is visible)
  const burndownData = useMemo(() => {
    if (!showBurndownChart) {
      return { weeks: [], totalPlanned: 0, totalActual: 0, completed: 0, remaining: 0 };
    }

    const totalPlannedEffort = filteredInitiatives.reduce((sum, i) => sum + (i.estimatedEffort || 0), 0);
    const totalActualEffort = filteredInitiatives.reduce((sum, i) => sum + (i.actualEffort || 0), 0);
    const completedEffort = filteredInitiatives
      .filter(i => i.status === Status.Done)
      .reduce((sum, i) => sum + (i.actualEffort || 0), 0);
    
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
  }, [filteredInitiatives, showBurndownChart]);

  // Buffer Usage Trend data (lazy evaluation - only calculate when chart is visible)
  const bufferTrendData = useMemo(() => {
    if (!showBufferChart) return [];
    
    const history = config.healthHistory || [];
    return history.map(h => ({
      date: new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      used: h.bufferUsed,
      total: h.bufferTotal,
      remaining: h.bufferTotal - h.bufferUsed,
      percentUsed: h.bufferTotal > 0 ? Math.round((h.bufferUsed / h.bufferTotal) * 100) : 0
    }));
  }, [config.healthHistory, showBufferChart]);

  // Memoize getOwnerName to prevent recreating on every render
  const getOwnerName = useCallback((ownerId: string) => {
    return users.find(u => u.id === ownerId)?.name || 'Unknown';
  }, [users]);

  // Memoize handlers to prevent child re-renders
  const handleDelayedPageChange = useCallback((page: number) => {
    setDelayedPage(page);
  }, []);

  const handleOverlookedPageChange = useCallback((page: number) => {
    setOverlookedPage(page);
  }, []);

  const handleVariancePageChange = useCallback((page: number) => {
    setVariancePage(page);
  }, []);

  // Paginated data for tables
  const paginatedDelayed = useMemo(() => {
    return paginate(healthMetrics.mostDelayed, delayedPage, PAGE_SIZE);
  }, [healthMetrics.mostDelayed, delayedPage]);

  const paginatedOverlooked = useMemo(() => {
    return paginate(healthMetrics.overlookedItems, overlookedPage, PAGE_SIZE);
  }, [healthMetrics.overlookedItems, overlookedPage]);

  const paginatedVariance = useMemo(() => {
    return paginate(healthMetrics.varianceItems, variancePage, PAGE_SIZE);
  }, [healthMetrics.varianceItems, variancePage]);

  return (
    <div className="w-full px-6">
      {/* Info Modal */}
      <InfoModal isOpen={isInfoModalOpen} onClose={() => setIsInfoModalOpen(false)} />
      <ChangesListModal 
        isOpen={showChangesListModal} 
        onClose={() => setShowChangesListModal(false)} 
        initiatives={filteredInitiatives}
      />
      <ItemChangesModal 
        isOpen={selectedItemForChanges !== null} 
        onClose={() => setSelectedItemForChanges(null)} 
        item={selectedItemForChanges}
      />

      <div className="space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 via-slate-850 to-slate-900 px-8 py-6 rounded-2xl shadow-xl border border-slate-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Workplan Health Overview</h2>
            <p className="text-slate-400 text-sm">
              Analyzing {healthMetrics.initiativeCount} initiatives
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsInfoModalOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors text-sm"
            >
              <Info className="w-4 h-4" />
              <span>View All Metrics</span>
            </button>
          </div>
        </div>
      </div>

      {/* Health Metrics Grid - Schedule & Effort Sections */}
      <div className="space-y-4">
        {/* Schedule Health Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <MetricTooltip metricKey="avgDelay" position="bottom" value={healthMetrics.avgDelay}>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-help hover:shadow-md hover:border-slate-300 transition-all h-[160px] flex flex-col justify-between w-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <p className="text-sm text-slate-500 font-medium">Avg delay</p>
                </div>
                <TrafficLight status={healthMetrics.avgDelay <= 0 ? 'good' : healthMetrics.avgDelay <= 7 ? 'warning' : 'critical'} />
              </div>
              <div>
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
            </div>
          </MetricTooltip>

          <MetricTooltip metricKey="onTimeRate" position="bottom" value={healthMetrics.onTimeRate}>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-help hover:shadow-md hover:border-slate-300 transition-all h-[160px] flex flex-col justify-between w-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-slate-400" />
                  <p className="text-sm text-slate-500 font-medium">On-time rate</p>
                </div>
                <TrafficLight status={healthMetrics.onTimeRate >= 80 ? 'good' : healthMetrics.onTimeRate >= 60 ? 'warning' : 'critical'} />
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-3xl font-black ${healthMetrics.onTimeRate >= 80 ? 'text-emerald-600' : healthMetrics.onTimeRate >= 60 ? 'text-amber-500' : 'text-red-500'}`}>
                    {healthMetrics.onTimeRate}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full mt-3">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${getHealthBarColor(healthMetrics.onTimeRate)}`}
                    style={{ width: `${healthMetrics.onTimeRate}%` }}
                  />
                </div>
              </div>
            </div>
          </MetricTooltip>

          <MetricTooltip metricKey="etaSlippage" position="bottom" value={healthMetrics.etaSlippageCount}>
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-help hover:shadow-md hover:border-slate-300 transition-all h-[160px] flex flex-col justify-between w-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <p className="text-sm text-slate-500 font-medium">ETA slippage</p>
                </div>
                <TrafficLight status={healthMetrics.etaSlippageCount === 0 ? 'good' : healthMetrics.etaSlippageCount <= 3 ? 'warning' : 'critical'} />
              </div>
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-slate-800">{healthMetrics.etaSlippageCount}</span>
                  <span className="text-slate-400 text-sm">items</span>
                </div>
                <p className="text-xs text-slate-500 mt-2">with ETA changes from baseline</p>
              </div>
            </div>
          </MetricTooltip>

          {/* Delay Distribution */}
          <div ref={delayRef} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow h-[160px] flex flex-col w-full">
            <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-gradient-to-b from-emerald-500 to-red-500 rounded-full"></span>
              Delay Distribution
            </h3>
            {showDelayChart && (
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={healthMetrics.delayBuckets} margin={{ top: 2, right: 5, left: 5, bottom: 2 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '11px' }}
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
            )}
          </div>
        </div>

        {/* Effort Health Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <MetricTooltip metricKey="effortVariance" position="bottom" value={healthMetrics.effortVariance}>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-help hover:shadow-md hover:border-slate-300 transition-all h-[160px] flex flex-col justify-between w-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {healthMetrics.effortVariance >= 0 
                  ? <TrendingUp className="w-4 h-4 text-slate-400" />
                  : <TrendingDown className="w-4 h-4 text-slate-400" />
                }
                <p className="text-sm text-slate-500 font-medium">Effort variance</p>
              </div>
              <TrafficLight status={Math.abs(healthMetrics.effortVariance) <= 10 ? 'good' : Math.abs(healthMetrics.effortVariance) <= 25 ? 'warning' : 'critical'} />
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className={`text-3xl font-black ${Math.abs(healthMetrics.effortVariance) <= 10 ? 'text-emerald-600' : Math.abs(healthMetrics.effortVariance) <= 25 ? 'text-amber-500' : 'text-red-500'}`}>
                  {healthMetrics.effortVariance > 0 ? '+' : ''}{healthMetrics.effortVariance}%
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {healthMetrics.effortVariance > 0 ? 'Scope increased from baseline' : healthMetrics.effortVariance < 0 ? 'Scope reduced from baseline' : 'On target'}
              </p>
            </div>
          </div>
        </MetricTooltip>

        <MetricTooltip metricKey="netScopeChange" position="bottom" value={healthMetrics.netScopeChange}>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-help hover:shadow-md hover:border-slate-300 transition-all h-[160px] flex flex-col justify-between w-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-slate-400" />
                <p className="text-sm text-slate-500 font-medium">Net scope change</p>
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className={`text-3xl font-black ${healthMetrics.netScopeChange === 0 ? 'text-slate-800' : healthMetrics.netScopeChange > 0 ? 'text-amber-500' : 'text-emerald-600'}`}>
                  {isNaN(healthMetrics.netScopeChange) ? '0' : healthMetrics.netScopeChange > 0 ? '+' : ''}{isNaN(healthMetrics.netScopeChange) ? '0' : healthMetrics.netScopeChange}
                </span>
                <span className="text-slate-400 text-sm">weeks</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                {healthMetrics.totalCurrentEffort}w current vs {healthMetrics.totalOriginalEffort}w original
              </p>
            </div>
          </div>
        </MetricTooltip>

        <MetricTooltip metricKey="estimationAccuracy" position="bottom" value={healthMetrics.estimationAccuracy}>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-help hover:shadow-md hover:border-slate-300 transition-all h-[160px] flex flex-col justify-between w-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-slate-400" />
                <p className="text-sm text-slate-500 font-medium">Est. accuracy</p>
              </div>
              <TrafficLight status={healthMetrics.estimationAccuracy >= 90 ? 'good' : healthMetrics.estimationAccuracy >= 70 ? 'warning' : 'critical'} />
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <span className={`text-3xl font-black ${healthMetrics.estimationAccuracy >= 90 ? 'text-emerald-600' : healthMetrics.estimationAccuracy >= 70 ? 'text-amber-500' : 'text-red-500'}`}>
                  {healthMetrics.estimationAccuracy}%
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-2">Based on completed items</p>
            </div>
          </div>
        </MetricTooltip>

        {/* Wasted Effort Analysis (Always visible) */}
        <MetricTooltip metricKey="obsoleteEffort" position="bottom" value={healthMetrics.totalObsoleteEstimatedEffort}>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm cursor-help hover:shadow-md hover:border-slate-300 transition-all h-[160px] flex flex-col justify-between w-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-purple-500" />
                <p className="text-sm text-slate-500 font-medium">Wasted Effort</p>
              </div>
              <span className="text-xs font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">{healthMetrics.obsoleteCount} obsolete</span>
            </div>
            <div className="flex gap-3">
              <div className="flex-1 p-3 bg-purple-50 rounded-xl">
                <div className="text-xs text-purple-600 font-medium mb-1">Allocated</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-purple-700">
                    {healthMetrics.totalObsoleteEstimatedEffort.toFixed(1)}
                  </span>
                  <span className="text-xs text-purple-500">w</span>
                </div>
              </div>
              <div className="flex-1 p-3 bg-purple-50 rounded-xl">
                <div className="text-xs text-purple-600 font-medium mb-1">Actual</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-purple-700">
                    {healthMetrics.totalObsoleteActualEffort.toFixed(1)}
                  </span>
                  <span className="text-xs text-purple-500">w</span>
                </div>
              </div>
            </div>
          </div>
        </MetricTooltip>
        </div>
      </div>

      {/* Change Activity & Status Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Change Activity */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <FileEdit className="w-4 h-4" />
              Change Activity
            </h3>
            <span className="text-xs text-slate-400">{healthMetrics.totalChanges} total changes</span>
          </div>
          
          {/* Change Activity Mini Cards */}
          <div className="flex justify-center gap-4 mb-4">
            <MetricTooltip metricKey="totalChanges" position="bottom" value={healthMetrics.totalChanges}>
              <div className="text-center p-3 bg-slate-50 rounded-xl cursor-help hover:bg-slate-100 transition-colors h-[70px] w-[120px] flex flex-col justify-center items-center">
                <div className="text-xl font-bold text-slate-800">{healthMetrics.totalChanges}</div>
                <div className="text-xs text-slate-500">Total</div>
              </div>
            </MetricTooltip>
            <div 
              onClick={() => setShowChangesListModal(true)}
              className="text-center p-3 bg-blue-50 rounded-xl cursor-pointer hover:bg-blue-100 transition-colors h-[70px] w-[120px] flex flex-col justify-center items-center"
            >
              <div className="text-xl font-bold text-blue-600">{healthMetrics.changeFrequency}</div>
              <div className="text-xs text-slate-500">Per Item</div>
            </div>
            <MetricTooltip metricKey="recentChanges" position="bottom" value={healthMetrics.recentChanges}>
              <div className="text-center p-3 bg-emerald-50 rounded-xl cursor-help hover:bg-emerald-100 transition-colors h-[70px] w-[120px] flex flex-col justify-center items-center">
                <div className="text-xl font-bold text-emerald-600">{healthMetrics.recentChanges}</div>
                <div className="text-xs text-slate-500">Last 7 Days</div>
              </div>
            </MetricTooltip>
          </div>

          {healthMetrics.mostVolatile.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 font-semibold tracking-wider mb-2">Most volatile items</p>
              <div className="space-y-2">
                {healthMetrics.mostVolatile.map((item, idx) => (
                  <div key={item.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs text-slate-400 w-4 flex-shrink-0">{idx + 1}.</span>
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-mono font-semibold rounded flex-shrink-0">
                        {item.id}
                      </span>
                      <span className="text-sm text-slate-700 truncate flex-1">{item.title}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setSelectedItemForChanges(item)}
                        className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded hover:bg-amber-100 transition-colors cursor-pointer"
                      >
                        {item.changeCount} changes
                      </button>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Status & Completion Health */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Status & Completion
            </h3>
          </div>
          
          {/* Status Distribution Cards - 2 rows of 3 */}
          <div className="space-y-3 mb-5">
            {/* Row 1: Not Started, In Progress, At Risk */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-4 bg-slate-50 rounded-xl h-[90px] flex flex-col justify-center items-center">
                <span className="w-3 h-3 rounded-full bg-slate-400 mb-2" />
                <span className="text-2xl font-bold text-slate-600">{healthMetrics.statusCounts.notStarted}</span>
                <div className="text-xs text-slate-500 mt-1">Not Started</div>
              </div>
              <div className="p-4 bg-blue-50 rounded-xl h-[90px] flex flex-col justify-center items-center">
                <span className="w-3 h-3 rounded-full bg-blue-500 mb-2" />
                <span className="text-2xl font-bold text-blue-600">{healthMetrics.statusCounts.inProgress}</span>
                <div className="text-xs text-blue-600 mt-1">In Progress</div>
              </div>
              <div className="p-4 bg-red-50 rounded-xl h-[90px] flex flex-col justify-center items-center">
                <AlertCircle className="w-4 h-4 text-red-500 mb-2" />
                <span className="text-2xl font-bold text-red-600">{healthMetrics.statusCounts.atRisk}</span>
                <div className="text-xs text-red-600 mt-1">At Risk</div>
              </div>
            </div>
            {/* Row 2: Done, Obsolete, Avg Completion */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-4 bg-emerald-50 rounded-xl h-[90px] flex flex-col justify-center items-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mb-2" />
                <span className="text-2xl font-bold text-emerald-600">{healthMetrics.statusCounts.done}</span>
                <div className="text-xs text-emerald-600 mt-1">Done</div>
              </div>
              <div className="p-4 bg-purple-50 rounded-xl h-[90px] flex flex-col justify-center items-center">
                <span className="w-3 h-3 rounded-full bg-purple-500 mb-2" />
                <span className="text-2xl font-bold text-purple-600">{healthMetrics.statusCounts.obsolete}</span>
                <div className="text-xs text-purple-600 mt-1">Obsolete</div>
              </div>
              <MetricTooltip metricKey="avgCompletionRate" position="top" value={healthMetrics.avgCompletionRate} hideExternalIcon>
                <div className={`p-4 rounded-xl h-[90px] w-full flex flex-col justify-center items-center cursor-help relative ${healthMetrics.avgCompletionRate >= 70 ? 'bg-emerald-50' : healthMetrics.avgCompletionRate >= 40 ? 'bg-amber-50' : 'bg-red-50'}`}>
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400 absolute top-2 right-2" />
                  <span className={`text-2xl font-bold ${healthMetrics.avgCompletionRate >= 70 ? 'text-emerald-600' : healthMetrics.avgCompletionRate >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                    {healthMetrics.avgCompletionRate}%
                  </span>
                  <div className="text-xs text-slate-500 mt-1">Avg. Completion</div>
                </div>
              </MetricTooltip>
            </div>
          </div>

          {/* Low Completion Items & Stale Items - Centered */}
          <div className="flex justify-center gap-3">
            <MetricTooltip metricKey="lowCompletionItems" position="top" value={healthMetrics.lowCompletionCount} hideExternalIcon>
              <div className="p-4 bg-amber-50 rounded-xl h-[90px] w-[200px] flex flex-col justify-center items-center cursor-help hover:bg-amber-100 transition-colors relative">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400 absolute top-2 right-2" />
                <span className={`text-2xl font-bold ${healthMetrics.lowCompletionCount === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {healthMetrics.lowCompletionCount}
                </span>
                <div className="text-xs text-slate-500 mt-1">Low (&lt;30%)</div>
              </div>
            </MetricTooltip>

            <MetricTooltip metricKey="staleItems" position="top" value={healthMetrics.staleItems.length} hideExternalIcon>
              <div className="p-4 bg-slate-100 rounded-xl h-[90px] w-[200px] flex flex-col justify-center items-center cursor-help hover:bg-slate-200 transition-colors relative">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400 absolute top-2 right-2" />
                <span className={`text-2xl font-bold ${healthMetrics.staleItems.length === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {healthMetrics.staleItems.length}
                </span>
                <div className="text-xs text-slate-500 mt-1">Stale (14+ days)</div>
              </div>
            </MetricTooltip>
          </div>
        </div>
      </div>

      {/* Charts and Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Burndown Chart */}
        <div ref={burndownRef} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <TrendingDown className="w-3.5 h-3.5 text-blue-500" />
            Effort Burndown
          </h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-slate-500">Total: <span className="font-bold text-slate-700">{burndownData.totalPlanned}w</span></span>
            <span className="text-slate-500">Remaining: <span className="font-bold text-amber-600">{burndownData.remaining}w</span></span>
          </div>
        </div>
        {showBurndownChart && (
          <>
            <div className="h-40">
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
          </>
        )}
        </div>

        {/* Most Delayed Items Table */}
        {healthMetrics.mostDelayed.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-red-50 to-amber-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Most Delayed Items
              </h3>
              {healthMetrics.mostDelayed.length > PAGE_SIZE && (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <button
                    onClick={() => handleDelayedPageChange(Math.max(1, delayedPage - 1))}
                    disabled={!paginatedDelayed.hasPreviousPage}
                    className="px-2 py-1 rounded border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                  >
                    Previous
                  </button>
                  <span>Page {paginatedDelayed.pagination.currentPage} of {paginatedDelayed.totalPages}</span>
                  <button
                    onClick={() => handleDelayedPageChange(Math.min(paginatedDelayed.totalPages, delayedPage + 1))}
                    disabled={!paginatedDelayed.hasNextPage}
                    className="px-2 py-1 rounded border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
            <div ref={delayedTableRef} className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gradient-to-b from-slate-50 to-white border-b border-slate-200">
                    <th className="text-left py-2 px-3 text-xs font-bold text-slate-600 tracking-wider">Initiative</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-slate-600 tracking-wider">Owner</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-slate-600 tracking-wider">Original ETA</th>
                    <th className="text-left py-2 px-3 text-xs font-bold text-slate-600 tracking-wider">Current ETA</th>
                    <th className="text-right py-2 px-3 text-xs font-bold text-slate-600 tracking-wider">Days delayed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedDelayed.items.map((item) => (
                    <DelayedItemRow key={item.id} item={item} getOwnerName={getOwnerName} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Completion Time Distribution Chart */}
        {totalCompletedCount > 0 && (
          <div ref={completionTimeRef} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                Completion Time Distribution
              </h3>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-slate-500">Avg: <span className="font-bold text-slate-700">{healthMetrics.avgCompletionDays}d</span></span>
                {healthMetrics.medianCompletionDays > 0 && (
                  <span className="text-slate-500">Median: <span className="font-bold text-slate-700">{healthMetrics.medianCompletionDays}d</span></span>
                )}
              </div>
            </div>
            {showCompletionTimeChart && healthMetrics.completionTimeBuckets.length > 0 ? (
              <>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={healthMetrics.completionTimeBuckets} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="name" 
                        tick={{ fontSize: 10 }} 
                        axisLine={false} 
                        tickLine={false}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value: number) => [`${value} initiative${value !== 1 ? 's' : ''}`, 'Count']}
                        labelFormatter={(label) => `Time Range: ${label}`}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {healthMetrics.completionTimeBuckets.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-4 mt-3 text-xs text-slate-500">
                  <span>Total Completed: <span className="font-bold text-slate-700">{healthMetrics.totalCompleted}</span></span>
                </div>
              </>
            ) : showCompletionTimeChart ? (
              <div className="h-40 flex items-center justify-center text-slate-400 text-sm">
                No completion data available
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Buffer Usage Trend */}
      {bufferTrendData.length > 0 && (
        <div ref={bufferRef} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-purple-500" />
              BAU Buffer Usage Trend
            </h3>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-slate-500">Latest: <span className="font-bold text-purple-600">{bufferTrendData[bufferTrendData.length - 1]?.percentUsed || 0}% used</span></span>
            </div>
          </div>
          <div className="h-40">
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

      {/* Repeatedly Overlooked Items */}
      {healthMetrics.overlookedItems.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-red-50 to-rose-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <AlertCircle size={18} className="text-red-600" /> Repeatedly Overlooked Items
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Initiatives that have been delayed 3+ times. These items are being repeatedly deprioritized and need attention.
                </p>
              </div>
              {healthMetrics.overlookedItems.length > PAGE_SIZE && (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <button
                    onClick={() => handleOverlookedPageChange(Math.max(1, overlookedPage - 1))}
                    disabled={!paginatedOverlooked.hasPreviousPage}
                    className="px-2 py-1 rounded border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                  >
                    Previous
                  </button>
                  <span>Page {paginatedOverlooked.pagination.currentPage} of {paginatedOverlooked.totalPages}</span>
                  <button
                    onClick={() => handleOverlookedPageChange(Math.min(paginatedOverlooked.totalPages, overlookedPage + 1))}
                    disabled={!paginatedOverlooked.hasNextPage}
                    className="px-2 py-1 rounded border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-xs">
              <thead className="bg-gradient-to-b from-slate-50 to-white sticky top-0 shadow-sm">
                <tr>
                  <th className="px-3 py-2 text-xs font-bold text-slate-600 tracking-wider">Initiative</th>
                  <th className="px-3 py-2 text-xs font-bold text-slate-600 tracking-wider">Owner</th>
                  <th className="px-3 py-2 text-xs font-bold text-slate-600 tracking-wider">Delay Count</th>
                  <th className="px-3 py-2 text-xs font-bold text-slate-600 tracking-wider">Last Delay</th>
                  <th className="px-3 py-2 text-xs font-bold text-slate-600 tracking-wider">Current ETA</th>
                  <th className="px-3 py-2 text-xs font-bold text-slate-600 tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedOverlooked.items
                  .sort((a, b) => (b.overlookedCount || 0) - (a.overlookedCount || 0))
                  .map(item => (
                  <OverlookedItemRow key={item.id} item={item} getOwnerName={getOwnerName} />
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
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <TrendingUp size={18} className="text-blue-600" /> Baseline Variance Report
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Initiatives that have deviated from their original planning baseline.
                </p>
              </div>
              {healthMetrics.varianceItems.length > PAGE_SIZE && (
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <button
                    onClick={() => handleVariancePageChange(Math.max(1, variancePage - 1))}
                    disabled={!paginatedVariance.hasPreviousPage}
                    className="px-2 py-1 rounded border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                  >
                    Previous
                  </button>
                  <span>Page {paginatedVariance.pagination.currentPage} of {paginatedVariance.totalPages}</span>
                  <button
                    onClick={() => handleVariancePageChange(Math.min(paginatedVariance.totalPages, variancePage + 1))}
                    disabled={!paginatedVariance.hasNextPage}
                    className="px-2 py-1 rounded border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-xs">
              <thead className="bg-gradient-to-b from-slate-50 to-white sticky top-0 shadow-sm">
                <tr>
                  <th className="px-3 py-2 text-xs font-bold text-slate-600 tracking-wider">Initiative</th>
                  <th className="px-3 py-2 text-xs font-bold text-slate-600 tracking-wider">Original effort</th>
                  <th className="px-3 py-2 text-xs font-bold text-slate-600 tracking-wider">Current effort</th>
                  <th className="px-3 py-2 text-xs font-bold text-slate-600 tracking-wider">Variance</th>
                  <th className="px-3 py-2 text-xs font-bold text-slate-600 tracking-wider">Original ETA</th>
                  <th className="px-3 py-2 text-xs font-bold text-slate-600 tracking-wider">Current ETA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedVariance.items.map(item => (
                  <VarianceItemRow key={item.id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

// Memoize the component to prevent unnecessary re-renders when props haven't changed
export const ResourcesDashboard = memo(ResourcesDashboardComponent, (prevProps, nextProps) => {
  // Custom comparison: only re-render if initiatives actually changed
  if (prevProps.filteredInitiatives.length !== nextProps.filteredInitiatives.length) {
    return false; // Re-render needed
  }
  
  // Check if any initiative IDs changed
  const prevIds = new Set(prevProps.filteredInitiatives.map(i => i.id));
  const nextIds = new Set(nextProps.filteredInitiatives.map(i => i.id));
  if (prevIds.size !== nextIds.size || [...prevIds].some(id => !nextIds.has(id))) {
    return false; // Re-render needed
  }
  
  // Check if config or users changed
  if (prevProps.config !== nextProps.config || prevProps.users !== nextProps.users) {
    return false; // Re-render needed
  }
  
  // Props are equal, skip re-render
  return true;
});

