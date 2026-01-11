/**
 * Report Generation Service
 * 
 * Generates monthly summary reports from initiative data and change history
 */

import { 
  Initiative, 
  ChangeRecord, 
  MonthlyReport, 
  ReportStatus, 
  ReportMetrics,
  Status,
  User
} from '../types';
import { generateId } from '../utils';

/**
 * Get start and end dates for a period (YYYY-MM format)
 */
function getPeriodDates(period: string): { start: Date; end: Date } {
  const [year, month] = period.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999); // Last day of month
  return { start, end };
}

/**
 * Check if a date is within the period
 */
function isInPeriod(dateStr: string, period: string): boolean {
  const date = new Date(dateStr);
  const { start, end } = getPeriodDates(period);
  return date >= start && date <= end;
}

/**
 * Format initiative for display in report
 */
function formatInitiative(initiative: Initiative, users: User[]): string {
  const owner = users.find(u => u.id === initiative.ownerId);
  const ownerName = owner?.name || initiative.ownerId;
  const eta = initiative.eta ? new Date(initiative.eta).toLocaleDateString() : 'N/A';
  return `**${initiative.title}** (${initiative.id}) - Owner: ${ownerName}, ETA: ${eta}`;
}

/**
 * Generate team-level report
 */
export function generateTeamReport(
  initiatives: Initiative[],
  changeLog: ChangeRecord[],
  teamLeadId: string,
  period: string,
  generatedBy: string,
  users: User[]
): MonthlyReport {
  // Filter initiatives by owner
  const teamInitiatives = initiatives.filter(i => i.ownerId === teamLeadId);
  
  // Filter changes within period and for this team's initiatives
  const teamInitiativeIds = new Set(teamInitiatives.map(i => i.id));
  const periodChanges = changeLog.filter(c => 
    isInPeriod(c.timestamp, period) && teamInitiativeIds.has(c.initiativeId)
  );

  // Calculate metrics
  const completed = teamInitiatives.filter(i => 
    i.status === Status.Done && 
    i.lastUpdated && 
    isInPeriod(i.lastUpdated, period)
  );

  const newItems = teamInitiatives.filter(i => 
    i.createdAt && 
    isInPeriod(i.createdAt, period)
  );

  const atRisk = teamInitiatives.filter(i => 
    i.status === Status.AtRisk &&
    i.lastUpdated &&
    isInPeriod(i.lastUpdated, period)
  );

  const etaChanges = periodChanges.filter(c => c.field === 'eta' || c.field === 'ETA');
  
  // Calculate effort variance
  let totalEstimated = 0;
  let totalActual = 0;
  teamInitiatives.forEach(i => {
    totalEstimated += i.estimatedEffort || 0;
    totalActual += i.actualEffort || 0;
  });
  const effortVariance = totalEstimated > 0 
    ? ((totalActual - totalEstimated) / totalEstimated) * 100 
    : 0;

  // Status changes breakdown
  const statusChanges = periodChanges
    .filter(c => c.field === 'status')
    .reduce((acc, c) => {
      const key = `${c.oldValue}→${c.newValue}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const statusChangesArray = Object.entries(statusChanges).map(([key, count]) => {
    const [from, to] = key.split('→');
    return { from, to, count };
  });

  const metrics: ReportMetrics = {
    initiativeCount: teamInitiatives.length,
    completedCount: completed.length,
    newCount: newItems.length,
    atRiskCount: atRisk.length,
    etaChangedCount: etaChanges.length,
    effortVariance,
    statusChanges: statusChangesArray
  };

  // Generate section content
  const completedItems = completed.length > 0
    ? completed.map(i => formatInitiative(i, users)).join('\n\n')
    : 'No initiatives were completed this month.';

  const newItemsText = newItems.length > 0
    ? newItems.map(i => formatInitiative(i, users)).join('\n\n')
    : 'No new initiatives were added this month.';

  // Status changes
  const statusChangesText = statusChangesArray.length > 0
    ? statusChangesArray.map(sc => 
        `- ${sc.count} initiative(s) moved from **${sc.from}** to **${sc.to}**`
      ).join('\n')
    : 'No status changes occurred this month.';

  // ETA changes
  const etaChangesText = etaChanges.length > 0
    ? etaChanges.map(c => {
        const initiative = teamInitiatives.find(i => i.id === c.initiativeId);
        if (!initiative) return '';
        const oldDate = c.oldValue ? new Date(c.oldValue as string).toLocaleDateString() : 'N/A';
        const newDate = c.newValue ? new Date(c.newValue as string).toLocaleDateString() : 'N/A';
        const daysDiff = c.oldValue && c.newValue
          ? Math.ceil((new Date(c.newValue as string).getTime() - new Date(c.oldValue as string).getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        const direction = daysDiff > 0 ? 'delayed' : daysDiff < 0 ? 'accelerated' : 'unchanged';
        return `- **${initiative.title}**: ${oldDate} → ${newDate} (${direction} by ${Math.abs(daysDiff)} days)`;
      }).filter(Boolean).join('\n')
    : 'No ETA changes occurred this month.';

  // Trade-offs (from riskActionLog or At Risk items)
  const tradeOffs = teamInitiatives
    .filter(i => i.status === Status.AtRisk && i.riskActionLog)
    .map(i => `- **${i.title}**: ${i.riskActionLog}`)
    .join('\n');
  const tradeOffsText = tradeOffs || 'No trade-offs documented this month.';

  // Risks and blockers
  const risks = atRisk.map(i => {
    const riskText = i.riskActionLog ? `\n  - Action: ${i.riskActionLog}` : '';
    return `- **${i.title}** (${i.id})${riskText}`;
  }).join('\n');
  const risksText = risks || 'No items at risk this month.';

  // Generate draft executive summary
  const executiveSummary = `This month, the team worked on ${teamInitiatives.length} initiative(s), completing ${completed.length} and adding ${newItems.length} new initiative(s). ${atRisk.length > 0 ? `${atRisk.length} initiative(s) are currently at risk.` : 'All initiatives are on track.'}`;

  const report: MonthlyReport = {
    id: generateId(),
    type: 'team',
    period,
    teamLeadId,
    status: ReportStatus.Draft,
    generatedAt: new Date().toISOString(),
    generatedBy,
    metrics,
    sections: {
      executiveSummary,
      highlights: '', // Empty, to be filled by editor
      completedItems,
      newItems: newItemsText,
      statusChanges: statusChangesText,
      etaChanges: etaChangesText,
      tradeOffs: tradeOffsText,
      risksAndBlockers: risksText,
      nextMonthOutlook: '' // Empty, to be filled by editor
    }
  };

  return report;
}

/**
 * Generate department-level report from team reports
 */
export function generateDepartmentReport(
  teamReports: MonthlyReport[],
  period: string,
  generatedBy: string
): MonthlyReport {
  // Aggregate metrics
  const totalInitiatives = teamReports.reduce((sum, r) => sum + r.metrics.initiativeCount, 0);
  const totalCompleted = teamReports.reduce((sum, r) => sum + r.metrics.completedCount, 0);
  const totalNew = teamReports.reduce((sum, r) => sum + r.metrics.newCount, 0);
  const totalAtRisk = teamReports.reduce((sum, r) => sum + r.metrics.atRiskCount, 0);
  const totalEtaChanges = teamReports.reduce((sum, r) => sum + r.metrics.etaChangedCount, 0);
  
  // Average effort variance
  const avgEffortVariance = teamReports.length > 0
    ? teamReports.reduce((sum, r) => sum + r.metrics.effortVariance, 0) / teamReports.length
    : 0;

  // Aggregate status changes
  const statusChangesMap = new Map<string, number>();
  teamReports.forEach(r => {
    r.metrics.statusChanges.forEach(sc => {
      const key = `${sc.from}→${sc.to}`;
      statusChangesMap.set(key, (statusChangesMap.get(key) || 0) + sc.count);
    });
  });

  const statusChanges = Array.from(statusChangesMap.entries()).map(([key, count]) => {
    const [from, to] = key.split('→');
    return { from, to, count };
  });

  const metrics: ReportMetrics = {
    initiativeCount: totalInitiatives,
    completedCount: totalCompleted,
    newCount: totalNew,
    atRiskCount: totalAtRisk,
    etaChangedCount: totalEtaChanges,
    effortVariance: avgEffortVariance,
    statusChanges
  };

  // Combine highlights from team reports
  const teamHighlights = teamReports
    .filter(r => r.sections.highlights)
    .map(r => `**Team ${r.teamLeadId}**:\n${r.sections.highlights}`)
    .join('\n\n');

  // Roll up completed items
  const completedItems = teamReports
    .filter(r => r.sections.completedItems && r.sections.completedItems !== 'No initiatives were completed this month.')
    .map(r => `**Team ${r.teamLeadId}**:\n${r.sections.completedItems}`)
    .join('\n\n') || 'No initiatives were completed across all teams this month.';

  // Roll up risks
  const risks = teamReports
    .filter(r => r.sections.risksAndBlockers && r.sections.risksAndBlockers !== 'No items at risk this month.')
    .map(r => `**Team ${r.teamLeadId}**:\n${r.sections.risksAndBlockers}`)
    .join('\n\n') || 'No items at risk across all teams this month.';

  // Generate executive summary
  const executiveSummary = `This month, the department worked on ${totalInitiatives} initiative(s) across ${teamReports.length} team(s), completing ${totalCompleted} and adding ${totalNew} new initiative(s). ${totalAtRisk > 0 ? `${totalAtRisk} initiative(s) are currently at risk.` : 'All initiatives are on track.'}`;

  const report: MonthlyReport = {
    id: generateId(),
    type: 'department',
    period,
    status: ReportStatus.Draft,
    generatedAt: new Date().toISOString(),
    generatedBy,
    metrics,
    sections: {
      executiveSummary,
      highlights: teamHighlights || '', // Combined from team reports
      completedItems,
      newItems: `**New Initiatives Across All Teams**:\n${teamReports.map(r => `Team ${r.teamLeadId}: ${r.metrics.newCount} new initiative(s)`).join('\n')}`,
      statusChanges: statusChanges.map(sc => 
        `- ${sc.count} initiative(s) moved from **${sc.from}** to **${sc.to}**`
      ).join('\n') || 'No status changes occurred this month.',
      etaChanges: `**ETA Changes Across All Teams**:\n${teamReports.map(r => `Team ${r.teamLeadId}: ${r.metrics.etaChangedCount} ETA change(s)`).join('\n')}`,
      tradeOffs: teamReports
        .filter(r => r.sections.tradeOffs && r.sections.tradeOffs !== 'No trade-offs documented this month.')
        .map(r => `**Team ${r.teamLeadId}**:\n${r.sections.tradeOffs}`)
        .join('\n\n') || 'No trade-offs documented across all teams this month.',
      risksAndBlockers: risks,
      nextMonthOutlook: '' // Empty, to be filled by editor
    }
  };

  return report;
}

