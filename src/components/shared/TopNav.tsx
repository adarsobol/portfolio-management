import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { LayoutDashboard, Gauge, Calendar, Settings, Zap, LogOut, GitBranch, ChevronDown, AlertTriangle } from 'lucide-react';
import { User as UserType, ViewType, AppConfig, Role } from '../../types';
import { canViewTab, canAccessAdmin } from '../../utils';
import { ValidationResult } from '../../services/weeklyEffortValidation';
import { daysToWeeks, DAYS_PER_WEEK } from '../../utils/effortConverter';

interface TopNavProps {
  currentView: ViewType;
  setCurrentView: (view: ViewType) => void;
  currentUser: UserType;
  config: AppConfig;
  setConfig: (config: AppConfig | ((prev: AppConfig) => AppConfig)) => void;
  onLogout: () => void;
  weeklyEffortFlags?: Map<string, ValidationResult>;
}

export const TopNav: React.FC<TopNavProps> = ({ 
  currentView: _currentView, 
  setCurrentView, 
  currentUser, 
  config,
  setConfig,
  onLogout,
  weeklyEffortFlags
}) => {
  const location = useLocation();
  const canAccessWorkplanHealth = canViewTab(config, currentUser.role, 'accessWorkplanHealth');
  const canAccessAdminPanel = canAccessAdmin(config, currentUser.role);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  
  // Check if current user has an active weekly effort flag
  const hasEffortWarning = currentUser.role === Role.TeamLead && weeklyEffortFlags?.has(currentUser.id);
  
  // Get base capacity (set by admin) and adjustment (set by user)
  const baseCapacityWeeks = config.teamCapacities[currentUser.id] || 0;
  const adjustmentWeeks = config.teamCapacityAdjustments?.[currentUser.id] || 0;
  // adjustmentWeeks is signed: positive = deduct, negative = add
  const adjustedCapacityWeeks = Math.max(0, baseCapacityWeeks - adjustmentWeeks);
  
  // Convert adjustment to weeks and days for display (use absolute value)
  const adjustmentDisplay = useMemo(() => {
    const absWeeks = Math.abs(adjustmentWeeks);
    const wholeWeeks = Math.floor(absWeeks);
    const fractionalWeeks = absWeeks - wholeWeeks;
    const days = Math.round(fractionalWeeks * DAYS_PER_WEEK);
    return { weeks: wholeWeeks, days };
  }, [adjustmentWeeks]);
  
  // Convert base and adjusted capacity for display
  const baseCapacityDisplay = useMemo(() => {
    const wholeWeeks = Math.floor(baseCapacityWeeks);
    const fractionalWeeks = baseCapacityWeeks - wholeWeeks;
    const days = Math.round(fractionalWeeks * DAYS_PER_WEEK);
    return { weeks: wholeWeeks, days };
  }, [baseCapacityWeeks]);
  
  const adjustedCapacityDisplay = useMemo(() => {
    const wholeWeeks = Math.floor(adjustedCapacityWeeks);
    const fractionalWeeks = adjustedCapacityWeeks - wholeWeeks;
    const days = Math.round(fractionalWeeks * DAYS_PER_WEEK);
    return { weeks: wholeWeeks, days };
  }, [adjustedCapacityWeeks]);
  
  // Local state for input values (adjustment)
  const [weeksInput, setWeeksInput] = useState<string>(adjustmentDisplay.weeks.toString());
  const [daysInput, setDaysInput] = useState<string>(adjustmentDisplay.days.toString());
  const [hasChanges, setHasChanges] = useState(false);
  const [showCapacityInput, setShowCapacityInput] = useState(false);
  // Adjustment mode: 'add' for negative adjustment (adds to capacity), 'deduct' for positive (deducts from capacity)
  const [adjustmentMode, setAdjustmentMode] = useState<'add' | 'deduct'>(adjustmentWeeks < 0 ? 'add' : 'deduct');
  
  // Update inputs and mode when adjustment changes externally
  useEffect(() => {
    setWeeksInput(adjustmentDisplay.weeks.toString());
    setDaysInput(adjustmentDisplay.days.toString());
    setAdjustmentMode(adjustmentWeeks < 0 ? 'add' : 'deduct');
    setHasChanges(false);
  }, [adjustmentDisplay, adjustmentWeeks]);
  
  // Handle capacity adjustment update
  const handleCapacityChange = () => {
    const weeks = parseFloat(weeksInput) || 0;
    const days = parseFloat(daysInput) || 0;
    
    // Validate inputs
    if (weeks < 0 || days < 0) {
      return; // Invalid input, don't update
    }
    if (days >= DAYS_PER_WEEK) {
      // Auto-convert excess days to weeks
      const extraWeeks = Math.floor(days / DAYS_PER_WEEK);
      const remainingDays = days % DAYS_PER_WEEK;
      setWeeksInput((weeks + extraWeeks).toString());
      setDaysInput(remainingDays.toString());
      return; // Will trigger re-render and this function again
    }
    
    // Convert to total weeks (adjustment amount)
    const totalAdjustmentWeeks = weeks + daysToWeeks(days);
    // Apply sign based on mode: 'add' = negative (adds to capacity), 'deduct' = positive (deducts from capacity)
    const signedAdjustment = adjustmentMode === 'add' ? -totalAdjustmentWeeks : totalAdjustmentWeeks;
    
    // Update config with adjustment
    setConfig((prev: AppConfig) => ({
      ...prev,
      teamCapacityAdjustments: {
        ...(prev.teamCapacityAdjustments || {}),
        [currentUser.id]: signedAdjustment
      }
    }));
    
    setHasChanges(false);
  };
  
  // Handle input changes
  const handleWeeksChange = (value: string) => {
    setWeeksInput(value);
    setHasChanges(true);
  };
  
  const handleDaysChange = (value: string) => {
    setDaysInput(value);
    setHasChanges(true);
  };
  
  // Check if user has capacity assigned (or allow setting it)
  const hasCapacity = baseCapacityWeeks > 0 || config.teamCapacities.hasOwnProperty(currentUser.id);
  
  // Determine active view from location
  const getActiveView = (): ViewType => {
    if (location.pathname === '/admin') return 'admin';
    if (location.pathname === '/timeline') return 'timeline';
    if (location.pathname === '/workflows') return 'workflows';
    if (location.pathname === '/dependencies') return 'dependencies';
    if (location.pathname === '/resources') return 'resources';
    if (location.pathname.startsWith('/item/')) return 'all';
    return 'all'; // Default
  };
  
  const activeView = getActiveView();
  
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
        activeView === view 
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
          <NavButton view="timeline" icon={Calendar} label="Timeline" activeGradient="from-purple-500 to-purple-600" />
          <NavButton view="workflows" icon={Zap} label="Workflows" activeGradient="from-amber-500 to-amber-600" />
          {canAccessWorkplanHealth && (
            <NavButton view="resources" icon={Gauge} label="Workplan Health" activeGradient="from-cyan-500 to-cyan-600" />
          )}
          {canAccessAdminPanel && (
            <NavButton view="admin" icon={Settings} label="Admin" activeGradient="from-slate-600 to-slate-700" />
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
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-white truncate">{currentUser.name}</p>
              {hasEffortWarning && (
                <div className="relative" title="Weekly effort exceeded threshold">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                </div>
              )}
            </div>
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
              <div className="px-2 py-1.5 space-y-2">
                {/* Capacity Adjustment */}
                {(hasCapacity || true) && (
                  <div className="p-2 bg-slate-800/30 rounded-lg border border-slate-700/50">
                    <button
                      onClick={() => setShowCapacityInput(!showCapacityInput)}
                      className="w-full flex items-center justify-between cursor-pointer group"
                    >
                      <span className="text-xs font-medium text-slate-300 group-hover:text-slate-200 transition-colors">
                        Capacity Adjustment
                      </span>
                      <ChevronDown size={12} className={`text-slate-400 transition-transform ${showCapacityInput ? 'rotate-180' : ''}`} />
                    </button>
                    {showCapacityInput && (
                      <div className="mt-2 pt-2 border-t border-slate-700/50">
                        <div className="mb-2 space-y-1">
                          <p className="text-[10px] text-slate-400 text-center">
                            Base: {baseCapacityDisplay.weeks}w {baseCapacityDisplay.days > 0 ? `${baseCapacityDisplay.days}d` : ''}
                          </p>
                          <p className="text-[10px] text-slate-300 text-center font-medium">
                            Adjusted: {adjustedCapacityDisplay.weeks}w {adjustedCapacityDisplay.days > 0 ? `${adjustedCapacityDisplay.days}d` : ''}
                          </p>
                        </div>
                        {/* Add/Deduct Toggle */}
                        <div className="mb-2 flex gap-1 bg-slate-900/50 rounded-lg p-1 border border-slate-700/50">
                          <button
                            type="button"
                            onClick={() => {
                              setAdjustmentMode('add');
                              // Trigger save if there are input values
                              const weeks = parseFloat(weeksInput) || 0;
                              const days = parseFloat(daysInput) || 0;
                              if (weeks > 0 || days > 0) {
                                setTimeout(() => handleCapacityChange(), 0);
                              }
                            }}
                            className={`flex-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${
                              adjustmentMode === 'add'
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAdjustmentMode('deduct');
                              // Trigger save if there are input values
                              const weeks = parseFloat(weeksInput) || 0;
                              const days = parseFloat(daysInput) || 0;
                              if (weeks > 0 || days > 0) {
                                setTimeout(() => handleCapacityChange(), 0);
                              }
                            }}
                            className={`flex-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${
                              adjustmentMode === 'deduct'
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            Deduct
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <input
                              type="number"
                              min="0"
                              max="60"
                              step="1"
                              value={weeksInput}
                              onChange={(e) => handleWeeksChange(e.target.value)}
                              onBlur={handleCapacityChange}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleCapacityChange();
                                }
                              }}
                              className="w-full px-2 py-1 bg-slate-900/50 border border-slate-700/50 rounded text-white text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              placeholder="0"
                            />
                            <p className="text-[10px] text-slate-500 mt-0.5 text-center">weeks</p>
                          </div>
                          <span className="text-slate-500 text-xs pt-4">/</span>
                          <div className="flex-1">
                            <input
                              type="number"
                              min="0"
                              max="4"
                              step="1"
                              value={daysInput}
                              onChange={(e) => handleDaysChange(e.target.value)}
                              onBlur={handleCapacityChange}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleCapacityChange();
                                }
                              }}
                              className="w-full px-2 py-1 bg-slate-900/50 border border-slate-700/50 rounded text-white text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              placeholder="0"
                            />
                            <p className="text-[10px] text-slate-500 mt-0.5 text-center">days</p>
                          </div>
                        </div>
                        {hasChanges && (
                          <p className="text-[10px] text-amber-400 mt-1 text-center">Press Enter or click outside to save</p>
                        )}
                        <p className="text-[10px] text-slate-500 mt-1 text-center">
                          {adjustmentMode === 'add' ? 'Add to base capacity' : 'Deduct from base capacity'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
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

