/**
 * Effort conversion utilities for converting between weeks and days
 * Standard conversion: 5 working days = 1 week
 */

export const DAYS_PER_WEEK = 5; // Working days per week

/**
 * Convert weeks to days
 * @param weeks - Number of weeks
 * @returns Number of days
 */
export function weeksToDays(weeks: number): number {
  return weeks * DAYS_PER_WEEK;
}

/**
 * Convert days to weeks
 * @param days - Number of days
 * @returns Number of weeks (rounded to 2 decimal places)
 */
export function daysToWeeks(days: number): number {
  return Math.round((days / DAYS_PER_WEEK) * 100) / 100;
}

/**
 * Format effort value with unit indicator
 * @param value - Effort value
 * @param unit - Unit to display ('weeks' or 'days')
 * @returns Formatted string (e.g., "5.0w" or "25d")
 */
export function formatEffort(value: number, unit: 'weeks' | 'days'): string {
  if (unit === 'days') {
    return `${value.toFixed(1)}d`;
  }
  return `${value.toFixed(2)}w`;
}

