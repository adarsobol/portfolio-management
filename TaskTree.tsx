
import React from 'react';
import { Layers, CornerDownRight, User as UserIcon, AlertTriangle } from 'lucide-react';
import { Initiative, User, Status, WorkType } from '../types';
import { HIERARCHY } from '../constants';
import { StatusBadge, PriorityBadge } from './Shared';

interface TaskTreeProps {
  filteredInitiatives: Initiative[];
  users: User[];
  setEditingItem: (item: Initiative) => void;
  setIsModalOpen: (isOpen: boolean) => void;
}

export const TaskTree: React.FC<TaskTreeProps> = ({
  filteredInitiatives,
  users,
  setEditingItem,
  setIsModalOpen
}) => {
  return (
    <div className="space-y-8">
      {Object.entries(HIERARCHY).map(([assetClass, pillars]) => {
         const assetItems = filteredInitiatives.filter(i => i.l1_assetClass === assetClass);
         if (assetItems.length === 0) return null;

         return (
           <div key={assetClass} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-500">
             {/* Asset Class Header */}
             <div className="bg-slate-50/80 p-4 border-b border-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-sm text-blue-600">
                   <Layers size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-800 tracking-tight">{assetClass}</h3>
                <span className="ml-auto text-xs font-semibold bg-white border border-slate-200 text-slate-600 px-3 py-1 rounded-full shadow-sm">
                   {assetItems.length} Items
                </span>
             </div>

             <div className="p-6">
               {pillars.map((pillar, pIdx) => {
                 const pillarItems = assetItems.filter(i => i.l2_pillar === pillar.name);
                 if (pillarItems.length === 0) return null;

                 return (
                   <div key={pillar.name} className="relative pl-8 border-l-2 border-slate-100 last:border-0 pb-8 last:pb-0">
                      {/* Connection Dot */}
                      <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-200 border-2 border-white ring-1 ring-slate-100"></div>
                      
                      {/* Pillar Title */}
                      <h4 className="text-md font-bold text-slate-700 mb-6 flex items-center gap-2">
                        {pillar.name}
                        <span className="text-xs font-normal text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
                          Function
                        </span>
                      </h4>

                      <div className="space-y-6">
                        {pillar.responsibilities.map(resp => {
                           const respItems = pillarItems.filter(i => i.l3_responsibility === resp);
                           if (respItems.length === 0) return null;

                           return (
                             <div key={resp}>
                               {/* Responsibility Header */}
                               <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                  <CornerDownRight size={14} className="text-slate-300" />
                                  {resp}
                               </h5>
                               
                               {/* Initiative Grid */}
                               <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pl-5">
                                 {respItems.map(item => {
                                   const owner = users.find(u => u.id === item.ownerId);
                                   const percentComplete = item.estimatedEffort > 0 ? (item.actualEffort / item.estimatedEffort) * 100 : 0;
                                   
                                   const statusColors = {
                                      [Status.Planned]: 'border-l-slate-300',
                                      [Status.InProgress]: 'border-l-blue-500',
                                      [Status.Delayed]: 'border-l-red-500',
                                      [Status.Complete]: 'border-l-emerald-500',
                                   };
                                   const borderClass = statusColors[item.status] || 'border-l-slate-200';

                                   return (
                                     <div 
                                       key={item.id} 
                                       onClick={() => { setEditingItem(item); setIsModalOpen(true); }}
                                       className={`bg-white border border-slate-200 rounded-lg p-4 shadow-sm hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group border-l-4 ${borderClass}`}
                                     >
                                       <div className="flex justify-between items-start mb-3">
                                          <div className="flex-1 pr-2">
                                             <div className="font-bold text-slate-800 text-sm leading-tight mb-1 group-hover:text-blue-700 transition-colors">
                                                {item.title}
                                             </div>
                                             <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <div className="flex items-center gap-1">
                                                  <UserIcon size={12} />
                                                  {owner?.name}
                                                </div>
                                                <span>•</span>
                                                <span>{item.quarter}</span>
                                             </div>
                                          </div>
                                          <img src={owner?.avatar} alt={owner?.name} className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200" />
                                       </div>

                                       <div className="flex items-center justify-between text-xs mt-3 pt-3 border-t border-slate-50">
                                          <div className="flex gap-2">
                                             <StatusBadge status={item.status} />
                                             <PriorityBadge priority={item.priority} />
                                          </div>
                                          <div className="flex flex-col items-end">
                                             <span className="font-medium text-slate-600 mb-0.5">{Math.round(percentComplete)}%</span>
                                             <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                                                <div 
                                                  className={`h-full rounded-full ${item.status === Status.Delayed ? 'bg-red-500' : 'bg-blue-500'}`} 
                                                  style={{ width: `${Math.min(percentComplete, 100)}%` }}
                                                />
                                             </div>
                                          </div>
                                       </div>
                                       <div className="mt-2 flex justify-between items-center text-[10px] text-slate-400">
                                          <span>ETA: {item.eta}</span>
                                          {item.workType === WorkType.Unplanned && (
                                             <span className="text-amber-600 font-bold flex items-center gap-1">
                                                <AlertTriangle size={10} /> Unplanned
                                             </span>
                                          )}
                                       </div>
                                     </div>
                                   )
                                 })}
                               </div>
                             </div>
                           )
                        })}
                      </div>
                   </div>
                 )
               })}
             </div>
           </div>
         )
      })}
    </div>
  );
};
