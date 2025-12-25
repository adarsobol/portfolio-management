import { Status, Priority } from '../../types';

export const StatusBadge = ({ status }: { status: Status }) => {
  const styles = {
    // Not Started: Light gray with clear text
    [Status.NotStarted]: 'text-slate-500 bg-slate-100 border-slate-200',
    // In Progress: Vibrant blue for positive momentum
    [Status.InProgress]: 'text-white bg-blue-500 border-blue-600 shadow-sm',
    // At Risk: Prominent amber/red for immediate attention
    [Status.AtRisk]: 'text-white bg-amber-500 border-amber-600 shadow-sm animate-pulse',
    // Done: Muted green to fade into background
    [Status.Done]: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    // Obsolete: Muted gray/purple to indicate deprecated items
    [Status.Obsolete]: 'text-slate-600 bg-slate-200 border-slate-300',
    // Deleted: Red/strikethrough style for soft-deleted items
    [Status.Deleted]: 'text-red-600 bg-red-50 border-red-200 line-through',
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
