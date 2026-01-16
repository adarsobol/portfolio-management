import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Maximize2, Minimize2, Building2, FolderOpen, Target, FileText, Gauge, HelpCircle, ChevronUp } from 'lucide-react';
import { Initiative, Status, User, AppConfig, InitiativeType, UserCommentReadState, Comment as CommentType } from '../../types';
import { calculateCompletionRate } from '../../utils';

interface WorkPlanOverviewProps {
  initiatives: Initiative[];
  users: User[];
  config: AppConfig;
  currentUser: User;
  onInitiativeClick?: (initiative: Initiative) => void;
  filterAssetClass?: string; // Asset class filter to determine if grouping by asset class is needed
  commentReadState?: UserCommentReadState;
  onAddComment?: (initiativeId: string, comment: CommentType) => void;
  onMarkCommentRead?: (initiativeId: string) => void;
}

interface GroupedData {
  [assetClass: string]: {
    [pillar: string]: {
      [responsibility: string]: {
        [target: string]: Initiative[];
      };
    };
  };
}

interface AggregatedMetrics {
  count: number;
  totalActualEffort: number;
  totalPlannedEffort: number;
  avgCompletion: number;
  worstStatus: Status | null;
}

interface StatusBreakdown {
  notStarted: number;
  inProgress: number;
  atRisk: number;
  done: number;
  obsolete: number;
  deleted: number;
}

interface StrategicWorkloadItem {
  name: string;
  totalAllocated: number;
  actualSpent: number;
  weightedProgress: number;
  burnRate: number;
  efficiencyIndex: number;
  statusBreakdown: StatusBreakdown;
  itemCount: number;
}

interface StrategicInsight {
  type: 'efficiency_leak' | 'risk_density' | 'estimation_variance' | 'investment_heavy' | 'velocity_leader';
  severity: 'critical' | 'warning' | 'positive';
  pillar?: string;
  responsibility?: string;
  message: string;
  metric?: number;
}

// Asset class color mapping
const getAssetClassColors = (assetClass: string) => {
  const colors: Record<string, { bg: string; bgDark: string; text: string; border: string }> = {
    PL: { bg: 'bg-indigo-50', bgDark: 'bg-indigo-200', text: 'text-indigo-700', border: 'border-indigo-200' },
    Auto: { bg: 'bg-blue-50', bgDark: 'bg-blue-200', text: 'text-blue-700', border: 'border-blue-200' },
    POS: { bg: 'bg-green-50', bgDark: 'bg-green-200', text: 'text-green-700', border: 'border-green-200' },
    Advisory: { bg: 'bg-purple-50', bgDark: 'bg-purple-200', text: 'text-purple-700', border: 'border-purple-200' },
    Production: { bg: 'bg-amber-50', bgDark: 'bg-amber-200', text: 'text-amber-700', border: 'border-amber-200' },
  };
  return colors[assetClass] || { bg: 'bg-slate-50', bgDark: 'bg-slate-200', text: 'text-slate-700', border: 'border-slate-200' };
};


// Calculate completion percentage
const getCompletionRate = (initiative: Initiative): number => {
  if (initiative.completionRate !== undefined) {
    return initiative.completionRate;
  }
  // Fallback: estimate from status
  switch (initiative.status) {
    case Status.Done:
      return 100;
    case Status.NotStarted:
      return 0;
    case Status.InProgress:
      return 50; // Default estimate
    case Status.AtRisk:
      return 30; // Lower estimate for at-risk items
    default:
      return 0;
  }
};

// Calculate strategic workload metrics for a group (only In Progress, At Risk, Done)
const calculateStrategicMetrics = (groupInitiatives: Initiative[]): StrategicWorkloadItem | null => {
  // Filter to Active Portfolio: In Progress, At Risk, Done only
  const activeInitiatives = groupInitiatives.filter(i => 
    i.status === Status.InProgress || 
    i.status === Status.AtRisk || 
    i.status === Status.Done
  );

  if (activeInitiatives.length === 0) {
    return null;
  }

  const totalAllocated = activeInitiatives.reduce((sum, i) => sum + (i.estimatedEffort || 0), 0);
  const investedEffort = activeInitiatives.reduce((sum, i) => sum + (i.actualEffort || 0), 0);
  
  // Weighted Progress: Sum(completionRate * estimatedEffort) / Total Allocated
  const weightedProgressSum = activeInitiatives.reduce((sum, i) => {
    let completionRate: number;
    if (i.status === Status.Done) {
      completionRate = 100;
    } else {
      completionRate = i.completionRate ?? calculateCompletionRate(i.actualEffort, i.estimatedEffort);
    }
    return sum + (completionRate / 100) * (i.estimatedEffort || 0);
  }, 0);
  const weightedProgress = totalAllocated > 0 ? (weightedProgressSum / totalAllocated) * 100 : 0;
  
  const investedRate = totalAllocated > 0 ? (investedEffort / totalAllocated) * 100 : 0;
  const efficiencyIndex = investedRate > 0 ? weightedProgress / investedRate : 0;

  // Status breakdown for ALL statuses (from all initiatives, not just active)
  const statusBreakdown: StatusBreakdown = {
    notStarted: groupInitiatives.filter(i => i.status === Status.NotStarted).length,
    inProgress: groupInitiatives.filter(i => i.status === Status.InProgress).length,
    atRisk: groupInitiatives.filter(i => i.status === Status.AtRisk).length,
    done: groupInitiatives.filter(i => i.status === Status.Done).length,
    obsolete: groupInitiatives.filter(i => i.status === Status.Obsolete).length,
    deleted: groupInitiatives.filter(i => i.status === Status.Deleted).length,
  };

  return {
    name: groupInitiatives[0]?.l2_pillar || groupInitiatives[0]?.l3_responsibility || groupInitiatives[0]?.l4_target || 'Uncategorized',
    totalAllocated,
    actualSpent: investedEffort,
    weightedProgress: Math.round(weightedProgress * 10) / 10,
    burnRate: Math.round(investedRate * 10) / 10,
    efficiencyIndex: Math.round(efficiencyIndex * 100) / 100,
    statusBreakdown,
    itemCount: groupInitiatives.length,
  };
};

// Calculate aggregated metrics for a group of initiatives
const calculateAggregatedMetrics = (initiatives: Initiative[]): AggregatedMetrics => {
  if (initiatives.length === 0) {
    return { count: 0, totalActualEffort: 0, totalPlannedEffort: 0, avgCompletion: 0, worstStatus: null };
  }

  const totalActualEffort = initiatives.reduce((sum, i) => sum + (i.actualEffort || 0), 0);
  const totalPlannedEffort = initiatives.reduce((sum, i) => {
    return sum + (i.estimatedEffort || i.originalEstimatedEffort || 0);
  }, 0);
  const totalCompletion = initiatives.reduce((sum, i) => sum + getCompletionRate(i), 0);
  const avgCompletion = totalCompletion / initiatives.length;

  // Determine worst status (priority: AtRisk > InProgress > NotStarted > Done)
  const statusPriority: Record<Status, number> = {
    [Status.AtRisk]: 4,
    [Status.InProgress]: 3,
    [Status.NotStarted]: 2,
    [Status.Done]: 1,
    [Status.Obsolete]: 0,
    [Status.Deleted]: 0,
  };

  const worstStatus = initiatives.reduce((worst, i) => {
    const currentPriority = statusPriority[i.status] || 0;
    const worstPriority = worst ? statusPriority[worst] || 0 : 0;
    return currentPriority > worstPriority ? i.status : worst;
  }, null as Status | null);

  return {
    count: initiatives.length,
    totalActualEffort,
    totalPlannedEffort,
    avgCompletion: Math.round(avgCompletion),
    worstStatus,
  };
};

export const WorkPlanOverview: React.FC<WorkPlanOverviewProps> = ({
  initiatives,
  users: _users,
  config: _config,
  currentUser: _currentUser,
  onInitiativeClick,
  filterAssetClass = '',
  commentReadState: _commentReadState,
  onAddComment: _onAddComment,
  onMarkCommentRead: _onMarkCommentRead,
}) => {
  void _config; void _users; void _currentUser; void _commentReadState; void _onAddComment; void _onMarkCommentRead; // Reserved for future use
  
  // Determine if we should group by asset class (when no filter is applied)
  const shouldGroupByAssetClass = !filterAssetClass;
  
  // Group initiatives by Asset Class → Pillar → Responsibility → Target → Initiative
  const groupedData = useMemo((): GroupedData => {
    const groups: GroupedData = {};

    initiatives.forEach((initiative) => {
      const assetClass = initiative.l1_assetClass || 'Uncategorized';
      const pillar = initiative.l2_pillar || 'Uncategorized';
      const responsibility = initiative.l3_responsibility || 'Uncategorized';
      const target = initiative.l4_target || 'Uncategorized';

      // If filtering by asset class, use a single group key, otherwise group by asset class
      const groupKey = shouldGroupByAssetClass ? assetClass : 'All';

      if (!groups[groupKey]) {
        groups[groupKey] = {};
      }
      if (!groups[groupKey][pillar]) {
        groups[groupKey][pillar] = {};
      }
      if (!groups[groupKey][pillar][responsibility]) {
        groups[groupKey][pillar][responsibility] = {};
      }
      if (!groups[groupKey][pillar][responsibility][target]) {
        groups[groupKey][pillar][responsibility][target] = [];
      }

      groups[groupKey][pillar][responsibility][target].push(initiative);
    });

    // Sort initiatives within each target by priority and status
    Object.keys(groups).forEach((assetClass) => {
      Object.keys(groups[assetClass]).forEach((pillar) => {
        Object.keys(groups[assetClass][pillar]).forEach((responsibility) => {
          Object.keys(groups[assetClass][pillar][responsibility]).forEach((target) => {
            groups[assetClass][pillar][responsibility][target].sort((a, b) => {
              // Sort by status priority (AtRisk first), then by priority (P0 > P1 > P2)
              const statusPriority: Record<Status, number> = {
                [Status.AtRisk]: 4,
                [Status.InProgress]: 3,
                [Status.NotStarted]: 2,
                [Status.Done]: 1,
                [Status.Obsolete]: 0,
                [Status.Deleted]: 0,
              };

              const statusDiff = (statusPriority[b.status] || 0) - (statusPriority[a.status] || 0);
              if (statusDiff !== 0) return statusDiff;

              const priorityOrder = { P0: 3, P1: 2, P2: 1 };
              const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
              return priorityDiff;
            });
          });
        });
      });
    });

    return groups;
  }, [initiatives, shouldGroupByAssetClass]);

  // Collapse/expand state - need to track all hierarchy levels
  const [collapsedAssetClasses, setCollapsedAssetClasses] = useState<Set<string>>(new Set());
  const [collapsedPillars, setCollapsedPillars] = useState<Set<string>>(new Set());
  const [collapsedResponsibilities, setCollapsedResponsibilities] = useState<Set<string>>(new Set());
  const [collapsedTargets, setCollapsedTargets] = useState<Set<string>>(new Set());
  const [allExpanded, setAllExpanded] = useState(true);

  const toggleAssetClass = (assetClass: string) => {
    setCollapsedAssetClasses((prev) => {
      const next = new Set(prev);
      if (next.has(assetClass)) {
        next.delete(assetClass);
      } else {
        next.add(assetClass);
      }
      return next;
    });
  };

  const togglePillar = (assetClass: string, pillar: string) => {
    const key = `${assetClass}::${pillar}`;
    setCollapsedPillars((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleResponsibility = (assetClass: string, pillar: string, responsibility: string) => {
    const key = `${assetClass}::${pillar}::${responsibility}`;
    setCollapsedResponsibilities((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleTarget = (assetClass: string, pillar: string, responsibility: string, target: string) => {
    const key = `${assetClass}::${pillar}::${responsibility}::${target}`;
    setCollapsedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const expandAll = () => {
    setCollapsedAssetClasses(new Set());
    setCollapsedPillars(new Set());
    setCollapsedResponsibilities(new Set());
    setCollapsedTargets(new Set());
    setAllExpanded(true);
  };

  const collapseAll = () => {
    const allAssetClasses = new Set(Object.keys(groupedData));
    setCollapsedAssetClasses(allAssetClasses);
    setCollapsedPillars(new Set());
    setCollapsedResponsibilities(new Set());
    setCollapsedTargets(new Set());
    setAllExpanded(false);
  };

  // Collapse to specific levels
  const collapseToPillars = () => {
    setCollapsedAssetClasses(new Set());
    setCollapsedPillars(new Set());
    // Collapse all responsibilities and targets
    const allResponsibilities = new Set<string>();
    const allTargets = new Set<string>();
    Object.keys(groupedData).forEach((assetClassKey) => {
      Object.keys(groupedData[assetClassKey]).forEach((pillar) => {
        Object.keys(groupedData[assetClassKey][pillar]).forEach((responsibility) => {
          Object.keys(groupedData[assetClassKey][pillar][responsibility]).forEach((target) => {
            allResponsibilities.add(`${assetClassKey}::${pillar}::${responsibility}`);
            allTargets.add(`${assetClassKey}::${pillar}::${responsibility}::${target}`);
          });
        });
      });
    });
    setCollapsedResponsibilities(allResponsibilities);
    setCollapsedTargets(allTargets);
    setAllExpanded(false);
  };

  const collapseToResponsibilities = () => {
    setCollapsedAssetClasses(new Set());
    setCollapsedPillars(new Set());
    setCollapsedResponsibilities(new Set());
    // Collapse all targets
    const allTargets = new Set<string>();
    Object.keys(groupedData).forEach((assetClassKey) => {
      Object.keys(groupedData[assetClassKey]).forEach((pillar) => {
        Object.keys(groupedData[assetClassKey][pillar]).forEach((responsibility) => {
          Object.keys(groupedData[assetClassKey][pillar][responsibility]).forEach((target) => {
            allTargets.add(`${assetClassKey}::${pillar}::${responsibility}::${target}`);
          });
        });
      });
    });
    setCollapsedTargets(allTargets);
    setAllExpanded(false);
  };

  const collapseToTargets = () => {
    setCollapsedAssetClasses(new Set());
    setCollapsedPillars(new Set());
    setCollapsedResponsibilities(new Set());
    setCollapsedTargets(new Set());
    setAllExpanded(false);
  };



  // Render Status Mix bar (all statuses)
  const renderStatusMix = (breakdown: StatusBreakdown) => {
    const total = breakdown.notStarted + breakdown.inProgress + breakdown.atRisk + breakdown.done + breakdown.obsolete + breakdown.deleted;
    if (total === 0) {
      return <span className="text-[10px] text-slate-400">No items</span>;
    }

    const notStartedPct = (breakdown.notStarted / total) * 100;
    const inProgressPct = (breakdown.inProgress / total) * 100;
    const atRiskPct = (breakdown.atRisk / total) * 100;
    const donePct = (breakdown.done / total) * 100;
    const obsoletePct = (breakdown.obsolete / total) * 100;
    const deletedPct = (breakdown.deleted / total) * 100;

    return (
      <div className="flex items-center gap-0.5 h-3 w-full">
        {notStartedPct > 0 && (
          <div
            className="h-full bg-slate-400/70 rounded"
            style={{ width: `${notStartedPct}%`, minWidth: notStartedPct > 2 ? '2px' : '0px' }}
            title={`Not Started: ${breakdown.notStarted}`}
          />
        )}
        {inProgressPct > 0 && (
          <div
            className="h-full bg-blue-500/80 rounded"
            style={{ width: `${inProgressPct}%`, minWidth: inProgressPct > 2 ? '2px' : '0px' }}
            title={`In Progress: ${breakdown.inProgress}`}
          />
        )}
        {atRiskPct > 0 && (
          <div
            className="h-full bg-orange-500/80 rounded"
            style={{ width: `${atRiskPct}%`, minWidth: atRiskPct > 2 ? '2px' : '0px' }}
            title={`At Risk: ${breakdown.atRisk}`}
          />
        )}
        {donePct > 0 && (
          <div
            className="h-full bg-teal-500/80 rounded"
            style={{ width: `${donePct}%`, minWidth: donePct > 2 ? '2px' : '0px' }}
            title={`Done: ${breakdown.done}`}
          />
        )}
        {obsoletePct > 0 && (
          <div
            className="h-full bg-slate-300/60 rounded"
            style={{ width: `${obsoletePct}%`, minWidth: obsoletePct > 2 ? '2px' : '0px' }}
            title={`Obsolete: ${breakdown.obsolete}`}
          />
        )}
        {deletedPct > 0 && (
          <div
            className="h-full bg-rose-400/70 rounded"
            style={{ width: `${deletedPct}%`, minWidth: deletedPct > 2 ? '2px' : '0px' }}
            title={`Deleted: ${breakdown.deleted}`}
          />
        )}
      </div>
    );
  };

  // Render Allocated vs Actual
  const renderAllocatedVsActual = (allocated: number, actual: number) => {
    return (
      <div className="flex items-center gap-2">
        <div>
          <div className="text-xs font-medium text-slate-700">
            {allocated.toFixed(1)}w
          </div>
          <div className="text-[10px] text-slate-500">allocated</div>
        </div>
        <div className="text-slate-300">|</div>
        <div>
          <div className="text-xs font-medium text-slate-700">
            {actual.toFixed(1)}w
          </div>
          <div className="text-[10px] text-slate-500">actual</div>
        </div>
      </div>
    );
  };

  // Render Invested Effort vs Progress
  const renderInvestedVsProgress = (burnRate: number, weightedProgress: number) => {
    return (
      <div>
        <div className="relative w-full h-6 bg-slate-100/50 rounded overflow-hidden">
          {/* Ghost bar for total allocated (100%) */}
          <div className="absolute inset-0 bg-slate-200/40" />
          {/* Invested Effort bar */}
          <div
            className="absolute bottom-0 left-0 bg-indigo-400/70 h-full transition-all rounded"
            style={{ width: `${Math.min(burnRate, 100)}%` }}
            title={`Invested Effort: ${burnRate.toFixed(0)}%`}
          />
          {/* Progress bar (foreground) */}
          <div
            className="absolute bottom-0 left-0 bg-teal-500/85 h-3/4 transition-all rounded"
            style={{ width: `${Math.min(weightedProgress, 100)}%` }}
            title={`Progress: ${weightedProgress.toFixed(0)}% weighted progress`}
          />
          {/* Gap indicator if progress < invested */}
          {weightedProgress < burnRate && (
            <div
              className="absolute bottom-0 bg-amber-400/60 h-1/4 transition-all rounded"
              style={{
                left: `${weightedProgress}%`,
                width: `${Math.min(burnRate - weightedProgress, 100 - weightedProgress)}%`,
              }}
              title={`Efficiency gap: ${(burnRate - weightedProgress).toFixed(0)}%`}
            />
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 text-[10px]">
          <span className="text-slate-600">
            Invested: <span className="font-medium text-indigo-700">{burnRate.toFixed(0)}%</span>
          </span>
          <span className="text-teal-700">
            Progress: <span className="font-medium">{weightedProgress.toFixed(0)}%</span>
          </span>
        </div>
      </div>
    );
  };

  // Render Efficiency badge
  const renderEfficiency = (efficiencyIndex: number) => {
    return (
      <div className="flex flex-col items-end">
        <div className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
          efficiencyIndex >= 1.0
            ? 'bg-teal-50 text-teal-700 border border-teal-200'
            : efficiencyIndex >= 0.8
            ? 'bg-amber-50 text-amber-700 border border-amber-200'
            : 'bg-rose-50 text-rose-700 border border-rose-200'
        }`}>
          {(efficiencyIndex * 100).toFixed(0)}%
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">progress/invested</div>
      </div>
    );
  };

  // Count total items for display
  const totalItems = useMemo(() => {
    let count = 0;
    Object.values(groupedData).forEach((assetGroups) => {
      Object.values(assetGroups).forEach((pillarGroups) => {
        Object.values(pillarGroups).forEach((responsibilityGroups) => {
          Object.values(responsibilityGroups).forEach((initiatives) => {
            count += initiatives.length;
          });
        });
      });
    });
    return count;
  }, [groupedData]);

  // Calculate insights from all pillars and responsibilities
  const insights = useMemo((): StrategicInsight[] => {
    const allInsights: StrategicInsight[] = [];
    
    // Collect all initiatives for pillar/responsibility analysis
    const pillarMap = new Map<string, Initiative[]>();
    const responsibilityMap = new Map<string, Initiative[]>();
    
    Object.values(groupedData).forEach((assetGroups) => {
      Object.entries(assetGroups).forEach(([pillar, pillarGroups]) => {
        Object.entries(pillarGroups).forEach(([responsibility, responsibilityGroups]) => {
          Object.values(responsibilityGroups).forEach((initiatives) => {
            // Add to pillar map
            if (!pillarMap.has(pillar)) {
              pillarMap.set(pillar, []);
            }
            pillarMap.get(pillar)!.push(...initiatives);
            
            // Add to responsibility map
            if (!responsibilityMap.has(responsibility)) {
              responsibilityMap.set(responsibility, []);
            }
            responsibilityMap.get(responsibility)!.push(...initiatives);
          });
        });
      });
    });

    // Generate insights for pillars
    pillarMap.forEach((initiatives, pillar) => {
      const metrics = calculateStrategicMetrics(initiatives);
      if (!metrics) return;

      // Efficiency Leak
      if (metrics.burnRate > metrics.weightedProgress + 20 && metrics.totalAllocated > 0) {
        const gap = Math.round(metrics.burnRate - metrics.weightedProgress);
        allInsights.push({
          type: 'efficiency_leak',
          severity: gap > 40 ? 'critical' : 'warning',
          pillar,
          message: `${pillar} has invested ${metrics.burnRate.toFixed(0)}% of allocated effort but only achieved ${metrics.weightedProgress.toFixed(0)}% progress (${gap}% gap)`,
          metric: gap,
        });
      }

      // Risk Density
      const atRiskEffort = initiatives
        .filter(i => i.status === Status.AtRisk)
        .reduce((sum, i) => sum + (i.estimatedEffort || 0), 0);
      const riskPercentage = metrics.totalAllocated > 0 ? (atRiskEffort / metrics.totalAllocated) * 100 : 0;
      if (riskPercentage > 40) {
        allInsights.push({
          type: 'risk_density',
          severity: riskPercentage > 60 ? 'critical' : 'warning',
          pillar,
          message: `${pillar} has ${riskPercentage.toFixed(0)}% of its allocated effort currently marked 'At Risk'`,
          metric: riskPercentage,
        });
      }

      // Velocity Leaders
      if (metrics.efficiencyIndex > 1.1 && metrics.totalAllocated > 5) {
        allInsights.push({
          type: 'velocity_leader',
          severity: 'positive',
          pillar,
          message: `${pillar} is delivering ${(metrics.efficiencyIndex * 100).toFixed(0)}% efficiency (progress vs. invested effort)`,
          metric: metrics.efficiencyIndex,
        });
      }
    });

    // Generate insights for responsibilities
    responsibilityMap.forEach((initiatives, responsibility) => {
      const metrics = calculateStrategicMetrics(initiatives);
      if (!metrics) return;

      // Efficiency Leak
      if (metrics.burnRate > metrics.weightedProgress + 20 && metrics.totalAllocated > 0) {
        const gap = Math.round(metrics.burnRate - metrics.weightedProgress);
        allInsights.push({
          type: 'efficiency_leak',
          severity: gap > 40 ? 'critical' : 'warning',
          responsibility,
          message: `${responsibility} has invested ${metrics.burnRate.toFixed(0)}% of allocated effort but only achieved ${metrics.weightedProgress.toFixed(0)}% progress (${gap}% gap)`,
          metric: gap,
        });
      }
    });

    // Sort by severity
    const severityOrder = { critical: 0, warning: 1, positive: 2 };
    allInsights.sort((a, b) => {
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;
      return Math.abs(b.metric || 0) - Math.abs(a.metric || 0);
    });

    return allInsights;
  }, [groupedData]);

  const [insightsCollapsed, setInsightsCollapsed] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header with expand/collapse controls */}
      <div className="px-4 py-2.5 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-700">Work Plan Overview</h2>
          <span className="text-[10px] text-slate-500">
            {totalItems} initiative{totalItems !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={allExpanded ? collapseAll : expandAll}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-medium transition-colors shadow-sm"
            title={allExpanded ? 'Collapse All' : 'Expand All'}
          >
            {allExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            <span>{allExpanded ? 'Collapse All' : 'Expand All'}</span>
          </button>
          <span className="text-slate-300 text-[10px]">|</span>
          <button
            onClick={collapseToPillars}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-medium transition-colors shadow-sm"
            title="Show only Pillars (collapse Responsibilities, Targets, Initiatives)"
          >
            <Building2 size={12} />
            <span>To Pillars</span>
          </button>
          <button
            onClick={collapseToResponsibilities}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-medium transition-colors shadow-sm"
            title="Show Pillars and Responsibilities (collapse Targets, Initiatives)"
          >
            <FolderOpen size={12} />
            <span>To Responsibilities</span>
          </button>
          <button
            onClick={collapseToTargets}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-medium transition-colors shadow-sm"
            title="Show Pillars, Responsibilities, and Targets (collapse Initiatives)"
          >
            <Target size={12} />
            <span>To Targets</span>
          </button>
        </div>
      </div>

      {/* Automated Insights Summary */}
      {insights.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-pink-50 px-4 py-3 border-b border-slate-200">
          <button
            onClick={() => setInsightsCollapsed(!insightsCollapsed)}
            className="flex items-center gap-2 w-full mb-3 hover:opacity-80 transition-opacity"
          >
            <Gauge className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Automated Insights</h3>
            <HelpCircle className="w-3 h-3 text-slate-400" />
            <span className="text-[10px] text-slate-500 ml-auto">Based on Active Portfolio (In Progress, At Risk, Done)</span>
            {insightsCollapsed ? (
              <ChevronDown className="w-4 h-4 text-slate-600" />
            ) : (
              <ChevronUp className="w-4 h-4 text-slate-600" />
            )}
          </button>
          {!insightsCollapsed && (
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {insights.map((insight, idx) => {
                const severityColors = {
                  critical: 'bg-red-50 border-red-200 text-red-800',
                  warning: 'bg-amber-50 border-amber-200 text-amber-800',
                  positive: 'bg-emerald-50 border-emerald-200 text-emerald-800',
                };
                const severityIcons = {
                  critical: '🔴',
                  warning: '🟡',
                  positive: '🟢',
                };
                return (
                  <div
                    key={idx}
                    className={`flex items-start gap-2 p-2 rounded-lg border ${severityColors[insight.severity]}`}
                  >
                    <span className="text-sm flex-shrink-0">{severityIcons[insight.severity]}</span>
                    <p className="text-xs font-medium flex-1 leading-relaxed">{insight.message}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Column headers */}
      <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
        <div className="w-6"></div>
        <div>Item</div>
        <div className="w-[140px] text-center">Status Mix</div>
        <div className="w-[140px] text-center">Allocated vs. Actual</div>
        <div className="w-[180px] text-center">Invested Effort vs. Progress</div>
        <div className="w-[100px] text-right">Efficiency</div>
      </div>


      {/* Tree structure */}
      <div className="divide-y divide-slate-100">
        {Object.keys(groupedData)
          .sort()
          .map((assetClassKey) => {
            const assetClassGroups = groupedData[assetClassKey];
            const isAssetClassCollapsed = collapsedAssetClasses.has(assetClassKey);
            
            // Get asset class name (if grouping by asset class, use the key; otherwise use the first initiative's asset class)
            const firstInitiative = Object.values(assetClassGroups)[0]?.[Object.keys(Object.values(assetClassGroups)[0] || {})[0]]?.[Object.keys(Object.values(Object.values(assetClassGroups)[0] || {})[0] || {})[0]]?.[0];
            const assetClassName = shouldGroupByAssetClass ? assetClassKey : (firstInitiative?.l1_assetClass || 'All');
            const assetClassColors = getAssetClassColors(assetClassName);

            // Calculate asset class level metrics
            const assetClassInitiatives: Initiative[] = [];
            Object.values(assetClassGroups).forEach((pillarGroups) => {
              Object.values(pillarGroups).forEach((responsibilityGroups) => {
                Object.values(responsibilityGroups).forEach((targetGroups) => {
                  assetClassInitiatives.push(...targetGroups);
                });
              });
            });
            const assetClassMetrics = calculateAggregatedMetrics(assetClassInitiatives);
            const assetClassStrategic = calculateStrategicMetrics(assetClassInitiatives);
            
            // Calculate status breakdown for asset class
            const assetClassStatusBreakdown: StatusBreakdown = {
              notStarted: assetClassInitiatives.filter(i => i.status === Status.NotStarted).length,
              inProgress: assetClassInitiatives.filter(i => i.status === Status.InProgress).length,
              atRisk: assetClassInitiatives.filter(i => i.status === Status.AtRisk).length,
              done: assetClassInitiatives.filter(i => i.status === Status.Done).length,
              obsolete: assetClassInitiatives.filter(i => i.status === Status.Obsolete).length,
              deleted: assetClassInitiatives.filter(i => i.status === Status.Deleted).length,
            };

            return (
              <div key={assetClassKey}>
                {/* Asset Class header (only show when grouping by asset class) */}
                {shouldGroupByAssetClass && (
                  <div
                    className={`grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-2 px-3 py-2.5 items-center cursor-pointer hover:opacity-90 transition-colors border-l-[6px] ${assetClassColors.border} ${assetClassColors.bgDark} border-t-2 border-t-slate-300 shadow-sm`}
                    onClick={() => toggleAssetClass(assetClassKey)}
                  >
                    <div className="w-6 flex items-center justify-center">
                      {isAssetClassCollapsed ? (
                        <ChevronRight size={14} className="text-slate-400" />
                      ) : (
                        <ChevronDown size={14} className="text-slate-400" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1.5 rounded font-bold text-xs ${assetClassColors.text} ${assetClassColors.bgDark} border-2 ${assetClassColors.border}`}>
                        {assetClassName}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-700">
                        ({assetClassMetrics.count} item{assetClassMetrics.count !== 1 ? 's' : ''})
                      </span>
                    </div>
                    <div className="w-[140px] px-2">
                      {renderStatusMix(assetClassStatusBreakdown)}
                    </div>
                    <div className="w-[140px] px-2">
                      {assetClassStrategic ? renderAllocatedVsActual(assetClassStrategic.totalAllocated, assetClassStrategic.actualSpent) : '—'}
                    </div>
                    <div className="w-[180px] px-2">
                      {assetClassStrategic ? renderInvestedVsProgress(assetClassStrategic.burnRate, assetClassStrategic.weightedProgress) : '—'}
                    </div>
                    <div className="w-[100px] px-2 text-right">
                      {assetClassStrategic ? renderEfficiency(assetClassStrategic.efficiencyIndex) : '—'}
                    </div>
                  </div>
                )}

                {/* Pillars */}
                {(!shouldGroupByAssetClass || !isAssetClassCollapsed) && (
                  <div>
                    {Object.keys(assetClassGroups)
                      .sort()
                      .map((pillar) => {
                        const pillarGroups = assetClassGroups[pillar];
                        const pillarKey = `${assetClassKey}::${pillar}`;
                        const isPillarCollapsed = collapsedPillars.has(pillarKey);
                        
                        // Calculate pillar metrics
                        const pillarInitiatives: Initiative[] = [];
                        Object.values(pillarGroups).forEach((responsibilityGroups) => {
                          Object.values(responsibilityGroups).forEach((targetGroups) => {
                            pillarInitiatives.push(...targetGroups);
                          });
                        });
                        const pillarMetrics = calculateAggregatedMetrics(pillarInitiatives);
                        const pillarStrategic = calculateStrategicMetrics(pillarInitiatives);
                        
                        // Calculate status breakdown for pillar
                        const pillarStatusBreakdown: StatusBreakdown = {
                          notStarted: pillarInitiatives.filter(i => i.status === Status.NotStarted).length,
                          inProgress: pillarInitiatives.filter(i => i.status === Status.InProgress).length,
                          atRisk: pillarInitiatives.filter(i => i.status === Status.AtRisk).length,
                          done: pillarInitiatives.filter(i => i.status === Status.Done).length,
                          obsolete: pillarInitiatives.filter(i => i.status === Status.Obsolete).length,
                          deleted: pillarInitiatives.filter(i => i.status === Status.Deleted).length,
                        };

                        return (
                          <div key={pillarKey}>
                            {/* Pillar header */}
                            <div
                              className={`grid grid-cols-[auto_auto_1fr_auto_auto_auto_auto] gap-2 px-3 py-2 items-center cursor-pointer hover:bg-slate-100/50 transition-colors border-l-2 border-l-slate-300 bg-slate-50`}
                              onClick={() => togglePillar(assetClassKey, pillar)}
                            >
                              <div className="w-6 flex items-center justify-center">
                                {isPillarCollapsed ? (
                                  <ChevronRight size={14} className="text-slate-400" />
                                ) : (
                                  <ChevronDown size={14} className="text-slate-400" />
                                )}
                              </div>
                              <div className="w-6 flex items-center justify-center">
                                <Building2 size={12} className="text-slate-500" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-800">{pillar}</span>
                                <span className="text-[10px] text-slate-600">
                                  ({pillarMetrics.count} item{pillarMetrics.count !== 1 ? 's' : ''})
                                </span>
                              </div>
                              <div className="w-[140px] px-2">
                                {renderStatusMix(pillarStatusBreakdown)}
                              </div>
                              <div className="w-[140px] px-2">
                                {pillarStrategic ? renderAllocatedVsActual(pillarStrategic.totalAllocated, pillarStrategic.actualSpent) : '—'}
                              </div>
                              <div className="w-[180px] px-2">
                                {pillarStrategic ? renderInvestedVsProgress(pillarStrategic.burnRate, pillarStrategic.weightedProgress) : '—'}
                              </div>
                              <div className="w-[100px] px-2 text-right">
                                {pillarStrategic ? renderEfficiency(pillarStrategic.efficiencyIndex) : '—'}
                              </div>
                            </div>

                            {/* Responsibilities */}
                            {!isPillarCollapsed && (
                              <div>
                                {Object.keys(pillarGroups)
                                  .sort()
                                  .map((responsibility, respIndex) => {
                                    const responsibilityGroups = pillarGroups[responsibility];
                                    const responsibilityKey = `${assetClassKey}::${pillar}::${responsibility}`;
                                    const isResponsibilityCollapsed = collapsedResponsibilities.has(responsibilityKey);
                                    
                                    // Calculate responsibility metrics
                                    const responsibilityInitiatives: Initiative[] = [];
                                    Object.values(responsibilityGroups).forEach((targetGroups) => {
                                      responsibilityInitiatives.push(...targetGroups);
                                    });
                                    const responsibilityMetrics = calculateAggregatedMetrics(responsibilityInitiatives);
                                    const responsibilityStrategic = calculateStrategicMetrics(responsibilityInitiatives);
                                    
                                    // Calculate status breakdown for responsibility
                                    const responsibilityStatusBreakdown: StatusBreakdown = {
                                      notStarted: responsibilityInitiatives.filter(i => i.status === Status.NotStarted).length,
                                      inProgress: responsibilityInitiatives.filter(i => i.status === Status.InProgress).length,
                                      atRisk: responsibilityInitiatives.filter(i => i.status === Status.AtRisk).length,
                                      done: responsibilityInitiatives.filter(i => i.status === Status.Done).length,
                                      obsolete: responsibilityInitiatives.filter(i => i.status === Status.Obsolete).length,
                                      deleted: responsibilityInitiatives.filter(i => i.status === Status.Deleted).length,
                                    };

                                    return (
                                      <div key={responsibilityKey}>
                                        {/* Responsibility header */}
                                        <div
                                          className={`grid grid-cols-[auto_auto_auto_1fr_auto_auto_auto_auto] gap-2 px-3 py-1.5 items-center cursor-pointer hover:bg-slate-100/30 transition-colors border-l-2 border-l-slate-300 ${respIndex % 2 === 0 ? 'bg-slate-50/50' : 'bg-slate-100/30'}`}
                                          onClick={() => toggleResponsibility(assetClassKey, pillar, responsibility)}
                                        >
                                          <div className="w-6"></div>
                                          <div className="w-6"></div>
                                          <div className="w-6 flex items-center justify-center">
                                            {isResponsibilityCollapsed ? (
                                              <ChevronRight size={12} className="text-slate-400" />
                                            ) : (
                                              <ChevronDown size={12} className="text-slate-400" />
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            <FolderOpen size={11} className="text-slate-500 flex-shrink-0" />
                                            <span className="text-[11px] font-medium text-slate-700 italic">
                                              {responsibility}
                                            </span>
                                            <span className="text-[9px] text-slate-500">
                                              ({responsibilityMetrics.count})
                                            </span>
                                          </div>
                                          <div className="w-[140px] px-2">
                                            {renderStatusMix(responsibilityStatusBreakdown)}
                                          </div>
                                          <div className="w-[140px] px-2">
                                            {responsibilityStrategic ? renderAllocatedVsActual(responsibilityStrategic.totalAllocated, responsibilityStrategic.actualSpent) : '—'}
                                          </div>
                                          <div className="w-[180px] px-2">
                                            {responsibilityStrategic ? renderInvestedVsProgress(responsibilityStrategic.burnRate, responsibilityStrategic.weightedProgress) : '—'}
                                          </div>
                                          <div className="w-[100px] px-2 text-right">
                                            {responsibilityStrategic ? renderEfficiency(responsibilityStrategic.efficiencyIndex) : '—'}
                                          </div>
                                        </div>

                                        {/* Targets */}
                                        {!isResponsibilityCollapsed && (
                                          <div>
                                            {Object.keys(responsibilityGroups)
                                              .sort()
                                              .map((target, targetIndex) => {
                                                const targetInitiatives = responsibilityGroups[target];
                                                const targetKey = `${assetClassKey}::${pillar}::${responsibility}::${target}`;
                                                const isTargetCollapsed = collapsedTargets.has(targetKey);
                                                const targetMetrics = calculateAggregatedMetrics(targetInitiatives);
                                                const targetStrategic = calculateStrategicMetrics(targetInitiatives);
                                                
                                                // Calculate status breakdown for target
                                                const targetStatusBreakdown: StatusBreakdown = {
                                                  notStarted: targetInitiatives.filter(i => i.status === Status.NotStarted).length,
                                                  inProgress: targetInitiatives.filter(i => i.status === Status.InProgress).length,
                                                  atRisk: targetInitiatives.filter(i => i.status === Status.AtRisk).length,
                                                  done: targetInitiatives.filter(i => i.status === Status.Done).length,
                                                  obsolete: targetInitiatives.filter(i => i.status === Status.Obsolete).length,
                                                  deleted: targetInitiatives.filter(i => i.status === Status.Deleted).length,
                                                };

                                                return (
                                                  <div key={targetKey}>
                                                    {/* Target header */}
                                                    <div
                                                      className={`grid grid-cols-[auto_auto_auto_auto_1fr_auto_auto_auto_auto] gap-2 px-3 py-1 items-center cursor-pointer hover:bg-slate-100/20 transition-colors border-l-2 border-l-slate-300 ${targetIndex % 2 === 0 ? 'bg-slate-50/30' : 'bg-slate-100/20'}`}
                                                      onClick={() => toggleTarget(assetClassKey, pillar, responsibility, target)}
                                                    >
                                                      <div className="w-6"></div>
                                                      <div className="w-6"></div>
                                                      <div className="w-6"></div>
                                                      <div className="w-6 flex items-center justify-center">
                                                        {isTargetCollapsed ? (
                                                          <ChevronRight size={11} className="text-slate-400" />
                                                        ) : (
                                                          <ChevronDown size={11} className="text-slate-400" />
                                                        )}
                                                      </div>
                                                      <div className="flex items-center gap-1.5">
                                                        <Target size={10} className="text-slate-500 flex-shrink-0" />
                                                        <span className="text-[11px] text-slate-700">
                                                          {target}
                                                        </span>
                                                        <span className="text-[9px] text-slate-500">
                                                          ({targetMetrics.count})
                                                        </span>
                                                      </div>
                                                      <div className="w-[140px] px-2">
                                                        {renderStatusMix(targetStatusBreakdown)}
                                                      </div>
                                                      <div className="w-[140px] px-2">
                                                        {targetStrategic ? renderAllocatedVsActual(targetStrategic.totalAllocated, targetStrategic.actualSpent) : '—'}
                                                      </div>
                                                      <div className="w-[180px] px-2">
                                                        {targetStrategic ? renderInvestedVsProgress(targetStrategic.burnRate, targetStrategic.weightedProgress) : '—'}
                                                      </div>
                                                      <div className="w-[100px] px-2 text-right">
                                                        {targetStrategic ? renderEfficiency(targetStrategic.efficiencyIndex) : '—'}
                                                      </div>
                                                    </div>

                                                    {/* Initiatives */}
                                                    {!isTargetCollapsed && (
                                                      <div>
                                                        {targetInitiatives.map((initiative, initiativeIndex) => {
                                                          const plannedEffort = initiative.estimatedEffort || initiative.originalEstimatedEffort || 0;
                                                          const actualEffort = initiative.actualEffort || 0;
                                                          
                                                          // Calculate strategic metrics for individual initiative
                                                          const initiativeStrategic = calculateStrategicMetrics([initiative]);
                                                          
                                                          // Status breakdown for single initiative
                                                          const initiativeStatusBreakdown: StatusBreakdown = {
                                                            notStarted: initiative.status === Status.NotStarted ? 1 : 0,
                                                            inProgress: initiative.status === Status.InProgress ? 1 : 0,
                                                            atRisk: initiative.status === Status.AtRisk ? 1 : 0,
                                                            done: initiative.status === Status.Done ? 1 : 0,
                                                            obsolete: initiative.status === Status.Obsolete ? 1 : 0,
                                                            deleted: initiative.status === Status.Deleted ? 1 : 0,
                                                          };

                                                          return (
                                                            <div
                                                              key={initiative.id}
                                                              className={`grid grid-cols-[auto_auto_auto_auto_1fr_auto_auto_auto_auto] gap-2 px-3 py-1 items-center hover:bg-blue-50/50 transition-colors ${initiativeIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                                                              onClick={() => onInitiativeClick?.(initiative)}
                                                            >
                                                              <div className="w-6"></div>
                                                              <div className="w-6"></div>
                                                              <div className="w-6"></div>
                                                              <div className="w-6"></div>
                                                              <div className="flex items-center gap-1.5 min-w-0">
                                                                <FileText size={10} className="text-slate-400 flex-shrink-0" />
                                                                <span
                                                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0 ${
                                                                    initiative.initiativeType === InitiativeType.WP
                                                                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                                                      : 'bg-purple-100 text-purple-700 border border-purple-300'
                                                                  }`}
                                                                  title={initiative.initiativeType === InitiativeType.WP ? 'Work Plan' : 'Business As Usual'}
                                                                >
                                                                  {initiative.initiativeType === InitiativeType.WP ? 'WP' : 'BAU'}
                                                                </span>
                                                                <span
                                                                  className="text-[11px] text-slate-800 truncate cursor-pointer hover:text-blue-600 flex-1 min-w-0"
                                                                  title={initiative.title}
                                                                >
                                                                  {initiative.title}
                                                                </span>
                                                              </div>
                                                              <div className="w-[140px] px-2">
                                                                {renderStatusMix(initiativeStatusBreakdown)}
                                                              </div>
                                                              <div className="w-[140px] px-2">
                                                                {plannedEffort > 0 || actualEffort > 0 ? renderAllocatedVsActual(plannedEffort, actualEffort) : '—'}
                                                              </div>
                                                              <div className="w-[180px] px-2">
                                                                {initiativeStrategic ? renderInvestedVsProgress(initiativeStrategic.burnRate, initiativeStrategic.weightedProgress) : '—'}
                                                              </div>
                                                              <div className="w-[100px] px-2 text-right">
                                                                {initiativeStrategic ? renderEfficiency(initiativeStrategic.efficiencyIndex) : '—'}
                                                              </div>
                                                            </div>
                                                          );
                                                        })}
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Empty state */}
      {Object.keys(groupedData).length === 0 && (
        <div className="px-4 py-12 text-center text-slate-400 text-sm">
          No initiatives found. Try adjusting your filters.
        </div>
      )}
    </div>
  );
};
