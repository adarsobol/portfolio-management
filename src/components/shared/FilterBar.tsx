import { useMemo, useState, useRef, useEffect } from 'react';
import { Filter, ChevronDown, X, Bookmark, BookmarkCheck, Trash2, Save } from 'lucide-react';
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
      if (savedViewsDropdownRef.current && !savedViewsDropdownRef.current.contains(event.target as Node)) {
        setIsSavedViewsDropdownOpen(false);
      }
    };
    if (isOwnerDropdownOpen || isQuarterDropdownOpen || isStatusDropdownOpen || isSavedViewsDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOwnerDropdownOpen, isQuarterDropdownOpen, isStatusDropdownOpen, isSavedViewsDropdownOpen]);

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
    const statuses = new Set(initiatives.map(i => i.status));
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

        {/* Quarter Filter - Dropdown */}
        <div className="relative" ref={quarterDropdownRef}>
          <button
            onClick={() => setIsQuarterDropdownOpen(!isQuarterDropdownOpen)}
            className="flex items-center gap-2 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-400 focus:outline-none shadow-sm hover:border-slate-300 transition-colors"
          >
            <Filter size={16} className="text-blue-500" />
            <span className="text-slate-700">Quarter</span>
            {filterQuarter.length > 0 && (
              <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full font-semibold">
                {filterQuarter.length}
              </span>
            )}
            <ChevronDown size={16} className={`text-slate-400 transition-transform ${isQuarterDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isQuarterDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[200px] max-h-[300px] flex flex-col">
              {/* Search input */}
              <div className="p-2 border-b border-slate-200">
                <input
                  type="text"
                  placeholder="Search quarters..."
                  value={quarterSearchQuery}
                  onChange={(e) => setQuarterSearchQuery(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-400 focus:outline-none"
                  autoFocus
                />
              </div>
              
              {/* Quarter list */}
              <div className="overflow-y-auto max-h-[240px]">
                {filteredQuarters.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-500 text-center">
                    No quarters found
                  </div>
                ) : (
                  filteredQuarters.map(quarter => {
                    const isSelected = filterQuarter.includes(quarter);
                    return (
                      <button
                        key={quarter}
                        onClick={() => toggleQuarter(quarter)}
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
                        <span className="flex-1">{quarter}</span>
                      </button>
                    );
                  })
                )}
              </div>
              
              {/* Clear selection */}
              {filterQuarter.length > 0 && (
                <div className="p-2 border-t border-slate-200">
                  <button
                    onClick={() => {
                      setFilterQuarter([]);
                      setQuarterSearchQuery('');
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

        {/* Priority Segmented Control */}
        <div className="flex bg-slate-100 p-1 rounded-lg shadow-inner border border-slate-200">
          <button
            onClick={() => {
              if (filterPriority.length === 0) {
                setFilterPriority([...availablePriorities]);
              } else {
                setFilterPriority([]);
              }
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
              filterPriority.length === 0
                ? 'bg-white text-blue-600 shadow-sm border border-blue-200' 
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }`}
          >
            All
          </button>
          {availablePriorities.map(priority => {
            const isSelected = filterPriority.includes(priority);
            return (
              <button
                key={priority}
                onClick={() => togglePriority(priority)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                  isSelected
                    ? 'bg-white text-blue-600 shadow-sm border border-blue-200' 
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`}
              >
                {priority}
              </button>
            );
          })}
        </div>

        {/* Status Filter - Dropdown */}
        <div className="relative" ref={statusDropdownRef}>
          <button
            onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
            className="flex items-center gap-2 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-400 focus:outline-none shadow-sm hover:border-slate-300 transition-colors"
          >
            <Filter size={16} className="text-blue-500" />
            <span className="text-slate-700">Status</span>
            {filterStatus.length > 0 && (
              <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full font-semibold">
                {filterStatus.length}
              </span>
            )}
            <ChevronDown size={16} className={`text-slate-400 transition-transform ${isStatusDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isStatusDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[200px] max-h-[300px] flex flex-col">
              {/* Search input */}
              <div className="p-2 border-b border-slate-200">
                <input
                  type="text"
                  placeholder="Search statuses..."
                  value={statusSearchQuery}
                  onChange={(e) => setStatusSearchQuery(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-400 focus:outline-none"
                  autoFocus
                />
              </div>
              
              {/* Status list */}
              <div className="overflow-y-auto max-h-[240px]">
                {filteredStatuses.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-500 text-center">
                    No statuses found
                  </div>
                ) : (
                  filteredStatuses.map(status => {
                    const isSelected = filterStatus.includes(status);
                    return (
                      <button
                        key={status}
                        onClick={() => toggleStatus(status)}
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
                        <span className="flex-1">{status}</span>
                      </button>
                    );
                  })
                )}
              </div>
              
              {/* Clear selection */}
              {filterStatus.length > 0 && (
                <div className="p-2 border-t border-slate-200">
                  <button
                    onClick={() => {
                      setFilterStatus([]);
                      setStatusSearchQuery('');
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

        {/* Saved Views Dropdown */}
        <div className="relative" ref={savedViewsDropdownRef}>
          <button
            onClick={() => setIsSavedViewsDropdownOpen(!isSavedViewsDropdownOpen)}
            className="flex items-center gap-2 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-400 focus:outline-none shadow-sm hover:border-slate-300 transition-colors"
          >
            <Bookmark size={16} className="text-blue-500" />
            <span className="text-slate-700">Saved Views</span>
            {savedViews.length > 0 && (
              <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full font-semibold">
                {savedViews.length}
              </span>
            )}
            <ChevronDown size={16} className={`text-slate-400 transition-transform ${isSavedViewsDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {isSavedViewsDropdownOpen && (
            <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[280px] max-h-[400px] flex flex-col">
              {/* Header */}
              <div className="p-3 border-b border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-slate-700">Saved Filter Views</span>
                </div>
                <button
                  onClick={() => {
                    setIsSaveViewModalOpen(true);
                    setIsSavedViewsDropdownOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Save size={14} />
                  Save Current View
                </button>
              </div>
              
              {/* Saved views list */}
              <div className="overflow-y-auto max-h-[300px]">
                {savedViews.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-slate-500 text-center">
                    No saved views
                  </div>
                ) : (
                  savedViews.map(view => (
                    <div
                      key={view.id}
                      className="px-3 py-2 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => loadSavedView(view)}
                          className="flex-1 text-left text-sm text-slate-700 hover:text-blue-600 transition-colors"
                        >
                          <div className="font-medium">{view.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {new Date(view.createdAt).toLocaleDateString()}
                          </div>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSavedView(view.id);
                          }}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete view"
                        >
                          <Trash2 size={14} />
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
            className="text-sm text-red-600 hover:text-red-800 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            Clear All
          </button>
        )}

      </div>

      {/* Save View Modal */}
      {isSaveViewModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setIsSaveViewModalOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Save Filter View</h3>
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
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-400 focus:outline-none mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setIsSaveViewModalOpen(false);
                  setSaveViewName('');
                }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveCurrentView}
                disabled={!saveViewName.trim()}
                className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
