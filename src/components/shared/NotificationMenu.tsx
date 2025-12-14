import React, { useState, useRef, useEffect } from 'react';
import { Bell, X, Check, AlertCircle, Edit, Clock, TrendingUp, AtSign, AlertTriangle, MessageSquare } from 'lucide-react';
import { Notification, NotificationType } from '../../types';

interface NotificationMenuProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onNotificationClick: (notification: Notification) => void;
  currentUserId: string; // Add current user ID to filter notifications
}

export const NotificationMenu: React.FC<NotificationMenuProps> = ({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  onNotificationClick,
  currentUserId
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8,
        right: window.innerWidth - rect.right
      });
    }
  }, [isOpen]);

  // Filter notifications to show relevant notifications for current user:
  // 1. Direct notifications (mentions, etc.) where userId matches currentUserId
  // 2. Owner notifications - user owns the initiative that was changed/commented on
  const userNotifications = notifications.filter(n => 
    n.userId === currentUserId ||
    n.metadata?.ownerId === currentUserId
  );
  
  const unreadCount = userNotifications.filter(n => !n.read).length;
  const sortedNotifications = [...userNotifications].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case NotificationType.Delay:
        return <AlertCircle size={16} className="text-red-500" />;
      case NotificationType.StatusChange:
        return <Edit size={16} className="text-blue-500" />;
      case NotificationType.EtaChange:
        return <Clock size={16} className="text-amber-500" />;
      case NotificationType.EffortChange:
        return <TrendingUp size={16} className="text-purple-500" />;
      case NotificationType.Mention:
        return <AtSign size={16} className="text-cyan-500" />;
      case NotificationType.AtRisk:
        return <AlertTriangle size={16} className="text-orange-500" />;
      case NotificationType.FieldChange:
        return <Edit size={16} className="text-slate-500" />;
      case NotificationType.NewComment:
        return <MessageSquare size={16} className="text-blue-500" />;
      default:
        return <Bell size={16} className="text-slate-500" />;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <>
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          className="relative p-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          title="Notifications"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          <div 
            ref={dropdownRef}
            className="fixed w-96 bg-white rounded-xl shadow-xl border border-slate-200 z-50 max-h-[600px] flex flex-col"
            style={{
              top: `${dropdownPosition.top}px`,
              right: `${dropdownPosition.right}px`,
              maxHeight: 'calc(100vh - 100px)'
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-slate-600" />
                <h3 className="font-semibold text-slate-800">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkAllAsRead();
                    }}
                    className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                    title="Mark all as read"
                  >
                    <Check size={16} />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearAll();
                    }}
                    className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Clear all"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {sortedNotifications.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <Bell size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No notifications</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {sortedNotifications.map(notification => (
                    <div
                      key={notification.id}
                      onClick={() => {
                        onNotificationClick(notification);
                        if (!notification.read) {
                          onMarkAsRead(notification.id);
                        }
                      }}
                      className={`p-4 hover:bg-slate-50 cursor-pointer transition-colors ${
                        !notification.read ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className={`text-sm font-semibold ${!notification.read ? 'text-slate-900' : 'text-slate-700'}`}>
                              {notification.title}
                            </h4>
                            {!notification.read && (
                              <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                            )}
                          </div>
                          <p className="text-xs text-slate-600 mb-1 line-clamp-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-slate-400">
                              {formatTime(notification.timestamp)}
                            </span>
                            <span className="text-xs text-slate-500 truncate max-w-[150px]">
                              {notification.initiativeTitle}
                            </span>
                          </div>
                        </div>
                        {!notification.read && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkAsRead(notification.id);
                            }}
                            className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                            title="Mark as read"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="p-3 border-t border-slate-200 bg-slate-50">
                <p className="text-xs text-slate-500 text-center">
                  {notifications.length} total notification{notifications.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
};

export default NotificationMenu;

