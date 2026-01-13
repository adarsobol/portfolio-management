import React, { useState, useEffect } from 'react';
import { AlertTriangle, Search, Calendar, User, CheckCircle2, RefreshCw, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { ErrorLog, LogSeverity, User as UserType } from '../../types';
import { logService } from '../../services/logService';
import { logger } from '../../utils/logger';

interface ErrorLogViewProps {
  currentUser: UserType;
  users: UserType[];
}

export const ErrorLogView: React.FC<ErrorLogViewProps> = ({ users }) => {
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<LogSeverity | 'all'>('all');
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date>(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)); // Last 7 days
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadErrorLogs();
  }, [startDate, endDate, selectedSeverity, selectedUserId]);

  const loadErrorLogs = async () => {
    setLoading(true);
    try {
      const logs = await logService.getErrorLogs({
        startDate,
        endDate,
        severity: selectedSeverity === 'all' ? undefined : selectedSeverity,
        userId: selectedUserId === 'all' ? undefined : selectedUserId,
      });
      setErrorLogs(logs);
    } catch (error) {
      logger.error('Failed to load error logs', { context: 'ErrorLogView.loadLogs', error: error instanceof Error ? error : undefined });
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = errorLogs.filter(log => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        log.message?.toLowerCase().includes(query) ||
        log.stack?.toLowerCase().includes(query) ||
        log.context?.toLowerCase().includes(query) ||
        log.userEmail?.toLowerCase().includes(query) ||
        log.url?.toLowerCase().includes(query)
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

  const getSeverityColor = (severity: LogSeverity) => {
    switch (severity) {
      case LogSeverity.CRITICAL:
        return 'bg-red-600 text-white';
      case LogSeverity.ERROR:
        return 'bg-red-500 text-white';
      case LogSeverity.WARN:
        return 'bg-yellow-500 text-white';
      case LogSeverity.INFO:
        return 'bg-blue-500 text-white';
      case LogSeverity.DEBUG:
        return 'bg-gray-500 text-white';
      default:
        return 'bg-gray-400 text-white';
    }
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
    link.download = `error-logs-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <h1 className="text-sm font-bold text-slate-900">Error Logs</h1>
          <span className="text-xs text-slate-500">({filteredLogs.length} errors)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadErrorLogs}
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
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Severity Filter */}
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value as LogSeverity | 'all')}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Severities</option>
            <option value={LogSeverity.CRITICAL}>Critical</option>
            <option value={LogSeverity.ERROR}>Error</option>
            <option value={LogSeverity.WARN}>Warning</option>
            <option value={LogSeverity.INFO}>Info</option>
            <option value={LogSeverity.DEBUG}>Debug</option>
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
          <p className="text-slate-600">Loading error logs...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-slate-600">No error logs found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map((log) => {
            const isExpanded = expandedLogs.has(log.id);
            return (
              <div
                key={log.id}
                className={`bg-white rounded-lg shadow border-l-4 ${
                  log.severity === LogSeverity.CRITICAL ? 'border-red-600' :
                  log.severity === LogSeverity.ERROR ? 'border-red-500' :
                  log.severity === LogSeverity.WARN ? 'border-yellow-500' :
                  'border-blue-500'
                }`}
              >
                <div
                  className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => toggleExpand(log.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${getSeverityColor(log.severity)}`}>
                          {log.severity.toUpperCase()}
                        </span>
                        {log.context && (
                          <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">
                            {log.context}
                          </span>
                        )}
                        {log.resolved && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Resolved
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-slate-900 mb-1">{log.message}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatTimestamp(log.timestamp)}
                        </span>
                        {log.userEmail && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {log.userEmail}
                          </span>
                        )}
                        {log.url && (
                          <span className="truncate max-w-xs" title={log.url}>
                            {log.url}
                          </span>
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
                    {log.stack && (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-700 mb-2">Stack Trace</h4>
                        <pre className="text-xs bg-slate-50 p-3 rounded border border-slate-200 overflow-x-auto">
                          {log.stack}
                        </pre>
                      </div>
                    )}
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-slate-700 mb-2">Metadata</h4>
                        <pre className="text-xs bg-slate-50 p-3 rounded border border-slate-200 overflow-x-auto">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
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

export default ErrorLogView;

