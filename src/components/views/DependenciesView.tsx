import React, { useState, useMemo } from 'react';
import { 
  Users, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Filter,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Edit2,
  Save,
  X as XIcon
} from 'lucide-react';
import { Initiative, User, Status, DependencyTeam, Dependency } from '../../types';
import { DEPENDENCY_TEAM_CATEGORIES } from '../../constants';

interface DependenciesViewProps {
  initiatives: Initiative[];
  users: User[];
  onInitiativeClick: (initiative: Initiative) => void;
  onInitiativeUpdate?: (initiative: Initiative) => void;
}

type FilterMode = 'all' | 'with-deps' | 'no-deps';
type ViewMode = 'initiatives' | 'teams';

// Helper to get status color
const getStatusColor = (status: Status): string => {
  switch (status) {
    case Status.Done: return 'bg-emerald-100 text-emerald-700';
    case Status.InProgress: return 'bg-blue-100 text-blue-700';
    case Status.AtRisk: return 'bg-red-100 text-red-700';
    default: return 'bg-slate-100 text-slate-600';
  }
};

const getStatusIcon = (status: Status) => {
  switch (status) {
    case Status.Done: return <CheckCircle2 size={14} className="text-emerald-500" />;
    case Status.AtRisk: return <AlertTriangle size={14} className="text-red-500" />;
    case Status.InProgress: return <Clock size={14} className="text-blue-500" />;
    default: return <Clock size={14} className="text-slate-400" />;
  }
};

export const DependenciesView: React.FC<DependenciesViewProps> = ({
  initiatives,
  users,
  onInitiativeClick,
  onInitiativeUpdate
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('initiatives');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [expandedTeams, setExpandedTeams] = useState<Set<DependencyTeam>>(new Set());
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<DependencyTeam | ''>('');
  const [editingDependency, setEditingDependency] = useState<{ initiativeId: string; depIndex: number } | null>(null);
  const [editFormData, setEditFormData] = useState<{ deliverable: string; eta: string } | null>(null);

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

  // Group initiatives by team (for team view)
  const initiativesByTeam = useMemo(() => {
    const grouped = new Map<DependencyTeam, Initiative[]>();
    
    Object.values(DependencyTeam).forEach(team => {
      grouped.set(team, []);
    });

    initiatives.forEach(initiative => {
      if (initiative.dependencies && initiative.dependencies.length > 0) {
        initiative.dependencies.forEach(dep => {
          const existing = grouped.get(dep.team) || [];
          grouped.set(dep.team, [...existing, initiative]);
        });
      }
    });

    return grouped;
  }, [initiatives]);

  // Filter initiatives
  const filteredInitiatives = useMemo(() => {
    let filtered = initiatives;

    switch (filterMode) {
      case 'with-deps':
        filtered = initiatives.filter(i => 
          (dependencyData.externalDeps.get(i.id)?.length || 0) > 0
        );
        break;
      case 'no-deps':
        filtered = initiatives.filter(i => 
          !dependencyData.externalDeps.has(i.id)
        );
        break;
    }

    // Apply team filter
    if (selectedTeamFilter) {
      filtered = filtered.filter(i => 
        dependencyData.externalDeps.get(i.id)?.some(dep => dep.team === selectedTeamFilter)
      );
    }

    // Sort: items with dependencies first, then by status priority
    return [...filtered].sort((a, b) => {
      const aHasDeps = dependencyData.externalDeps.has(a.id) ? 1 : 0;
      const bHasDeps = dependencyData.externalDeps.has(b.id) ? 1 : 0;
      if (bHasDeps !== aHasDeps) return bHasDeps - aHasDeps;
      
      // Then by at-risk status
      const aAtRisk = a.status === Status.AtRisk ? 1 : 0;
      const bAtRisk = b.status === Status.AtRisk ? 1 : 0;
      return bAtRisk - aAtRisk;
    });
  }, [initiatives, filterMode, selectedTeamFilter, dependencyData]);

  // Filter teams (for team view)
  const filteredTeams = useMemo(() => {
    return Array.from(initiativesByTeam.entries())
      .filter(([team, initiatives]) => {
        if (filterMode === 'no-deps') return false;
        if (filterMode === 'with-deps') return initiatives.length > 0;
        return true;
      })
      .filter(([team]) => {
        if (selectedTeamFilter) return team === selectedTeamFilter;
        return true;
      })
      .sort(([teamA, initiativesA], [teamB, initiativesB]) => {
        // Sort by number of initiatives (descending), then by at-risk count
        const aAtRisk = initiativesA.filter(i => i.status === Status.AtRisk).length;
        const bAtRisk = initiativesB.filter(i => i.status === Status.AtRisk).length;
        if (bAtRisk !== aAtRisk) return bAtRisk - aAtRisk;
        return initiativesB.length - initiativesA.length;
      });
  }, [initiativesByTeam, filterMode, selectedTeamFilter]);

  // Stats by team
  const teamStats = useMemo(() => {
    const stats: Record<DependencyTeam, { count: number; atRisk: number }> = {} as any;
    
    Object.values(DependencyTeam).forEach(team => {
      stats[team] = { count: 0, atRisk: 0 };
    });

    initiatives.forEach(initiative => {
      initiative.dependencies?.forEach(dep => {
        stats[dep.team].count++;
        if (initiative.status === Status.AtRisk) {
          stats[dep.team].atRisk++;
        }
      });
    });

    return stats;
  }, [initiatives]);

  // General stats
  const stats = useMemo(() => ({
    total: initiatives.length,
    withDependencies: initiatives.filter(i => dependencyData.externalDeps.has(i.id)).length,
    atRiskWithDeps: initiatives.filter(i => 
      i.status === Status.AtRisk && dependencyData.externalDeps.has(i.id)
    ).length
  }), [initiatives, dependencyData]);

  const toggleExpanded = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleTeamExpanded = (team: DependencyTeam) => {
    setExpandedTeams(prev => {
      const next = new Set(prev);
      if (next.has(team)) {
        next.delete(team);
      } else {
        next.add(team);
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

  const getOwnerName = (ownerId: string) => users.find(u => u.id === ownerId)?.name || 'Unknown';

  return (
    <div className="space-y-6">
      {/* Header Stats - Team-focused */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Users size={16} className="text-indigo-500" />
            <span className="text-xs text-slate-500 font-medium uppercase">With Dependencies</span>
          </div>
          <div className="text-2xl font-bold text-slate-800">{stats.withDependencies}</div>
          <div className="text-xs text-slate-400">of {stats.total} initiatives</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={16} className="text-red-500" />
            <span className="text-xs text-slate-500 font-medium uppercase">At Risk + Deps</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{stats.atRiskWithDeps}</div>
          <div className="text-xs text-slate-400">needs attention</div>
        </div>

        {/* Team breakdown cards */}
        {DEPENDENCY_TEAM_CATEGORIES.map(category => {
          const categoryCount = category.teams.reduce((sum, t) => sum + teamStats[t].count, 0);
          const categoryAtRisk = category.teams.reduce((sum, t) => sum + teamStats[t].atRisk, 0);
          const colorClasses = category.color === 'blue' 
            ? { text: 'text-blue-600', icon: 'text-blue-500' }
            : { text: 'text-purple-600', icon: 'text-purple-500' };

          return (
            <div key={category.name} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Users size={16} className={colorClasses.icon} />
                <span className="text-xs text-slate-500 font-medium uppercase">{category.name}</span>
              </div>
              <div className={`text-2xl font-bold ${colorClasses.text}`}>{categoryCount}</div>
              <div className="text-xs text-slate-400">
                {categoryAtRisk > 0 && <span className="text-red-500">{categoryAtRisk} at risk</span>}
                {categoryAtRisk === 0 && 'dependencies'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Team Breakdown Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-slate-200">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Users size={16} className="text-indigo-600" />
            Dependencies by Team
          </h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.values(DependencyTeam).map(team => {
              const stat = teamStats[team];
              const category = DEPENDENCY_TEAM_CATEGORIES.find(c => c.teams.includes(team));
              const colorClasses = category?.color === 'blue'
                ? { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' }
                : { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' };

              return (
                <button
                  key={team}
                  onClick={() => setSelectedTeamFilter(selectedTeamFilter === team ? '' : team)}
                  className={`p-3 rounded-lg border transition-all text-left ${
                    selectedTeamFilter === team
                      ? `${colorClasses.bg} ${colorClasses.border} ring-2 ring-indigo-500`
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-medium text-sm ${selectedTeamFilter === team ? colorClasses.text : 'text-slate-700'}`}>
                      {team}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      stat.count > 0 ? `${colorClasses.bg} ${colorClasses.text}` : 'bg-slate-100 text-slate-400'
                    }`}>
                      {stat.count}
                    </span>
                  </div>
                  {stat.atRisk > 0 && (
                    <div className="mt-1 text-xs text-red-500 flex items-center gap-1">
                      <AlertTriangle size={10} />
                      {stat.atRisk} at risk
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* View Mode Toggle & Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">View:</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('initiatives')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'initiatives'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              By Initiative
            </button>
            <button
              onClick={() => setViewMode('teams')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                viewMode === 'teams'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              By Dependent Team
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-700">Filter:</span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {[
              { mode: 'all' as FilterMode, label: 'All Initiatives', count: stats.total },
              { mode: 'with-deps' as FilterMode, label: 'With Dependencies', count: stats.withDependencies },
              { mode: 'no-deps' as FilterMode, label: 'No Dependencies', count: stats.total - stats.withDependencies },
            ].map(({ mode, label, count }) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filterMode === mode
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>

          {selectedTeamFilter && (
            <button
              onClick={() => setSelectedTeamFilter('')}
              className="ml-auto px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              Clear team filter
            </button>
          )}
        </div>
      </div>

      {/* Initiatives List or Team View */}
      {viewMode === 'initiatives' ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-800">
              Initiatives
              {selectedTeamFilter && (
                <span className="ml-2 font-normal text-slate-500">
                  depending on <span className="font-medium text-indigo-600">{selectedTeamFilter}</span>
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Showing {filteredInitiatives.length} initiatives
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredInitiatives.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Users size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500">No initiatives match the current filter</p>
              </div>
            ) : (
            filteredInitiatives.map(initiative => {
              const dependencies = dependencyData.externalDeps.get(initiative.id) || [];
              const isExpanded = expandedItems.has(initiative.id);
              const hasDependencies = dependencies.length > 0;

                return (
                  <div key={initiative.id}>
                    {/* Main Row */}
                    <div 
                      className={`px-6 py-4 hover:bg-slate-50 cursor-pointer transition-colors ${
                        initiative.status === Status.AtRisk ? 'bg-red-50/30' : ''
                      }`}
                      onClick={() => hasDependencies && toggleExpanded(initiative.id)}
                    >
                      <div className="flex items-center gap-4">
                        {/* Expand Button */}
                        <button
                          className={`p-1 rounded hover:bg-slate-200 transition-colors ${
                            !hasDependencies ? 'invisible' : ''
                          }`}
                        >
                          {isExpanded ? (
                            <ChevronDown size={16} className="text-slate-400" />
                          ) : (
                            <ChevronRight size={16} className="text-slate-400" />
                          )}
                        </button>

                        {/* Status Icon */}
                        <div className="flex-shrink-0">
                          {getStatusIcon(initiative.status)}
                          </div>

                        {/* Initiative Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800 truncate">{initiative.title}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(initiative.status)}`}>
                              {initiative.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                            <span>{getOwnerName(initiative.ownerId)}</span>
                            <span>•</span>
                            <span>ETA: {initiative.eta}</span>
                            {initiative.l1_assetClass && (
                              <>
                                <span>•</span>
                                <span>{initiative.l1_assetClass}</span>
                              </>
                            )}
                          </div>
                        </div>

                      {/* Dependency Summary Badge */}
                        {dependencies.length > 0 && (
                          <div 
                          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-medium"
                            title="External team dependencies"
                          >
                            <Users size={12} />
                          <span>{dependencies.length} team{dependencies.length !== 1 ? 's' : ''}</span>
                          </div>
                        )}

                        {/* Open Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onInitiativeClick(initiative);
                          }}
                          className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                          title="Open initiative"
                        >
                          <ExternalLink size={16} />
                        </button>
                      </div>
                    </div>

                  {/* Expanded Details */}
                  {isExpanded && hasDependencies && (
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
                      <div className="ml-10">
                        <h4 className="text-xs font-bold text-slate-600 uppercase mb-3 flex items-center gap-2">
                          <Users size={12} className="text-indigo-500" />
                          External Team Dependencies
                            </h4>
                            <div className="space-y-2">
                          {dependencies.map((dep, index) => {
                            const category = DEPENDENCY_TEAM_CATEGORIES.find(c => c.teams.includes(dep.team));
                            const colorClasses = category?.color === 'blue'
                              ? { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' }
                              : { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' };
                            
                            const isEditing = editingDependency?.initiativeId === initiative.id && editingDependency?.depIndex === index;

                            return (
                              <div 
                                key={`${dep.team}-${index}`}
                                className={`p-3 rounded-lg border ${colorClasses.border} ${colorClasses.bg}`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Users size={14} className={colorClasses.text} />
                                    <span className={`font-medium ${colorClasses.text}`}>{dep.team}</span>
                                  </div>
                                  {onInitiativeUpdate && (
                                    <div className="flex items-center gap-1">
                                      {isEditing ? (
                                        <>
                                          <button
                                            onClick={saveDependencyEdit}
                                            className="p-1 hover:bg-green-100 rounded text-green-600 transition-colors"
                                            title="Save"
                                          >
                                            <Save size={14} />
                                          </button>
                                          <button
                                            onClick={cancelEditingDependency}
                                            className="p-1 hover:bg-red-100 rounded text-red-600 transition-colors"
                                            title="Cancel"
                                          >
                                            <XIcon size={14} />
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          onClick={() => startEditingDependency(initiative.id, index)}
                                          className="p-1 hover:bg-slate-200 rounded text-slate-600 transition-colors"
                                          title="Edit dependency"
                                        >
                                          <Edit2 size={14} />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                                
                                {isEditing && editFormData ? (
                                  <div className="space-y-2">
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 mb-1">Deliverable</label>
                                      <textarea
                                        value={editFormData.deliverable}
                                        onChange={(e) => setEditFormData({ ...editFormData, deliverable: e.target.value })}
                                        placeholder={`What deliverable is required from ${dep.team}?`}
                                        className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 resize-none bg-white"
                                        rows={2}
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium text-slate-600 mb-1">ETA</label>
                                      <input
                                        type="date"
                                        value={editFormData.eta}
                                        onChange={(e) => setEditFormData({ ...editFormData, eta: e.target.value })}
                                        className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white"
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    {dep.deliverable && (
                                      <div className="flex items-start gap-1.5 text-sm text-slate-700 mb-2">
                                        <MessageSquare size={12} className="text-slate-400 mt-0.5 flex-shrink-0" />
                                        <span className="italic">"{dep.deliverable}"</span>
                                      </div>
                                    )}
                                    {dep.eta && (
                                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                        <Clock size={12} className="text-slate-400" />
                                        <span>ETA: {dep.eta}</span>
                                      </div>
                                    )}
                                    {!dep.deliverable && !dep.eta && (
                                      <div className="text-xs text-slate-400 italic">No deliverable or ETA specified</div>
                                    )}
                                  </>
                                )}
                            </div>
                            );
                          })}
                          </div>
                      </div>
                    </div>
                  )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-800">
              Grouped by Dependent Team
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Showing {filteredTeams.length} teams with dependencies
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredTeams.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Users size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500">No teams match the current filter</p>
              </div>
            ) : (
              filteredTeams.map(([team, teamInitiatives]) => {
                const category = DEPENDENCY_TEAM_CATEGORIES.find(c => c.teams.includes(team));
                const colorClasses = category?.color === 'blue'
                  ? { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'text-blue-500' }
                  : { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', icon: 'text-purple-500' };
                const isExpanded = expandedTeams.has(team);
                const atRiskCount = teamInitiatives.filter(i => i.status === Status.AtRisk).length;
                
                // Get dependencies for this team from each initiative
                const getDependencyForTeam = (initiative: Initiative): Dependency | undefined => {
                  return initiative.dependencies?.find(dep => dep.team === team);
                };

                return (
                  <div key={team}>
                    {/* Team Header */}
                    <div 
                      className={`px-6 py-4 hover:bg-slate-50 cursor-pointer transition-colors ${
                        atRiskCount > 0 ? 'bg-red-50/30' : ''
                      }`}
                      onClick={() => toggleTeamExpanded(team)}
                    >
                      <div className="flex items-center gap-4">
                        {/* Expand Button */}
                        <button className="p-1 rounded hover:bg-slate-200 transition-colors">
                          {isExpanded ? (
                            <ChevronDown size={16} className="text-slate-400" />
                          ) : (
                            <ChevronRight size={16} className="text-slate-400" />
                          )}
                        </button>

                        {/* Team Icon */}
                        <div className="flex-shrink-0">
                          <Users size={18} className={colorClasses.icon} />
                        </div>

                        {/* Team Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${colorClasses.text}`}>{team}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClasses.bg} ${colorClasses.text}`}>
                              {teamInitiatives.length} initiative{teamInitiatives.length !== 1 ? 's' : ''}
                            </span>
                            {atRiskCount > 0 && (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 flex items-center gap-1">
                                <AlertTriangle size={12} />
                                {atRiskCount} at risk
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {category?.name || 'Other'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Initiatives */}
                    {isExpanded && (
                      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
                        <div className="ml-10 space-y-2">
                          {teamInitiatives.map(initiative => {
                            const dep = getDependencyForTeam(initiative);
                            const depIndex = dep ? initiative.dependencies?.findIndex(d => d.team === team) : -1;
                            const isEditing = depIndex >= 0 && editingDependency?.initiativeId === initiative.id && editingDependency?.depIndex === depIndex;

                            return (
                              <div
                                key={initiative.id}
                                className={`p-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors ${
                                  initiative.status === Status.AtRisk ? 'border-red-200 bg-red-50/30' : ''
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  {/* Status Icon */}
                                  <div className="flex-shrink-0">
                                    {getStatusIcon(initiative.status)}
                                  </div>

                                  {/* Initiative Info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-slate-800 truncate">{initiative.title}</span>
                                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(initiative.status)}`}>
                                        {initiative.status}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                      <span>{getOwnerName(initiative.ownerId)}</span>
                                      <span>•</span>
                                      <span>ETA: {initiative.eta}</span>
                                      {initiative.l1_assetClass && (
                                        <>
                                          <span>•</span>
                                          <span>{initiative.l1_assetClass}</span>
                                        </>
                                      )}
                                    </div>
                                    {dep && (
                                      <div className="mt-2 space-y-1">
                                        {isEditing && editFormData ? (
                                          <div className="space-y-2 p-2 bg-slate-50 rounded border border-slate-200">
                                            <div>
                                              <label className="block text-xs font-medium text-slate-600 mb-1">Deliverable</label>
                                              <textarea
                                                value={editFormData.deliverable}
                                                onChange={(e) => setEditFormData({ ...editFormData, deliverable: e.target.value })}
                                                placeholder={`What deliverable is required from ${dep.team}?`}
                                                className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 resize-none bg-white"
                                                rows={2}
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-xs font-medium text-slate-600 mb-1">ETA</label>
                                              <input
                                                type="date"
                                                value={editFormData.eta}
                                                onChange={(e) => setEditFormData({ ...editFormData, eta: e.target.value })}
                                                className="w-full px-2.5 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white"
                                              />
                                            </div>
                                            <div className="flex items-center gap-2 pt-1">
                                              <button
                                                onClick={saveDependencyEdit}
                                                className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 transition-colors flex items-center gap-1"
                                              >
                                                <Save size={12} />
                                                Save
                                              </button>
                                              <button
                                                onClick={cancelEditingDependency}
                                                className="px-2 py-1 text-xs bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-colors flex items-center gap-1"
                                              >
                                                <XIcon size={12} />
                                                Cancel
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <>
                                            {dep.deliverable && (
                                              <div className="flex items-start gap-1.5 text-xs text-slate-600 p-2 bg-slate-50 rounded border border-slate-200">
                                                <MessageSquare size={12} className="text-slate-400 mt-0.5 flex-shrink-0" />
                                                <span className="italic">"{dep.deliverable}"</span>
                                              </div>
                                            )}
                                            {dep.eta && (
                                              <div className="flex items-center gap-1.5 text-xs text-slate-600 px-2">
                                                <Clock size={12} className="text-slate-400" />
                                                <span>Dependency ETA: {dep.eta}</span>
                                              </div>
                                            )}
                                            {!dep.deliverable && !dep.eta && (
                                              <div className="text-xs text-slate-400 italic px-2">No deliverable or ETA specified</div>
                                            )}
                                            {onInitiativeUpdate && depIndex >= 0 && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  startEditingDependency(initiative.id, depIndex);
                                                }}
                                                className="mt-1 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded border border-slate-200 transition-colors flex items-center gap-1"
                                                title="Edit dependency"
                                              >
                                                <Edit2 size={12} />
                                                Edit Dependency
                                              </button>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Open Button */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onInitiativeClick(initiative);
                                    }}
                                    className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                                    title="Open initiative"
                                  >
                                    <ExternalLink size={16} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
        <h4 className="text-xs font-bold text-slate-600 uppercase mb-3">Team Categories</h4>
        <div className="flex flex-wrap gap-6 text-sm text-slate-600">
          {DEPENDENCY_TEAM_CATEGORIES.map(category => {
            const colorClasses = category.color === 'blue'
              ? { bg: 'bg-blue-100', text: 'text-blue-700' }
              : { bg: 'bg-purple-100', text: 'text-purple-700' };

            return (
              <div key={category.name} className="flex items-center gap-2">
                <div className={`px-2 py-1 rounded text-xs font-medium ${colorClasses.bg} ${colorClasses.text}`}>
              <Users size={12} className="inline mr-1" />
                  {category.name}
            </div>
                <span className="text-slate-500">
                  ({category.teams.join(', ')})
                </span>
          </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
