/**
 * Server-side ID generation utility
 * Shared logic for generating Jira-style initiative IDs (Q425-001 format)
 */

interface Initiative {
  id: string;
  quarter?: string;
}

/**
 * Parse a quarter string to extract quarter number and year
 */
function parseQuarter(quarterStr: string): { quarter: number; year: number } {
  if (!quarterStr || typeof quarterStr !== 'string') {
    const now = new Date();
    const month = now.getMonth();
    const quarter = Math.floor(month / 3) + 1;
    return { quarter, year: now.getFullYear() };
  }

  const trimmed = quarterStr.trim();
  const patterns = [
    /Q(\d)\s+(\d{4})/i,
    /Q(\d)[-\/](\d{4})/i,
    /(\d)Q\s+(\d{4})/i,
    /Q(\d)\s+(\d{2})/i,
    /Q(\d)[-\/](\d{2})/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      const quarter = parseInt(match[1], 10);
      let year = parseInt(match[2], 10);
      if (year < 100) {
        year = 2000 + year;
      }
      if (quarter >= 1 && quarter <= 4 && year >= 2000 && year <= 2099) {
        return { quarter, year };
      }
    }
  }

  const quarterMatch = trimmed.match(/Q?(\d)/i);
  if (quarterMatch) {
    const quarter = parseInt(quarterMatch[1], 10);
    if (quarter >= 1 && quarter <= 4) {
      const now = new Date();
      return { quarter, year: now.getFullYear() };
    }
  }

  const now = new Date();
  const month = now.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  return { quarter, year: now.getFullYear() };
}

/**
 * Check if an ID matches the Jira-style format
 */
function isJiraStyleId(id: string): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }
  return /^Q[1-4]\d{2}-\d{3}$/.test(id);
}

/**
 * Extract sequence number from a Jira-style ID
 */
function extractSequence(id: string): number | null {
  if (!isJiraStyleId(id)) {
    return null;
  }
  const match = id.match(/-(\d{3})$/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Generate a new Jira-style initiative ID
 */
export function generateInitiativeId(
  quarter: string | undefined,
  existingInitiatives: Initiative[] = []
): string {
  const { quarter: q, year } = quarter ? parseQuarter(quarter) : (() => {
    const now = new Date();
    const month = now.getMonth();
    return { quarter: Math.floor(month / 3) + 1, year: now.getFullYear() };
  })();
  
  const year2Digit = year % 100;
  let maxSequence = 0;
  
  for (const initiative of existingInitiatives) {
    if (isJiraStyleId(initiative.id)) {
      const sequence = extractSequence(initiative.id);
      if (sequence !== null && sequence > maxSequence) {
        maxSequence = sequence;
      }
    }
  }
  
  const nextSequence = maxSequence + 1;
  return `Q${q}${year2Digit.toString().padStart(2, '0')}-${nextSequence.toString().padStart(3, '0')}`;
}

