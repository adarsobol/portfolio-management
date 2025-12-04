
import React, { useMemo } from 'react';
import { Filter, List, GitGraph, Check } from 'lucide-react';
import { AssetClass, UnplannedTag, User, Role } from '../types';
import { HIERARCHY } from '../constants';

interface FilterBarProps {
  filterAssetClass: string;
  setFilterAssetClass: (val: string) => void;
  filterPillar: string;
  setFilterPillar: (val: string) => void;
  filterResponsibility: string;
  setFilterResponsibility: (val: string) => void;
  filterOwners: string[];
  setFilterOwners: (val: string[]) => void;
  filterWorkType: string;
  setFilterWorkType: (val: string) => void;
  searchQuery: string;
  resetFilters: () => void;
  currentView: string;
  viewLayout: 'table' | 'tree';
  setViewLayout: (layout: 'table' | 'tree') => void;
  users: User[];
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filterAssetClass, setFilterAssetClass,
  filterPillar, setFilterPillar,
  filterResponsibility, setFilterResponsibility,
  filterOwners, setFilterOwners,
  filterWorkType, setFilterWorkType,
  searchQuery, resetFilters,
  currentView, viewLayout, setViewLayout,
  users
}) => {

  const availableFilterPillars = useMemo(() => {
    if (filterAssetClass) {
      return HIERARCHY[filterAssetClass as AssetClass]?.map(p => p.name) || [];
    }
    const all = Object.values(HIERARCHY).flatMap(nodes => nodes.map(n => n.name));
    return Array.from(new Set(all));
  }, [filterAssetClass]);

  const availableFilterResponsibilities = useMemo(() => {
    const pillarsToSearch = filterPillar ? [filterPillar] : availableFilterPillars;
    const allNodes = Object.values(HIERARCHY).flat();
    const relevantNodes = allNodes.filter(n => pillarsToSearch.includes(n.name));
    const resps = relevantNodes.flatMap(n => n.responsibilities);
    return Array.from(new Set(resps));
  }, [filterPillar, availableFilterPillars]);

  const toggleOwnerFilter = (id: string) => {
    const newOwners = filterOwners.includes(id) 
      ? filterOwners.filter(x => x !== id) 
      : [...filterOwners, id];
    setFilterOwners(newOwners);
  };

  return (
    <div className="flex flex-col gap-4 mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
      {/* Top Row: General Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center text-slate-500 mr-2">
          <Filter size={16} className="mr-2" />
          <span className="text-sm font-semibold">Filters:</span>
        </div>
        
        <select 
          value={filterAssetClass}
          onChange={(e) => {
            setFilterAssetClass(e.target.value);
            setFilterPillar(''); 
            setFilterResponsibility('');
          }}
          className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">All Asset Classes</option>
          {Object.values(AssetClass).map(ac => <option key={ac} value={ac}>{ac}</option>)}
        </select>

        <select 
          value={filterPillar}
          onChange={(e) => {
            setFilterPillar(e.target.value);
            setFilterResponsibility('');
          }}
          className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">All Pillars</option>
          {availableFilterPillars.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select 
          value={filterResponsibility}
          onChange={(e) => setFilterResponsibility(e.target.value)}
          className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:outline-none max-w-[200px] truncate"
        >
          <option value="">All Responsibilities</option>
          {availableFilterResponsibilities.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        
        {/* Work Type Segmented Control */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
           {[
             { label: 'All', value: '' },
             { label: 'Planned', value: 'Planned' },
             { label: 'Unplanned', value: 'Unplanned' },
             { label: 'Risk', value: UnplannedTag.RiskItem },
             { label: 'PM', value: UnplannedTag.PMItem },
           ].map(opt => (
             <button
               key={opt.label}
               onClick={() => setFilterWorkType(opt.value)}
               className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                 filterWorkType === opt.value 
                   ? 'bg-white text-blue-600 shadow-sm' 
                   : 'text-slate-500 hover:text-slate-700'
               }`}
             >
               {opt.label}
             </button>
           ))}
        </div>

        {(filterAssetClass || filterPillar || filterResponsibility || filterOwners.length > 0 || filterWorkType || searchQuery) && (
          <button 
            onClick={resetFilters}
            className="text-sm text-red-600 hover:text-red-800 font-medium ml-auto px-2"
          >
            Clear All
          </button>
        )}

        {/* View Layout Toggle for All Tasks */}
        {currentView === 'all' && (
          <div className="ml-auto border-l pl-3 flex gap-1">
             <button 
               onClick={() => setViewLayout('table')}
               className={`p-1.5 rounded ${viewLayout === 'table' ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:bg-slate-100'}`}
               title="Table View"
             >
               <List size={18} />
             </button>
             <button 
               onClick={() => setViewLayout('tree')}
               className={`p-1.5 rounded ${viewLayout === 'tree' ? 'bg-blue-100 text-blue-600' : 'text-slate-400 hover:bg-slate-100'}`}
               title="Tree Hierarchy View"
             >
               <GitGraph size={18} />
             </button>
          </div>
        )}
      </div>

      {/* Bottom Row: Team Visual Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
        <span className="text-xs font-bold text-slate-500 uppercase mr-2 whitespace-nowrap">Filter by Team:</span>
        {users.filter(u => u.role === Role.TeamLead).map(u => {
          const isSelected = filterOwners.includes(u.id);
          return (
            <button
              key={u.id}
              onClick={() => toggleOwnerFilter(u.id)}
              className={`relative flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all border-2 ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-600 scale-105 shadow-md z-10'
                  : 'bg-slate-100 text-slate-500 border-white hover:border-slate-300 hover:scale-105 grayscale opacity-70 hover:opacity-100'
              }`}
              title={u.name}
            >
              <img src={u.avatar} alt={u.name} className="w-full h-full rounded-full" />
              {isSelected && (
                <div className="absolute -bottom-1 -right-1 bg-blue-600 rounded-full p-0.5 border border-white">
                  <Check size={8} className="text-white" strokeWidth={3} />
                </div>
              )}
            </button>
          )
        })}
        {filterOwners.length > 0 && (
           <button 
             onClick={() => setFilterOwners([])} 
             className="text-xs text-slate-400 hover:text-red-500 ml-2 whitespace-nowrap"
           >
              Clear Teams
           </button>
        )}
      </div>
    </div>
  );
};
