import { useState, useEffect } from 'react';
import { Users, Circle, Eye } from 'lucide-react';
import { realtimeService, UserPresence } from '../../services/realtimeService';

interface PresenceIndicatorProps {
  currentUserId: string;
}

export function PresenceIndicator({ currentUserId }: PresenceIndicatorProps) {
  const [onlineUsers, setOnlineUsers] = useState<UserPresence[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const unsubscribe = realtimeService.onPresenceUpdate((users) => {
      // Filter out current user
      setOnlineUsers(users.filter(u => u.id !== currentUserId));
    });

    return unsubscribe;
  }, [currentUserId]);

  if (onlineUsers.length === 0) {
    return null;
  }

  const viewLabels: Record<string, string> = {
    'all': 'Dashboard',
    'resources': 'Workplan Health',
    'timeline': 'Calendar',
    'admin': 'Admin',
    'workflows': 'Workflows',
    'dependencies': 'Dependencies'
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-sm font-medium transition-colors border border-emerald-200"
      >
        <div className="relative">
          <Users size={16} />
          <Circle 
            size={8} 
            className="absolute -top-1 -right-1 fill-emerald-500 text-emerald-500" 
          />
        </div>
        <span>{onlineUsers.length} online</span>
      </button>

      {isExpanded && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-3 py-2 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-600 tracking-wide">
              Online team members
            </h3>
          </div>
          
          <div className="max-h-64 overflow-y-auto">
            {onlineUsers.map((user) => (
              <div 
                key={user.id} 
                className="px-3 py-2 hover:bg-slate-50 flex items-center gap-3"
              >
                <div className="relative">
                  {user.avatar ? (
                    <img 
                      src={user.avatar} 
                      alt={user.name}
                      className="w-8 h-8 rounded-full object-cover border-2 border-emerald-300"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center border-2 border-emerald-300">
                      <span className="text-xs font-bold text-emerald-700">
                        {user.name.charAt(0)}
                      </span>
                    </div>
                  )}
                  <Circle 
                    size={10} 
                    className="absolute -bottom-0.5 -right-0.5 fill-emerald-500 text-emerald-500 border border-white rounded-full" 
                  />
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {user.name}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Eye size={10} />
                    <span>{viewLabels[user.currentView] || user.currentView}</span>
                    {user.editingInitiativeId && (
                      <span className="ml-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-medium">
                        Editing
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

