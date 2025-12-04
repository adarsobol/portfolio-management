import React from 'react';
import { Monitor, TrendingUp, AlertTriangle, Battery, User as UserIcon } from 'lucide-react';
import { Initiative, Status, AppConfig, User, WorkType } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';

interface ResourcesDashboardProps {
  filteredInitiatives: Initiative[];
  config: AppConfig;
  users: User[];
}

export const ResourcesDashboard: React.FC<ResourcesDashboardProps> = ({ filteredInitiatives, config, users }) => {
  
  // 1. Calculate Aggregates
  const totalAssignedEffort = filteredInitiatives.reduce((sum, i) => sum + i.estimatedEffort, 0);
  const totalActualEffort = filteredInitiatives.reduce((sum, i) => sum + i.actualEffort, 0);
  const totalPlannedEffort = filteredInitiatives
    .filter(i => i.workType === WorkType.Planned)
    .reduce((sum, i) => sum + i.estimatedEffort, 0);
  const totalUnplannedEffort = filteredInitiatives
    .filter(i => i.workType === WorkType.Unplanned)
    .reduce((sum, i) => sum + i.estimatedEffort, 0);

  // 2. Identify Relevant Capacity
  // Get unique owners in the filtered view
  const uniqueOwnerIds: string[] = Array.from(new Set(filteredInitiatives.map(i => i.ownerId)));
  const relevantCapacity = uniqueOwnerIds.reduce((sum: number, id: string) => sum + (config.teamCapacities[id] || 0), 0);
  
  // Utilization
  const utilization = relevantCapacity > 0 ? Math.round((totalAssignedEffort / relevantCapacity) * 100) : 0;
  
  // Burn Rate Efficiency (Actual / Est)
  // < 100% means under budget (good), > 100% means over budget (bad)
  const efficiency = totalAssignedEffort > 0 ? Math.round((totalActualEffort / totalAssignedEffort) * 100) : 0;

  // 3. Team Load Data for Chart
  const teamLoadData = uniqueOwnerIds.map((id: string) => {
    const ownerName = users.find(u => u.id === id)?.name || 'Unknown';
    const capacity = config.teamCapacities[id] || 0;
    const assigned = filteredInitiatives.filter(i => i.ownerId === id).reduce((sum, i) => sum + i.estimatedEffort, 0);
    return { name: ownerName, capacity, assigned };
  }).sort((a, b) => b.assigned - a.assigned);

  // 4. Work Type Pie Data
  const workTypeData = [
    { name: 'Planned', value: totalPlannedEffort, color: '#3b82f6' },
    { name: 'Unplanned', value: totalUnplannedEffort, color: '#f59e0b' }
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      {/* Scope Header */}
      <div className="bg-white px-6 py-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
        <div className="p-2 bg-cyan-50 text-cyan-600 rounded-lg">
          <Monitor size={24} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">Resource Health Monitor</h2>
          <p className="text-xs text-slate-500">
            Analyzing {filteredInitiatives.length} initiatives across {uniqueOwnerIds.length} team members (Filtered Scope).
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Utilization */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col relative overflow-hidden">
          <div className="flex justify-between items-start mb-2 relative z-10">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Utilization</p>
              <h3 className="text-3xl font-extrabold text-slate-800">{utilization}%</h3>
            </div>
            <div className={`p-2 rounded-lg ${utilization > 100 ? 'bg-red-50 text-red-600' : 'bg-cyan-50 text-cyan-600'}`}>
              <Battery size={20} />
            </div>
          </div>
          <div className="w-full bg-slate-100 h-2 rounded-full mt-auto relative z-10">
            <div 
              className={`h-full rounded-full ${utilization > 100 ? 'bg-red-500' : 'bg-cyan-500'}`} 
              style={{ width: `${Math.min(utilization, 100)}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 mt-2 relative z-10">{totalAssignedEffort}w assigned / {relevantCapacity}w capacity</p>
        </div>

        {/* Efficiency */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Efficiency (Burn)</p>
              <h3 className="text-3xl font-extrabold text-slate-800">{efficiency}%</h3>
            </div>
            <div className={`p-2 rounded-lg ${efficiency > 100 ? 'bg-orange-50 text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>
              <TrendingUp size={20} />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-auto">
            {efficiency > 100 ? 'Burning faster than planned' : 'On track with estimates'}
          </p>
          <div className="text-xs text-slate-400 mt-1">{totalActualEffort}w spent vs {totalAssignedEffort}w est.</div>
        </div>

        {/* Unplanned Load */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Unplanned Load</p>
              <h3 className="text-3xl font-extrabold text-slate-800">{totalUnplannedEffort}<span className="text-lg text-slate-400 font-medium">w</span></h3>
            </div>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <AlertTriangle size={20} />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-auto">
            {totalAssignedEffort > 0 ? Math.round((totalUnplannedEffort/totalAssignedEffort)*100) : 0}% of total workload
          </p>
        </div>

        {/* Team Count */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Active Owners</p>
              <h3 className="text-3xl font-extrabold text-slate-800">{uniqueOwnerIds.length}</h3>
            </div>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <UserIcon size={20} />
            </div>
          </div>
          <div className="flex -space-x-2 mt-auto overflow-hidden py-1">
             {uniqueOwnerIds.slice(0, 5).map(id => {
               const u = users.find(user => user.id === id);
               return <img key={id} src={u?.avatar} className="w-6 h-6 rounded-full border border-white" alt="" title={u?.name} />
             })}
             {uniqueOwnerIds.length > 5 && (
               <div className="w-6 h-6 rounded-full bg-slate-100 border border-white flex items-center justify-center text-[9px] font-bold text-slate-500">
                 +{uniqueOwnerIds.length - 5}
               </div>
             )}
          </div>
        </div>
      </div>

      {/* Detailed Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Chart 1: Load Balance */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-700 mb-6">Load Balance by Owner (Filtered Scope)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={teamLoadData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 11}} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" />
                <Bar dataKey="capacity" name="Capacity" fill="#e2e8f0" barSize={12} radius={[0, 4, 4, 0]} />
                <Bar dataKey="assigned" name="Assigned Load" fill="#0891b2" barSize={12} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Work Distribution */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-700 mb-2">Work Type Distribution</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={workTypeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {workTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="text-center mt-[-140px] mb-[100px] pointer-events-none">
               <div className="text-2xl font-bold text-slate-800">{totalAssignedEffort}w</div>
               <div className="text-xs text-slate-400">Total Effort</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};