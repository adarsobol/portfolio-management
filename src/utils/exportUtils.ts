// Export utilities for CSV and Excel exports
import { Initiative, User, Status, WorkType } from '../types';
import * as XLSX from 'xlsx';

/**
 * Get owner name by ID
 */
function getOwnerName(users: User[], ownerId: string | undefined): string {
  if (!users || !ownerId) return ownerId || '';
  const user = users.find(u => u.id === ownerId);
  return user?.name || ownerId;
}

/**
 * Format date for export
 */
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
}

/**
 * Calculate days between two dates
 */
function calculateDaysDelayed(currentEta: string | undefined, originalEta: string | undefined): number {
  if (!currentEta || !originalEta) return 0;
  try {
    const current = new Date(currentEta);
    const original = new Date(originalEta);
    const diffTime = current.getTime() - original.getTime();
    return Math.round(diffTime / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

/**
 * Calculate effort variance percentage
 */
function calculateEffortVariancePercent(current: number, original: number): string {
  if (!original || original === 0) return 'N/A';
  const variance = ((current - original) / original) * 100;
  return `${variance.toFixed(1)}%`;
}

/**
 * Format comment with author and timestamp
 */
function formatComment(comment: { text: string; authorId: string; timestamp: string }, users: User[]): string {
  const author = getOwnerName(users, comment.authorId);
  const date = formatDate(comment.timestamp);
  return `[${date} - ${author}]: ${comment.text}`;
}

/**
 * Get the last N changes from history, sorted by most recent first
 */
function getLastChanges(history: Initiative['history'], count: number): Initiative['history'] {
  if (!history || history.length === 0) return [];
  return [...history]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, count);
}

/**
 * Transform initiative to export row format
 */
function transformInitiativeForExport(initiative: Initiative, users: User[]): Record<string, string | number> {
  if (!initiative) return {};
  
  const history = initiative.history || [];
  const comments = initiative.comments || [];
  const lastChanges = getLastChanges(history, 5);
  
  // Build change log columns (5 changes x 5 fields each)
  const changeLogColumns: Record<string, string> = {};
  for (let i = 1; i <= 5; i++) {
    const change = lastChanges ? lastChanges[i - 1] : undefined;
    changeLogColumns[`Change ${i} Field`] = change?.field || '';
    changeLogColumns[`Change ${i} Old Value`] = change?.oldValue !== undefined ? String(change.oldValue) : '';
    changeLogColumns[`Change ${i} New Value`] = change?.newValue !== undefined ? String(change.newValue) : '';
    changeLogColumns[`Change ${i} By`] = change?.changedBy || '';
    changeLogColumns[`Change ${i} Date`] = change?.timestamp ? formatDate(change.timestamp) : '';
  }
  
  // Get latest comment and all comments concatenated
  const latestComment = comments.length > 0 
    ? comments
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]
    : null;
  const latestCommentText = latestComment 
    ? formatComment(latestComment, users).slice(0, 200) + (latestComment.text.length > 200 ? '...' : '')
    : '';
  const allCommentsText = comments
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .map(c => formatComment(c, users))
    .join(' | ');
  
  return {
    // Hierarchy (L1-L4)
    'ID': initiative.id || '',
    'Asset Class (L1)': initiative.l1_assetClass || '',
    'Pillar (L2)': initiative.l2_pillar || '',
    'Responsibility (L3)': initiative.l3_responsibility || '',
    'Target (L4)': initiative.l4_target || '',
    
    // Initiative Details (L5)
    'Title': initiative.title || '',
    'Owner': getOwnerName(users, initiative.ownerId),
    'Assignee': initiative.assignee || '',
    'Quarter': initiative.quarter || '',
    'Status': initiative.status || '',
    'Priority': initiative.priority || '',
    'Work Type': initiative.workType || '',
    'Unplanned Tags': (initiative.unplannedTags || []).join(', '),
    
    // Effort Metrics
    'Estimated Effort (weeks)': initiative.estimatedEffort ?? 0,
    'Original Estimated Effort (weeks)': initiative.originalEstimatedEffort ?? 0,
    'Actual Effort (weeks)': initiative.actualEffort ?? 0,
    'Effort Variance (weeks)': (initiative.estimatedEffort || 0) - (initiative.originalEstimatedEffort || 0),
    'Effort Variance %': calculateEffortVariancePercent(
      initiative.estimatedEffort || 0, 
      initiative.originalEstimatedEffort || 0
    ),
    
    // Time Metrics
    'ETA': formatDate(initiative.eta),
    'Original ETA': formatDate(initiative.originalEta),
    'Days Delayed': calculateDaysDelayed(initiative.eta, initiative.originalEta),
    'Last Updated': formatDate(initiative.lastUpdated),
    
    // Risk & Dependencies
    'At Risk': initiative.status === 'At Risk' ? 'Yes' : 'No',
    'Risk Action Log': initiative.riskActionLog || '',
    'Dependencies': initiative.dependencies?.map(d => `${d.team} (${d.deliverable || 'N/A'}, ETA: ${d.eta || 'N/A'})`).join('; ') || '',
    
    // Comments
    'Comments Count': comments.length,
    'Total Changes Count': history.length,
    'Latest Comment': latestCommentText,
    'All Comments': allCommentsText,
    
    // Change Log (Last 5 Changes)
    ...changeLogColumns
  };
}

// Flag to prevent multiple simultaneous downloads
let isDownloading = false;

/**
 * Trigger file download - opens Save As dialog
 */
async function downloadFile(blob: Blob, filename: string): Promise<void> {
  // Prevent multiple downloads at once
  if (isDownloading) {
    console.warn('Download already in progress, skipping...');
    return;
  }
  
  isDownloading = true;
  
  try {
    // Try File System Access API first (shows Save As dialog)
    if ('showSaveFilePicker' in window) {
      try {
        const extension = filename.split('.').pop() || 'xlsx';
        const mimeType = extension === 'csv' 
          ? 'text/csv' 
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: extension === 'csv' ? 'CSV File' : 'Excel File',
            accept: { [mimeType]: [`.${extension}`] }
          }]
        });
        
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        
        console.log(`File saved via File System Access API: ${filename}`);
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.log('User cancelled save dialog');
          return;
        }
        console.log('File System Access API failed, trying fallback...', err);
      }
    }
    
    // Fallback: Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
    
    console.log(`Download initiated: ${filename}`);
    
    // Show alert with download location info
    alert(`File "${filename}" is being downloaded.\n\nIf the file has a random name, check your browser's Downloads folder or use Cmd+S / Ctrl+S after opening the file.`);
    
  } catch (error) {
    console.error('Download failed:', error);
    throw error;
  } finally {
    setTimeout(() => {
      isDownloading = false;
    }, 500);
  }
}

/**
 * Export initiatives to CSV and trigger download
 */
export async function exportToCSV(initiatives: Initiative[], users: User[], filename = 'initiatives'): Promise<void> {
  try {
    if (!initiatives || initiatives.length === 0) {
      alert('No data to export');
      return;
    }

    const rows = initiatives.map(i => transformInitiativeForExport(i, users));
    
    // Get headers from first row
    const headers = Object.keys(rows[0]);
    
    // Build CSV content
    const csvRows: string[] = [];
    
    // Add header row
    csvRows.push(headers.map(h => `"${h}"`).join(','));
    
    // Add data rows
    for (const row of rows) {
      const values = headers.map(header => {
        const value = row[header];
        // Escape quotes and wrap in quotes
        const escaped = String(value ?? '').replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }
    
    const csvContent = csvRows.join('\n');
    const fullFilename = `${filename}_${formatDateForFilename()}.csv`;
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    await downloadFile(blob, fullFilename);
    
    console.log(`Export successful: ${fullFilename}`);
  } catch (error) {
    console.error('Export to CSV failed:', error);
    alert('Failed to export to CSV. See console for details.');
  }
}

/**
 * Export initiatives to Excel and trigger download
 */
export async function exportToExcel(initiatives: Initiative[], users: User[], filename = 'initiatives'): Promise<void> {
  try {
    if (!initiatives || initiatives.length === 0) {
      alert('No data to export');
      return;
    }

    const rows = initiatives.map(i => transformInitiativeForExport(i, users));
    
    // Create workbook and worksheet
    const utils = XLSX.utils || (XLSX as any).default?.utils;
    if (!utils) {
      throw new Error('XLSX utils not available');
    }
    
    const workbook = utils.book_new();
    const worksheet = utils.json_to_sheet(rows);
    
    // Set column widths
    const columnWidths = [
      // Hierarchy (L1-L4)
      { wch: 12 },  // ID
      { wch: 12 },  // Asset Class (L1)
      { wch: 25 },  // Pillar (L2)
      { wch: 35 },  // Responsibility (L3)
      { wch: 25 },  // Target (L4)
      
      // Initiative Details (L5)
      { wch: 40 },  // Title
      { wch: 20 },  // Owner
      { wch: 20 },  // Secondary Owner
      { wch: 10 },  // Quarter
      { wch: 12 },  // Status
      { wch: 8 },   // Priority
      { wch: 15 },  // Work Type
      { wch: 20 },  // Unplanned Tags
      
      // Effort Metrics
      { wch: 18 },  // Estimated Effort (weeks)
      { wch: 22 },  // Original Estimated Effort (weeks)
      { wch: 16 },  // Actual Effort (weeks)
      { wch: 18 },  // Effort Variance (weeks)
      { wch: 14 },  // Effort Variance %
      
      // Time Metrics
      { wch: 12 },  // ETA
      { wch: 12 },  // Original ETA
      { wch: 12 },  // Days Delayed
      { wch: 12 },  // Last Updated
      
      // Risk & Dependencies
      { wch: 8 },   // At Risk
      { wch: 40 },  // Risk Action Log
      { wch: 25 },  // Dependencies
      
      // Comments
      { wch: 12 },  // Comments Count
      { wch: 14 },  // Total Changes Count
      { wch: 50 },  // Latest Comment
      { wch: 80 },  // All Comments
      
      // Change Log - Change 1
      { wch: 15 },  // Change 1 Field
      { wch: 18 },  // Change 1 Old Value
      { wch: 18 },  // Change 1 New Value
      { wch: 18 },  // Change 1 By
      { wch: 12 },  // Change 1 Date
      
      // Change Log - Change 2
      { wch: 15 },  // Change 2 Field
      { wch: 18 },  // Change 2 Old Value
      { wch: 18 },  // Change 2 New Value
      { wch: 18 },  // Change 2 By
      { wch: 12 },  // Change 2 Date
      
      // Change Log - Change 3
      { wch: 15 },  // Change 3 Field
      { wch: 18 },  // Change 3 Old Value
      { wch: 18 },  // Change 3 New Value
      { wch: 18 },  // Change 3 By
      { wch: 12 },  // Change 3 Date
      
      // Change Log - Change 4
      { wch: 15 },  // Change 4 Field
      { wch: 18 },  // Change 4 Old Value
      { wch: 18 },  // Change 4 New Value
      { wch: 18 },  // Change 4 By
      { wch: 12 },  // Change 4 Date
      
      // Change Log - Change 5
      { wch: 15 },  // Change 5 Field
      { wch: 18 },  // Change 5 Old Value
      { wch: 18 },  // Change 5 New Value
      { wch: 18 },  // Change 5 By
      { wch: 12 },  // Change 5 Date
    ];
    worksheet['!cols'] = columnWidths;
    
    // Add worksheet to workbook
    utils.book_append_sheet(workbook, worksheet, 'Initiatives');
    
    // Add summary sheet
    const summary = createSummaryData(initiatives, users);
    const summarySheet = utils.json_to_sheet(summary);
    summarySheet['!cols'] = [{ wch: 25 }, { wch: 15 }];
    utils.book_append_sheet(workbook, summarySheet, 'Summary');
    
    // Write to buffer and create blob for download (more reliable than writeFile)
    const write = XLSX.write || (XLSX as any).default?.write;
    if (!write) {
      throw new Error('XLSX write not available');
    }
    
    const excelBuffer = write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    
    const fullFilename = `${filename}_${formatDateForFilename()}.xlsx`;
    await downloadFile(blob, fullFilename);
    
    console.log(`Export successful: ${fullFilename}`);
  } catch (error) {
    console.error('Export to Excel failed:', error);
    alert('Failed to export to Excel. See console for details.');
  }
}

/**
 * Create summary data for the summary sheet
 */
function createSummaryData(initiatives: Initiative[], _users: User[]): Record<string, string | number>[] {
  const totalEffort = initiatives.reduce((sum, i) => sum + (i.estimatedEffort || 0), 0);
  const actualEffort = initiatives.reduce((sum, i) => sum + (i.actualEffort || 0), 0);
  const byStatus = initiatives.reduce((acc, i) => {
    const status = i.status || 'Unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const byPriority = initiatives.reduce((acc, i) => {
    const priority = i.priority || 'Unknown';
    acc[priority] = (acc[priority] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return [
    { 'Metric': 'Total Initiatives', 'Value': initiatives.length },
    { 'Metric': 'Total Estimated Effort', 'Value': `${totalEffort} weeks` },
    { 'Metric': 'Total Actual Effort', 'Value': `${actualEffort} weeks` },
    { 'Metric': 'At Risk Count', 'Value': initiatives.filter(i => i.status === 'At Risk').length },
    { 'Metric': '', 'Value': '' },
    { 'Metric': '--- By Status ---', 'Value': '' },
    ...Object.entries(byStatus).map(([status, count]) => ({ 'Metric': status, 'Value': count })),
    { 'Metric': '', 'Value': '' },
    { 'Metric': '--- By Priority ---', 'Value': '' },
    ...Object.entries(byPriority).map(([priority, count]) => ({ 'Metric': priority, 'Value': count })),
    { 'Metric': '', 'Value': '' },
    { 'Metric': 'Export Date', 'Value': new Date().toLocaleString() },
  ];
}

/**
 * Format date for filename
 */
function formatDateForFilename(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Export filtered data with applied filters info
 */
export async function exportFilteredData(
  initiatives: Initiative[],
  users: User[],
  filters: {
    assetClass?: string;
    pillar?: string;
    owners?: string[];
    workType?: string;
  },
  format: 'csv' | 'excel' = 'excel'
): Promise<void> {
  // Create filename with filter info
  let filename = 'initiatives';
  const filterParts: string[] = [];
  
  if (filters.assetClass) filterParts.push(filters.assetClass);
  if (filters.pillar) filterParts.push(filters.pillar.slice(0, 20));
  if (filters.owners && filters.owners.length === 1 && filters.owners[0]) {
    const ownerName = getOwnerName(users, filters.owners[0]);
    filterParts.push(ownerName.split(' ')[0]);
  }
  if (filters.workType) filterParts.push(filters.workType.replace(' Work', ''));
  
  if (filterParts.length > 0) {
    filename = `initiatives_${filterParts.join('_').replace(/\s+/g, '-')}`;
  }
  
  if (format === 'csv') {
    await exportToCSV(initiatives, users, filename);
  } else {
    await exportToExcel(initiatives, users, filename);
  }
}

/**
 * Export initiatives to clipboard as tab-separated values (can be pasted into Excel/Sheets)
 */
export async function exportToClipboard(initiatives: Initiative[], users: User[]): Promise<void> {
  if (!initiatives || initiatives.length === 0) {
    alert('No data to export');
    return;
  }

  const rows = initiatives.map(i => transformInitiativeForExport(i, users));
  
  // Get headers from first row
  const headers = Object.keys(rows[0]);
  
  // Build TSV content (tab-separated for Excel/Sheets paste)
  const tsvRows: string[] = [];
  
  // Add header row
  tsvRows.push(headers.join('\t'));
  
  // Add data rows
  for (const row of rows) {
    const values = headers.map(header => {
      const value = row[header];
      // Replace tabs and newlines to avoid breaking the format
      return String(value ?? '').replace(/[\t\n\r]/g, ' ');
    });
    tsvRows.push(values.join('\t'));
  }
  
  const tsvContent = tsvRows.join('\n');
  
  // Copy to clipboard
  await navigator.clipboard.writeText(tsvContent);
  
  console.log(`Copied ${initiatives.length} initiatives to clipboard`);
}

/**
 * Map internal status to Notion-friendly status labels
 */
function mapStatusToNotion(status: Status): string {
  switch (status) {
    case Status.NotStarted:
      return 'New';
    case Status.InProgress:
      return 'In Progress';
    case Status.Done:
      return 'Presented & Done';
    case Status.AtRisk:
      return 'In Progress (Follow up)';
    default:
      return status;
  }
}

/**
 * Check if a date is within the current week (Monday to Sunday)
 */
function isWithinCurrentWeek(dateStr: string | undefined): boolean {
  if (!dateStr) return false;
  try {
    const date = new Date(dateStr);
    const now = new Date();
    
    // Get the start of current week (Monday)
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);
    
    // Get the end of current week (Sunday)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    return date >= startOfWeek && date <= endOfWeek;
  } catch {
    return false;
  }
}

/**
 * Transform an unplanned initiative to Notion export row format
 */
function transformInitiativeForNotionExport(initiative: Initiative, users: User[]): Record<string, string> {
  const ownerName = getOwnerName(users, initiative.ownerId);
  const mustHaveThisWeek = isWithinCurrentWeek(initiative.eta);
  const progressCondition = initiative.riskActionLog || 'On Track';
  
  return {
    'Agenda Item': initiative.title || '',
    'Experiment Leading': initiative.l2_pillar || '',
    'Due Date': formatDate(initiative.eta),
    'Priority': initiative.priority || '',
    'Must Have This Week': mustHaveThisWeek ? 'Yes' : 'No',
    'Requested': formatDate(initiative.lastUpdated),
    'Owner (PM)': ownerName,
    'Progress Condition': progressCondition,
    'Flow Meeting': '',
    'Risk Budget Updated': '',
    'PM Segment': initiative.l1_assetClass || '',
    'Status': mapStatusToNotion(initiative.status)
  };
}

/**
 * Export unplanned initiatives to clipboard in Notion format
 * Columns: Agenda Item, Experiment Leading, Due Date, Priority, Must Have This Week,
 *          Requested, Owner (PM), Progress Condition, Flow Meeting, Risk Budget Updated,
 *          PM Segment, Status
 */
export async function exportUnplannedToNotionClipboard(initiatives: Initiative[], users: User[]): Promise<number> {
  // Filter only unplanned items
  const unplannedItems = initiatives.filter(i => i.workType === WorkType.Unplanned);
  
  if (!unplannedItems || unplannedItems.length === 0) {
    alert('No unplanned items to export');
    return 0;
  }

  const rows = unplannedItems.map(i => transformInitiativeForNotionExport(i, users));
  
  // Define the exact Notion column order
  const notionHeaders = [
    'Agenda Item',
    'Experiment Leading',
    'Due Date',
    'Priority',
    'Must Have This Week',
    'Requested',
    'Owner (PM)',
    'Progress Condition',
    'Flow Meeting',
    'Risk Budget Updated',
    'PM Segment',
    'Status'
  ];
  
  // Build TSV content (tab-separated for Notion paste)
  const tsvRows: string[] = [];
  
  // Add header row
  tsvRows.push(notionHeaders.join('\t'));
  
  // Add data rows
  for (const row of rows) {
    const values = notionHeaders.map(header => {
      const value = row[header];
      // Replace tabs and newlines to avoid breaking the format
      return String(value ?? '').replace(/[\t\n\r]/g, ' ');
    });
    tsvRows.push(values.join('\t'));
  }
  
  const tsvContent = tsvRows.join('\n');
  
  // Copy to clipboard
  await navigator.clipboard.writeText(tsvContent);
  
  console.log(`Copied ${unplannedItems.length} unplanned items to clipboard (Notion format)`);
  return unplannedItems.length;
}

