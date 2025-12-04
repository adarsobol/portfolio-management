
import React from 'react';
import { LayoutDashboard, Monitor, Calendar, Settings } from 'lucide-react';
import { User } from '../types';

interface SidebarProps {
  currentView: string;
  setCurrentView: (view: any) => void;
  currentUser: User;
  setCurrentUser: (user: User) => void;
  users: User[];
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  setCurrentView, 
  currentUser, 
  setCurrentUser, 
  users 
}) => {
  return (
    <aside className="w-full md:w-64 bg-slate-900 text-white flex flex-col sticky top-0 md:h-screen z-20">
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold tracking-tight">PortfolioMgr</h1>
        <p className="text-xs text-slate-400 mt-1">Work Plan Management</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        <button onClick={() => setCurrentView('all')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'all' ? 'bg-blue-600' : 'text-slate-300 hover:bg-slate-800'}`}>
          <LayoutDashboard size={20} /><span>All Tasks</span>
        </button>
        <button onClick={() => setCurrentView('resources')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'resources' ? 'bg-cyan-600' : 'text-slate-300 hover:bg-slate-800'}`}>
          <Monitor size={20} /><span>Resources</span>
        </button>
        <button onClick={() => setCurrentView('timeline')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'timeline' ? 'bg-purple-600' : 'text-slate-300 hover:bg-slate-800'}`}>
          <Calendar size={20} /><span>Timeline</span>
        </button>
        <button onClick={() => setCurrentView('admin')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${currentView === 'admin' ? 'bg-slate-700' : 'text-slate-300 hover:bg-slate-800'}`}>
          <Settings size={20} /><span>Admin</span>
        </button>
      </nav>
      <div className="p-4 border-t border-slate-800">
         <div className="text-xs uppercase text-slate-500 font-bold mb-2">Simulate User</div>
         <select 
          value={currentUser.id}
          onChange={(e) => setCurrentUser(users.find(u => u.id === e.target.value) || users[0])}
          className="w-full bg-slate-800 text-white text-sm rounded px-3 py-2 border-none"
         >
          {users.map(u => <option key={u.id} value={u.id}>{u.role} - {u.name}</option>)}
         </select>
      </div>
    </aside>
  );
};
