
import React from 'react';
import { Status, Priority } from '../types';

export const StatusBadge = ({ status }: { status: Status }) => {
  const styles = {
    [Status.Planned]: 'text-slate-600 bg-slate-100',
    [Status.InProgress]: 'text-blue-700 bg-blue-50',
    [Status.Delayed]: 'text-red-700 bg-red-50',
    [Status.Complete]: 'text-emerald-700 bg-emerald-50',
  };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap border border-transparent ${styles[status]}`}>{status}</span>;
};

export const PriorityBadge = ({ priority }: { priority: Priority }) => {
  const styles = {
    [Priority.P0]: 'text-red-700 bg-red-50 font-bold',
    [Priority.P1]: 'text-orange-700 bg-orange-50 font-medium',
    [Priority.P2]: 'text-slate-600 bg-slate-100',
  };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border border-transparent ${styles[priority]}`}>{priority}</span>;
};
