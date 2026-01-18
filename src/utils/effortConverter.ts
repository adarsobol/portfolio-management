/**
 * Effort conversion utilities for converting between weeks, days, and hours
 * Standard conversion: 8 hours = 1 day, 5 working days = 1 week
 */

export const HOURS_PER_DAY = 8; // Working hours per day
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
 * @returns Number of weeks (rounded to 4 decimal places for better precision)
 */
export function daysToWeeks(days: number): number {
  // Use 4 decimal places to minimize rounding errors while keeping practical precision
  // 0.0001 weeks = 0.0005 days, which is negligible for practical purposes
  return Math.round((days / DAYS_PER_WEEK) * 10000) / 10000;
}

/**
 * Convert weeks to hours
 * @param weeks - Number of weeks
 * @returns Number of hours
 */
export function weeksToHours(weeks: number): number {
  return weeks * DAYS_PER_WEEK * HOURS_PER_DAY;
}

/**
 * Convert hours to weeks
 * @param hours - Number of hours
 * @returns Number of weeks (rounded to 4 decimal places for better precision)
 */
export function hoursToWeeks(hours: number): number {
  return Math.round((hours / (DAYS_PER_WEEK * HOURS_PER_DAY)) * 10000) / 10000;
}

/**
 * Convert days to hours
 * @param days - Number of days
 * @returns Number of hours
 */
export function daysToHours(days: number): number {
  return days * HOURS_PER_DAY;
}

/**
 * Convert hours to days
 * @param hours - Number of hours
 * @returns Number of days (rounded to 4 decimal places for better precision)
 */
export function hoursToDays(hours: number): number {
  return Math.round((hours / HOURS_PER_DAY) * 10000) / 10000;
}

/**
 * Format effort value with unit indicator
 * @param value - Effort value
 * @param unit - Unit to display ('weeks', 'days', or 'hours')
 * @returns Formatted string (e.g., "5.0w", "25d", or "40h")
 */
export function formatEffort(value: number, unit: 'weeks' | 'days' | 'hours'): string {
  if (unit === 'hours') {
    return `${value.toFixed(1)}h`;
  }
  if (unit === 'days') {
    return `${value.toFixed(1)}d`;
  }
  return `${value.toFixed(2)}w`;
}

/**
 * Format a number to a specified number of decimal places
 * Removes trailing zeros (e.g., 2.50 becomes "2.5", 3.00 becomes "3")
 * @param value - The number to format
 * @param decimals - Maximum decimal places (default: 2)
 * @returns Formatted string representation
 */
export function formatNumber(value: number, decimals: number = 2): string {
  return Number(value.toFixed(decimals)).toString();
}

