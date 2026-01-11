import { useMemo, useState, useRef, useEffect } from 'react';
import { Filter, ChevronDown, X } from 'lucide-react';
import { User, UnplannedTag, AppConfig, Initiative } from '../../types';
import { getAssetClasses } from '../../utils/valueLists';

interface FilterBarProps {
  filterAssetClass: string;
  setFilterAssetClass: (val: string) => void;
  filterOwners: string[];
  setFilterOwners: (val: string[]) => void;
  filterWorkType: string[];
  setFilterWorkType: (val: string[]) => void;
  searchQuery: string;
  resetFilters: () => void;
  currentView: string;
  viewLayout: 'table' | 'tree';
  setViewLayout: (layout: 'table' | 'tree') => void;
  users: User[];
  initiatives: Initiative[];
  config: AppConfig;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filterAssetClass, setFilterAssetClass,
  filterOwners, setFilterOwners,
  filterWorkType, setFilterWorkType,
  searchQuery, resetFilters,
  currentView: _currentView, viewLayout: _viewLayout, setViewLayout: _setViewLayout,
  users,
  initiatives,
  config
}) => {
  // Reserved for future layout toggle functionality
  void _currentView; void _viewLayout; void _setViewLayout;

  // Owner dropdown state
  const [isOwnerDropdownOpen, setIsOwnerDropdownOpen] = useState(false);
  const [ownerSearchQuery, setOwnerSearchQuery] = useState('');
  const ownerDropdownRef = useRef<HTMLDivElement>(null);

  // Get owners from existing initiatives (only show owners who have items)
  const availableOwners = useMemo(() => {
    const ownerIds = new Set(initiatives.map(i => i.ownerId));
    return users.filter(u => ownerIds.has(u.id));
  }, [initiatives, users]);

  // Filter owners by search query
  const filteredOwners = useMemo(() => {
    if (!ownerSearchQuery.trim()) return availableOwners;
    const query = ownerSearchQuery.toLowerCase();
    return availableOwners.filter(owner => 
      owner.name.toLowerCase().includes(query) || 
      owner.email.toLowerCase().includes(query)
    );
  }, [availableOwners, ownerSearchQuery]);

  const toggleOwner = (ownerId: string) => {
    if (filterOwners.includes(ownerId)) {
      setFilterOwners(filterOwners.filter(id => id !== ownerId));
    } else {
      setFilterOwners([...filterOwners, ownerId]);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ownerDropdownRef.current && !ownerDropdownRef.current.contains(event.target as Node)) {
        setIsOwnerDropdownOpen(false);
        setOwnerSearchQuery('');
      }
    };
    if (isOwnerDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOwnerDropdownOpen]);

  const hasActiveFilters = filterAssetClass || filterOwners.length > 0 || filterWorkType.length > 0 || searchQuery;

  // Work type options including unplanned tags
  const workTypeOptions = [
    { label: 'All', value: '', singleSelect: true },
    { label: 'WP', value: 'WP', singleSelect: true },
    { label: 'BAU', value: 'BAU', singleSelect: true },
    { label: 'Unplanned', value: 'Unplanned', singleSelect: true },
    { label: 'Risk', value: UnplannedTag.RiskItem, singleSelect: false },
    { label: 'PM', value: UnplannedTag.PMItem, singleSelect: false },
  ];

  const toggleWorkType = (value: string, singleSelect: boolean) => {
    if (value === '') {
      // "All" clears all filters
      setFilterWorkType([]);
      return;
    }
    
    if (singleSelect) {
      // Single-select options (WP, BAU, Unplanned) replace all selections
      if (filterWorkType.includes(value)) {
        setFilterWorkType([]);
      } else {
        setFilterWorkType([value]);
      }
    } else {
      // Multi-select options (Risk, PM) toggle individually
      if (filterWorkType.includes(value)) {
        setFilterWorkType(filterWorkType.filter(v => v !== value));
      } else {
        // Remove single-select options when adding multi-select
        const filtered = filterWorkType.filter(v => v !== 'WP' && v !== 'BAU' && v !== 'Unplanned' && v !== 'Planned');
        setFilterWorkType([...filtered, value]);
      }
    }
  };

  return (
    <div className="flex flex-col gap-4 mb-6 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
      {/* Filter Row */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex items-center text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg">
          <Filter size={16} className="mr-2 text-blue-500" />
          <span className="text-sm font-bold tracking-wide">Filters</span>
        </div>
        
        {/* Asset Class Filter */}
        <select 
          value={filterAssetClass}
          onChange={(e) => setFilterAssetClass(e.target.value)}
          className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-400 focus:outline-none shadow-sm hover:border-slate-300 transition-colors min-w-[140px]"
        >
          <option value="">All Asset Classes</option>
          {getAssetClasses(config).map(ac => <option key={ac} value={ac}>{ac}</option>)}
        </select>

        {/* Owner Filter - Dropdown */}
        <div className="relative" ref={ownerDropdownRef}>
          <button
            onClick={() => setIsOwnerDropdownOpen(!isOwnerDropdownOpen)}
            className="flex items-center gap-2 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-400 focus:outline-none shadow-sm hover:border-slate-300 transition-colors"
          >
            <Filter size={16} className="text-blue-500" />
            <span className="text-slate-700">Owners</span>
            {filterOwners.length > 0 && (
              <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full font-semibold">
                {filterOwners.length}
              </span>
            )}
            <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOwnerDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isOwnerDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[240px] max-h-[300px] flex flex-col">
              {/* Search input */}
              <div className="p-2 border-b border-slate-200">
                <input
                  type="text"
                  placeholder="Search owners..."
                  value={ownerSearchQuery}
                  onChange={(e) => setOwnerSearchQuery(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-400 focus:outline-none"
                  autoFocus
                />
              </div>
              
              {/* Owner list */}
              <div className="overflow-y-auto max-h-[240px]">
                {filteredOwners.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-500 text-center">
                    No owners found
                  </div>
                ) : (
                  filteredOwners.map(owner => {
                    const isSelected = filterOwners.includes(owner.id);
                    return (
                      <button
                        key={owner.id}
                        onClick={() => toggleOwner(owner.id)}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors flex items-center gap-2 ${
                          isSelected ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                        />
                        <span className="flex-1">{owner.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
              
              {/* Clear selection */}
              {filterOwners.length > 0 && (
                <div className="p-2 border-t border-slate-200">
                  <button
                    onClick={() => {
                      setFilterOwners([]);
                      setOwnerSearchQuery('');
                    }}
                    className="w-full px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors flex items-center justify-center gap-1"
                  >
                    <X size={14} />
                    Clear selection
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Work Type Segmented Control */}
        <div className="flex bg-slate-100 p-1 rounded-lg shadow-inner border border-slate-200">
          {workTypeOptions.map(opt => {
            const isSelected = opt.value === '' 
              ? filterWorkType.length === 0
              : filterWorkType.includes(opt.value);
            return (
              <button
                key={opt.label}
                onClick={() => toggleWorkType(opt.value, opt.singleSelect)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                  isSelected
                    ? 'bg-white text-blue-600 shadow-sm border border-blue-200' 
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {hasActiveFilters && (
          <button 
            onClick={resetFilters}
            className="text-sm text-red-600 hover:text-red-800 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            Clear All
          </button>
        )}

      </div>
    </div>
  );
};
