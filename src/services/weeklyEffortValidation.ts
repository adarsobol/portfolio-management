import { Initiative, AppConfig } from '../types';

export interface ValidationResult {
  flagged: boolean;
  deviationPercent: number;
  averageWeeklyEffort: number;
  currentWeekEffort: number;
  teamLeadId: string;
  quarter: string;
}

/**
 * Get quarter start date from quarter string (e.g., "Q4 2024")
 */
export function getQuarterStartDate(quarter: string): Date {
  const match = quarter.match(/Q(\d)\s+(\d{4})/);
  if (!match) {
    // Default to current quarter if parsing fails
    const now = new Date();
    const currentQuarter = Math.floor(now.getMonth() / 3);
    const year = now.getFullYear();
    const month = currentQuarter * 3; // 0, 3, 6, or 9
    return new Date(year, month, 1);
  }
  
  const quarterNum = parseInt(match[1], 10);
  const year = parseInt(match[2], 10);
  const month = (quarterNum - 1) * 3; // Q1=0, Q2=3, Q3=6, Q4=9
  
  return new Date(year, month, 1);
}

/**
 * Check if date is Thursday EOD (end of day)
 */
export function isThursdayEOD(date: Date): boolean {
  return date.getDay() === 4; // 4 = Thursday
}

/**
 * Get current week key for localStorage tracking (e.g., "2024-W45")
 */
export function getCurrentWeekKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${year}-W${weekNumber}`;
}

/**
 * Validate weekly team effort for a specific Team Lead
 * Compares current week's effort to quarterly average
 */
export function validateWeeklyTeamEffort(
  initiatives: Initiative[],
  config: AppConfig,
  teamLeadId: string
): ValidationResult {
  // Filter initiatives by Team Lead
  const teamLeadInitiatives = initiatives.filter(i => i.ownerId === teamLeadId);
  
  if (teamLeadInitiatives.length === 0) {
    return {
      flagged: false,
      deviationPercent: 0,
      averageWeeklyEffort: 0,
      currentWeekEffort: 0,
      teamLeadId,
      quarter: 'Q1 2024'
    };
  }
  
  // Get quarter from first initiative (all should be same quarter)
  const quarter = teamLeadInitiatives[0].quarter;
  const quarterStartDate = getQuarterStartDate(quarter);
  const now = new Date();
  
  // Calculate weeks in quarter from start to now
  const daysSinceQuarterStart = Math.floor((now.getTime() - quarterStartDate.getTime()) / (24 * 60 * 60 * 1000));
  const weeksInQuarter = Math.max(1, Math.ceil(daysSinceQuarterStart / 7)); // At least 1 week
  
  // Calculate total team effort (sum of actualEffort)
  const totalTeamEffort = teamLeadInitiatives.reduce((sum, i) => sum + (i.actualEffort || 0), 0);
  
  // Calculate average weekly effort
  const averageWeeklyEffort = totalTeamEffort / weeksInQuarter;
  
  // Calculate current week's updated effort (items updated since last Thursday EOD)
  const lastThursday = new Date(now);
  lastThursday.setDate(now.getDate() - ((now.getDay() + 3) % 7)); // Get last Thursday
  lastThursday.setHours(23, 59, 59, 999);
  
  // If no initiatives have lastWeeklyUpdate, use lastUpdated as fallback for current week
  const currentWeekEffort = teamLeadInitiatives
    .filter(i => {
      // Use lastWeeklyUpdate if available, otherwise fall back to lastUpdated
      const updateField = i.lastWeeklyUpdate || i.lastUpdated;
      if (!updateField) return false;
      const updateDate = new Date(updateField);
      return updateDate >= lastThursday;
    })
    .reduce((sum, i) => sum + (i.actualEffort || 0), 0);
  
  // If still no current week effort found, use all initiatives updated in last 7 days as fallback
  const fallbackCurrentWeekEffort = currentWeekEffort === 0 
    ? teamLeadInitiatives
        .filter(i => {
          const updateField = i.lastWeeklyUpdate || i.lastUpdated;
          if (!updateField) return false;
          const updateDate = new Date(updateField);
          const sevenDaysAgo = new Date(now);
          sevenDaysAgo.setDate(now.getDate() - 7);
          return updateDate >= sevenDaysAgo;
        })
        .reduce((sum, i) => sum + (i.actualEffort || 0), 0)
    : currentWeekEffort;
  
  // Use fallback if no current week effort found
  const finalCurrentWeekEffort = fallbackCurrentWeekEffort;
  
  // Calculate deviation percentage
  const deviationPercent = averageWeeklyEffort > 0
    ? Math.abs((finalCurrentWeekEffort - averageWeeklyEffort) / averageWeeklyEffort) * 100
    : 0;
  
  // Get threshold from config (default 15%)
  const threshold = config.weeklyEffortValidation?.thresholdPercent || 15;
  
  return {
    flagged: deviationPercent >= threshold,
    deviationPercent,
    averageWeeklyEffort,
    currentWeekEffort: finalCurrentWeekEffort,
    teamLeadId,
    quarter
  };
}

/**
 * Validate all Team Leads
 */
export function validateAllTeamLeads(
  initiatives: Initiative[],
  config: AppConfig,
  teamLeadIds: string[]
): ValidationResult[] {
  return teamLeadIds.map(id => validateWeeklyTeamEffort(initiatives, config, id));
}

