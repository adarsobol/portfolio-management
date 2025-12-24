import React, { useState } from 'react';
import { LayoutDashboard, Gauge, Calendar, Settings, Zap, LogOut, GitBranch, ChevronDown } from 'lucide-react';
import { User as UserType, ViewType, AppConfig } from '../../types';
import { canViewTab, canAccessAdmin } from '../../utils';

interface TopNavProps {
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  currentUser: UserType;
  config: AppConfig;
  onLogout: () => void;
  isTeamLeadView: boolean;
  onToggleTeamLeadView: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({ 
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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  
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
      className={`flex items-center space-x-1.5 px-3 py-2 rounded-lg transition-all font-medium text-xs ${
        currentView === view 
          ? `bg-gradient-to-r ${activeGradient} text-white shadow-lg` 
          : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
      }`}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );

  return (
    <nav className="w-full bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 text-white flex items-center justify-between px-3 md:px-4 py-2 sticky top-0 z-30 border-b border-slate-800/50 shadow-md">
      {/* Left side - Logo and Navigation */}
      <div className="flex items-center gap-4 lg:gap-6 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <h1 className="text-base font-black tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">PortfolioMgr</h1>
          <span className="text-[10px] text-slate-500 font-medium hidden lg:inline">Work Plan Management</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap lg:flex-nowrap flex-1 min-w-0">
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
        </div>
      </div>

      {/* Right side - User Menu */}
      <div className="relative">
        <button
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800/50 transition-all"
        >
          <img 
            src={currentUser.avatar} 
            alt={currentUser.name} 
            className="w-7 h-7 rounded-lg ring-2 ring-slate-700 shadow-lg"
          />
          <div className="hidden sm:block text-left">
            <p className="text-xs font-semibold text-white truncate">{currentUser.name}</p>
            <p className="text-[10px] text-slate-500 truncate font-medium">{currentUser.role}</p>
          </div>
          <ChevronDown size={12} className={`text-slate-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown Menu */}
        {userMenuOpen && (
          <>
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setUserMenuOpen(false)}
            />
            <div className="absolute right-0 mt-2 w-56 bg-slate-800 rounded-lg shadow-xl border border-slate-700/50 py-2 z-50">
              <div className="px-3 py-2 border-b border-slate-700/50 sm:hidden">
                <p className="text-xs font-semibold text-white">{currentUser.name}</p>
                <p className="text-[10px] text-slate-500 font-medium">{currentUser.role}</p>
              </div>
              <div className="px-2 py-1.5">
                <div className="p-2 bg-slate-800/30 rounded-lg border border-slate-700/50">
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-300 group-hover:text-slate-200 transition-colors">
                        TL View
                      </span>
                      {isTeamLeadView && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded font-medium">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={isTeamLeadView}
                        onChange={onToggleTeamLeadView}
                        className="sr-only"
                      />
                      <div
                        className={`w-10 h-5 rounded-full transition-colors duration-200 ${
                          isTeamLeadView ? 'bg-indigo-600' : 'bg-slate-700'
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
                            isTeamLeadView ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </div>
                    </div>
                  </label>
                </div>
              </div>
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 mx-2 mt-1 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all text-xs font-medium border border-slate-600/50"
              >
                <LogOut size={12} />
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    </nav>
  );
};

