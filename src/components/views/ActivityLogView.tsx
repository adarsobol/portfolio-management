import React, { useState, useEffect } from 'react';
import { Activity, Search, Calendar, User, ChevronDown, ChevronUp, RefreshCw, Download } from 'lucide-react';
import { ActivityLog, ActivityType, User as UserType } from '../../types';
import { logService } from '../../services/logService';

interface ActivityLogViewProps {
  currentUser: UserType;
  users: UserType[];
}

export const ActivityLogView: React.FC<ActivityLogViewProps> = ({ users }) => {
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<ActivityType | 'all'>('all');
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date>(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)); // Last 7 days
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadActivityLogs();
  }, [startDate, endDate, selectedType, selectedUserId]);

  const loadActivityLogs = async () => {
    setLoading(true);
    try {
      console.log('[ACTIVITY LOG VIEW] Loading logs with filters:', { startDate, endDate, selectedType, selectedUserId });
      const logs = await logService.getActivityLogs({
        startDate,
        endDate,
        type: selectedType === 'all' ? undefined : selectedType,
        userId: selectedUserId === 'all' ? undefined : selectedUserId,
      });
      console.log('[ACTIVITY LOG VIEW] Loaded logs:', logs.length, logs);
      setActivityLogs(logs);
    } catch (error) {
      console.error('[ACTIVITY LOG VIEW] Failed to load activity logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = activityLogs.filter(log => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        log.description?.toLowerCase().includes(query) ||
        log.userEmail?.toLowerCase().includes(query) ||
        log.initiativeId?.toLowerCase().includes(query) ||
        log.taskId?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const toggleExpand = (logId: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedLogs(newExpanded);
  };

  const getActivityTypeColor = (type: ActivityType) => {
    if (type.includes('CREATE')) return 'bg-green-100 text-green-700';
    if (type.includes('UPDATE')) return 'bg-blue-100 text-blue-700';
    if (type.includes('DELETE')) return 'bg-red-100 text-red-700';
    if (type === ActivityType.LOGIN) return 'bg-purple-100 text-purple-700';
    if (type === ActivityType.LOGOUT) return 'bg-gray-100 text-gray-700';
    if (type === ActivityType.EXPORT_DATA) return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-700';
  };

  const formatActivityType = (type: ActivityType): string => {
    return type
      .split('_')
      .map(word => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const exportLogs = () => {
    const dataStr = JSON.stringify(filteredLogs, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `activity-logs-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Get unique activity types for filter
  const activityTypes = Object.values(ActivityType);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900">Activity Logs</h1>
          <span className="text-sm text-slate-500">({filteredLogs.length} activities)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadActivityLogs}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={exportLogs}
            className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search activities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Activity Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as ActivityType | 'all')}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Types</option>
            {activityTypes.map(type => (
              <option key={type} value={type}>{formatActivityType(type)}</option>
            ))}
          </select>

          {/* User Filter */}
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Users</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>

          {/* Date Range */}
          <div className="flex gap-2">
            <input
              type="date"
              value={startDate.toISOString().split('T')[0]}
              onChange={(e) => setStartDate(new Date(e.target.value))}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <span className="self-center text-slate-500">to</span>
            <input
              type="date"
              value={endDate.toISOString().split('T')[0]}
              onChange={(e) => setEndDate(new Date(e.target.value))}
              className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Logs List */}
      {loading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading activity logs...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Activity className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600">No activity logs found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map((log) => {
            const isExpanded = expandedLogs.has(log.id);
            return (
              <div
                key={log.id}
                className="bg-white rounded-lg shadow border-l-4 border-blue-500"
              >
                <div
                  className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggleExpand(log.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${getActivityTypeColor(log.type)}`}>
                          {formatActivityType(log.type)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-900 mb-1">{log.description}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatTimestamp(log.timestamp)}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {log.userEmail}
                        </span>
                        {log.initiativeId && (
                          <span className="text-blue-600">Initiative: {log.initiativeId}</span>
                        )}
                        {log.taskId && (
                          <span className="text-purple-600">Task: {log.taskId}</span>
                        )}
                      </div>
                    </div>
                    <button className="ml-4 text-slate-400 hover:text-slate-600">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-slate-200 pt-4 space-y-3">
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-700 mb-2">Metadata</h4>
                        <pre className="text-xs bg-slate-50 p-3 rounded border border-slate-200 overflow-x-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </div>
                    )}
                    {log.ipAddress && (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-700 mb-2">IP Address</h4>
                        <p className="text-xs text-slate-600 font-mono">{log.ipAddress}</p>
                      </div>
                    )}
                    {log.userAgent && (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-700 mb-2">User Agent</h4>
                        <p className="text-xs text-slate-600">{log.userAgent}</p>
                      </div>
                    )}
                    {log.correlationId && (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-700 mb-2">Correlation ID</h4>
                        <p className="text-xs text-slate-600 font-mono">{log.correlationId}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ActivityLogView;

