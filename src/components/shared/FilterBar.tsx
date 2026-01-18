import { useMemo, useState, useRef, useEffect } from 'react';
import { Filter, ChevronDown, X, Bookmark, Trash2, Save } from 'lucide-react';
import { User, UnplannedTag, AppConfig, Initiative, SavedFilterView } from '../../types';
import { getAssetClasses, getQuarters, getPriorities, getStatuses } from '../../utils/valueLists';

interface FilterBarProps {
  filterAssetClass: string;
  setFilterAssetClass: (val: string) => void;
  filterOwners: string[];
  setFilterOwners: (val: string[]) => void;
  filterWorkType: string[];
  setFilterWorkType: (val: string[]) => void;
  filterQuarter: string[];
  setFilterQuarter: (val: string[]) => void;
  filterPriority: string[];
  setFilterPriority: (val: string[]) => void;
  filterStatus: string[];
  setFilterStatus: (val: string[]) => void;
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
  filterQuarter, setFilterQuarter,
  filterPriority, setFilterPriority,
  filterStatus, setFilterStatus,
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

  // Quarter dropdown state
  const [isQuarterDropdownOpen, setIsQuarterDropdownOpen] = useState(false);
  const [quarterSearchQuery, setQuarterSearchQuery] = useState('');
  const quarterDropdownRef = useRef<HTMLDivElement>(null);

  // Status dropdown state
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [statusSearchQuery, setStatusSearchQuery] = useState('');
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Work Type dropdown state
  const [isWorkTypeDropdownOpen, setIsWorkTypeDropdownOpen] = useState(false);
  const [workTypeSearchQuery, setWorkTypeSearchQuery] = useState('');
  const workTypeDropdownRef = useRef<HTMLDivElement>(null);

  // Priority dropdown state
  const [isPriorityDropdownOpen, setIsPriorityDropdownOpen] = useState(false);
  const [prioritySearchQuery, setPrioritySearchQuery] = useState('');
  const priorityDropdownRef = useRef<HTMLDivElement>(null);

  // Saved views state
  const [savedViews, setSavedViews] = useState<SavedFilterView[]>(() => {
    try {
      const stored = localStorage.getItem('saved-filter-views');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [isSavedViewsDropdownOpen, setIsSavedViewsDropdownOpen] = useState(false);
  const [isSaveViewModalOpen, setIsSaveViewModalOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState('');
  const savedViewsDropdownRef = useRef<HTMLDivElement>(null);

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

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ownerDropdownRef.current && !ownerDropdownRef.current.contains(event.target as Node)) {
        setIsOwnerDropdownOpen(false);
        setOwnerSearchQuery('');
      }
      if (quarterDropdownRef.current && !quarterDropdownRef.current.contains(event.target as Node)) {
        setIsQuarterDropdownOpen(false);
        setQuarterSearchQuery('');
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusDropdownOpen(false);
        setStatusSearchQuery('');
      }
      if (workTypeDropdownRef.current && !workTypeDropdownRef.current.contains(event.target as Node)) {
        setIsWorkTypeDropdownOpen(false);
        setWorkTypeSearchQuery('');
      }
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(event.target as Node)) {
        setIsPriorityDropdownOpen(false);
        setPrioritySearchQuery('');
      }
      if (savedViewsDropdownRef.current && !savedViewsDropdownRef.current.contains(event.target as Node)) {
        setIsSavedViewsDropdownOpen(false);
      }
    };
    if (isOwnerDropdownOpen || isQuarterDropdownOpen || isStatusDropdownOpen || isWorkTypeDropdownOpen || isPriorityDropdownOpen || isSavedViewsDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOwnerDropdownOpen, isQuarterDropdownOpen, isStatusDropdownOpen, isWorkTypeDropdownOpen, isPriorityDropdownOpen, isSavedViewsDropdownOpen]);

  const hasActiveFilters = filterAssetClass || filterOwners.length > 0 || filterWorkType.length > 0 || 
    filterQuarter.length > 0 || filterPriority.length > 0 || filterStatus.length > 0 || searchQuery;

  // Get available quarters, priorities, and statuses
  const availableQuarters = useMemo(() => getQuarters(config), [config]);
  const availablePriorities = useMemo(() => getPriorities(config), [config]);
  const availableStatuses = useMemo(() => getStatuses(config), [config]);

  // Get unique quarters/statuses from initiatives
  const usedQuarters = useMemo(() => {
    const quarters = new Set(initiatives.map(i => i.quarter));
    return availableQuarters.filter(q => quarters.has(q));
  }, [initiatives, availableQuarters]);

  const usedStatuses = useMemo(() => {
    const statuses = new Set(initiatives.map(i => i.status as string));
    return availableStatuses.filter(s => statuses.has(s));
  }, [initiatives, availableStatuses]);

  // Filter quarters by search query
  const filteredQuarters = useMemo(() => {
    if (!quarterSearchQuery.trim()) return usedQuarters;
    const query = quarterSearchQuery.toLowerCase();
    return usedQuarters.filter(q => q.toLowerCase().includes(query));
  }, [usedQuarters, quarterSearchQuery]);

  // Filter statuses by search query
  const filteredStatuses = useMemo(() => {
    if (!statusSearchQuery.trim()) return usedStatuses;
    const query = statusSearchQuery.toLowerCase();
    return usedStatuses.filter(s => s.toLowerCase().includes(query));
  }, [usedStatuses, statusSearchQuery]);

  const toggleQuarter = (quarter: string) => {
    if (filterQuarter.includes(quarter)) {
      setFilterQuarter(filterQuarter.filter(q => q !== quarter));
    } else {
      setFilterQuarter([...filterQuarter, quarter]);
    }
  };

  const togglePriority = (priority: string) => {
    if (filterPriority.includes(priority)) {
      setFilterPriority(filterPriority.filter(p => p !== priority));
    } else {
      setFilterPriority([...filterPriority, priority]);
    }
  };

  const toggleStatus = (status: string) => {
    if (filterStatus.includes(status)) {
      setFilterStatus(filterStatus.filter(s => s !== status));
    } else {
      setFilterStatus([...filterStatus, status]);
    }
  };

  // Saved views functions
  const saveCurrentView = () => {
    if (!saveViewName.trim()) return;
    
    const newView: SavedFilterView = {
      id: `view-${Date.now()}`,
      name: saveViewName.trim(),
      createdAt: new Date().toISOString(),
      filters: {
        assetClass: filterAssetClass,
        owners: filterOwners,
        workType: filterWorkType,
        quarter: filterQuarter,
        priority: filterPriority,
        status: filterStatus,
      }
    };
    
    const updatedViews = [...savedViews, newView];
    setSavedViews(updatedViews);
    localStorage.setItem('saved-filter-views', JSON.stringify(updatedViews));
    setSaveViewName('');
    setIsSaveViewModalOpen(false);
  };

  const loadSavedView = (view: SavedFilterView) => {
    setFilterAssetClass(view.filters.assetClass);
    setFilterOwners(view.filters.owners);
    setFilterWorkType(view.filters.workType);
    setFilterQuarter(view.filters.quarter);
    setFilterPriority(view.filters.priority);
    setFilterStatus(view.filters.status);
    setIsSavedViewsDropdownOpen(false);
  };

  const deleteSavedView = (id: string) => {
    const updatedViews = savedViews.filter(v => v.id !== id);
    setSavedViews(updatedViews);
    localStorage.setItem('saved-filter-views', JSON.stringify(updatedViews));
  };

  // Work type options including unplanned tags
  const workTypeOptions = [
    { label: 'All', value: '', singleSelect: true },
    { label: 'WP', value: 'WP', singleSelect: true },
    { label: 'BAU', value: 'BAU', singleSelect: true },
    { label: 'Unplanned', value: 'Unplanned', singleSelect: true },
    { label: 'Risk', value: UnplannedTag.RiskItem, singleSelect: false },
    { label: 'PM', value: UnplannedTag.PMItem, singleSelect: false },
  ];

  // Filter work types by search query
  const filteredWorkTypes = useMemo(() => {
    if (!workTypeSearchQuery.trim()) return workTypeOptions;
    const query = workTypeSearchQuery.toLowerCase();
    return workTypeOptions.filter(opt => opt.label.toLowerCase().includes(query));
  }, [workTypeSearchQuery]);

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

  // Filter priorities by search query
  const filteredPriorities = useMemo(() => {
    if (!prioritySearchQuery.trim()) return availablePriorities;
    const query = prioritySearchQuery.toLowerCase();
    return availablePriorities.filter(p => p.toLowerCase().includes(query));
  }, [availablePriorities, prioritySearchQuery]);

  return (
    <div className="flex flex-col gap-3 mb-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm card-glow overflow-visible relative z-[100]">
      {/* Filter Row */}
      <div className="flex flex-wrap gap-3 items-center overflow-visible">
        <div className="flex items-center text-slate-700 bg-gradient-to-r from-amber-50 to-amber-100/50 px-3 py-1.5 rounded-lg border border-amber-200/50">
          <Filter size={14} className="mr-1.5 text-amber-600" />
          <span className="text-xs font-bold tracking-wide">Filters</span>
        </div>
        
        {/* Asset Class Filter */}
        <select 
          value={filterAssetClass}
          onChange={(e) => setFilterAssetClass(e.target.value)}
          className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 focus:outline-none shadow-sm hover:border-amber-300 hover:bg-amber-50/30 transition-all duration-200 min-w-[120px] cursor-pointer"
        >
          <option value="">All Asset Classes</option>
          {getAssetClasses(config).map(ac => <option key={ac} value={ac}>{ac}</option>)}
        </select>

        {/* Owner Filter - Dropdown */}
        <div className="relative" ref={ownerDropdownRef}>
          <button
            onClick={() => setIsOwnerDropdownOpen(!isOwnerDropdownOpen)}
            className={`flex items-center gap-1.5 text-xs bg-slate-50 border rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 focus:outline-none shadow-sm transition-all duration-200 ${filterOwners.length > 0 ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 hover:border-amber-300 hover:bg-amber-50/30'}`}
          >
            <Filter size={14} className={filterOwners.length > 0 ? 'text-amber-600' : 'text-amber-500'} />
            <span className="text-slate-700">Owners</span>
            {filterOwners.length > 0 && (
              <span className="bg-gradient-to-r from-amber-500 to-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold shadow-sm animate-badge-pop">
                {filterOwners.length}
              </span>
            )}
            <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isOwnerDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isOwnerDropdownOpen && (
            <div className="absolute top-full left-0 mt-1.5 bg-white/95 backdrop-blur-lg border border-slate-200 rounded-xl shadow-xl z-[9999] min-w-[220px] max-h-[280px] flex flex-col animate-scale-in">
              {/* Search input */}
              <div className="p-2 border-b border-slate-100">
                <input
                  type="text"
                  placeholder="Search owners..."
                  value={ownerSearchQuery}
                  onChange={(e) => setOwnerSearchQuery(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 focus:outline-none transition-all"
                  autoFocus
                />
              </div>
              
              {/* Owner list */}
              <div className="overflow-y-auto max-h-[220px]">
                {filteredOwners.length === 0 ? (
                  <div className="px-2.5 py-3 text-xs text-slate-500 text-center">
                    No owners found
                  </div>
                ) : (
                  filteredOwners.map(owner => {
                    const isSelected = filterOwners.includes(owner.id);
                    return (
                      <button
                        key={owner.id}
                        onClick={() => toggleOwner(owner.id)}
                        className={`w-full px-2.5 py-2 text-left text-xs transition-all duration-150 flex items-center gap-2 ${
                          isSelected ? 'bg-amber-50 text-amber-700 border-l-2 border-amber-500' : 'text-slate-700 hover:bg-slate-50 border-l-2 border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-3.5 h-3.5 text-amber-600 border-slate-300 rounded focus:ring-amber-500 accent-amber-500"
                        />
                        <span className="flex-1 font-medium">{owner.name}</span>
                      </button>
                    );
                  })
                )}
              </div>
              
              {/* Clear selection */}
              {filterOwners.length > 0 && (
                <div className="p-2 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setFilterOwners([]);
                      setOwnerSearchQuery('');
                    }}
                    className="w-full px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center gap-1 font-medium"
                  >
                    <X size={12} />
                    Clear selection
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Work Type Filter - Dropdown */}
        <div className="relative" ref={workTypeDropdownRef}>
          <button
            onClick={() => setIsWorkTypeDropdownOpen(!isWorkTypeDropdownOpen)}
            className={`flex items-center gap-1.5 text-xs bg-slate-50 border rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 focus:outline-none shadow-sm transition-all duration-200 ${filterWorkType.length > 0 ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 hover:border-amber-300 hover:bg-amber-50/30'}`}
          >
            <Filter size={14} className={filterWorkType.length > 0 ? 'text-amber-600' : 'text-amber-500'} />
            <span className="text-slate-700">Work Type</span>
            {filterWorkType.length > 0 && (
              <span className="bg-gradient-to-r from-amber-500 to-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold shadow-sm animate-badge-pop">
                {filterWorkType.length}
              </span>
            )}
            <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isWorkTypeDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isWorkTypeDropdownOpen && (
            <div className="absolute top-full left-0 mt-1.5 bg-white/95 backdrop-blur-lg border border-slate-200 rounded-xl shadow-xl z-[9999] min-w-[180px] max-h-[280px] flex flex-col animate-scale-in">
              {/* Search input */}
              <div className="p-2 border-b border-slate-100">
                <input
                  type="text"
                  placeholder="Search work types..."
                  value={workTypeSearchQuery}
                  onChange={(e) => setWorkTypeSearchQuery(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 focus:outline-none transition-all"
                  autoFocus
                />
              </div>
              
              {/* Work Type list */}
              <div className="overflow-y-auto max-h-[220px]">
                {filteredWorkTypes.length === 0 ? (
                  <div className="px-2.5 py-3 text-xs text-slate-500 text-center">
                    No work types found
                  </div>
                ) : (
                  filteredWorkTypes.map(opt => {
                    const isSelected = opt.value === '' 
                      ? filterWorkType.length === 0
                      : filterWorkType.includes(opt.value);
                    return (
                      <button
                        key={opt.label}
                        onClick={() => toggleWorkType(opt.value, opt.singleSelect)}
                        className={`w-full px-2.5 py-2 text-left text-xs transition-all duration-150 flex items-center gap-2 ${
                          isSelected ? 'bg-amber-50 text-amber-700 border-l-2 border-amber-500' : 'text-slate-700 hover:bg-slate-50 border-l-2 border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-3.5 h-3.5 text-amber-600 border-slate-300 rounded focus:ring-amber-500 accent-amber-500"
                        />
                        <span className="flex-1 font-medium">{opt.label}</span>
                      </button>
                    );
                  })
                )}
              </div>
              
              {/* Clear selection */}
              {filterWorkType.length > 0 && (
                <div className="p-2 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setFilterWorkType([]);
                      setWorkTypeSearchQuery('');
                    }}
                    className="w-full px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center gap-1 font-medium"
                  >
                    <X size={12} />
                    Clear selection
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quarter Filter - Dropdown */}
        <div className="relative" ref={quarterDropdownRef}>
          <button
            onClick={() => setIsQuarterDropdownOpen(!isQuarterDropdownOpen)}
            className={`flex items-center gap-1.5 text-xs bg-slate-50 border rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 focus:outline-none shadow-sm transition-all duration-200 ${filterQuarter.length > 0 ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 hover:border-amber-300 hover:bg-amber-50/30'}`}
          >
            <Filter size={14} className={filterQuarter.length > 0 ? 'text-amber-600' : 'text-amber-500'} />
            <span className="text-slate-700">Quarter</span>
            {filterQuarter.length > 0 && (
              <span className="bg-gradient-to-r from-amber-500 to-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold shadow-sm animate-badge-pop">
                {filterQuarter.length}
              </span>
            )}
            <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isQuarterDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isQuarterDropdownOpen && (
            <div className="absolute top-full left-0 mt-1.5 bg-white/95 backdrop-blur-lg border border-slate-200 rounded-xl shadow-xl z-[9999] min-w-[180px] max-h-[280px] flex flex-col animate-scale-in">
              {/* Search input */}
              <div className="p-2 border-b border-slate-100">
                <input
                  type="text"
                  placeholder="Search quarters..."
                  value={quarterSearchQuery}
                  onChange={(e) => setQuarterSearchQuery(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 focus:outline-none transition-all"
                  autoFocus
                />
              </div>
              
              {/* Quarter list */}
              <div className="overflow-y-auto max-h-[220px]">
                {filteredQuarters.length === 0 ? (
                  <div className="px-2.5 py-3 text-xs text-slate-500 text-center">
                    No quarters found
                  </div>
                ) : (
                  filteredQuarters.map(quarter => {
                    const isSelected = filterQuarter.includes(quarter);
                    return (
                      <button
                        key={quarter}
                        onClick={() => toggleQuarter(quarter)}
                        className={`w-full px-2.5 py-2 text-left text-xs transition-all duration-150 flex items-center gap-2 ${
                          isSelected ? 'bg-amber-50 text-amber-700 border-l-2 border-amber-500' : 'text-slate-700 hover:bg-slate-50 border-l-2 border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-3.5 h-3.5 text-amber-600 border-slate-300 rounded focus:ring-amber-500 accent-amber-500"
                        />
                        <span className="flex-1 font-medium">{quarter}</span>
                      </button>
                    );
                  })
                )}
              </div>
              
              {/* Clear selection */}
              {filterQuarter.length > 0 && (
                <div className="p-2 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setFilterQuarter([]);
                      setQuarterSearchQuery('');
                    }}
                    className="w-full px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center gap-1 font-medium"
                  >
                    <X size={12} />
                    Clear selection
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Priority Filter - Dropdown */}
        <div className="relative" ref={priorityDropdownRef}>
          <button
            onClick={() => setIsPriorityDropdownOpen(!isPriorityDropdownOpen)}
            className={`flex items-center gap-1.5 text-xs bg-slate-50 border rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 focus:outline-none shadow-sm transition-all duration-200 ${filterPriority.length > 0 ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 hover:border-amber-300 hover:bg-amber-50/30'}`}
          >
            <Filter size={14} className={filterPriority.length > 0 ? 'text-amber-600' : 'text-amber-500'} />
            <span className="text-slate-700">Priority</span>
            {filterPriority.length > 0 && (
              <span className="bg-gradient-to-r from-amber-500 to-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold shadow-sm animate-badge-pop">
                {filterPriority.length}
              </span>
            )}
            <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isPriorityDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isPriorityDropdownOpen && (
            <div className="absolute top-full left-0 mt-1.5 bg-white/95 backdrop-blur-lg border border-slate-200 rounded-xl shadow-xl z-[9999] min-w-[150px] max-h-[280px] flex flex-col animate-scale-in">
              {/* Search input */}
              <div className="p-2 border-b border-slate-100">
                <input
                  type="text"
                  placeholder="Search priorities..."
                  value={prioritySearchQuery}
                  onChange={(e) => setPrioritySearchQuery(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 focus:outline-none transition-all"
                  autoFocus
                />
              </div>
              
              {/* Priority list */}
              <div className="overflow-y-auto max-h-[220px]">
                {filteredPriorities.length === 0 ? (
                  <div className="px-2.5 py-3 text-xs text-slate-500 text-center">
                    No priorities found
                  </div>
                ) : (
                  filteredPriorities.map(priority => {
                    const isSelected = filterPriority.includes(priority);
                    return (
                      <button
                        key={priority}
                        onClick={() => togglePriority(priority)}
                        className={`w-full px-2.5 py-2 text-left text-xs transition-all duration-150 flex items-center gap-2 ${
                          isSelected ? 'bg-amber-50 text-amber-700 border-l-2 border-amber-500' : 'text-slate-700 hover:bg-slate-50 border-l-2 border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-3.5 h-3.5 text-amber-600 border-slate-300 rounded focus:ring-amber-500 accent-amber-500"
                        />
                        <span className="flex-1 font-medium">{priority}</span>
                      </button>
                    );
                  })
                )}
              </div>
              
              {/* Clear selection */}
              {filterPriority.length > 0 && (
                <div className="p-2 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setFilterPriority([]);
                      setPrioritySearchQuery('');
                    }}
                    className="w-full px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center gap-1 font-medium"
                  >
                    <X size={12} />
                    Clear selection
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status Filter - Dropdown */}
        <div className="relative" ref={statusDropdownRef}>
          <button
            onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
            className={`flex items-center gap-1.5 text-xs bg-slate-50 border rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 focus:outline-none shadow-sm transition-all duration-200 ${filterStatus.length > 0 ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 hover:border-amber-300 hover:bg-amber-50/30'}`}
          >
            <Filter size={14} className={filterStatus.length > 0 ? 'text-amber-600' : 'text-amber-500'} />
            <span className="text-slate-700">Status</span>
            {filterStatus.length > 0 && (
              <span className="bg-gradient-to-r from-amber-500 to-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold shadow-sm animate-badge-pop">
                {filterStatus.length}
              </span>
            )}
            <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isStatusDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isStatusDropdownOpen && (
            <div className="absolute top-full left-0 mt-1.5 bg-white/95 backdrop-blur-lg border border-slate-200 rounded-xl shadow-xl z-[9999] min-w-[180px] max-h-[280px] flex flex-col animate-scale-in">
              {/* Search input */}
              <div className="p-2 border-b border-slate-100">
                <input
                  type="text"
                  placeholder="Search statuses..."
                  value={statusSearchQuery}
                  onChange={(e) => setStatusSearchQuery(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 focus:outline-none transition-all"
                  autoFocus
                />
              </div>
              
              {/* Status list */}
              <div className="overflow-y-auto max-h-[220px]">
                {filteredStatuses.length === 0 ? (
                  <div className="px-2.5 py-3 text-xs text-slate-500 text-center">
                    No statuses found
                  </div>
                ) : (
                  filteredStatuses.map(status => {
                    const isSelected = filterStatus.includes(status);
                    return (
                      <button
                        key={status}
                        onClick={() => toggleStatus(status)}
                        className={`w-full px-2.5 py-2 text-left text-xs transition-all duration-150 flex items-center gap-2 ${
                          isSelected ? 'bg-amber-50 text-amber-700 border-l-2 border-amber-500' : 'text-slate-700 hover:bg-slate-50 border-l-2 border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-3.5 h-3.5 text-amber-600 border-slate-300 rounded focus:ring-amber-500 accent-amber-500"
                        />
                        <span className="flex-1 font-medium">{status}</span>
                      </button>
                    );
                  })
                )}
              </div>
              
              {/* Clear selection */}
              {filterStatus.length > 0 && (
                <div className="p-2 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setFilterStatus([]);
                      setStatusSearchQuery('');
                    }}
                    className="w-full px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center justify-center gap-1 font-medium"
                  >
                    <X size={12} />
                    Clear selection
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Saved Views Dropdown */}
        <div className="relative" ref={savedViewsDropdownRef}>
          <button
            onClick={() => setIsSavedViewsDropdownOpen(!isSavedViewsDropdownOpen)}
            className={`flex items-center gap-1.5 text-xs bg-slate-50 border rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 focus:outline-none shadow-sm transition-all duration-200 ${savedViews.length > 0 ? 'border-cyan-300 bg-cyan-50/50' : 'border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/30'}`}
          >
            <Bookmark size={14} className={savedViews.length > 0 ? 'text-cyan-600' : 'text-cyan-500'} />
            <span className="text-slate-700">Saved Views</span>
            {savedViews.length > 0 && (
              <span className="bg-gradient-to-r from-cyan-500 to-cyan-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold shadow-sm">
                {savedViews.length}
              </span>
            )}
            <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isSavedViewsDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isSavedViewsDropdownOpen && (
            <div className="absolute top-full right-0 mt-1.5 bg-white/95 backdrop-blur-lg border border-slate-200 rounded-xl shadow-xl z-[9999] min-w-[260px] max-h-[360px] flex flex-col animate-scale-in">
              {/* Header */}
              <div className="p-3 border-b border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 tracking-tight">Saved Filter Views</span>
                </div>
                <button
                  onClick={() => {
                    setIsSaveViewModalOpen(true);
                    setIsSavedViewsDropdownOpen(false);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs bg-gradient-to-r from-cyan-500 to-cyan-600 text-white rounded-lg hover:from-cyan-600 hover:to-cyan-700 transition-all shadow-sm flex items-center justify-center gap-1.5 font-medium"
                >
                  <Save size={12} />
                  Save Current View
                </button>
              </div>
              
              {/* Saved views list */}
              <div className="overflow-y-auto max-h-[280px]">
                {savedViews.length === 0 ? (
                  <div className="px-2.5 py-3 text-xs text-slate-500 text-center">
                    No saved views
                  </div>
                ) : (
                  savedViews.map(view => (
                    <div
                      key={view.id}
                      className="px-2.5 py-1.5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => loadSavedView(view)}
                          className="flex-1 text-left text-xs text-slate-700 hover:text-blue-600 transition-colors"
                        >
                          <div className="font-medium">{view.name}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {new Date(view.createdAt).toLocaleDateString()}
                          </div>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSavedView(view.id);
                          }}
                          className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete view"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {hasActiveFilters && (
          <button 
            onClick={resetFilters}
            className="text-xs text-red-600 hover:text-white font-semibold px-3 py-1.5 rounded-lg hover:bg-red-500 transition-all duration-200 border border-red-200 hover:border-red-500"
          >
            Clear All
          </button>
        )}

      </div>

      {/* Save View Modal */}
      {isSaveViewModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setIsSaveViewModalOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl p-4 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Save Filter View</h3>
            <input
              type="text"
              placeholder="Enter view name..."
              value={saveViewName}
              onChange={(e) => setSaveViewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && saveViewName.trim()) {
                  saveCurrentView();
                } else if (e.key === 'Escape') {
                  setIsSaveViewModalOpen(false);
                  setSaveViewName('');
                }
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-400 focus:outline-none mb-3"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setIsSaveViewModalOpen(false);
                  setSaveViewName('');
                }}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveCurrentView}
                disabled={!saveViewName.trim()}
                className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
