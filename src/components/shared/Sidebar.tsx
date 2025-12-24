import React from 'react';
import { LayoutDashboard, Gauge, Calendar, Settings, Zap, LogOut, GitBranch } from 'lucide-react';
import { User, ViewType, AppConfig } from '../../types';
import { TeamLeadViewToggle } from './TeamLeadViewToggle';
import { canViewTab, canAccessAdmin } from '../../utils';

interface SidebarProps {
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  currentUser: User;
  config: AppConfig;
  onLogout: () => void;
  isTeamLeadView: boolean;
  onToggleTeamLeadView: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  setCurrentView, 
  currentUser, 
  config,
  onLogout,
  isTeamLeadView,
  onToggleTeamLeadView
}) => {
  const canAccessWorkplanHealth = canViewTab(config, currentUser.role, 'accessWorkplanHealth');
  const canAccessAdminPanel = canAccessAdmin(config, currentUser.role);
  
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
      className={`w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-all font-medium text-sm ${
        currentView === view 
          ? `bg-gradient-to-r ${activeGradient} text-white shadow-lg` 
          : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
      }`}
    >
      <Icon size={16} />
      <span className="text-xs">{label}</span>
    </button>
  );

  return (
    <aside className="w-full md:w-52 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white flex flex-col sticky top-0 md:h-screen z-20">
      <div className="px-4 py-3 border-b border-slate-800/50">
        <h1 className="text-base font-black tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">PortfolioMgr</h1>
        <p className="text-[10px] text-slate-500 mt-0.5 font-medium">Work Plan Management</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        <NavButton view="all" icon={LayoutDashboard} label="All Tasks" activeGradient="from-blue-500 to-blue-600" />
        <NavButton view="dependencies" icon={GitBranch} label="Dependencies" activeGradient="from-indigo-500 to-indigo-600" />
        {!isTeamLeadView && (
          <>
            <NavButton view="timeline" icon={Calendar} label="Timeline" activeGradient="from-purple-500 to-purple-600" />
            <NavButton view="workflows" icon={Zap} label="Workflows" activeGradient="from-amber-500 to-amber-600" />
            {canAccessWorkplanHealth && (
              <NavButton view="resources" icon={Gauge} label="Workplan Health" activeGradient="from-cyan-500 to-cyan-600" />
            )}
            {canAccessAdminPanel && (
              <NavButton view="admin" icon={Settings} label="Admin" activeGradient="from-slate-600 to-slate-700" />
            )}
          </>
        )}
      </nav>
      <div className="p-3 border-t border-slate-800/50 bg-slate-950/50">
        <div className="flex items-center gap-2.5 mb-3 p-1.5 bg-slate-800/30 rounded-lg">
          <img 
            src={currentUser.avatar} 
            alt={currentUser.name} 
            className="w-9 h-9 rounded-lg ring-2 ring-slate-700 shadow-lg"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{currentUser.name}</p>
            <p className="text-[10px] text-slate-500 truncate font-medium">{currentUser.role}</p>
          </div>
        </div>
        <TeamLeadViewToggle 
          isEnabled={isTeamLeadView}
          onToggle={onToggleTeamLeadView}
        />
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 rounded-lg transition-all text-xs font-medium border border-slate-700/50"
        >
            <LogOut size={12} />
          Sign Out
        </button>
      </div>
    </aside>
  );
};
