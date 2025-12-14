import { useMemo } from 'react';
import { Filter, List, Layers } from 'lucide-react';
import { AssetClass, User, UnplannedTag } from '../../types';

interface FilterBarProps {
  filterAssetClass: string;
  setFilterAssetClass: (val: string) => void;
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
  filterOwners, setFilterOwners,
  filterWorkType, setFilterWorkType,
  searchQuery, resetFilters,
  currentView, viewLayout, setViewLayout,
  users
}) => {

  // Get owners who have initiatives (Team Leads)
  const availableOwners = useMemo(() => {
    return users.filter(u => u.role === 'Team Lead' || u.role === 'Admin');
  }, [users]);

  const toggleOwner = (ownerId: string) => {
    if (filterOwners.includes(ownerId)) {
      setFilterOwners(filterOwners.filter(id => id !== ownerId));
    } else {
      setFilterOwners([...filterOwners, ownerId]);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Generate consistent color from name
  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 
      'bg-purple-500', 'bg-cyan-500', 'bg-orange-500', 'bg-indigo-500',
      'bg-pink-500', 'bg-teal-500'
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const hasActiveFilters = filterAssetClass || filterOwners.length > 0 || filterWorkType || searchQuery;

  // Work type options including unplanned tags
  const workTypeOptions = [
    { label: 'All', value: '' },
    { label: 'Planned', value: 'Planned' },
    { label: 'All Unplanned', value: 'Unplanned' },
    { label: 'Risk', value: UnplannedTag.RiskItem },
    { label: 'PM', value: UnplannedTag.PMItem },
  ];

  return (
    <div className="flex flex-col gap-4 mb-6 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
      {/* Filter Row */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg">
          <Filter size={16} className="mr-2 text-blue-500" />
          <span className="text-sm font-bold uppercase tracking-wide">Filters</span>
        </div>
        
        {/* Asset Class Filter */}
        <select 
          value={filterAssetClass}
          onChange={(e) => setFilterAssetClass(e.target.value)}
          className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-400 focus:outline-none shadow-sm hover:border-slate-300 transition-colors min-w-[140px]"
        >
          <option value="">All Asset Classes</option>
          {Object.values(AssetClass).map(ac => <option key={ac} value={ac}>{ac}</option>)}
        </select>

        {/* Owner Filter - Avatar Circles */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500 mr-2 font-medium">Owner:</span>
          <div className="flex -space-x-1">
            {availableOwners.slice(0, 8).map(owner => {
              const isSelected = filterOwners.includes(owner.id);
              return (
                <button
                  key={owner.id}
                  onClick={() => toggleOwner(owner.id)}
                  className={`relative w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white transition-all ${getAvatarColor(owner.name)} ${
                    isSelected 
                      ? 'ring-2 ring-blue-500 ring-offset-2 z-10 scale-110' 
                      : 'hover:scale-105 hover:z-10 opacity-60 hover:opacity-100'
                  }`}
                  title={owner.name}
                >
                  {owner.avatar ? (
                    <img 
                      src={owner.avatar} 
                      alt={owner.name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    getInitials(owner.name)
                  )}
                </button>
              );
            })}
          </div>
          {filterOwners.length > 0 && (
            <span className="text-xs text-blue-600 font-medium ml-2">
              {filterOwners.length} selected
            </span>
          )}
        </div>
        
        {/* Work Type Segmented Control */}
        <div className="flex bg-slate-100 p-1 rounded-lg shadow-inner border border-slate-200">
          {workTypeOptions.map(opt => (
            <button
              key={opt.label}
              onClick={() => setFilterWorkType(opt.value)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                filterWorkType === opt.value 
                  ? 'bg-white text-blue-600 shadow-sm border border-blue-200' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {hasActiveFilters && (
          <button 
            onClick={resetFilters}
            className="text-sm text-red-600 hover:text-red-800 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            Clear All
          </button>
        )}

        {/* View Layout Toggle for All Tasks */}
        {currentView === 'all' && (
          <div className="ml-auto border-l-2 border-slate-200 pl-4 flex gap-1 bg-slate-50 rounded-lg p-1">
            <button 
              onClick={() => setViewLayout('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewLayout === 'table' 
                  ? 'bg-white text-blue-600 shadow-sm border border-blue-200' 
                  : 'text-slate-500 hover:bg-white hover:text-slate-700 hover:shadow-sm'
              }`}
              title="Flat Table View"
            >
              <List size={14} />
              <span>Flat</span>
            </button>
            <button 
              onClick={() => setViewLayout('tree')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                viewLayout === 'tree' 
                  ? 'bg-white text-blue-600 shadow-sm border border-blue-200' 
                  : 'text-slate-500 hover:bg-white hover:text-slate-700 hover:shadow-sm'
              }`}
              title="Grouped by Hierarchy"
            >
              <Layers size={14} />
              <span>Grouped</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
