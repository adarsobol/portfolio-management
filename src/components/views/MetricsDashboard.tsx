import React, { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { PieChart as PieChartIcon, Shield, Battery, AlertTriangle, HelpCircle } from 'lucide-react';

// Metric tooltip definitions
const METRIC_TOOLTIPS: Record<string, { title: string; description: string; formula?: string; thresholds?: string }> = {
  initiativesStatus: {
    title: 'Initiatives Status',
    description: 'Shows the count of open initiatives (Not Started + In Progress + At Risk) with a breakdown by status.',
    formula: 'Open = Not Started + In Progress + At Risk',
    thresholds: 'Pie chart shows distribution across all statuses'
  },
  bauBufferHealth: {
    title: 'BAU Buffer Health',
    description: 'Tracks the remaining buffer capacity reserved for unplanned/BAU work. Buffer is allocated per team lead in Admin settings.',
    formula: 'Health % = (Buffer Remaining / Total Buffer) × 100\nBuffer Remaining = Total Buffer - Actual Unplanned Effort',
    thresholds: 'Green: >20% remaining  |  Red: ≤20% remaining'
  },
  capacityLoad: {
    title: 'Capacity Load',
    description: 'Shows how much of the team\'s total capacity is allocated to initiatives (estimated effort vs available capacity).',
    formula: 'Load % = (Total Estimated Effort / Total Capacity) × 100',
    thresholds: 'Green: ≤100%  |  Red: >100% (overallocated)'
  },
  workMix: {
    title: 'Work Type Mix',
    description: 'Breakdown of planned vs unplanned work. Unplanned work includes risk items, PM items, and ad-hoc requests.',
    formula: 'Counts initiatives by Work Type (Planned vs Unplanned)',
    thresholds: 'High unplanned count may indicate planning issues or excessive interruptions'
  }
};

// Metric Tooltip Component
const MetricTooltip: React.FC<{ 
  metricKey: string; 
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}> = ({ metricKey, children, position = 'bottom' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const tooltip = METRIC_TOOLTIPS[metricKey];

  if (!tooltip) return <>{children}</>;

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2'
  };

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div className={`absolute z-50 ${positionClasses[position]} w-72 pointer-events-none`}>
          <div className="bg-slate-900 text-white p-4 rounded-lg shadow-xl text-left">
            <div className="flex items-center gap-2 mb-2">
              <HelpCircle className="w-4 h-4 text-blue-400" />
              <h4 className="font-semibold text-sm">{tooltip.title}</h4>
            </div>
            <p className="text-xs text-slate-300 mb-2">{tooltip.description}</p>
            {tooltip.formula && (
              <div className="bg-slate-800 rounded px-2 py-1.5 mb-2">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Formula</p>
                <code className="text-xs text-blue-300 font-mono whitespace-pre-line">{tooltip.formula}</code>
              </div>
            )}
            {tooltip.thresholds && (
              <div className="text-[10px] text-slate-400">
                <span className="uppercase tracking-wider">Thresholds: </span>
                <span className="text-slate-300">{tooltip.thresholds}</span>
              </div>
            )}
            {/* Arrow */}
            <div className={`absolute w-2 h-2 bg-slate-900 transform rotate-45 ${
              position === 'top' ? 'top-full left-1/2 -translate-x-1/2 -mt-1' :
              position === 'bottom' ? 'bottom-full left-1/2 -translate-x-1/2 -mb-1' :
              position === 'left' ? 'left-full top-1/2 -translate-y-1/2 -ml-1' :
              'right-full top-1/2 -translate-y-1/2 -mr-1'
            }`} />
          </div>
        </div>
      )}
    </div>
  );
};

interface MetricsProps {
  metrics: {
    usage: number;
    capacityLoad: number;
    totalCapacity: number;
    totalEst: number;
    totalAct: number;
    countAtRisk: number;
    countUnplanned: number;
    countOpen: number;
    totalCount: number;
    bauBufferTotal: number;
    unplannedActuals: number;
    bauHealth: number;
    statusBreakdown: { name: string; value: number; color: string }[];
    workMix: { name: string; value: number; effort: number; color: string }[];
  };
}

export const MetricsDashboard: React.FC<MetricsProps> = ({ metrics }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
      
      {/* 1. Initiative Status */}
      <MetricTooltip metricKey="initiativesStatus" position="bottom">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow cursor-help">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Initiatives Status</p>
              <h3 className="text-3xl font-black text-slate-800">{metrics.countOpen} <span className="text-sm font-normal text-slate-400">Open</span></h3>
            </div>
            <div className="p-2.5 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl text-blue-600 shadow-sm">
              <PieChartIcon size={22} />
            </div>
          </div>
          <div className="h-28 w-full">
             <ResponsiveContainer width="100%" height="100%">
               <PieChart>
                 <Pie 
                   data={metrics.statusBreakdown} 
                   dataKey="value" 
                   nameKey="name" 
                   cx="50%" 
                   cy="50%" 
                   innerRadius={28} 
                   outerRadius={45} 
                   paddingAngle={3}
                   strokeWidth={0}
                 >
                   {metrics.statusBreakdown.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={entry.color} />
                   ))}
                 </Pie>
                 <Tooltip 
                   contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.15)', padding: '10px 14px' }}
                   itemStyle={{ fontSize: '12px', fontWeight: '500' }}
                 />
               </PieChart>
             </ResponsiveContainer>
          </div>
        </div>
      </MetricTooltip>

      {/* 2. BAU Buffer Health */}
      <MetricTooltip metricKey="bauBufferHealth" position="bottom">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow cursor-help">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">BAU Buffer Health</p>
              <h3 className="text-3xl font-black text-slate-800">{Math.round(metrics.bauHealth)}% <span className="text-sm font-normal text-slate-400">Rem.</span></h3>
            </div>
            <div className={`p-2.5 rounded-xl shadow-sm ${metrics.bauHealth < 20 ? 'bg-gradient-to-br from-red-50 to-red-100 text-red-600' : 'bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600'}`}>
              <Shield size={22} />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-xs text-slate-500 font-medium">
              <span>Used: <strong className="text-slate-700">{metrics.unplannedActuals}w</strong></span>
              <span>Allocated: <strong className="text-slate-700">{metrics.bauBufferTotal.toFixed(1)}w</strong></span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
               <div 
                 className={`h-full rounded-full transition-all duration-1000 ${metrics.bauHealth < 20 ? 'bg-gradient-to-r from-red-400 to-red-500' : 'bg-gradient-to-r from-emerald-400 to-emerald-500'}`} 
                 style={{ width: `${Math.min(metrics.bauHealth, 100)}%` }}
               />
            </div>
            <p className="text-[10px] text-slate-400 italic">Decrements based on actual unplanned work.</p>
          </div>
        </div>
      </MetricTooltip>

      {/* 3. Capacity Load */}
      <MetricTooltip metricKey="capacityLoad" position="bottom">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow cursor-help">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Capacity Load</p>
              <h3 className="text-3xl font-black text-slate-800">{Math.round(metrics.capacityLoad)}%</h3>
            </div>
            <div className="p-2.5 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl text-purple-600 shadow-sm">
              <Battery size={22} />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-xs text-slate-500 font-medium">
              <span>Assigned: <strong className="text-slate-700">{metrics.totalEst}w</strong></span>
              <span>Total Cap: <strong className="text-slate-700">{metrics.totalCapacity}w</strong></span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
               <div 
                 className={`h-full rounded-full transition-all duration-1000 ${metrics.capacityLoad > 100 ? 'bg-gradient-to-r from-red-400 to-red-500' : 'bg-gradient-to-r from-purple-400 to-purple-500'}`} 
                 style={{ width: `${Math.min(metrics.capacityLoad, 100)}%` }}
               />
            </div>
          </div>
        </div>
      </MetricTooltip>

      {/* 4. Work Type Mix */}
      <MetricTooltip metricKey="workMix" position="bottom">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow cursor-help">
          <div className="flex justify-between items-start mb-3">
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Work Mix</p>
              <h3 className="text-3xl font-black text-slate-800">{metrics.countUnplanned} <span className="text-sm font-normal text-slate-400">Unplanned</span></h3>
            </div>
            <div className="p-2.5 bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl text-amber-600 shadow-sm">
              <AlertTriangle size={22} />
            </div>
          </div>
          <div className="text-xs text-slate-500 mb-2 font-medium">
             Unplanned Effort: <strong className="text-amber-600">{metrics.workMix[1]?.effort || 0} wks</strong>
          </div>
           <div className="h-20 w-full">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={metrics.workMix}>
                 <Tooltip 
                   cursor={{fill: 'rgba(0,0,0,0.02)'}}
                   contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.15)', padding: '10px 14px' }}
                   formatter={(value: number, name: string, props: any) => {
                     return [`${value} items (${props.payload.effort} wks)`, name];
                   }}
                 />
                 <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                   {
                     metrics.workMix.map((entry, index) => (
                       <Cell key={`cell-${index}`} fill={entry.color} />
                     ))
                   }
                 </Bar>
               </BarChart>
             </ResponsiveContainer>
          </div>
        </div>
      </MetricTooltip>
    </div>
  );
};
