
import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { PieChart as PieChartIcon, Shield, Battery, AlertTriangle } from 'lucide-react';

interface MetricsProps {
  metrics: {
    usage: number;
    capacityLoad: number;
    totalCapacity: number;
    totalEst: number;
    totalAct: number;
    countDelayed: number;
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      
      {/* 1. Initiative Status */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Initiatives Status</p>
            <h3 className="text-2xl font-bold text-slate-800">{metrics.countOpen} <span className="text-sm font-normal text-slate-400">Open</span></h3>
          </div>
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
            <PieChartIcon size={20} />
          </div>
        </div>
        <div className="h-24 w-full">
           <ResponsiveContainer width="100%" height="100%">
             <PieChart>
               <Pie 
                 data={metrics.statusBreakdown} 
                 dataKey="value" 
                 nameKey="name" 
                 cx="50%" 
                 cy="50%" 
                 innerRadius={25} 
                 outerRadius={40} 
                 paddingAngle={2}
               >
                 {metrics.statusBreakdown.map((entry, index) => (
                   <Cell key={`cell-${index}`} fill={entry.color} />
                 ))}
               </Pie>
               <Tooltip 
                 contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                 itemStyle={{ fontSize: '12px' }}
               />
             </PieChart>
           </ResponsiveContainer>
        </div>
      </div>

      {/* 2. BAU Buffer Health */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">BAU Buffer Health</p>
            <h3 className="text-2xl font-bold text-slate-800">{Math.round(metrics.bauHealth)}% <span className="text-sm font-normal text-slate-400">Rem.</span></h3>
          </div>
          <div className={`p-2 rounded-lg ${metrics.bauHealth < 20 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
            <Shield size={20} />
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Used: {metrics.unplannedActuals}w</span>
            <span>Allocated: {metrics.bauBufferTotal.toFixed(1)}w</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
             <div 
               className={`h-full rounded-full transition-all duration-1000 ${metrics.bauHealth < 20 ? 'bg-red-500' : 'bg-emerald-500'}`} 
               style={{ width: `${Math.min(metrics.bauHealth, 100)}%` }}
             />
          </div>
          <p className="text-[10px] text-slate-400 italic">Decrements based on actual unplanned work.</p>
        </div>
      </div>

      {/* 3. Capacity Load */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Capacity Load</p>
            <h3 className="text-2xl font-bold text-slate-800">{Math.round(metrics.capacityLoad)}%</h3>
          </div>
          <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
            <Battery size={20} />
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between text-xs text-slate-500">
            <span>Assigned: {metrics.totalEst}w</span>
            <span>Total Cap: {metrics.totalCapacity}w</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
             <div 
               className={`h-full rounded-full transition-all duration-1000 ${metrics.capacityLoad > 100 ? 'bg-red-500' : 'bg-purple-500'}`} 
               style={{ width: `${Math.min(metrics.capacityLoad, 100)}%` }}
             />
          </div>
        </div>
      </div>

      {/* 4. Work Type Mix */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Work Mix</p>
            <h3 className="text-2xl font-bold text-slate-800">{metrics.countUnplanned} <span className="text-sm font-normal text-slate-400">Unplanned</span></h3>
          </div>
          <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
            <AlertTriangle size={20} />
          </div>
        </div>
        <div className="text-xs text-slate-500 mb-2">
           Unplanned Effort: <strong>{metrics.workMix[1].effort} wks</strong>
        </div>
         <div className="h-20 w-full">
           <ResponsiveContainer width="100%" height="100%">
             <BarChart data={metrics.workMix}>
               <Tooltip 
                 cursor={{fill: 'transparent'}}
                 contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                 formatter={(value: number, name: string, props: any) => {
                   return [`${value} items (${props.payload.effort} wks)`, name];
                 }}
               />
               <Bar dataKey="value" radius={[4, 4, 0, 0]}>
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
    </div>
  );
};
