
import React, { useState } from 'react';
import { Settings, Camera, TrendingUp, History, Download, Trash2, Plus } from 'lucide-react';
import { User, Role, AppConfig, Initiative, Snapshot, ChangeRecord, PermissionKey } from '../types';
import { HIERARCHY } from '../constants';

interface AdminPanelProps {
  currentUser: User;
  config: AppConfig;
  setConfig: (config: any) => void;
  users: User[];
  setUsers: (users: User[]) => void;
  initiatives: Initiative[];
  snapshots: Snapshot[];
  setSnapshots: (snap: any) => void;
  changeLog: ChangeRecord[];
  handleFreezeStatus: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentUser,
  config,
  setConfig,
  users,
  setUsers,
  initiatives,
  snapshots,
  changeLog,
  handleFreezeStatus
}) => {
  const [newUser, setNewUser] = useState<Partial<User>>({ role: Role.TeamLead });

  const isAdminAccess = currentUser.email === 'adar.sobol@pagaya.com';
  if (!isAdminAccess) {
     return <div className="p-10 text-center text-red-500 font-bold">Access Denied</div>;
  }

  const permissionLabels: Record<PermissionKey, string> = {
    createPlanned: 'Create Planned',
    createUnplanned: 'Create Unplanned',
    editOwn: 'Edit Own Tasks',
    editAll: 'Edit All Tasks',
    editUnplanned: 'Edit Unplanned',
    accessAdmin: 'Access Admin',
    manageCapacity: 'Manage Capacity'
  };
  
  const varianceItems = initiatives.filter(i => 
    i.estimatedEffort !== i.originalEstimatedEffort || i.eta !== i.originalEta
  );

  const handlePermissionToggle = (role: Role, key: PermissionKey) => {
    setConfig((prev: AppConfig) => ({
      ...prev,
      rolePermissions: {
        ...prev.rolePermissions,
        [role]: {
          ...prev.rolePermissions[role],
          [key]: !prev.rolePermissions[role][key]
        }
      }
    }));
  };

  const handleAddUser = () => {
    if (!newUser.name || !newUser.email) return;
    const id = 'u_' + Math.random().toString(36).substr(2, 5);
    const user: User = {
      id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role as Role,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(newUser.name)}&background=random`
    };
    setUsers([...users, user]);
    setNewUser({ role: Role.TeamLead });
  };

  const handleDeleteUser = (id: string) => {
    if (id === currentUser.id) {
      alert("You cannot delete yourself.");
      return;
    }
    if (confirm("Are you sure you want to delete this user?")) {
      setUsers(users.filter(u => u.id !== id));
    }
  };

  const getOwnerName = (id?: string) => users.find(u => u.id === id)?.name || 'Unknown';

  const generateCSVReport = (data: Initiative[]) => {
    const sortedData = [...data].sort((a, b) => {
       if (a.l1_assetClass !== b.l1_assetClass) return a.l1_assetClass.localeCompare(b.l1_assetClass);
       if (a.l2_pillar !== b.l2_pillar) return a.l2_pillar.localeCompare(b.l2_pillar);
       return a.l3_responsibility.localeCompare(b.l3_responsibility);
    });

    const headers = [
      'Asset Class', 'Pillar', 'Responsibility', 'L4 Target', 'Initiative Title',
      'Primary Owner', 'Secondary Owner', 'Status', 'Work Type', 'Priority',
      'Quarter', 'Original Effort', 'Current Effort', 'Actual Effort',
      'Original ETA', 'Current ETA', 'Risk/Action Log', 'Last Updated', 'Audit Trail'
    ];

    const escape = (field: any) => {
      const str = String(field || '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvRows = sortedData.map(item => {
       const ownerName = getOwnerName(item.ownerId);
       const auditTrail = item.history 
         ? item.history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
             .map(h => `${new Date(h.timestamp).toLocaleString()} - ${h.changedBy}: Changed ${h.field} from '${h.oldValue}' to '${h.newValue}'`)
             .join('\n')
         : '';

       return [
         item.l1_assetClass, item.l2_pillar, item.l3_responsibility, item.l4_target, item.title,
         ownerName, item.secondaryOwner, item.status, item.workType, item.priority,
         item.quarter, item.originalEstimatedEffort, item.estimatedEffort, item.actualEffort,
         item.originalEta, item.eta, item.riskActionLog, item.lastUpdated, auditTrail
       ].map(escape).join(',');
    });

    return [headers.join(','), ...csvRows].join('\n');
  };

  const handleExportSnapshot = (snapshot: Snapshot) => {
     const csvContent = generateCSVReport(snapshot.data);
     const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
     a.download = `${snapshot.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`;
     a.click();
     URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
        <Settings /> Admin Configuration
      </h2>

      <div className="flex justify-end gap-2">
        <button 
          onClick={handleFreezeStatus}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 shadow-sm"
        >
          <Camera size={16} /> Freeze Status (Snapshot)
        </button>
      </div>

      {/* General Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
         <h3 className="font-bold text-slate-800 mb-4 border-b pb-2">General Settings</h3>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           <div>
             <label className="block text-sm font-medium text-slate-700 mb-1">BAU Buffer Suggestion (%)</label>
             <input 
               type="number" 
               value={config.bauBufferSuggestion}
               onChange={(e) => setConfig((prev: AppConfig) => ({...prev, bauBufferSuggestion: parseInt(e.target.value) || 0}))}
               className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
             />
             <p className="text-xs text-slate-500 mt-1">Recommended buffer percentage for unplanned work.</p>
           </div>
         </div>
      </div>
      
      {/* Baseline Variance Report */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
           <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
             <h3 className="font-bold text-slate-800 flex items-center gap-2"><TrendingUp size={16} /> Baseline Variance Report</h3>
             <p className="text-xs text-slate-500 mt-1">Comparing current status against original planning baseline.</p>
           </div>
           <div className="max-h-60 overflow-y-auto">
             <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500">Initiative</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500">Original Effort</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500">Current Effort</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500">Variance</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500">Original ETA</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500">Current ETA</th>
                  </tr>
                </thead>
                <tbody>
                  {varianceItems.length === 0 ? (
                    <tr><td colSpan={6} className="p-4 text-center text-slate-400 text-xs">No variance from baseline found.</td></tr>
                  ) : varianceItems.map(item => {
                     const effortDiff = item.estimatedEffort - item.originalEstimatedEffort;
                     return (
                      <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium truncate max-w-[200px]" title={item.title}>{item.title}</td>
                        <td className="px-4 py-2 text-slate-500">{item.originalEstimatedEffort}w</td>
                        <td className="px-4 py-2 font-medium">{item.estimatedEffort}w</td>
                        <td className={`px-4 py-2 text-xs font-bold ${effortDiff > 0 ? 'text-red-500' : effortDiff < 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                           {effortDiff > 0 ? '+' : ''}{effortDiff}w
                        </td>
                        <td className="px-4 py-2 text-slate-500 text-xs">{item.originalEta}</td>
                        <td className={`px-4 py-2 text-xs ${item.eta !== item.originalEta ? 'text-blue-600 font-medium' : ''}`}>{item.eta}</td>
                      </tr>
                     )
                  })}
                </tbody>
             </table>
           </div>
      </div>
      
      {/* Snapshots & Audit */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Snapshots */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
           <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
             <h3 className="font-bold text-slate-800 flex items-center gap-2"><Camera size={16} /> Status Snapshots</h3>
           </div>
           <div className="max-h-60 overflow-y-auto">
             <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500">Name</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500">Date</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500">Items</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.length === 0 ? (
                    <tr><td colSpan={4} className="p-4 text-center text-slate-400 text-xs">No snapshots taken yet.</td></tr>
                  ) : snapshots.map(snap => (
                    <tr key={snap.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2 truncate max-w-[150px]">{snap.name}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{new Date(snap.timestamp).toLocaleDateString()}</td>
                      <td className="px-4 py-2 text-xs">{snap.data.length}</td>
                      <td className="px-4 py-2 text-right">
                        <button onClick={() => handleExportSnapshot(snap)} className="text-blue-600 hover:text-blue-800" title="Export">
                          <Download size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
             </table>
           </div>
        </div>
        
        {/* Change Log */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
           <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
             <h3 className="font-bold text-slate-800 flex items-center gap-2"><History size={16} /> Recent Changes (Audit Log)</h3>
           </div>
           <div className="max-h-60 overflow-y-auto">
             <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500">Initiative</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500">Change</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500">By</th>
                  </tr>
                </thead>
                <tbody>
                  {changeLog.length === 0 ? (
                    <tr><td colSpan={3} className="p-4 text-center text-slate-400 text-xs">No recorded changes in this session.</td></tr>
                  ) : changeLog.map(log => (
                    <tr key={log.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2 truncate max-w-[150px]" title={log.initiativeTitle}>{log.initiativeTitle}</td>
                      <td className="px-4 py-2 text-xs">
                        <span className="font-semibold text-slate-700">{log.field}:</span> 
                        <span className="text-red-500 mx-1">{log.oldValue}</span>
                        &rarr;
                        <span className="text-emerald-500 mx-1">{log.newValue}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">{log.changedBy}</td>
                    </tr>
                  ))}
                </tbody>
             </table>
           </div>
        </div>
      </div>

      {/* User Management */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
         <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
           <div>
             <h3 className="font-bold text-slate-800">User Management</h3>
             <p className="text-xs text-slate-500 mt-1">Add, edit, or remove users and assign roles.</p>
           </div>
         </div>
         
         <div className="p-4 bg-slate-50 border-b border-slate-100 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
           <div>
             <label className="block text-xs font-medium text-slate-500 mb-1">Full Name</label>
             <input 
               type="text" 
               placeholder="Jane Doe"
               value={newUser.name || ''}
               onChange={(e) => setNewUser(prev => ({...prev, name: e.target.value}))}
               className="w-full text-sm rounded border-slate-300 p-2"
             />
           </div>
           <div>
             <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
             <input 
               type="email" 
               placeholder="jane@company.com"
               value={newUser.email || ''}
               onChange={(e) => setNewUser(prev => ({...prev, email: e.target.value}))}
               className="w-full text-sm rounded border-slate-300 p-2"
             />
           </div>
           <div>
             <label className="block text-xs font-medium text-slate-500 mb-1">Role</label>
             <select 
               value={newUser.role}
               onChange={(e) => setNewUser(prev => ({...prev, role: e.target.value as Role}))}
               className="w-full text-sm rounded border-slate-300 p-2"
             >
               {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
             </select>
           </div>
           <button 
             onClick={handleAddUser}
             disabled={!newUser.name || !newUser.email}
             className="bg-blue-600 text-white text-sm px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
           >
             <Plus size={16} /> Add User
           </button>
         </div>

         <div className="max-h-80 overflow-y-auto custom-scrollbar">
           <table className="w-full text-left text-sm">
             <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
               <tr>
                 <th className="px-6 py-3 font-semibold text-slate-600">User</th>
                 <th className="px-6 py-3 font-semibold text-slate-600">Email</th>
                 <th className="px-6 py-3 font-semibold text-slate-600">Role</th>
                 <th className="px-6 py-3 font-semibold text-slate-600 text-right">Actions</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
               {users.map(u => (
                 <tr key={u.id} className="hover:bg-slate-50">
                   <td className="px-6 py-3 font-medium flex items-center gap-2">
                     <img src={u.avatar} alt={u.name} className="w-6 h-6 rounded-full bg-slate-200" />
                     {u.name}
                   </td>
                   <td className="px-6 py-3 text-slate-500">{u.email}</td>
                   <td className="px-6 py-3">
                     <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs border border-slate-200">
                       {u.role}
                     </span>
                   </td>
                   <td className="px-6 py-3 text-right">
                     <button 
                       onClick={() => handleDeleteUser(u.id)}
                       className="text-slate-400 hover:text-red-500 transition-colors"
                       title="Remove User"
                     >
                       <Trash2 size={16} />
                     </button>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>
      </div>

      {/* Authorization Matrix */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
         <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
           <h3 className="font-bold text-slate-800">Authorization Levels Management Center</h3>
           <p className="text-xs text-slate-500 mt-1">Define granular permissions for each user role.</p>
         </div>
         <div className="overflow-x-auto">
           <table className="w-full text-left text-sm">
             <thead className="bg-slate-50 border-b border-slate-200">
               <tr>
                 <th className="px-6 py-3 font-semibold text-slate-600">Role</th>
                 {Object.keys(permissionLabels).map(key => (
                   <th key={key} className="px-6 py-3 font-semibold text-slate-600 whitespace-nowrap">
                     {permissionLabels[key as PermissionKey]}
                   </th>
                 ))}
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
               {Object.values(Role).map(role => (
                 <tr key={role} className="hover:bg-slate-50">
                   <td className="px-6 py-3 font-medium bg-white sticky left-0">{role}</td>
                   {Object.keys(permissionLabels).map(key => {
                     const pKey = key as PermissionKey;
                     const isChecked = config.rolePermissions[role][pKey];
                     return (
                       <td key={key} className="px-6 py-3 text-center">
                         <input 
                           type="checkbox" 
                           checked={isChecked}
                           onChange={() => handlePermissionToggle(role, pKey)}
                           className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                         />
                       </td>
                     );
                   })}
                 </tr>
               ))}
             </tbody>
           </table>
         </div>
      </div>

      {/* Capacity Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
         <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
           <h3 className="font-bold text-slate-800">Team Capacity Planning</h3>
           <p className="text-xs text-slate-500 mt-1">Set the weekly capacity (in staff weeks) for each Team Lead.</p>
         </div>
         <table className="w-full text-left text-sm">
           <thead className="bg-slate-50 border-b border-slate-200">
             <tr>
               <th className="px-6 py-3 font-semibold text-slate-600">Team Lead</th>
               <th className="px-6 py-3 font-semibold text-slate-600">Capacity (wks)</th>
               <th className="px-6 py-3 font-semibold text-slate-600">Assigned Load</th>
               <th className="px-6 py-3 font-semibold text-slate-600">Utilization</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-100">
             {users.filter(u => u.role === Role.TeamLead).map(user => {
               const capacity = config.teamCapacities[user.id] || 0;
               const load = initiatives.filter(i => i.ownerId === user.id).reduce((sum, i) => sum + i.estimatedEffort, 0);
               const utilization = capacity > 0 ? Math.round((load / capacity) * 100) : 0;
               let utilColor = 'text-emerald-600';
               if (utilization > 80) utilColor = 'text-amber-600';
               if (utilization > 100) utilColor = 'text-red-600 font-bold';

               return (
                 <tr key={user.id} className="hover:bg-slate-50">
                   <td className="px-6 py-3 font-medium flex items-center gap-2">
                     <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                        {user.name.charAt(0)}
                     </div>
                     {user.name}
                   </td>
                   <td className="px-6 py-3">
                     <input 
                       type="number" 
                       className="w-24 px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                       value={capacity}
                       onChange={(e) => setConfig((prev: AppConfig) => ({...prev, teamCapacities: {...prev.teamCapacities, [user.id]: parseFloat(e.target.value)||0}}))}
                     />
                   </td>
                   <td className="px-6 py-3">{load} wks</td>
                   <td className={`px-6 py-3 ${utilColor}`}>{utilization}%</td>
                 </tr>
               );
             })}
           </tbody>
         </table>
      </div>
    </div>
  );
};
