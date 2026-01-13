import React, { useState, useEffect, useRef } from 'react';
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
    description: 'Shows planned and actual effort invested in BAU initiatives. BAU initiatives are unplanned work comprised of risk and PM items. Planned effort is manually set. Actual effort is auto-calculated from tasks. Percentage shows actual effort as a share of total buffer allocated for filtered users.',
    formula: 'Planned Effort = Sum of BAU initiatives\' estimated effort (manually set)\nActual Effort = Sum of BAU initiatives\' actual effort (auto-calculated from tasks)\n% of Buffer = (Actual Effort / Total Buffer) × 100\nNote: Planned effort is independent of tasks. Actual effort aggregates from tasks.',
    thresholds: 'Shows total effort invested in BAU initiatives and percentage of allocated buffer used'
  },
  capacityLoad: {
    title: 'Capacity Load & Actual Rate',
    description: 'Capacity Load shows planned effort vs total capacity. Actual Rate shows actual reported effort vs total capacity.',
    formula: 'Load % = (Total Estimated Effort / Total Capacity) × 100\nActual Rate % = (Total Actual Effort / Total Capacity) × 100',
    thresholds: 'Load: Green ≤100%, Red >100%. Actual Rate: Tracks actual reported progress against capacity.'
  },
  workMix: {
    title: 'Work Type Mix',
    description: 'Breakdown of planned vs unplanned work. Unplanned work includes risk items, PM items, and ad-hoc requests.',
    formula: 'Counts initiatives by Work Type (Planned vs Unplanned)',
    thresholds: 'High unplanned count may indicate planning issues or excessive interruptions'
  }
};

// Help button with tooltip popup
const HelpButton: React.FC<{ 
  metricKey: string; 
  position?: 'top' | 'bottom' | 'left' | 'right';
}> = ({ metricKey, position = 'bottom' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltip = METRIC_TOOLTIPS[metricKey];

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!isVisible) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setIsVisible(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isVisible]);

  if (!tooltip) return null;

  const positionClasses = {
    top: 'bottom-full right-0 mb-2',
    bottom: 'top-full right-0 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-0 ml-2'
  };

  return (
    <div className="absolute top-3 right-3 z-10" ref={tooltipRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsVisible(!isVisible);
        }}
        className="p-1 rounded-full hover:bg-slate-100 transition-colors"
        aria-label={`Info about ${tooltip.title}`}
      >
        <HelpCircle className={`w-4 h-4 ${isVisible ? 'text-blue-500' : 'text-slate-300'} hover:text-blue-500 transition-colors`} />
      </button>
      {isVisible && (
        <div className={`absolute z-50 ${positionClasses[position]} w-72`}>
          <div className="bg-slate-900 text-white p-4 rounded-lg shadow-xl text-left">
            <div className="flex items-center gap-2 mb-2">
              <HelpCircle className="w-4 h-4 text-blue-400" />
              <h4 className="font-semibold text-sm">{tooltip.title}</h4>
            </div>
            <p className="text-xs text-slate-300 mb-2">{tooltip.description}</p>
            {tooltip.formula && (
              <div className="bg-slate-800 rounded px-2 py-1.5 mb-2">
                <p className="text-[10px] text-slate-400 tracking-wider mb-0.5">Formula</p>
                <code className="text-xs text-blue-300 font-mono whitespace-pre-line">{tooltip.formula}</code>
              </div>
            )}
            {tooltip.thresholds && (
              <div className="text-[10px] text-slate-400">
                <span className="tracking-wider">Thresholds: </span>
                <span className="text-slate-300">{tooltip.thresholds}</span>
              </div>
            )}
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
    actualRate: number;
    totalCapacity: number;
    totalEst: number;
    totalAct: number;
    countAtRisk: number;
    countUnplanned: number;
    countOpen: number;
    totalCount: number;
    bauBufferTotal: number;
    unplannedActuals: number;
    bauInitiativeActuals?: number;
    bauInitiativeEstimated?: number;
    bauRemaining?: number;
    bauHealth: number;
    bauPlannedEffortPercentOfBuffer?: number;
    bauActualEffortPercentOfBuffer?: number;
    unplannedRiskCount?: number;
    unplannedPMCount?: number;
    countWP?: number;
    countBAU?: number;
    wpPercentage?: number;
    bauPercentage?: number;
    wpUnplannedPercentage?: number;
    bauUnplannedPercentage?: number;
    statusBreakdown: { name: string; value: number; color: string }[];
    workMix: { name: string; value: number; effort: number; color: string }[];
  };
}

export const MetricsDashboard: React.FC<MetricsProps> = ({ metrics }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      
      {/* 1. Initiative Status */}
      <div className="relative bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col hover:shadow-md transition-shadow">
        <HelpButton metricKey="initiativesStatus" position="left" />
        <div className="flex justify-between items-start mb-3 pr-6">
          <div>
            <p className="text-[10px] text-slate-500 font-bold tracking-wider mb-1">Initiatives status</p>
            <h3 className="text-3xl font-black text-slate-800">{metrics.countOpen} <span className="text-sm font-normal text-slate-400">Open</span></h3>
          </div>
          <div className="p-2.5 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl text-blue-600 shadow-sm">
            <PieChartIcon size={22} />
          </div>
        </div>
        <div className="h-28 w-full flex-1">
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

      {/* 2. BAU Buffer Health */}
      <div className="relative bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col hover:shadow-md transition-shadow">
        <HelpButton metricKey="bauBufferHealth" position="left" />
        <div className="flex justify-between items-start mb-4 pr-6">
          <div>
            <p className="text-[10px] text-slate-500 font-bold tracking-wider mb-1">BAU effort</p>
            <h3 className="text-3xl font-black text-slate-800">{(metrics.bauInitiativeActuals || 0).toFixed(1)}<span className="text-sm font-normal text-slate-400">w</span></h3>
          </div>
          <div className="p-2.5 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl text-purple-600 shadow-sm">
            <Shield size={22} />
          </div>
        </div>
        <div className="space-y-3 flex-1">
          <div className="bg-slate-50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Planned Effort:</span>
              <span className="font-bold text-slate-800">
                {(metrics.bauInitiativeEstimated || 0).toFixed(1)}w
                {metrics.bauPlannedEffortPercentOfBuffer !== undefined && metrics.bauBufferTotal > 0 && (
                  <span className={`ml-2 ${
                    metrics.bauPlannedEffortPercentOfBuffer > 100 ? 'text-red-600' :
                    metrics.bauPlannedEffortPercentOfBuffer > 80 ? 'text-amber-600' :
                    'text-slate-500'
                  }`}>
                    ({Math.round(metrics.bauPlannedEffortPercentOfBuffer)}%)
                  </span>
                )}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Actual Effort:</span>
              <span className="font-bold text-slate-800">
                {(metrics.bauInitiativeActuals || 0).toFixed(1)}w
                {metrics.bauActualEffortPercentOfBuffer !== undefined && metrics.bauBufferTotal > 0 && (
                  <span className={`ml-2 ${
                    metrics.bauActualEffortPercentOfBuffer > 100 ? 'text-red-600' :
                    metrics.bauActualEffortPercentOfBuffer > 80 ? 'text-amber-600' :
                    'text-slate-500'
                  }`}>
                    ({Math.round(metrics.bauActualEffortPercentOfBuffer)}%)
                  </span>
                )}
              </span>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 italic">BAU initiatives: Planned effort is manually set. Actual effort includes tasks.</p>
        </div>
      </div>

      {/* 3. Capacity Load */}
      <div className="relative bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col hover:shadow-md transition-shadow">
        <HelpButton metricKey="capacityLoad" position="left" />
        <div className="flex justify-between items-start mb-4 pr-6">
          <div>
            <p className="text-[10px] text-slate-500 font-bold tracking-wider mb-1">Capacity Load / Actual Rate</p>
            <h3 className="text-3xl font-black text-slate-800">
              {Math.round(metrics.capacityLoad)}%
              <span className="text-sm font-normal text-slate-400 mx-1">/</span>
              <span className="text-emerald-600">{Math.round(metrics.actualRate)}%</span>
            </h3>
          </div>
          <div className="p-2.5 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl text-purple-600 shadow-sm">
            <Battery size={22} />
          </div>
        </div>
        <div className="space-y-3 flex-1 flex flex-col justify-end">
          <div className="flex justify-between text-xs text-slate-500 font-medium">
            <span>Assigned: <strong className="text-slate-700">{metrics.totalEst}w</strong></span>
            <span>Actual: <strong className="text-emerald-700">{metrics.totalAct}w</strong></span>
            <span>Total Cap: <strong className="text-slate-700">{metrics.totalCapacity}w</strong></span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
             <div 
               className={`h-full transition-all duration-1000 ${metrics.capacityLoad > 100 ? 'bg-red-500' : 'bg-purple-500'}`} 
               style={{ width: `${Math.min(metrics.capacityLoad, 100)}%` }}
             />
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
             <div 
               className="h-full bg-emerald-500 transition-all duration-1000" 
               style={{ width: `${Math.min(metrics.actualRate, 100)}%` }}
             />
          </div>
        </div>
      </div>

      {/* 4. Work Type Mix */}
      <div className="relative bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col hover:shadow-md transition-shadow">
        <HelpButton metricKey="workMix" position="left" />
        <div className="flex items-start gap-3 mb-3 pr-6">
          <div className="p-2.5 bg-gradient-to-br from-orange-100 to-orange-200 rounded-xl text-orange-600 shadow-sm shrink-0">
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 font-bold tracking-wider mb-1">Work mix</p>
            <h3 className="text-3xl font-black text-slate-800 whitespace-nowrap">
              <span className="text-blue-600">{metrics.wpPercentage ?? 0}%</span>
              <span className="text-slate-400 mx-0.5">/</span>
              <span className="text-orange-700 font-black">{metrics.bauPercentage ?? 0}%</span>
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">
              <span className="text-blue-600 font-medium">WP</span>
              <span className="mx-1">•</span>
              <span className="text-orange-700 font-bold">BAU</span>
            </p>
          </div>
        </div>
        <div className="h-20 w-full flex-1">
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
        {/* Risk/PM Breakdown for Unplanned */}
        {((metrics.unplannedRiskCount ?? 0) > 0 || (metrics.unplannedPMCount ?? 0) > 0) && (
          <div className="mt-2 pt-2 border-t border-slate-100">
            <div className="flex gap-3 text-[10px] text-slate-500">
              {(metrics.unplannedRiskCount ?? 0) > 0 && (
                <span>
                  <span className="font-semibold text-slate-600">Risk:</span> {metrics.unplannedRiskCount}
                </span>
              )}
              {(metrics.unplannedPMCount ?? 0) > 0 && (
                <span>
                  <span className="font-semibold text-slate-600">PM:</span> {metrics.unplannedPMCount}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
