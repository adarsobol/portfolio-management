import { Status, Priority } from '../../types';

export const StatusBadge = ({ status }: { status: Status }) => {
  const styles = {
    // Not Started: Light gray with clear text
    [Status.NotStarted]: 'text-slate-500 bg-slate-100 border-slate-200',
    // In Progress: Vibrant blue for positive momentum
    [Status.InProgress]: 'text-white bg-blue-600 border-blue-700 shadow-md',
    // At Risk: Red for immediate attention (changed from amber)
    [Status.AtRisk]: 'text-white bg-red-600 border-red-700 shadow-lg animate-pulse',
    // Done: Muted green to fade into background
    [Status.Done]: 'text-emerald-800 bg-emerald-100 border-emerald-300',
    // Obsolete: Muted gray/purple to indicate deprecated items
    [Status.Obsolete]: 'text-slate-600 bg-slate-200 border-slate-300',
    // Deleted: Red/strikethrough style for soft-deleted items
    [Status.Deleted]: 'text-red-700 bg-red-100 border-red-300 line-through',
  };
  return (
    <span className={`px-2 py-1 rounded-md text-[10px] font-semibold whitespace-nowrap border ${styles[status]}`}>
      {status}
    </span>
  );
};

export const PriorityBadge = ({ priority }: { priority: Priority }) => {
  const styles = {
    // P0: Bright red with strong outline and gradient effect for critical emphasis
    [Priority.P0]: 'text-white bg-gradient-to-r from-red-500 to-red-600 border-2 border-red-700 font-bold shadow-md ring-2 ring-red-200',
    // P1: Clear amber/orange for important items
    [Priority.P1]: 'text-white bg-amber-500 border border-amber-600 font-semibold shadow-sm',
    // P2: Neutral slate for lower priority
    [Priority.P2]: 'text-slate-600 bg-slate-100 border border-slate-200',
  };
  return (
    <span className={`text-[10px] px-2 py-1 rounded-md ${styles[priority]}`}>
      {priority}
    </span>
  );
};

// Utility functions for row background colors
export const getStatusRowColor = (status: Status): string => {
  const colors = {
    [Status.NotStarted]: 'bg-slate-50/30',
    [Status.InProgress]: 'bg-blue-50/40',
    [Status.AtRisk]: 'bg-red-50/50',
    [Status.Done]: 'bg-emerald-50/30',
    [Status.Obsolete]: 'bg-slate-100/30',
    [Status.Deleted]: 'bg-red-50/20',
  };
  return colors[status] || '';
};

export const getPriorityRowColor = (priority: Priority): string => {
  const colors = {
    [Priority.P0]: 'border-l-4 border-l-red-600 bg-red-50/20',
    [Priority.P1]: 'border-l-4 border-l-amber-500 bg-amber-50/20',
    [Priority.P2]: '',
  };
  return colors[priority] || '';
};

// Utility functions for cell background colors
export const getStatusCellBg = (status: Status): string => {
  const bgColors = {
    [Status.NotStarted]: 'bg-slate-50',
    [Status.InProgress]: 'bg-blue-50',
    [Status.AtRisk]: 'bg-red-50',
    [Status.Done]: 'bg-emerald-50',
    [Status.Obsolete]: 'bg-slate-100',
    [Status.Deleted]: 'bg-red-50',
  };
  return bgColors[status] || '';
};

export const getPriorityCellBg = (priority: Priority): string => {
  const bgColors = {
    [Priority.P0]: 'bg-red-50',
    [Priority.P1]: 'bg-amber-50',
    [Priority.P2]: 'bg-white',
  };
  return bgColors[priority] || '';
};
