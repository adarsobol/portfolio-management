import React, { useState, useMemo, useCallback } from 'react';
import { 
  Users, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Edit2,
  Save,
  X as XIcon,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  History
} from 'lucide-react';
import { Initiative, User, Status, DependencyTeam, Dependency } from '../../types';
import { DEPENDENCY_TEAM_CATEGORIES } from '../../constants';
import { formatDateDisplay, isOverdue, getDateStatus, getDaysUntil } from '../../utils';

interface DependenciesViewProps {
  initiatives: Initiative[];
  users: User[];
  onInitiativeClick: (initiative: Initiative) => void;
  onInitiativeUpdate?: (initiative: Initiative) => void;
}

type SortField = 'team' | 'title' | 'eta' | 'status';
type SortDirection = 'asc' | 'desc';

// Helper to get status color
const getStatusColor = (status: Status): string => {
  switch (status) {
    case Status.Done: return 'bg-emerald-100 text-emerald-700';
    case Status.InProgress: return 'bg-blue-100 text-blue-700';
    case Status.AtRisk: return 'bg-red-100 text-red-700';
    case Status.Obsolete: return 'bg-slate-200 text-slate-600';
    default: return 'bg-slate-100 text-slate-600';
  }
};

const getStatusIcon = (status: Status) => {
  switch (status) {
    case Status.Done: return <CheckCircle2 size={14} className="text-emerald-500" />;
    case Status.AtRisk: return <AlertTriangle size={14} className="text-red-500" />;
    case Status.InProgress: return <Clock size={14} className="text-blue-500" />;
    case Status.Obsolete: return <History size={14} className="text-slate-500" />;
    default: return <Clock size={14} className="text-slate-400" />;
  }
};

export const DependenciesView: React.FC<DependenciesViewProps> = ({
  initiatives,
  users,
  onInitiativeClick,
  onInitiativeUpdate
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<DependencyTeam | ''>('');
  const [editingDependency, setEditingDependency] = useState<{ initiativeId: string; depIndex: number } | null>(null);
  const [editFormData, setEditFormData] = useState<{ deliverable: string; eta: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('eta');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Calculate dependency data
  const dependencyData = useMemo(() => {
    const externalDeps = new Map<string, Dependency[]>();

    initiatives.forEach(initiative => {
      if (initiative.dependencies && initiative.dependencies.length > 0) {
        externalDeps.set(initiative.id, initiative.dependencies);
      }
    });

    return { externalDeps };
  }, [initiatives]);

  // Flatten initiatives with dependencies into table rows (one row per dependency)
  const tableRows = useMemo(() => {
    const rows: Array<{
      id: string; // Unique row ID: initiativeId-depIndex
      team: DependencyTeam;
      initiative: Initiative;
      dependency: Dependency;
      depIndex: number;
    }> = [];
    
    initiatives.forEach(initiative => {
      initiative.dependencies?.forEach((dep, index) => {
        rows.push({ 
          id: `${initiative.id}-${index}`,
          team: dep.team, 
          initiative, 
          dependency: dep, 
          depIndex: index 
        });
      });
    });
    
    return rows;
  }, [initiatives]);

  // Calculate overdue count
  const overdueCount = useMemo(() => {
    return tableRows.filter(row => row.dependency.eta && isOverdue(row.dependency.eta)).length;
  }, [tableRows]);

  // Filter and sort table rows
  const filteredTableRows = useMemo(() => {
    let filtered = tableRows;

    // Apply team filter
    if (selectedTeamFilter) {
      filtered = filtered.filter(row => row.team === selectedTeamFilter);
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(row => {
        return (
          row.initiative.title.toLowerCase().includes(query) ||
          row.initiative.id.toLowerCase().includes(query) ||
          row.dependency.deliverable?.toLowerCase().includes(query) ||
          row.team.toLowerCase().includes(query)
        );
      });
    }

    // Sort based on selected field and direction
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'team':
          comparison = a.team.localeCompare(b.team);
          break;
        case 'title':
          comparison = a.initiative.title.localeCompare(b.initiative.title);
          break;
        case 'eta':
          // Sort by ETA date (overdue first, then by date)
          const aEta = a.dependency.eta || '';
          const bEta = b.dependency.eta || '';
          if (!aEta && !bEta) comparison = 0;
          else if (!aEta) comparison = 1;
          else if (!bEta) comparison = -1;
          else {
            const aDays = getDaysUntil(aEta);
            const bDays = getDaysUntil(bEta);
            // Overdue items first (negative days)
            if (aDays < 0 && bDays >= 0) comparison = -1;
            else if (aDays >= 0 && bDays < 0) comparison = 1;
            else comparison = aDays - bDays;
          }
          break;
        case 'status':
          // At-risk first, then by status order
          const aAtRisk = a.initiative.status === Status.AtRisk ? 1 : 0;
          const bAtRisk = b.initiative.status === Status.AtRisk ? 1 : 0;
          if (bAtRisk !== aAtRisk) comparison = bAtRisk - aAtRisk;
          else {
            const statusOrder = { [Status.AtRisk]: 0, [Status.InProgress]: 1, [Status.NotStarted]: 2, [Status.Done]: 3, [Status.Obsolete]: 4 };
            comparison = (statusOrder[a.initiative.status] || 99) - (statusOrder[b.initiative.status] || 99);
          }
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

      return sorted;
  }, [tableRows, selectedTeamFilter, searchQuery, sortField, sortDirection]);

  // Handle sort column click
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField, sortDirection]);

  // Stats by team
  const teamStats = useMemo(() => {
    const stats: Record<DependencyTeam, { count: number; atRisk: number; overdue: number }> = {} as any;
    
    Object.values(DependencyTeam).forEach(team => {
      stats[team] = { count: 0, atRisk: 0, overdue: 0 };
    });

    initiatives.forEach(initiative => {
      initiative.dependencies?.forEach(dep => {
        stats[dep.team].count++;
        if (initiative.status === Status.AtRisk) {
          stats[dep.team].atRisk++;
        }
        if (dep.eta && isOverdue(dep.eta)) {
          stats[dep.team].overdue++;
        }
      });
    });

    return stats;
  }, [initiatives]);

  // General stats
  const _stats = useMemo(() => ({
    total: initiatives.length,
    withDependencies: initiatives.filter(i => dependencyData.externalDeps.has(i.id)).length,
    atRiskWithDeps: initiatives.filter(i => 
      i.status === Status.AtRisk && dependencyData.externalDeps.has(i.id)
    ).length,
    overdue: overdueCount
  }), [initiatives, dependencyData, overdueCount]);
  void _stats; // Reserved for stats display feature

  const toggleRowExpanded = (rowId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const startEditingDependency = (initiativeId: string, depIndex: number) => {
    const initiative = initiatives.find(i => i.id === initiativeId);
    if (initiative?.dependencies?.[depIndex]) {
      const dep = initiative.dependencies[depIndex];
      setEditingDependency({ initiativeId, depIndex });
      setEditFormData({ deliverable: dep.deliverable || '', eta: dep.eta || '' });
    }
  };

  const cancelEditingDependency = () => {
    setEditingDependency(null);
    setEditFormData(null);
  };

  const saveDependencyEdit = () => {
    if (!editingDependency || !editFormData || !onInitiativeUpdate) return;
    
    const initiative = initiatives.find(i => i.id === editingDependency.initiativeId);
    if (!initiative) return;

    const updatedDependencies = [...(initiative.dependencies || [])];
    updatedDependencies[editingDependency.depIndex] = {
      ...updatedDependencies[editingDependency.depIndex],
      deliverable: editFormData.deliverable,
      eta: editFormData.eta
    };

    const updatedInitiative: Initiative = {
      ...initiative,
      dependencies: updatedDependencies,
      lastUpdated: new Date().toISOString().split('T')[0]
    };

    onInitiativeUpdate(updatedInitiative);
    setEditingDependency(null);
    setEditFormData(null);
  };

  const _getOwnerName = (ownerId: string) => users.find(u => u.id === ownerId)?.name || 'Unknown';
  void _getOwnerName; // Reserved for owner display feature

  return (
    <div className="space-y-4">
      {/* Filters and Controls */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
        <div className="p-4 space-y-3">
          {/* Search and Sort Row */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search dependencies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-600 whitespace-nowrap">Sort:</label>
              <select
                value={`${sortField}-${sortDirection}`}
                onChange={(e) => {
                  const [field, dir] = e.target.value.split('-');
                  setSortField(field as SortField);
                  setSortDirection(dir as SortDirection);
                }}
                className="px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white min-w-[180px]"
              >
                <option value="eta-asc">ETA (Overdue First)</option>
                <option value="eta-desc">ETA (Future First)</option>
                <option value="status-asc">Status (At Risk First)</option>
                <option value="status-desc">Status (Done First)</option>
                <option value="team-asc">Team (A-Z)</option>
                <option value="team-desc">Team (Z-A)</option>
                <option value="title-asc">Title (A-Z)</option>
                <option value="title-desc">Title (Z-A)</option>
              </select>
            </div>
          </div>

          {/* Team Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <span className="text-xs font-medium text-slate-500">Filter by team:</span>
            {Object.values(DependencyTeam).map(team => {
              const stat = teamStats[team];
              const category = DEPENDENCY_TEAM_CATEGORIES.find(c => c.teams.includes(team));
              const colorClasses = category?.color === 'blue'
                ? { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', activeBg: 'bg-blue-100' }
                : { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', activeBg: 'bg-purple-100' };
              const isActive = selectedTeamFilter === team;

              return (
                <button
                  key={team}
                  onClick={() => setSelectedTeamFilter(isActive ? '' : team)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${
                    isActive
                      ? `${colorClasses.activeBg} ${colorClasses.border} ${colorClasses.text} ring-1 ring-indigo-400`
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {team}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      stat.count > 0 
                        ? isActive ? `${colorClasses.bg} ${colorClasses.text}` : 'bg-slate-100 text-slate-600'
                        : 'bg-slate-50 text-slate-400'
                    }`}>
                      {stat.count}
                    </span>
                  </span>
                </button>
              );
            })}
            {selectedTeamFilter && (
              <button
                onClick={() => setSelectedTeamFilter('')}
                className="px-2.5 py-1 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dependencies Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">
              Dependencies
              {selectedTeamFilter && (
                <span className="ml-2 font-normal text-slate-500">
                  · <span className="font-medium text-indigo-600">{selectedTeamFilter}</span>
                </span>
              )}
            </h3>
            <span className="text-xs text-slate-500">
              {filteredTableRows.length} {filteredTableRows.length !== 1 ? 'items' : 'item'}
              {searchQuery && ` · "${searchQuery}"`}
            </span>
          </div>
        </div>

        {filteredTableRows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Users size={32} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-500">No dependencies found</p>
            {searchQuery && (
              <p className="text-xs text-slate-400 mt-1">Try adjusting your search</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead className="bg-slate-50/50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-8 sticky left-0 bg-slate-50/50 z-10"></th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('team')}
                      className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors group"
                    >
                      Team
                      {sortField === 'team' ? (
                        sortDirection === 'asc' ? <ArrowUp size={12} className="text-indigo-600" /> : <ArrowDown size={12} className="text-indigo-600" />
                      ) : (
                        <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-40" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('title')}
                      className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors group"
                    >
                      Initiative
                      {sortField === 'title' ? (
                        sortDirection === 'asc' ? <ArrowUp size={12} className="text-indigo-600" /> : <ArrowDown size={12} className="text-indigo-600" />
                      ) : (
                        <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-40" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('eta')}
                      className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors group"
                    >
                      ETA
                      {sortField === 'eta' ? (
                        sortDirection === 'asc' ? <ArrowUp size={12} className="text-indigo-600" /> : <ArrowDown size={12} className="text-indigo-600" />
                      ) : (
                        <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-40" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <button
                      onClick={() => handleSort('status')}
                      className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors group"
                    >
                      Status
                      {sortField === 'status' ? (
                        sortDirection === 'asc' ? <ArrowUp size={12} className="text-indigo-600" /> : <ArrowDown size={12} className="text-indigo-600" />
                      ) : (
                        <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-40" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/50">
                {filteredTableRows.map(row => {
                  const isExpanded = expandedRows.has(row.id);
                  const category = DEPENDENCY_TEAM_CATEGORIES.find(c => c.teams.includes(row.team));
                  const colorClasses = category?.color === 'blue'
                    ? { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'text-blue-500' }
                    : { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', icon: 'text-purple-500' };
                  const isEditing = editingDependency?.initiativeId === row.initiative.id && editingDependency?.depIndex === row.depIndex;

                  const dateStatus = row.dependency.eta ? getDateStatus(row.dependency.eta) : 'future';
                  const dateStatusClasses = {
                    overdue: 'bg-red-50/50 border-l-4 border-l-red-500',
                    'due-soon': 'bg-amber-50/50 border-l-4 border-l-amber-500',
                    'on-time': '',
                    'future': ''
                  };
                  const statusBadgeClasses = {
                    overdue: 'bg-red-100 text-red-700 border-red-300',
                    'due-soon': 'bg-amber-100 text-amber-700 border-amber-300',
                    'on-time': 'bg-green-100 text-green-700 border-green-300',
                    'future': 'bg-slate-100 text-slate-700 border-slate-300'
                  };
                  const statusIconClasses = {
                    overdue: 'text-red-500',
                    'due-soon': 'text-amber-500',
                    'on-time': 'text-green-500',
                    'future': 'text-slate-400'
                  };

                  return (
                    <React.Fragment key={row.id}>
                      <tr 
                        className={`hover:bg-slate-50/50 transition-colors ${
                          row.initiative.status === Status.AtRisk ? 'bg-red-50/20' : ''
                        } ${dateStatusClasses[dateStatus]}`}
                      >
                        <td className={`px-4 py-3 sticky left-0 z-10 ${
                          dateStatus === 'overdue' ? 'bg-red-50/50' : 
                          dateStatus === 'due-soon' ? 'bg-amber-50/50' : 
                          row.initiative.status === Status.AtRisk ? 'bg-red-50/20' : 'bg-white'
                        }`}>
                          <button
                            onClick={() => toggleRowExpanded(row.id)}
                            className="p-0.5 rounded hover:bg-slate-200/50 transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronDown size={14} className="text-slate-400" />
                            ) : (
                              <ChevronRight size={14} className="text-slate-400" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Users size={13} className={colorClasses.icon} />
                            <span className={`text-sm font-medium ${colorClasses.text}`}>{row.team}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-mono font-medium rounded flex-shrink-0">
                              {row.initiative.id}
                            </span>
                            <span className="text-sm font-medium text-slate-800 truncate">{row.initiative.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <Clock size={13} className={statusIconClasses[dateStatus]} />
                              <span className={`text-sm font-medium ${dateStatus === 'overdue' ? 'text-red-700' : dateStatus === 'due-soon' ? 'text-amber-700' : 'text-slate-700'}`}>
                                {formatDateDisplay(row.dependency.eta || '')}
                              </span>
                            </div>
                            {row.dependency.eta && (
                              <span 
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${statusBadgeClasses[dateStatus]}`}
                                title={row.dependency.eta}
                              >
                                {dateStatus === 'overdue' && `Overdue`}
                                {dateStatus === 'due-soon' && `Due Soon`}
                                {dateStatus === 'on-time' && `On Time`}
                                {dateStatus === 'future' && `Future`}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {getStatusIcon(row.initiative.status)}
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(row.initiative.status)}`}>
                              {row.initiative.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onInitiativeClick(row.initiative);
                            }}
                            className="p-1.5 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"
                            title="Open initiative"
                          >
                            <ExternalLink size={14} />
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="px-4 py-3 bg-slate-50/30 border-t border-slate-100">
                            <div className="ml-6">
                              <div className={`p-3 rounded-md border ${colorClasses.border} ${colorClasses.bg}`}>
                                {isEditing && editFormData ? (
                                  <div className="space-y-3">
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 mb-1">Deliverable</label>
                                      <textarea
                                        value={editFormData.deliverable}
                                        onChange={(e) => setEditFormData({ ...editFormData, deliverable: e.target.value })}
                                        placeholder={`What deliverable is required from ${row.team}?`}
                                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 resize-none bg-white"
                                        rows={3}
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 mb-1">ETA</label>
                                      <input
                                        type="date"
                                        value={editFormData.eta}
                                        onChange={(e) => setEditFormData({ ...editFormData, eta: e.target.value })}
                                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white"
                                      />
                                    </div>
                                    <div className="flex items-center gap-2 pt-2">
                                      <button
                                        onClick={saveDependencyEdit}
                                        className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-1"
                                      >
                                        <Save size={12} />
                                        Save
                                      </button>
                                      <button
                                        onClick={cancelEditingDependency}
                                        className="px-3 py-1.5 text-xs bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-colors flex items-center gap-1"
                                      >
                                        <XIcon size={12} />
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {row.dependency.deliverable ? (
                                      <div className="flex items-start gap-2 text-sm text-slate-700">
                                        <MessageSquare size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                                        <div>
                                          <div className="text-xs font-medium text-slate-500 mb-1">Deliverable</div>
                                          <div className="italic">"{row.dependency.deliverable}"</div>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-xs text-slate-400 italic">No deliverable specified</div>
                                    )}
                                    {onInitiativeUpdate && (
                                      <button
                                        onClick={() => startEditingDependency(row.initiative.id, row.depIndex)}
                                        className="mt-2 px-3 py-1.5 text-xs text-slate-600 hover:bg-white rounded border border-slate-300 transition-colors flex items-center gap-1"
                                        title="Edit dependency"
                                      >
                                        <Edit2 size={12} />
                                        Edit Dependency
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
