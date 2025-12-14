import React from 'react';
import { LayoutDashboard, Gauge, Calendar, Settings, Zap, LogOut, GitBranch } from 'lucide-react';
import { User, ViewType, AppConfig } from '../../types';

interface SidebarProps {
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  currentUser: User;
  config: AppConfig;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  setCurrentView, 
  currentUser, 
  config,
  onLogout 
}) => {
  const canAccessWorkplanHealth = config.rolePermissions[currentUser.role]?.accessWorkplanHealth ?? false;
  const NavButton = ({ 
    view, 
    icon: Icon, 
    label, 
    activeGradient 
  }: { 
    view: ViewType; 
    icon: React.ElementType; 
    label: string; 
    activeGradient: string;
  }) => (
    <button 
      onClick={() => setCurrentView(view)} 
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all font-medium ${
        currentView === view 
          ? `bg-gradient-to-r ${activeGradient} text-white shadow-lg` 
          : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
      }`}
    >
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );

  return (
    <aside className="w-full md:w-64 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white flex flex-col sticky top-0 md:h-screen z-20">
      <div className="p-6 border-b border-slate-800/50">
        <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">PortfolioMgr</h1>
        <p className="text-xs text-slate-500 mt-1 font-medium">Work Plan Management</p>
      </div>
      <nav className="flex-1 p-4 space-y-1.5">
        <NavButton view="all" icon={LayoutDashboard} label="All Tasks" activeGradient="from-blue-500 to-blue-600" />
        <NavButton view="dependencies" icon={GitBranch} label="Dependencies" activeGradient="from-indigo-500 to-indigo-600" />
        <NavButton view="timeline" icon={Calendar} label="Timeline" activeGradient="from-purple-500 to-purple-600" />
        <NavButton view="workflows" icon={Zap} label="Workflows" activeGradient="from-amber-500 to-amber-600" />
        {canAccessWorkplanHealth && (
          <NavButton view="resources" icon={Gauge} label="Workplan Health" activeGradient="from-cyan-500 to-cyan-600" />
        )}
        <NavButton view="admin" icon={Settings} label="Admin" activeGradient="from-slate-600 to-slate-700" />
      </nav>
      <div className="p-4 border-t border-slate-800/50 bg-slate-950/50">
        <div className="flex items-center gap-3 mb-4 p-2 bg-slate-800/30 rounded-xl">
          <img 
            src={currentUser.avatar} 
            alt={currentUser.name} 
            className="w-10 h-10 rounded-xl ring-2 ring-slate-700 shadow-lg"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{currentUser.name}</p>
            <p className="text-xs text-slate-500 truncate font-medium">{currentUser.role}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 rounded-xl transition-all text-sm font-medium border border-slate-700/50"
        >
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  );
};
