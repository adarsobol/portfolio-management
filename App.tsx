import React, { useState, useMemo, useEffect } from 'react';
import { Search, Plus } from 'lucide-react';

import { USERS, INITIAL_INITIATIVES, INITIAL_CONFIG } from './constants';
import { Initiative, Role, Status, WorkType, UnplannedTag, AppConfig, ChangeRecord, Snapshot, TradeOffAction, User } from './types';
import InitiativeModal from './components/InitiativeModal';

// Components
import { Sidebar } from './components/Sidebar';
import { FilterBar } from './components/FilterBar';
import { MetricsDashboard } from './components/MetricsDashboard';
import { ResourcesDashboard } from './components/ResourcesDashboard';
import { TaskTable } from './components/TaskTable';
import { TaskTree } from './components/TaskTree';
import { CalendarView } from './components/CalendarView';
import { AdminPanel } from './components/AdminPanel';

export default function App() {
  // State for Users (now editable)
  const [users, setUsers] = useState<User[]>(USERS);
  
  const defaultUser = users.find(u => u.email === 'adar.sobol@pagaya.com') || users[0];
  const [currentUser, setCurrentUser] = useState<User>(defaultUser); 
  
  const [initiatives, setInitiatives] = useState<Initiative[]>(INITIAL_INITIATIVES);
  const [config, setConfig] = useState<AppConfig>(INITIAL_CONFIG);
  
  // Audit & Snapshot State
  const [changeLog, setChangeLog] = useState<ChangeRecord[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  // Initialize changelog from mock data history
  useEffect(() => {
    const historyChanges = INITIAL_INITIATIVES.flatMap(i => i.history || []);
    if (historyChanges.length > 0) {
      // sort by date desc
      historyChanges.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setChangeLog(historyChanges);
    }
  }, []);

  // View State
  const [currentView, setCurrentView] = useState<'all' | 'resources' | 'timeline' | 'admin'>('all');
  const [viewLayout, setViewLayout] = useState<'table' | 'tree'>('table'); 
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter State
  const [filterAssetClass, setFilterAssetClass] = useState<string>('');
  const [filterPillar, setFilterPillar] = useState<string>('');
  const [filterResponsibility, setFilterResponsibility] = useState<string>('');
  const [filterOwners, setFilterOwners] = useState<string[]>([]);
  const [filterWorkType, setFilterWorkType] = useState<string>('');

  // Sort State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  
  // Calendar State
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Initiative | null>(null);

  // --- Auto-Status Logic ---
  useEffect(() => {
    // Run rules to auto-update statuses
    const today = new Date().toISOString().split('T')[0];
    let hasChanges = false;
    
    const updated = initiatives.map(item => {
      let newItem = { ...item };
      let changed = false;

      // Rule 1: Actual Effort > 0 & Planned -> In Progress
      if (item.actualEffort > 0 && item.status === Status.Planned) {
        newItem.status = Status.InProgress;
        changed = true;
      }

      // Rule 2: Today > ETA & Not Complete -> Delayed
      if (item.eta < today && item.status !== Status.Complete && item.status !== Status.Delayed) {
        newItem.status = Status.Delayed;
        newItem.isAtRisk = true; 
        changed = true;
      }

      if (changed) hasChanges = true;
      return newItem;
    });

    if (JSON.stringify(updated) !== JSON.stringify(initiatives)) {
       setInitiatives(updated);
    }
  }, []);

  // Derived Data
  const userPermissions = config.rolePermissions[currentUser.role];
  const canCreate = userPermissions.createPlanned || userPermissions.createUnplanned;

  const getOwnerName = (id?: string) => users.find(u => u.id === id)?.name || 'Unknown';

  const filteredInitiatives = useMemo(() => {
    let data = [...initiatives];

    if (filterAssetClass) data = data.filter(i => i.l1_assetClass === filterAssetClass);
    if (filterPillar) data = data.filter(i => i.l2_pillar === filterPillar);
    if (filterResponsibility) data = data.filter(i => i.l3_responsibility === filterResponsibility);
    if (filterOwners.length > 0) data = data.filter(i => filterOwners.includes(i.ownerId));
    if (filterWorkType) {
      if (filterWorkType === 'Planned') data = data.filter(i => i.workType === WorkType.Planned);
      else if (filterWorkType === 'Unplanned') data = data.filter(i => i.workType === WorkType.Unplanned);
      else data = data.filter(i => i.workType === WorkType.Unplanned && i.unplannedTags?.includes(filterWorkType as UnplannedTag));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(i => 
        i.title.toLowerCase().includes(q) || 
        i.ownerId.toLowerCase().includes(q) ||
        (i.secondaryOwner && i.secondaryOwner.toLowerCase().includes(q)) ||
        i.l2_pillar.toLowerCase().includes(q)
      );
    }

    // Sorting Logic
    if (sortConfig) {
      data.sort((a, b) => {
        let aValue: any = '';
        let bValue: any = '';

        switch (sortConfig.key) {
          case 'owner':
            aValue = getOwnerName(a.ownerId).toLowerCase();
            bValue = getOwnerName(b.ownerId).toLowerCase();
            break;
          case 'priority':
            aValue = a.priority;
            bValue = b.priority;
            break;
          default:
            aValue = (a as any)[sortConfig.key];
            bValue = (b as any)[sortConfig.key];
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return data;
  }, [initiatives, searchQuery, filterAssetClass, filterPillar, filterResponsibility, filterOwners, filterWorkType, sortConfig, users]);

  const metrics = useMemo(() => {
    const totalEst = filteredInitiatives.reduce((sum, i) => sum + i.estimatedEffort, 0);
    const totalAct = filteredInitiatives.reduce((sum, i) => sum + i.actualEffort, 0);
    
    let relevantOwners: string[] = [];
    if (filterOwners.length > 0) {
      relevantOwners = filterOwners;
    } else {
      relevantOwners = Object.keys(config.teamCapacities);
    }

    const totalCapacity = relevantOwners.reduce((sum, id) => sum + (config.teamCapacities[id] || 0), 0);
    const capacityLoad = totalCapacity > 0 ? (totalEst / totalCapacity) * 100 : 0;
    const usage = totalEst > 0 ? (totalAct / totalEst) * 100 : 0;
    
    const countPlanned = filteredInitiatives.filter(i => i.status === Status.Planned).length;
    const countInProgress = filteredInitiatives.filter(i => i.status === Status.InProgress).length;
    const countDelayed = filteredInitiatives.filter(i => i.status === Status.Delayed).length;
    const countComplete = filteredInitiatives.filter(i => i.status === Status.Complete).length;
    
    const plannedItems = filteredInitiatives.filter(i => i.workType === WorkType.Planned);
    const unplannedItems = filteredInitiatives.filter(i => i.workType === WorkType.Unplanned);
    
    const countPlannedWork = plannedItems.length;
    const countUnplannedWork = unplannedItems.length;

    const effortPlanned = plannedItems.reduce((sum, i) => sum + i.estimatedEffort, 0);
    const effortUnplanned = unplannedItems.reduce((sum, i) => sum + i.estimatedEffort, 0);

    const bauBufferTotal = (totalCapacity * config.bauBufferSuggestion) / 100;
    const unplannedActuals = filteredInitiatives
      .filter(i => i.workType === WorkType.Unplanned)
      .reduce((sum, i) => sum + i.actualEffort, 0);
    
    const bauRemaining = bauBufferTotal - unplannedActuals;
    const bauHealth = bauBufferTotal > 0 ? (bauRemaining / bauBufferTotal) * 100 : 0;

    return {
      usage,
      capacityLoad,
      totalCapacity,
      totalEst,
      totalAct,
      countDelayed,
      countUnplanned: filteredInitiatives.filter(i => i.workType === WorkType.Unplanned).length,
      countOpen: countPlanned + countInProgress + countDelayed,
      totalCount: filteredInitiatives.length,
      bauBufferTotal,
      unplannedActuals,
      bauHealth,
      statusBreakdown: [
        { name: 'On Track', value: countPlanned + countInProgress, color: '#3b82f6' },
        { name: 'Delayed', value: countDelayed, color: '#ef4444' },
        { name: 'Complete', value: countComplete, color: '#10b981' }
      ],
      workMix: [
         { name: 'Planned', value: countPlannedWork, effort: effortPlanned, color: '#3b82f6' },
         { name: 'Unplanned', value: countUnplannedWork, effort: effortUnplanned, color: '#f59e0b' }
      ]
    };
  }, [filteredInitiatives, config.teamCapacities, filterOwners, config.bauBufferSuggestion]);

  // Actions
  const recordChange = (initiative: Initiative, field: string, oldValue: any, newValue: any): ChangeRecord => {
    return {
      id: Math.random().toString(36).substr(2, 9),
      initiativeId: initiative.id,
      initiativeTitle: initiative.title,
      field,
      oldValue,
      newValue,
      changedBy: currentUser.name,
      timestamp: new Date().toISOString()
    };
  };

  const handleSave = (item: Initiative, tradeOffAction?: TradeOffAction) => {
    const today = new Date().toISOString().split('T')[0];
    
    if (item.actualEffort > 0 && item.status === Status.Planned) item.status = Status.InProgress;
    if (item.eta < today && item.status !== Status.Complete && item.status !== Status.Delayed) {
      item.status = Status.Delayed;
      item.isAtRisk = true;
    }

    setInitiatives(prev => {
      let nextInitiatives = [...prev];
      const existingIndex = nextInitiatives.findIndex(i => i.id === item.id);
      
      if (existingIndex > -1) {
        const existing = nextInitiatives[existingIndex];
        const changes: ChangeRecord[] = [];
        if (existing.estimatedEffort !== item.estimatedEffort) {
          changes.push(recordChange(existing, 'Effort', existing.estimatedEffort, item.estimatedEffort));
        }
        if (existing.eta !== item.eta) {
           changes.push(recordChange(existing, 'ETA', existing.eta, item.eta));
        }

        if (changes.length > 0) {
          setChangeLog(prevLog => [...changes, ...prevLog]);
          item.history = [...(existing.history || []), ...changes];
        } else {
          item.history = existing.history;
        }

        nextInitiatives[existingIndex] = item;
      } else {
        nextInitiatives.push(item);
      }

      if (tradeOffAction) {
        const targetIndex = nextInitiatives.findIndex(i => i.id === tradeOffAction.targetInitiativeId);
        if (targetIndex > -1) {
          const target = nextInitiatives[targetIndex];
          const fieldMap = { 'status': 'Status', 'eta': 'ETA', 'priority': 'Priority' };
          const fieldLabel = fieldMap[tradeOffAction.field];
          const oldValue = target[tradeOffAction.field];
          
          const updatedTarget = { 
            ...target, 
            [tradeOffAction.field]: tradeOffAction.newValue,
            lastUpdated: today
          };

          const changeRecord = recordChange(target, fieldLabel, oldValue, tradeOffAction.newValue);
          updatedTarget.history = [...(target.history || []), changeRecord];
          setChangeLog(prevLog => [changeRecord, ...prevLog]);
          nextInitiatives[targetIndex] = updatedTarget;
        }
      }
      return nextInitiatives;
    });
  };

  const handleInlineUpdate = (id: string, field: keyof Initiative, value: any) => {
    setInitiatives(prev => prev.map(i => {
      if (i.id === id) {
        const oldValue = i[field];
        if (oldValue !== value && (field === 'estimatedEffort' || field === 'eta')) {
           const change = recordChange(i, field === 'estimatedEffort' ? 'Effort' : 'ETA', oldValue, value);
           setChangeLog(prevLog => [change, ...prevLog]);
           i.history = [...(i.history || []), change];
        }
        const updated = { ...i, [field]: value, lastUpdated: new Date().toISOString().split('T')[0] };
        if (updated.actualEffort > 0 && updated.status === Status.Planned) updated.status = Status.InProgress;
        return updated;
      }
      return i;
    }));
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleFreezeStatus = () => {
    const snapshot: Snapshot = {
      id: Math.random().toString(36).substr(2, 9),
      name: `Status Report - ${new Date().toLocaleString()}`,
      timestamp: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(initiatives)),
      config: JSON.parse(JSON.stringify(config)),
      createdBy: currentUser.name
    };
    setSnapshots(prev => [snapshot, ...prev]);
    alert("Status frozen successfully.");
  };

  const resetFilters = () => {
    setFilterAssetClass('');
    setFilterPillar('');
    setFilterResponsibility('');
    setFilterOwners([]);
    setFilterWorkType('');
    setSearchQuery('');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      <Sidebar 
        currentView={currentView} 
        setCurrentView={setCurrentView} 
        currentUser={currentUser} 
        setCurrentUser={setCurrentUser} 
        users={users} 
      />

      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
             <h2 className="text-2xl font-bold text-slate-800 capitalize">
               {currentView === 'all' ? 'Comprehensive Dashboard' : 
                currentView === 'resources' ? 'Resources Monitoring' : currentView}
             </h2>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" placeholder="Search..." 
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            {canCreate && (
              <button onClick={() => { setEditingItem(null); setIsModalOpen(true); }} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <Plus size={16} /><span>New</span>
              </button>
            )}
          </div>
        </div>

        {currentView === 'admin' ? (
          <AdminPanel 
            currentUser={currentUser}
            config={config}
            setConfig={setConfig}
            users={users}
            setUsers={setUsers}
            initiatives={initiatives}
            snapshots={snapshots}
            setSnapshots={setSnapshots}
            changeLog={changeLog}
            handleFreezeStatus={handleFreezeStatus}
          />
        ) : (
           <>
             {currentView === 'all' && (
                <MetricsDashboard 
                  metrics={metrics} 
                  filteredInitiatives={filteredInitiatives} 
                />
             )}
             
             <FilterBar 
                filterAssetClass={filterAssetClass} setFilterAssetClass={setFilterAssetClass}
                filterPillar={filterPillar} setFilterPillar={setFilterPillar}
                filterResponsibility={filterResponsibility} setFilterResponsibility={setFilterResponsibility}
                filterOwners={filterOwners} setFilterOwners={setFilterOwners}
                filterWorkType={filterWorkType} setFilterWorkType={setFilterWorkType}
                searchQuery={searchQuery} resetFilters={resetFilters}
                currentView={currentView} viewLayout={viewLayout} setViewLayout={setViewLayout}
                users={users}
             />

             {currentView === 'resources' ? (
               <ResourcesDashboard 
                 filteredInitiatives={filteredInitiatives} 
                 config={config} 
                 users={users} 
               />
             ) : currentView === 'timeline' ? (
               <CalendarView 
                 filteredInitiatives={filteredInitiatives}
                 handleInlineUpdate={handleInlineUpdate}
                 setEditingItem={setEditingItem}
                 setIsModalOpen={setIsModalOpen}
                 calendarDate={calendarDate}
                 setCalendarDate={setCalendarDate}
               />
             ) : (
               viewLayout === 'tree' ? (
                 <TaskTree 
                   filteredInitiatives={filteredInitiatives}
                   users={users}
                   setEditingItem={setEditingItem}
                   setIsModalOpen={setIsModalOpen}
                 />
               ) : (
                 <TaskTable 
                   filteredInitiatives={filteredInitiatives}
                   handleInlineUpdate={handleInlineUpdate}
                   setEditingItem={setEditingItem}
                   setIsModalOpen={setIsModalOpen}
                   sortConfig={sortConfig}
                   handleSort={handleSort}
                   users={users}
                   currentUser={currentUser}
                   config={config}
                 />
               )
             )}
           </>
        )}
      </main>

      <InitiativeModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        currentUser={currentUser}
        initiativeToEdit={editingItem}
        rolePermissions={config.rolePermissions}
        users={users}
        allInitiatives={initiatives}
      />
    </div>
  );
}