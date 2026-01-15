import { Initiative } from '../types';

/**
 * Parse a quarter string to extract quarter number and year
 * Supports formats like: "Q4 2025", "Q4-2025", "4Q 2025", "Q4/2025"
 * @param quarterStr - Quarter string (e.g., "Q4 2025")
 * @returns Object with quarter (1-4) and year (full year, e.g., 2025)
 */
export function parseQuarter(quarterStr: string): { quarter: number; year: number } {
  if (!quarterStr || typeof quarterStr !== 'string') {
    // Default to current quarter/year
    const now = new Date();
    const month = now.getMonth(); // 0-11
    const quarter = Math.floor(month / 3) + 1; // 1-4
    return { quarter, year: now.getFullYear() };
  }

  const trimmed = quarterStr.trim();
  
  // Try to match patterns like "Q4 2025", "Q4-2025", "Q4/2025", "4Q 2025"
  const patterns = [
    /Q(\d)\s+(\d{4})/i,           // Q4 2025
    /Q(\d)[-\/](\d{4})/i,          // Q4-2025 or Q4/2025
    /(\d)Q\s+(\d{4})/i,            // 4Q 2025
    /Q(\d)\s+(\d{2})/i,            // Q4 25 (2-digit year)
    /Q(\d)[-\/](\d{2})/i,          // Q4-25
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const quarter = parseInt(match[1], 10);
      let year = parseInt(match[2], 10);
      
      // Handle 2-digit year (assume 2000-2099)
      if (year < 100) {
        year = 2000 + year;
      }
      
      if (quarter >= 1 && quarter <= 4 && year >= 2000 && year <= 2099) {
        return { quarter, year };
      }
    }
  }

  // Fallback: try to extract just quarter number
  const quarterMatch = trimmed.match(/Q?(\d)/i);
  if (quarterMatch) {
    const quarter = parseInt(quarterMatch[1], 10);
    if (quarter >= 1 && quarter <= 4) {
      const now = new Date();
      return { quarter, year: now.getFullYear() };
    }
  }

  // Final fallback: current quarter/year
  const now = new Date();
  const month = now.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  return { quarter, year: now.getFullYear() };
}

/**
 * Check if an ID matches the Jira-style format (Q425-001)
 * @param id - ID to check
 * @returns true if ID matches the format
 */
export function isJiraStyleId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }
  // Pattern: Q followed by quarter (1-4), 2-digit year, dash, 3-digit sequence
  return /^Q[1-4]\d{2}-\d{3}$/.test(id);
}

/**
 * Extract sequence number from a Jira-style ID
 * @param id - Jira-style ID (e.g., "Q425-001")
 * @returns Sequence number or null if invalid
 */
function extractSequence(id: string): number | null {
  if (!isJiraStyleId(id)) {
    return null;
  }
  const match = id.match(/-(\d{3})$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Get the current quarter and year
 * @returns Object with current quarter (1-4) and year
 */
function getCurrentQuarter(): { quarter: number; year: number } {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const quarter = Math.floor(month / 3) + 1; // 1-4
  return { quarter, year: now.getFullYear() };
}

/**
 * Get the current quarter as a formatted string (e.g., "Q1 2026")
 * @returns Formatted quarter string
 */
export function getCurrentQuarterString(): string {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const quarter = Math.floor(month / 3) + 1; // 1-4
  return `Q${quarter} ${now.getFullYear()}`;
}

/**
 * Generate a new Jira-style initiative ID
 * Format: Q{quarter}{2-digit-year}-{3-digit-sequence}
 * Example: Q425-001 (Quarter 4, Year 2025, Sequence 001)
 * 
 * The sequence number is continuous across all quarters and never resets.
 * 
 * @param quarter - Quarter string (e.g., "Q4 2025") or undefined to use current quarter
 * @param existingInitiatives - Array of existing initiatives to find the highest sequence
 * @returns New initiative ID in format Q425-001
 */
export function generateInitiativeId(
  quarter?: string,
  existingInitiatives: Initiative[] = []
): string {
  // Parse quarter or use current quarter
  const { quarter: q, year } = quarter ? parseQuarter(quarter) : getCurrentQuarter();
  
  // Get 2-digit year
  const year2Digit = year % 100;
  
  // Find the highest sequence number across all existing initiatives
  let maxSequence = 0;
  
  for (const initiative of existingInitiatives) {
    if (isJiraStyleId(initiative.id)) {
      const sequence = extractSequence(initiative.id);
      if (sequence !== null && sequence > maxSequence) {
        maxSequence = sequence;
      }
    }
  }
  
  // Generate next sequence number
  const nextSequence = maxSequence + 1;
  
  // Format: Q{quarter}{2-digit-year}-{3-digit-sequence}
  return `Q${q}${year2Digit.toString().padStart(2, '0')}-${nextSequence.toString().padStart(3, '0')}`;
}

