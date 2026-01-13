import React, { useState, useRef, useCallback } from 'react';
import { Settings, Trash2, Plus, MessageSquare, Upload, AlertCircle, CheckCircle2, X, Loader2, Users, ClipboardList, Gauge, ClipboardCopy, Eye, Edit, Check, XCircle, LayoutDashboard, GitBranch, Calendar, Zap, Shield, Clock, RefreshCw, Database, Download, RotateCcw, HardDrive, FileCheck, AlertTriangle, Activity, List } from 'lucide-react';
import { ErrorLogView } from './ErrorLogView';
import { ActivityLogView } from './ActivityLogView';
import { SupportCenter } from './SupportCenter';
import { ValueListsManager } from './ValueListsManager';
import { User, Role, AppConfig, Initiative, PermissionKey, TabAccessLevel, TaskManagementScope, PermissionValue, VersionMetadata, Status, InitiativeType } from '../../types';
import { migrateEnumsToConfig, getAssetClasses } from '../../utils/valueLists';
import { canBeOwner } from '../../utils';
import * as XLSX from 'xlsx';
import { getVersionService } from '../../services/versionService';
import { sheetsSync } from '../../services';

// BadgePermission Component for visual permission display
interface BadgePermissionProps {
  value: TabAccessLevel | TaskManagementScope;
  onChange: (newValue: TabAccessLevel | TaskManagementScope) => void;
  type: 'tab' | 'taskManagement';
}

const BadgePermission: React.FC<BadgePermissionProps> = ({ value, onChange, type }) => {
  const tabCycle: TabAccessLevel[] = ['none', 'view', 'edit'];
  const taskCycle: TaskManagementScope[] = ['no', 'yes', 'own'];
  
  const handleClick = () => {
    if (type === 'tab') {
      const current = value as TabAccessLevel;
      const currentIndex = tabCycle.indexOf(current);
      const nextIndex = (currentIndex + 1) % tabCycle.length;
      onChange(tabCycle[nextIndex]);
    } else {
      const current = value as TaskManagementScope;
      const currentIndex = taskCycle.indexOf(current);
      const nextIndex = (currentIndex + 1) % taskCycle.length;
      onChange(taskCycle[nextIndex]);
    }
  };

  if (type === 'tab') {
    const level = value as TabAccessLevel;
    const configs = {
      none: { label: 'None', bg: 'bg-slate-100', text: 'text-slate-400', border: 'border-slate-200', icon: XCircle },
      view: { label: 'View', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: Eye },
      edit: { label: 'Edit', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: Edit },
    };
    const config = configs[level];
    const Icon = config.icon;
    const nextLevel = tabCycle[(tabCycle.indexOf(level) + 1) % tabCycle.length];

    return (
      <button
        onClick={handleClick}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border ${config.bg} ${config.text} ${config.border} text-xs font-medium hover:opacity-80 transition-all cursor-pointer min-w-[60px] justify-center`}
        title={`Click to cycle: ${level} → ${nextLevel}`}
      >
        {Icon && <Icon size={12} />}
        <span>{config.label}</span>
      </button>
    );
  } else {
    // Handle task management scope
    let scope: TaskManagementScope = value as TaskManagementScope;
    
    // Handle legacy boolean values or unexpected values
    if (typeof value === 'boolean') {
      scope = value ? 'yes' : 'no';
    } else if (value !== 'no' && value !== 'yes' && value !== 'own') {
      // Default to 'no' if value is unexpected
      scope = 'no';
    }
    
    const configs = {
      no: { label: 'No', bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', icon: XCircle },
      yes: { label: 'Yes', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: Check },
      own: { label: 'Only own', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Edit },
    };
    const config = configs[scope];
    if (!config) {
      // Fallback if config is still undefined
      return (
        <button
          onClick={handleClick}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border bg-slate-100 text-slate-400 border-slate-200 text-xs font-medium hover:opacity-80 transition-all cursor-pointer min-w-[70px] justify-center"
        >
          <XCircle size={12} />
          <span>No</span>
        </button>
      );
    }
    const Icon = config.icon;
    const nextScope = taskCycle[(taskCycle.indexOf(scope) + 1) % taskCycle.length];

    return (
      <button
        onClick={handleClick}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border ${config.bg} ${config.text} ${config.border} text-xs font-medium hover:opacity-80 transition-all cursor-pointer min-w-[70px] justify-center`}
        title={`Click to cycle: ${scope} → ${nextScope}`}
      >
        {Icon && <Icon size={12} />}
        <span>{config.label}</span>
      </button>
    );
  }
};

// Admin Sidebar Menu Component
interface AdminSidebarProps {
  activeSection: string;
  onSectionChange: (sectionId: string) => void;
  deletedInitiativesCount: number;
}

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number | string;
  category?: string;
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({ activeSection, onSectionChange, deletedInitiativesCount }) => {
  const menuItems: MenuItem[] = [
    { id: 'slack', label: 'Slack Integration', icon: <MessageSquare size={16} /> },
    { id: 'login-history', label: 'Login History', icon: <Clock size={16} /> },
    { id: 'error-logs', label: 'Error Logs', icon: <AlertTriangle size={16} /> },
    { id: 'activity-logs', label: 'Activity Logs', icon: <Activity size={16} /> },
    { id: 'support-center', label: 'Support Center', icon: <MessageSquare size={16} /> },
    { id: 'backup-management', label: 'Backup Management', icon: <Database size={16} /> },
    { id: 'data-versions', label: 'Data Versions', icon: <Clock size={16} /> },
    { id: 'trash', label: 'Trash', icon: <Trash2 size={16} />, badge: deletedInitiativesCount },
    { id: 'bulk-import', label: 'Bulk Import', icon: <Upload size={16} /> },
    { id: 'value-lists', label: 'Value Lists', icon: <List size={16} /> },
    { id: 'user-management', label: 'User Management', icon: <Users size={16} /> },
    { id: 'authorization-matrix', label: 'Authorization', icon: <Shield size={16} /> },
    { id: 'capacity-planning', label: 'Capacity Planning', icon: <Gauge size={16} /> },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex-shrink-0 h-full overflow-y-auto">
      <div className="p-2 border-b border-slate-200">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-1.5">
          <Settings size={18} className="text-slate-600" />
          Admin Panel
        </h2>
      </div>
      <nav className="p-1.5 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeSection === item.id
                ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-md'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className={activeSection === item.id ? 'text-white' : 'text-slate-500'}>
              {item.icon}
            </span>
            <span className="flex-1 text-left">{item.label}</span>
            {item.badge !== undefined && (typeof item.badge === 'number' ? item.badge > 0 : item.badge) && (
              <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                activeSection === item.id
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}>
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
    </aside>
  );
};

interface AdminPanelProps {
  currentUser: User;
  config: AppConfig;
  setConfig: (config: AppConfig | ((prev: AppConfig) => AppConfig)) => void;
  users: User[];
  setUsers: (users: User[]) => void;
  initiatives: Initiative[];
  onClearCache?: () => Promise<void>;
  deletedInitiatives?: Initiative[];
  onRestore?: (id: string) => void;
  isDataLoading?: boolean;
}

// Types for bulk import
interface ParsedUser {
  email: string;
  name: string;
  role: string;
  isValid: boolean;
  error?: string;
}

interface ParsedInitiative {
  title: string;
  ownerEmail: string;
  assetClass: string;
  pillar: string;
  responsibility: string;
  target: string;
  quarter: string;
  status: string;
  priority: string;
  workType: string;
  estimatedEffort: number;
  eta: string;
  isValid: boolean;
  error?: string;
}

interface ImportResult {
  success: boolean;
  created?: number;
  imported?: number;
  skipped?: number;
  errors?: { row: number; email?: string; title?: string; error: string }[];
  total?: number;
}

// Backup types
interface BackupInfo {
  date: string;
  path: string;
  files: number;
  totalSize: number;
  status: 'success' | 'partial' | 'failed';
  timestamp: string;
}

interface BackupManifest {
  id: string;
  timestamp: string;
  date: string;
  files: { name: string; path: string; size: number }[];
  totalSize: number;
  duration: number;
  status: 'success' | 'partial' | 'failed';
  errors?: string[];
}

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || '';

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentUser,
  config,
  setConfig,
  users,
  setUsers,
  initiatives,
  onClearCache: _onClearCache,
  deletedInitiatives = [],
  onRestore,
  isDataLoading = false
}) => {
  void _onClearCache; // Reserved for cache clearing feature
  const [newUser, setNewUser] = useState<Partial<User>>({ role: Role.TeamLead });
  
  // Migrate enums to config on mount if needed
  React.useEffect(() => {
    if (!config.valueListsMigrated) {
      const migratedConfig = migrateEnumsToConfig(config);
      if (migratedConfig !== config) {
        setConfig(migratedConfig);
      }
    }
  }, [config, setConfig]);
  
  // Active section state - only one section visible at a time
  const [activeSection, setActiveSection] = useState<string>('slack');
  
  // Track which sections have loaded their data (for lazy loading)
  const [loadedSections, setLoadedSections] = useState<Set<string>>(new Set());
  
  const handleSectionChange = useCallback((sectionId: string) => {
    setActiveSection(sectionId);
    // Trigger lazy loading if not already loaded
    if (!loadedSections.has(sectionId)) {
      // This will be handled by the section render functions
    }
  }, [loadedSections]);
  
  const markSectionLoaded = useCallback((sectionId: string) => {
    setLoadedSections(prev => new Set(prev).add(sectionId));
  }, []);
  
  // User import state
  const [userImportData, setUserImportData] = useState<ParsedUser[]>([]);
  const [userImportLoading, setUserImportLoading] = useState(false);
  const [userImportResult, setUserImportResult] = useState<ImportResult | null>(null);
  const userFileInputRef = useRef<HTMLInputElement>(null);
  
  // Task import state
  const [taskImportData, setTaskImportData] = useState<ParsedInitiative[]>([]);
  const [taskImportLoading, setTaskImportLoading] = useState(false);
  const [taskImportResult, setTaskImportResult] = useState<ImportResult | null>(null);
  const taskFileInputRef = useRef<HTMLInputElement>(null);
  const permissionsTableRef = useRef<HTMLDivElement>(null);
  
  
  // Permission tab state
  const [activePermissionTab, setActivePermissionTab] = useState<'tabs' | 'tasks' | 'admin'>('tabs');
  
  // Login history state
  const [loginHistory, setLoginHistory] = useState<Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    avatar?: string;
    lastLogin: string | null;
  }>>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [loginHistoryError, setLoginHistoryError] = useState<string | null>(null);
  
  // Backup management state
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<BackupManifest | null>(null);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  
  // User management loading state
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  
  // Version management state
  const [versions, setVersions] = useState<VersionMetadata[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [versionError, setVersionError] = useState<string | null>(null);
  const [versionSuccess, setVersionSuccess] = useState<string | null>(null);
  const [isRestoringVersion, setIsRestoringVersion] = useState(false);
  const [isSyncingVersion, setIsSyncingVersion] = useState<string | null>(null);
  const [retentionDays, setRetentionDays] = useState<number>(30);
  
  // Fetch users from spreadsheet
  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    setUsersError(null);
    try {
      const response = await fetch(`${API_ENDPOINT}/api/auth/users`, {
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('portfolio-auth-token') || ''}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.users && data.users.length > 0) {
          setUsers(data.users);
        } else {
          setUsers([]);
        }
      } else if (response.status === 403) {
        setUsersError('Admin access required to view users');
      } else {
        const errorData = await response.json().catch(() => ({}));
        setUsersError(errorData.error || 'Failed to load users');
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
      setUsersError('Network error while fetching users');
    } finally {
      setIsLoadingUsers(false);
    }
  };
  
  // Fetch login history
  const fetchLoginHistory = async () => {
    setIsLoadingHistory(true);
    setLoginHistoryError(null);
    try {
      const response = await fetch(`${API_ENDPOINT}/api/admin/login-history`, {
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('portfolio-auth-token') || ''}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setLoginHistory(data.users || []);
      } else if (response.status === 403) {
        setLoginHistoryError('Admin access required to view login history');
      } else {
        const errorData = await response.json().catch(() => ({}));
        setLoginHistoryError(errorData.error || 'Failed to load login history');
      }
    } catch (error) {
      console.error('Failed to fetch login history:', error);
      setLoginHistoryError('Network error while fetching login history');
    } finally {
      setIsLoadingHistory(false);
    }
  };
  
  // Fetch backups
  const fetchBackups = async () => {
    setIsLoadingBackups(true);
    setBackupError(null);
    try {
      const response = await fetch(`${API_ENDPOINT}/api/backups`, {
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('portfolio-auth-token') || ''}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setBackups(data.backups || []);
      } else if (response.status === 503) {
        setBackupError('Backup service not available. GCS storage may not be configured.');
      } else {
        setBackupError('Failed to fetch backups');
      }
    } catch (error) {
      console.error('Failed to fetch backups:', error);
      setBackupError('Network error while fetching backups');
    } finally {
      setIsLoadingBackups(false);
    }
  };
  
  // Fetch backup details
  const fetchBackupDetails = async (date: string) => {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/backups/${date}`, {
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('portfolio-auth-token') || ''}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setSelectedBackup(data.backup);
      }
    } catch (error) {
      console.error('Failed to fetch backup details:', error);
    }
  };
  
  // Create manual backup
  const createManualBackup = async () => {
    setIsCreatingBackup(true);
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const response = await fetch(`${API_ENDPOINT}/api/backups/create`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('portfolio-auth-token') || ''}`
        },
        body: JSON.stringify({ label: 'manual' })
      });
      const data = await response.json();
      if (data.success) {
        setBackupSuccess(`Backup created successfully! ${data.manifest.files.length} files backed up.${data.source === 'sheets' ? ' (Sheets snapshot)' : ''}`);
        fetchBackups();
      } else if (response.status === 503) {
        // Service unavailable - usually OpenSSL/connection issue
        setBackupError(data.message || 'Backup service temporarily unavailable. This works in production.');
      } else {
        setBackupError(data.error || 'Failed to create backup');
      }
    } catch (error) {
      console.error('Failed to create backup:', error);
      setBackupError('Network error while creating backup');
    } finally {
      setIsCreatingBackup(false);
    }
  };
  
  // Restore from backup
  const restoreFromBackup = async (date: string) => {
    if (!confirm(`Are you sure you want to restore data from ${date}? This will overwrite current data.`)) {
      return;
    }
    
    setIsRestoring(true);
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const response = await fetch(`${API_ENDPOINT}/api/backups/restore/${date}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('portfolio-auth-token') || ''}`
        },
        body: JSON.stringify({ confirm: true })
      });
      const data = await response.json();
      if (data.success) {
        setBackupSuccess(`Restored ${data.filesRestored} files from ${date}. Refreshing page...`);
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setBackupError(`Restore failed: ${data.errors?.join(', ') || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to restore backup:', error);
      setBackupError('Network error while restoring backup');
    } finally {
      setIsRestoring(false);
    }
  };
  
  // Format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };
  
  // Version management functions
  const fetchVersions = useCallback(() => {
    setIsLoadingVersions(true);
    setVersionError(null);
    try {
      const versionService = getVersionService();
      const allVersions = versionService.listVersions();
      setVersions(allVersions);
      setRetentionDays(versionService.getRetentionDays());
    } catch (error) {
      console.error('Failed to fetch versions:', error);
      setVersionError('Failed to load versions');
    } finally {
      setIsLoadingVersions(false);
    }
  }, []);
  
  const cleanupOldVersions = useCallback(() => {
    try {
      const versionService = getVersionService();
      const deletedCount = versionService.cleanupOldVersions(retentionDays);
      setVersionSuccess(`Cleaned up ${deletedCount} old version(s)`);
      setTimeout(() => setVersionSuccess(null), 3000);
      fetchVersions();
    } catch (error) {
      console.error('Failed to cleanup versions:', error);
      setVersionError('Failed to cleanup old versions');
      setTimeout(() => setVersionError(null), 5000);
    }
  }, [retentionDays, fetchVersions]);
  
  const restoreVersion = useCallback(async (versionId: string) => {
    setIsRestoringVersion(true);
    setVersionError(null);
    try {
      const versionService = getVersionService();
      const versionData = versionService.restoreVersion(versionId);
      
      if (!versionData) {
        setVersionError('Version not found');
        setTimeout(() => setVersionError(null), 5000);
        return;
      }
      
      // Restore initiatives and tasks
      // Note: This should trigger a reload in the parent component
      // For now, we'll show a success message
      setVersionSuccess(`Version restored successfully. Please refresh the page to see changes.`);
      setTimeout(() => setVersionSuccess(null), 5000);
      
      // Trigger window reload to apply changes
      window.location.reload();
    } catch (error) {
      console.error('Failed to restore version:', error);
      setVersionError('Failed to restore version');
      setTimeout(() => setVersionError(null), 5000);
    } finally {
      setIsRestoringVersion(false);
    }
  }, []);
  
  const syncVersionToSheets = useCallback(async (versionId: string) => {
    setIsSyncingVersion(versionId);
    setVersionError(null);
    try {
      const versionService = getVersionService();
      const snapshot = versionService.exportVersion(versionId, config, currentUser.email);
      
      if (!snapshot) {
        setVersionError('Failed to export version');
        setTimeout(() => setVersionError(null), 5000);
        return;
      }
      
      // Queue snapshot and force immediate sync
      sheetsSync.queueSnapshot(snapshot);
      await sheetsSync.forceSyncNow();
      
      // Check if sync succeeded by checking if version was marked as synced
      // The createSnapshotTab method will automatically mark it as synced on success
      // Wait a bit for the sync to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Refresh versions to get updated sync status
      fetchVersions();
      
      // Check if version is now synced
      const updatedVersions = versionService.listVersions();
      const syncedVersion = updatedVersions.find(v => v.id === versionId);
      
      if (syncedVersion?.syncedToSheets) {
        setVersionSuccess('Version synced to Google Sheets successfully');
        setTimeout(() => setVersionSuccess(null), 3000);
      } else {
        // Check sync status for errors
        const syncStatus = sheetsSync.getStatus();
        if (syncStatus.error) {
          setVersionError(`Failed to sync: ${syncStatus.error}`);
        } else {
          setVersionError('Sync may still be in progress. Please check again in a moment.');
        }
        setTimeout(() => setVersionError(null), 5000);
      }
    } catch (error) {
      console.error('Failed to sync version:', error);
      setVersionError('Failed to sync version to Google Sheets');
      setTimeout(() => setVersionError(null), 5000);
    } finally {
      setIsSyncingVersion(null);
    }
  }, [config, currentUser.email, fetchVersions]);
  
  const deleteVersion = useCallback((versionId: string) => {
    if (!confirm('Are you sure you want to delete this version? This action cannot be undone.')) {
      return;
    }
    
    try {
      const versionService = getVersionService();
      const success = versionService.deleteVersion(versionId);
      
      if (success) {
        setVersionSuccess('Version deleted successfully');
        setTimeout(() => setVersionSuccess(null), 3000);
        fetchVersions();
      } else {
        setVersionError('Failed to delete version');
        setTimeout(() => setVersionError(null), 5000);
      }
    } catch (error) {
      console.error('Failed to delete version:', error);
      setVersionError('Failed to delete version');
      setTimeout(() => setVersionError(null), 5000);
    }
  }, [fetchVersions]);
  
  // Initial fetch
  // Note: Data is fetched lazily when sections are expanded
  
  // Format relative time
  const formatRelativeTime = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
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

  const isAdminAccess = currentUser.email === 'adar.sobol@pagaya.com';
  if (!isAdminAccess) {
     return <div className="p-4 text-center text-red-500 font-bold">Access Denied</div>;
  }
  
  // Valid values for validation
  const VALID_ROLES = ['Admin', 'SVP', 'VP', 'Director (Department Management)', 'Director (Group Lead)', 'Team Lead', 'Portfolio Operations'];
  const VALID_ASSET_CLASSES = ['PL', 'Auto', 'POS', 'Advisory'];
  const VALID_STATUSES = ['Not Started', 'In Progress', 'At Risk', 'Done', 'Obsolete'];
  const VALID_PRIORITIES = ['P0', 'P1', 'P2'];
  const VALID_WORK_TYPES = ['Planned Work', 'Unplanned Work'];
  
  // Parse Excel/CSV file for users
  const handleUserFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];
        
        const parsed: ParsedUser[] = jsonData.map((row, _idx) => {
          const email = (row.Email || row.email || row.EMAIL || '').toString().trim();
          const name = (row.Name || row.name || row.NAME || row['Full Name'] || '').toString().trim();
          const role = (row.Role || row.role || row.ROLE || 'Team Lead').toString().trim();
          
          let isValid = true;
          let error = '';
          
          // Validate email
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!email || !emailRegex.test(email)) {
            isValid = false;
            error = 'Invalid or missing email';
          } else if (!name) {
            isValid = false;
            error = 'Name is required';
          } else if (!VALID_ROLES.includes(role)) {
            isValid = false;
            error = `Invalid role "${role}"`;
          } else if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
            isValid = false;
            error = 'User already exists';
          }
          
          return { email, name, role, isValid, error };
        });
        
        setUserImportData(parsed);
        setUserImportResult(null);
      } catch (err) {
        console.error('Error parsing file:', err);
        alert('Failed to parse file. Please ensure it is a valid Excel or CSV file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };
  
  // Parse Excel/CSV file for tasks
  const handleTaskFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];
        
        const parsed: ParsedInitiative[] = jsonData.map((row) => {
          const title = (row.Title || row.title || row.TITLE || '').toString().trim();
          const ownerEmail = (row['Owner Email'] || row.ownerEmail || row.owner || row.Owner || '').toString().trim().toLowerCase();
          const assetClass = (row['Asset Class'] || row.assetClass || row.l1_assetClass || '').toString().trim();
          const pillar = (row.Pillar || row.pillar || row.l2_pillar || '').toString().trim();
          const responsibility = (row.Responsibility || row.responsibility || row.l3_responsibility || '').toString().trim();
          const target = (row.Target || row.target || row.l4_target || '').toString().trim();
          const quarter = (row.Quarter || row.quarter || '').toString().trim();
          const status = (row.Status || row.status || 'Not Started').toString().trim();
          const priority = (row.Priority || row.priority || 'P1').toString().trim();
          const workType = (row['Work Type'] || row.workType || 'Planned Work').toString().trim();
          const estimatedEffort = parseFloat(row['Estimated Effort'] || row.estimatedEffort || row['Estimated Effort (weeks)'] || '0') || 0;
          
          let eta = (row.ETA || row.eta || '').toString().trim();
          // Handle Excel date serial numbers
          if (typeof row.ETA === 'number' || typeof row.eta === 'number') {
            const excelDate = row.ETA || row.eta;
            const excelEpoch = new Date(1899, 11, 30);
            const date = new Date(excelEpoch.getTime() + excelDate * 86400000);
            eta = date.toISOString().split('T')[0];
          }
          
          let isValid = true;
          let error = '';
          
          if (!title) {
            isValid = false;
            error = 'Title is required';
          } else if (ownerEmail && !users.some(u => u.email.toLowerCase() === ownerEmail)) {
            isValid = false;
            error = `Owner "${ownerEmail}" not found`;
          } else if (assetClass && !VALID_ASSET_CLASSES.includes(assetClass)) {
            isValid = false;
            error = `Invalid asset class "${assetClass}"`;
          } else if (!VALID_STATUSES.includes(status)) {
            isValid = false;
            error = `Invalid status "${status}"`;
          } else if (!VALID_PRIORITIES.includes(priority)) {
            isValid = false;
            error = `Invalid priority "${priority}"`;
          } else if (!VALID_WORK_TYPES.includes(workType)) {
            isValid = false;
            error = `Invalid work type "${workType}"`;
          }
          
          return {
            title, ownerEmail, assetClass, pillar, responsibility, target,
            quarter, status, priority, workType, estimatedEffort, eta,
            isValid, error
          };
        });
        
        setTaskImportData(parsed);
        setTaskImportResult(null);
      } catch (err) {
        console.error('Error parsing file:', err);
        alert('Failed to parse file. Please ensure it is a valid Excel or CSV file.');
      }
    };
    reader.readAsArrayBuffer(file);
  };
  
  // Submit user import to API
  const handleUserImportSubmit = async () => {
    const validUsers = userImportData.filter(u => u.isValid);
    if (validUsers.length === 0) {
      alert('No valid users to import');
      return;
    }
    
    setUserImportLoading(true);
    try {
      const response = await fetch(`${API_ENDPOINT}/api/users/bulk-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: validUsers })
      });
      
      const result = await response.json();
      setUserImportResult(result);
      
      if (result.success && result.created > 0) {
        // Refresh users list from API
        await fetchUsers();
      }
    } catch (err) {
      console.error('Import failed:', err);
      setUserImportResult({ success: false, errors: [{ row: 0, error: 'Network error' }] });
    } finally {
      setUserImportLoading(false);
    }
  };
  
  // Submit task import to API
  const handleTaskImportSubmit = async () => {
    const validTasks = taskImportData.filter(t => t.isValid);
    if (validTasks.length === 0) {
      alert('No valid tasks to import');
      return;
    }
    
    setTaskImportLoading(true);
    try {
      const response = await fetch(`${API_ENDPOINT}/api/sheets/bulk-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initiatives: validTasks })
      });
      
      const result = await response.json();
      setTaskImportResult(result);
      
      if (result.success && result.imported > 0) {
        // Trigger a page reload to refresh initiatives
        window.location.reload();
      }
    } catch (err) {
      console.error('Import failed:', err);
      setTaskImportResult({ success: false, errors: [{ row: 0, error: 'Network error' }] });
    } finally {
      setTaskImportLoading(false);
    }
  };
  
  // Clear user import
  const clearUserImport = () => {
    setUserImportData([]);
    setUserImportResult(null);
    if (userFileInputRef.current) userFileInputRef.current.value = '';
  };
  
  // Clear task import
  const clearTaskImport = () => {
    setTaskImportData([]);
    setTaskImportResult(null);
    if (taskFileInputRef.current) taskFileInputRef.current.value = '';
  };
  
  // Copy user template to clipboard
  const copyUserTemplate = async () => {
    const template = 'Email\tName\tRole\njohn.doe@company.com\tJohn Doe\tTeam Lead';
    try {
      await navigator.clipboard.writeText(template);
      alert('User template copied! Paste into Excel/Sheets.\n\nValid Roles: Admin, SVP, VP, Director (Department Management), Director (Group Lead), Team Lead, Portfolio Operations');
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = template;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('User template copied! Paste into Excel/Sheets.\n\nValid Roles: Admin, SVP, VP, Director (Department Management), Director (Group Lead), Team Lead, Portfolio Operations');
    }
  };
  
  // Copy task template to clipboard
  const copyTaskTemplate = async () => {
    const template = 'Title\tOwner Email\tAsset Class\tPillar\tResponsibility\tTarget\tQuarter\tStatus\tPriority\tWork Type\tEstimated Effort\tETA\nMy Initiative\tjohn@company.com\tPL\tPillar Name\tResponsibility\tTarget\tQ1 2025\tNot Started\tP1\tPlanned Work\t4\t2025-03-31';
    try {
      await navigator.clipboard.writeText(template);
      alert('Task template copied! Paste into Excel/Sheets.\n\nValid Values:\n• Asset Class: PL, Auto, POS, Advisory\n• Status: Not Started, In Progress, At Risk, Done\n• Priority: P0, P1, P2\n• Work Type: Planned Work, Unplanned Work');
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = template;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('Task template copied! Paste into Excel/Sheets.\n\nValid Values:\n• Asset Class: PL, Auto, POS, Advisory\n• Status: Not Started, In Progress, At Risk, Done\n• Priority: P0, P1, P2\n• Work Type: Planned Work, Unplanned Work');
    }
  };

  // Permission column definitions organized by category
  const tabPermissions: { key: PermissionKey; label: string }[] = [
    { key: 'accessAllTasks', label: 'All Tasks' },
    { key: 'accessDependencies', label: 'Dependencies' },
    { key: 'accessTimeline', label: 'Timeline' },
    { key: 'accessWorkflows', label: 'Workflows' },
    { key: 'accessWorkplanHealth', label: 'Workplan Health' },
  ];

  const taskManagementPermissions: { key: PermissionKey; label: string }[] = [
    { key: 'createNewTasks', label: 'Create Tasks' },
    { key: 'editTasks', label: 'Edit Tasks' },
    { key: 'deleteTasks', label: 'Delete Tasks' },
  ];

  const adminPermissions: { key: PermissionKey; label: string }[] = [
    { key: 'accessAdmin', label: 'Admin Access' },
    { key: 'manageWorkflows', label: 'Manage Workflows' },
  ];

  const _allPermissions = [...tabPermissions, ...taskManagementPermissions, ...adminPermissions];
  void _allPermissions; // Reserved for permission filtering feature

  const handlePermissionChange = (role: Role, key: PermissionKey, value: PermissionValue) => {
    setConfig((prev: AppConfig) => ({
      ...prev,
      rolePermissions: {
        ...prev.rolePermissions,
        [role]: {
          ...prev.rolePermissions[role],
          [key]: value
        }
      }
    }));
  };

  const isTabPermission = (key: PermissionKey): boolean => {
    return tabPermissions.some(p => p.key === key);
  };

  const getPermissionValue = (role: Role, key: PermissionKey): PermissionValue => {
    const defaultValue = isTabPermission(key) ? 'none' : 'no';
    return config.rolePermissions[role]?.[key] ?? defaultValue;
  };

  const [isAddingUser, setIsAddingUser] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

  const handleAddUser = async () => {
    if (!newUser.name || !newUser.email) return;
    
    setIsAddingUser(true);
    setUserError(null);
    
    try {
      const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(newUser.name)}&background=random`;
      // Generate a temporary password for OAuth users (they'll use Google login)
      const tempPassword = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      const response = await fetch(`${API_ENDPOINT}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('portfolio-auth-token') || ''}`
        },
        body: JSON.stringify({
          email: newUser.email,
          password: tempPassword, // Temporary password for OAuth users
          name: newUser.name,
          role: newUser.role || Role.TeamLead,
          avatar: avatar,
          team: newUser.team || undefined
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      // Refresh users list from API
      await fetchUsers();

      // Clear form
      setNewUser({ role: Role.TeamLead });
    } catch (error) {
      console.error('Failed to add user:', error);
      setUserError(error instanceof Error ? error.message : 'Failed to add user');
      alert(`Failed to add user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsAddingUser(false);
    }
  };

  const [isDeletingUser, setIsDeletingUser] = useState<string | null>(null);

  const handleDeleteUser = async (id: string) => {
    if (id === currentUser.id) {
      alert("You cannot delete yourself.");
      return;
    }
    
    if (!confirm("Are you sure you want to delete this user?")) {
      return;
    }

    setIsDeletingUser(id);
    setUserError(null);

    try {
      const response = await fetch(`${API_ENDPOINT}/api/users/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('portfolio-auth-token') || ''}`
        }
      });

      // Check status BEFORE parsing JSON to handle 404 gracefully
      if (response.status === 404) {
        // User doesn't exist in backend (likely a fallback user from USERS constant)
        // Just remove from local state silently - no need to refresh from API
        setUsers(users.filter(u => u.id !== id));
        setIsDeletingUser(null);
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Failed to delete user' }));
        throw new Error(data.error || 'Failed to delete user');
      }

      // Success - refresh users list from API
      await fetchUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
      setUserError(error instanceof Error ? error.message : 'Failed to delete user');
      alert(`Failed to delete user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDeletingUser(null);
    }
  };

  const [isUpdatingUser, setIsUpdatingUser] = useState<string | null>(null);

  // Update user role or team inline
  const handleUpdateUser = async (userId: string, field: keyof User, value: any) => {
    // Optimistically update UI
    const previousUsers = users;
    setUsers(users.map(u => 
      u.id === userId ? { ...u, [field]: value } : u
    ));

    setIsUpdatingUser(userId);
    setUserError(null);

    try {
      const updateData: { role?: Role; team?: string } = {};
      if (field === 'role') {
        updateData.role = value as Role;
      } else if (field === 'team') {
        updateData.team = value || undefined;
      }

      const response = await fetch(`${API_ENDPOINT}/api/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('portfolio-auth-token') || ''}`
        },
        body: JSON.stringify(updateData)
      });

      const data = await response.json();

      if (!response.ok) {
        // Revert optimistic update on error
        setUsers(previousUsers);
        throw new Error(data.error || 'Failed to update user');
      }

      // Refresh users list from API to get server state
      await fetchUsers();
    } catch (error) {
      console.error('Failed to update user:', error);
      setUserError(error instanceof Error ? error.message : 'Failed to update user');
      // Error is silent for inline updates - user can see the revert
    } finally {
      setIsUpdatingUser(null);
    }
  };

  // Team options based on asset classes + "Other"
  const teamOptions = [...getAssetClasses(config), 'Other'];

  // Handle lazy loading when section becomes active
  React.useEffect(() => {
    if (!loadedSections.has(activeSection)) {
      // Trigger lazy loading based on section
      if (activeSection === 'login-history' && !loadedSections.has('login-history')) {
        fetchLoginHistory();
        markSectionLoaded('login-history');
      } else if (activeSection === 'backup-management' && !loadedSections.has('backup-management')) {
        fetchBackups();
        markSectionLoaded('backup-management');
      } else if (activeSection === 'data-versions' && !loadedSections.has('data-versions')) {
        fetchVersions();
        markSectionLoaded('data-versions');
      } else if (activeSection === 'value-lists' && !loadedSections.has('value-lists')) {
        markSectionLoaded('value-lists');
      } else if (activeSection === 'user-management' && !loadedSections.has('user-management')) {
        fetchUsers();
        markSectionLoaded('user-management');
      }
    }
  }, [activeSection, loadedSections]);

  return (
    <div className="h-full flex bg-[#F9FAFB]">
      <AdminSidebar 
        activeSection={activeSection} 
        onSectionChange={handleSectionChange}
        deletedInitiativesCount={deletedInitiatives.length}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-3">
          <div className="mb-3">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-1.5">
              <div className="p-1.5 bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl shadow-md">
                <Settings className="text-white" size={18} />
              </div>
              Admin Configuration
            </h2>
          </div>

          {/* Content Area - Show only active section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {activeSection === 'slack' && (
              <div className="animate-fadeIn">
                <div className="px-3 py-1.5 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-indigo-50">
                  <div className="flex items-center gap-1.5">
                    <div className="p-0.5 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-lg">
                      <MessageSquare size={16} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">Slack Integration</h3>
                    </div>
                  </div>
                </div>
                <div className="p-3">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input 
                type="checkbox" 
                id="slack-enabled"
                checked={config.slack?.enabled || false}
                onChange={(e) => setConfig((prev: AppConfig) => ({
                  ...prev,
                  slack: {
                    ...prev.slack,
                    enabled: e.target.checked,
                    webhookUrl: prev.slack?.webhookUrl || ''
                  }
                }))}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="slack-enabled" className="text-sm font-medium text-slate-700 cursor-pointer">
                Enable Slack notifications
              </label>
            </div>
            
            {config.slack?.enabled && (
              <div className="pt-3 border-t border-slate-200">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Webhook URL <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    placeholder="https://hooks.slack.com/services/..."
                    value={config.slack?.webhookUrl || ''}
                    onChange={(e) => setConfig((prev: AppConfig) => ({
                      ...prev,
                      slack: {
                        ...prev.slack,
                        webhookUrl: e.target.value,
                        enabled: prev.slack?.enabled || false
                      }
                    }))}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                  />
                  <p className="text-xs text-slate-500 mt-1">Slack incoming webhook URL. The webhook determines which channel receives notifications.</p>
                </div>
                
                <div className="mt-2">
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-2.5">
                    <p className="text-xs text-blue-800">
                      <strong>Note:</strong> Create an incoming webhook in your Slack workspace and configure it to post to your desired channel. 
                      All notifications will be sent to that channel.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
                </div>
              </div>
            )}

            {activeSection === 'login-history' && (
              <div className="animate-fadeIn">
                <div className="px-3 py-1.5 border-b border-slate-200 bg-gradient-to-r from-cyan-50 to-teal-50 flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <div className="p-0.5 bg-gradient-to-br from-cyan-500 to-teal-500 rounded-lg">
                      <Clock size={16} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">Login History</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Track when users last logged in</p>
                    </div>
                  </div>
                  <button
                    onClick={fetchLoginHistory}
                    disabled={isLoadingHistory}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <RefreshCw size={14} className={isLoadingHistory ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>
                <div className="p-3">
                  {/* Error message */}
                  {loginHistoryError && (
                    <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
            <AlertCircle size={16} />
            {loginHistoryError}
          </div>
        )}
        
        {isLoadingHistory ? (
          <div className="text-center py-6 text-slate-400">
            <Loader2 size={32} className="mx-auto mb-2 animate-spin" />
            <p className="text-sm">Loading login history...</p>
          </div>
        ) : loginHistoryError ? (
          <div className="text-center py-6 text-slate-400">
            <Clock size={32} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm">Unable to load login history</p>
          </div>
        ) : loginHistory.length === 0 ? (
          <div className="text-center py-6 text-slate-400">
            <Users size={32} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">No login history available</p>
            <p className="text-xs text-slate-400 mt-1">User login times will appear here after users log in</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 font-semibold text-slate-600">User</th>
                  <th className="px-3 py-2 font-semibold text-slate-600">Email</th>
                  <th className="px-3 py-2 font-semibold text-slate-600">Role</th>
                  <th className="px-3 py-2 font-semibold text-slate-600">Last Login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loginHistory.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <img 
                          src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`}
                          alt={user.name}
                          className="w-7 h-7 rounded-full bg-slate-200"
                        />
                        <span className="font-medium text-slate-700">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{user.email}</td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-medium">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {user.lastLogin ? (() => {
                        try {
                          const loginDate = new Date(user.lastLogin);
                          if (isNaN(loginDate.getTime())) {
                            return <span className="text-slate-400 italic">Invalid timestamp</span>;
                          }
                          return (
                            <div>
                              <p className="text-sm">{formatRelativeTime(user.lastLogin)}</p>
                              <p className="text-xs text-slate-400">
                                {loginDate.toLocaleString()}
                              </p>
                            </div>
                          );
                        } catch (error) {
                          console.error('Error parsing lastLogin timestamp:', error, user.lastLogin);
                          return <span className="text-slate-400 italic">Invalid timestamp</span>;
                        }
                      })() : (
                        <span className="text-slate-400 italic">Never logged in</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
                </div>
              </div>
            )}

            {activeSection === 'error-logs' && (
              <div className="animate-fadeIn">
                <div className="px-3 py-1.5 border-b border-slate-200 bg-gradient-to-r from-red-50 to-rose-50">
                  <div className="flex items-center gap-1.5">
                    <div className="p-0.5 bg-gradient-to-br from-red-500 to-rose-500 rounded-lg">
                      <AlertTriangle size={16} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">Error Logs</h3>
                      <p className="text-xs text-slate-500 mt-0.5">View and search application error logs for debugging</p>
                    </div>
                  </div>
                </div>
                <div className="p-0">
                  <ErrorLogView currentUser={currentUser} users={users} />
                </div>
              </div>
            )}

            {activeSection === 'activity-logs' && (
              <div className="animate-fadeIn">
                <div className="px-3 py-1.5 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                  <div className="flex items-center gap-1.5">
                    <div className="p-0.5 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg">
                      <Activity size={16} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">Activity Logs</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Track user actions and system activities</p>
                    </div>
                  </div>
                </div>
                <div className="p-0">
                  <ActivityLogView currentUser={currentUser} users={users} />
                </div>
              </div>
            )}

            {activeSection === 'support-center' && (
              <div className="animate-fadeIn">
                <div className="px-3 py-1.5 border-b border-slate-200 bg-gradient-to-r from-green-50 to-emerald-50">
                  <div className="flex items-center gap-1.5">
                    <div className="p-0.5 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg">
                      <MessageSquare size={16} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">Support Center</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Manage support tickets and user feedback</p>
                    </div>
                  </div>
                </div>
                <div className="p-0">
                  <SupportCenter currentUser={currentUser} users={users} />
                </div>
              </div>
            )}

            {activeSection === 'backup-management' && (
              <div className="animate-fadeIn">
                <div className="px-3 py-1.5 border-b border-slate-200 bg-gradient-to-r from-violet-50 to-purple-50 flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <div className="p-0.5 bg-gradient-to-br from-violet-500 to-purple-500 rounded-lg">
                      <Database size={16} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">Backup Management</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Create backups, restore data, and manage backup history</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={createManualBackup}
                      disabled={isCreatingBackup}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-violet-500 to-purple-500 rounded-lg hover:from-violet-600 hover:to-purple-600 transition-colors disabled:opacity-50"
                    >
                      {isCreatingBackup ? <Loader2 size={16} className="animate-spin" /> : <HardDrive size={16} />}
                      Create Backup
                    </button>
                    <button
                      onClick={fetchBackups}
                      disabled={isLoadingBackups}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <RefreshCw size={14} className={isLoadingBackups ? 'animate-spin' : ''} />
                      Refresh
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  {/* Status messages */}
                  {backupError && (
                    <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                      <AlertCircle size={16} />
                      {backupError}
                    </div>
                  )}
                  {backupSuccess && (
                    <div className="mb-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-center gap-2">
                      <CheckCircle2 size={16} />
                      {backupSuccess}
                    </div>
                  )}
                  
                  {isLoadingBackups ? (
                    <div className="text-center py-6 text-slate-400">
                      <Loader2 size={32} className="mx-auto mb-2 animate-spin" />
                      <p className="text-sm">Loading backups...</p>
                    </div>
                  ) : backups.length === 0 ? (
                    <div className="text-center py-6 text-slate-400">
                      <Database size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No backups available</p>
                      <p className="text-xs mt-1">Create your first backup using the button above</p>
                    </div>
                  ) : (
                    <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {backups.slice(0, 9).map((backup) => (
                <div
                  key={backup.date}
                  className="border border-slate-200 rounded-lg p-3 hover:border-violet-300 hover:shadow-sm transition-all cursor-pointer"
                  onClick={() => fetchBackupDetails(backup.date)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1 rounded-lg ${
                        backup.status === 'success' ? 'bg-emerald-100' :
                        backup.status === 'partial' ? 'bg-amber-100' : 'bg-red-100'
                      }`}>
                        <FileCheck size={14} className={
                          backup.status === 'success' ? 'text-emerald-600' :
                          backup.status === 'partial' ? 'text-amber-600' : 'text-red-600'
                        } />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-700">{backup.date}</p>
                        <p className="text-xs text-slate-400">
                          {new Date(backup.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                    <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                      backup.status === 'success' ? 'bg-emerald-100 text-emerald-700' :
                      backup.status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {backup.status}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
                    <span>{backup.files} files</span>
                    <span>{formatBytes(backup.totalSize)}</span>
                  </div>
                  
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        restoreFromBackup(backup.date);
                      }}
                      disabled={isRestoring}
                      className="flex-1 flex items-center justify-center gap-1 px-1.5 py-0.5 text-xs font-medium text-violet-600 bg-violet-50 rounded-lg hover:bg-violet-100 transition-colors disabled:opacity-50"
                    >
                      {isRestoring ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      Restore
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`${API_ENDPOINT}/api/backups/${backup.date}/download`, '_blank');
                      }}
                      className="flex items-center justify-center gap-1 px-1.5 py-0.5 text-xs font-medium text-slate-600 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <Download size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            {backups.length > 9 && (
              <p className="text-center text-xs text-slate-400 mt-3">
                Showing 9 of {backups.length} backups
              </p>
                    )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeSection === 'data-versions' && (
              <div className="animate-fadeIn">
                <div className="px-3 py-1.5 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-cyan-50 flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <div className="p-0.5 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg">
                      <Clock size={16} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">Data Versions</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Automatic local versioning of initiatives and tasks data</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={fetchVersions}
                      disabled={isLoadingVersions}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <RefreshCw size={14} className={isLoadingVersions ? 'animate-spin' : ''} />
                      Refresh
                    </button>
                    <button
                      onClick={cleanupOldVersions}
                      className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                      Cleanup
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  {/* Status messages */}
                  {versionError && (
                    <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                      <AlertCircle size={16} />
                      {versionError}
                    </div>
                  )}
                  {versionSuccess && (
                    <div className="mb-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-center gap-2">
                      <CheckCircle2 size={16} />
                      {versionSuccess}
                    </div>
                  )}

                  {/* Retention Settings */}
                  <div className="mb-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-700">Retention Period</p>
              <p className="text-xs text-slate-500 mt-1">Versions older than this will be automatically cleaned up</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="365"
                value={retentionDays}
                onChange={(e) => {
                  const days = parseInt(e.target.value) || 30;
                  setRetentionDays(days);
                  const versionService = getVersionService();
                  versionService.setRetentionDays(days);
                }}
                className="w-20 px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-600">days</span>
            </div>
          </div>
        </div>
        
        {isLoadingVersions ? (
          <div className="text-center py-6 text-slate-400">
            <Loader2 size={32} className="mx-auto mb-2 animate-spin" />
            <p className="text-sm">Loading versions...</p>
          </div>
        ) : versions.length === 0 ? (
          <div className="text-center py-6 text-slate-400">
            <Clock size={32} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm">No versions available</p>
            <p className="text-xs mt-1">Versions are created automatically when you save data</p>
          </div>
        ) : (
          <div className="p-3">
            <div className="space-y-2">
              {versions.map((version) => (
                <div
                  key={version.id}
                  className="border border-slate-200 rounded-lg p-3 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${
                        version.syncedToSheets ? 'bg-emerald-100' : 'bg-blue-100'
                      }`}>
                        {version.syncedToSheets ? (
                          <CheckCircle2 size={16} className="text-emerald-600" />
                        ) : (
                          <Clock size={16} className="text-blue-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-700">
                          {new Date(version.timestamp).toLocaleString()}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {version.initiativeCount} initiatives • {version.taskCount} tasks
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {version.syncedToSheets && version.sheetsTabName && (
                        <span className="px-1.5 py-0.5 text-xs bg-emerald-100 text-emerald-700 rounded-full">
                          Synced
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        {formatBytes(version.size)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => restoreVersion(version.id)}
                      disabled={isRestoringVersion}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                    >
                      {isRestoringVersion ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      Restore
                    </button>
                    {!version.syncedToSheets && (
                      <button
                        onClick={() => syncVersionToSheets(version.id)}
                        disabled={isSyncingVersion === version.id}
                        className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-violet-600 bg-violet-50 rounded-lg hover:bg-violet-100 transition-colors disabled:opacity-50"
                      >
                        {isSyncingVersion === version.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Database size={12} />
                        )}
                        Sync to Sheets
                      </button>
                    )}
                    <button
                      onClick={() => deleteVersion(version.id)}
                      className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            
            {versions.length > 0 && (
              <div className="mt-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Total: {versions.length} versions</span>
                  <span>{formatBytes(versions.reduce((sum, v) => sum + v.size, 0))}</span>
                </div>
              </div>
            )}
          </div>
        )}
                </div>
              </div>
            )}

            {activeSection === 'trash' && (
              <div className="animate-fadeIn">
                <div className="px-3 py-1.5 border-b border-slate-200 bg-gradient-to-r from-red-50 to-rose-50">
                  <div className="flex items-center gap-1.5">
                    <div className="p-0.5 bg-gradient-to-br from-red-500 to-rose-500 rounded-lg">
                      <Trash2 size={16} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">Trash</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {deletedInitiatives.length} deleted initiative{deletedInitiatives.length !== 1 ? 's' : ''} - restore or permanently remove items
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  {deletedInitiatives.length === 0 ? (
                    <div className="text-center py-6 text-slate-400">
                      <Trash2 size={32} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-sm font-medium text-slate-500">Trash is empty</p>
                      <p className="text-xs text-slate-400 mt-1">Deleted items will appear here</p>
                    </div>
                  ) : (
                    <>
                      <div className="max-h-96 overflow-y-auto">
                        <div className="space-y-2">
                          {deletedInitiatives.map(initiative => (
                            <div
                              key={initiative.id}
                              className="bg-slate-50 border border-slate-200 rounded-lg p-3 hover:shadow-sm transition-shadow"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-medium text-slate-800 truncate">
                                    {initiative.title}
                                  </h4>
                                  <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-slate-500">
                                    <span className="flex items-center gap-1">
                                      <Users size={14} />
                                      {users.find(u => u.id === initiative.ownerId)?.name || initiative.ownerId}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Calendar size={14} />
                                      {initiative.l2_pillar}
                                    </span>
                                    {initiative.deletedAt && (
                                      <span className="flex items-center gap-1 text-red-500">
                                        <Clock size={14} />
                                        Deleted {formatRelativeTime(initiative.deletedAt)}
                                      </span>
                                    )}
                                  </div>
                                  {initiative.deletedAt && (
                                    <p className="text-xs text-slate-400 mt-1">
                                      Deleted on {new Date(initiative.deletedAt).toLocaleString()}
                                    </p>
                                  )}
                                </div>
                                {onRestore && (
                                  <button
                                    onClick={() => onRestore(initiative.id)}
                                    disabled={isDataLoading}
                                    className="ml-4 flex items-center gap-1.5 px-2 py-1 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    <RotateCcw size={14} />
                                    Restore
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-xs text-amber-800">
                          <strong>Note:</strong> Items in trash are kept in the database with a "Deleted" status. 
                          You can restore them at any time. To permanently delete items, remove them directly from the Google Sheet.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {activeSection === 'bulk-import' && (
              <div className="animate-fadeIn">
                <div className="px-3 py-1.5 border-b border-slate-200 bg-gradient-to-r from-amber-50 to-orange-50">
                  <div className="flex items-center gap-1.5">
                    <div className="p-0.5 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg">
                      <Upload size={16} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">Bulk Import</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Import users and tasks from Excel/CSV files</p>
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* User Import */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-2.5 py-1.5 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                <h4 className="font-semibold text-slate-800 flex items-center gap-1.5 text-sm">
                  <Users size={16} className="text-blue-600" /> Bulk Import Users
                </h4>
                <p className="text-xs text-slate-500 mt-1">Upload Excel/CSV with columns: Email, Name, Role</p>
              </div>
          
          <div className="p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <input
                ref={userFileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleUserFileUpload}
                className="hidden"
                id="user-file-upload"
              />
              <label
                htmlFor="user-file-upload"
                className="flex items-center gap-2 px-2.5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm font-medium"
              >
                <Upload size={16} /> Select File
              </label>
              <button
                onClick={copyUserTemplate}
                className="flex items-center gap-2 px-2 py-1 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 hover:border-slate-400 text-sm font-medium transition-colors"
                title="Copy template to clipboard"
              >
                <ClipboardCopy size={16} /> Copy Template
              </button>
              {userImportData.length > 0 && (
                <button
                  onClick={clearUserImport}
                  className="text-slate-400 hover:text-slate-600"
                  title="Clear"
                >
                  <X size={18} />
                </button>
              )}
            </div>
            
            {userImportData.length > 0 && (
              <>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium text-slate-500">Status</th>
                        <th className="px-2 py-1.5 text-left font-medium text-slate-500">Email</th>
                        <th className="px-2 py-1.5 text-left font-medium text-slate-500">Name</th>
                        <th className="px-2 py-1.5 text-left font-medium text-slate-500">Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {userImportData.map((user, idx) => (
                        <tr key={idx} className={user.isValid ? '' : 'bg-red-50'}>
                          <td className="px-2 py-1.5">
                            {user.isValid ? (
                              <CheckCircle2 size={14} className="text-emerald-500" />
                            ) : (
                              <span title={user.error}>
                                <AlertCircle size={14} className="text-red-500" />
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 truncate max-w-[120px]">{user.email}</td>
                          <td className="px-2 py-1.5 truncate max-w-[100px]">{user.name}</td>
                          <td className="px-2 py-1.5">{user.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500">
                    <span className="text-emerald-600 font-medium">{userImportData.filter(u => u.isValid).length}</span> valid,{' '}
                    <span className="text-red-500 font-medium">{userImportData.filter(u => !u.isValid).length}</span> invalid
                  </div>
                  <button
                    onClick={handleUserImportSubmit}
                    disabled={userImportLoading || userImportData.filter(u => u.isValid).length === 0}
                    className="flex items-center gap-2 px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    {userImportLoading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    Import {userImportData.filter(u => u.isValid).length} Users
                  </button>
                </div>
              </>
            )}
            
            {userImportResult && (
              <div className={`p-2.5 rounded-lg text-sm ${userImportResult.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                {userImportResult.success ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} />
                    Created {userImportResult.created} users, skipped {userImportResult.skipped}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} />
                    Import failed: {userImportResult.errors?.[0]?.error}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
            {/* Task Import */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-2.5 py-1.5 border-b border-slate-200 bg-gradient-to-r from-amber-50 to-orange-50">
                <h4 className="font-semibold text-slate-800 flex items-center gap-1.5 text-sm">
                  <ClipboardList size={16} className="text-amber-600" /> Bulk Import Tasks
                </h4>
                <p className="text-xs text-slate-500 mt-1">Upload workplan Excel with initiative data</p>
              </div>
          
          <div className="p-2.5 space-y-2">
            <div className="flex items-center gap-2">
              <input
                ref={taskFileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleTaskFileUpload}
                className="hidden"
                id="task-file-upload"
              />
              <label
                htmlFor="task-file-upload"
                className="flex items-center gap-2 px-2.5 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 cursor-pointer text-sm font-medium"
              >
                <Upload size={16} /> Select File
              </label>
              <button
                onClick={copyTaskTemplate}
                className="flex items-center gap-2 px-2.5 py-1.5 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 hover:border-slate-400 text-sm font-medium transition-colors"
                title="Copy template to clipboard"
              >
                <ClipboardCopy size={16} /> Copy Template
              </button>
              {taskImportData.length > 0 && (
                <button
                  onClick={clearTaskImport}
                  className="text-slate-400 hover:text-slate-600"
                  title="Clear"
                >
                  <X size={18} />
                </button>
              )}
            </div>
            
            {taskImportData.length > 0 && (
              <>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium text-slate-500">Status</th>
                        <th className="px-2 py-1.5 text-left font-medium text-slate-500">Title</th>
                        <th className="px-2 py-1.5 text-left font-medium text-slate-500">Owner</th>
                        <th className="px-2 py-1.5 text-left font-medium text-slate-500">Asset</th>
                        <th className="px-2 py-1.5 text-left font-medium text-slate-500">Priority</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {taskImportData.map((task, idx) => (
                        <tr key={idx} className={task.isValid ? '' : 'bg-red-50'}>
                          <td className="px-2 py-1.5">
                            {task.isValid ? (
                              <CheckCircle2 size={14} className="text-emerald-500" />
                            ) : (
                              <span title={task.error}>
                                <AlertCircle size={14} className="text-red-500" />
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 truncate max-w-[150px]" title={task.title}>{task.title}</td>
                          <td className="px-2 py-1.5 truncate max-w-[100px]">{task.ownerEmail}</td>
                          <td className="px-2 py-1.5">{task.assetClass}</td>
                          <td className="px-2 py-1.5">{task.priority}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-500">
                    <span className="text-emerald-600 font-medium">{taskImportData.filter(t => t.isValid).length}</span> valid,{' '}
                    <span className="text-red-500 font-medium">{taskImportData.filter(t => !t.isValid).length}</span> invalid
                  </div>
                  <button
                    onClick={handleTaskImportSubmit}
                    disabled={taskImportLoading || taskImportData.filter(t => t.isValid).length === 0}
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    {taskImportLoading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    Import {taskImportData.filter(t => t.isValid).length} Tasks
                  </button>
                </div>
              </>
            )}
            
            {taskImportResult && (
              <div className={`p-2.5 rounded-lg text-sm ${taskImportResult.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                {taskImportResult.success ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} />
                    Imported {taskImportResult.imported} initiatives
                    {taskImportResult.errors && taskImportResult.errors.length > 0 && `, ${taskImportResult.errors.length} errors`}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} />
                    Import failed: {taskImportResult.errors?.[0]?.error}
                  </div>
                )}
              </div>
            )}
          </div>
            </div>
          </div>
                </div>
              </div>
            )}

            {activeSection === 'value-lists' && (
              <div className="animate-fadeIn">
                <div className="px-3 py-1.5 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-pink-50">
                  <div className="flex items-center gap-1.5">
                    <div className="p-0.5 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                      <List size={16} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">Value Lists Management</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Manage editable value lists for asset classes, statuses, and dependency teams</p>
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  {!loadedSections.has('value-lists') && (
                    <div className="text-center py-6 text-slate-400">
                      <Loader2 size={32} className="mx-auto mb-2 animate-spin" />
                      <p className="text-sm">Loading value lists...</p>
                    </div>
                  )}
                  {loadedSections.has('value-lists') && (
                    <ValueListsManager
                      config={config}
                      onUpdate={setConfig}
                      initiatives={initiatives}
                    />
                  )}
                </div>
              </div>
            )}


            {activeSection === 'user-management' && (
              <div className="animate-fadeIn">
                <div className="px-3 py-1.5 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-cyan-50 flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <div className="p-0.5 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg">
                      <Users size={16} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">User Management</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Add, edit, or remove users and assign roles</p>
                    </div>
                  </div>
                  <button
                    onClick={fetchUsers}
                    disabled={isLoadingUsers}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <RefreshCw size={14} className={isLoadingUsers ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>
                <div className="p-0">
                  {!loadedSections.has('user-management') && (
                    <div className="text-center py-6 text-slate-400">
                      <Loader2 size={32} className="mx-auto mb-2 animate-spin" />
                      <p className="text-sm">Loading users...</p>
                    </div>
                  )}
                  {loadedSections.has('user-management') && (
                    <>
                      <div className="p-2.5 bg-slate-50 border-b border-slate-100 grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
           <div>
             <label className="block text-xs font-medium text-slate-500 mb-1">Full Name</label>
             <input 
               type="text" 
               placeholder="Jane Doe"
               value={newUser.name || ''}
               onChange={(e) => setNewUser(prev => ({...prev, name: e.target.value}))}
               className="w-full text-sm rounded border-slate-300 p-1.5"
             />
           </div>
           <div>
             <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
             <input 
               type="email" 
               placeholder="jane@company.com"
               value={newUser.email || ''}
               onChange={(e) => setNewUser(prev => ({...prev, email: e.target.value}))}
               className="w-full text-sm rounded border-slate-300 p-1.5"
             />
           </div>
           <div>
             <label className="block text-xs font-medium text-slate-500 mb-1">Role</label>
             <select 
               value={newUser.role}
               onChange={(e) => setNewUser(prev => ({...prev, role: e.target.value as Role}))}
               className="w-full text-sm rounded border-slate-300 p-1.5"
             >
               {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
             </select>
           </div>
           <div>
             <label className="block text-xs font-medium text-slate-500 mb-1">Team</label>
             <select 
               value={newUser.team || ''}
               onChange={(e) => setNewUser(prev => ({...prev, team: e.target.value || undefined}))}
               className="w-full text-sm rounded border-slate-300 p-1.5"
             >
               <option value="">Unassigned</option>
               {teamOptions.map(team => <option key={team} value={team}>{team}</option>)}
             </select>
           </div>
           <button 
             onClick={handleAddUser}
             disabled={!newUser.name || !newUser.email || isAddingUser}
             className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
           >
             {isAddingUser ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} 
             {isAddingUser ? 'Adding...' : 'Add User'}
           </button>
         </div>

         {/* Error messages */}
         {usersError && (
           <div className="mx-3 mb-2 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
             <AlertCircle size={16} />
             {usersError}
           </div>
         )}
         {userError && (
           <div className="mx-3 mb-2 p-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
             <AlertCircle size={16} />
             {userError}
           </div>
         )}

         {isLoadingUsers ? (
           <div className="text-center py-6 text-slate-400">
             <Loader2 size={32} className="mx-auto mb-2 animate-spin" />
             <p className="text-sm">Loading users...</p>
           </div>
         ) : usersError ? (
           <div className="text-center py-6 text-slate-400">
             <Users size={32} className="mx-auto mb-2 text-slate-300" />
             <p className="text-sm">Unable to load users</p>
           </div>
         ) : users.length === 0 ? (
           <div className="text-center py-6 text-slate-400">
             <Users size={32} className="mx-auto mb-2 text-slate-300" />
             <p className="text-sm font-medium text-slate-500">No users found</p>
             <p className="text-xs text-slate-400 mt-1">Add users using the form above</p>
           </div>
         ) : (
           <div className="max-h-80 overflow-y-auto custom-scrollbar">
             <table className="w-full text-left text-sm">
               <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                 <tr>
                   <th className="px-3 py-2 font-semibold text-slate-600">User</th>
                   <th className="px-3 py-2 font-semibold text-slate-600">Email</th>
                   <th className="px-3 py-2 font-semibold text-slate-600">Role</th>
                   <th className="px-3 py-2 font-semibold text-slate-600">Team</th>
                   <th className="px-3 py-2 font-semibold text-slate-600">Initiatives</th>
                   <th className="px-3 py-2 font-semibold text-slate-600 text-right">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                 {users.map(u => {
                   const ownerCount = initiatives.filter(i => i.ownerId === u.id && i.status !== Status.Deleted).length;
                   const userCanBeOwner = canBeOwner(u.role);
                   return (
                     <tr key={u.id} className="hover:bg-slate-50">
                       <td className="px-3 py-2 font-medium flex items-center gap-2">
                         <img src={u.avatar} alt={u.name} className="w-6 h-6 rounded-full bg-slate-200" />
                         {u.name}
                         {userCanBeOwner && (
                           <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded" title="Can be assigned as owner">Owner</span>
                         )}
                       </td>
                       <td className="px-3 py-2 text-slate-500">{u.email}</td>
                       <td className="px-3 py-2">
                         <select
                           value={u.role}
                           onChange={(e) => handleUpdateUser(u.id, 'role', e.target.value as Role)}
                           disabled={isUpdatingUser === u.id}
                           className="text-xs px-2 py-1 rounded border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                         >
                           {Object.values(Role).map(r => (
                             <option key={r} value={r}>{r}</option>
                           ))}
                         </select>
                       </td>
                       <td className="px-3 py-2">
                         <select
                           value={u.team || ''}
                           onChange={(e) => handleUpdateUser(u.id, 'team', e.target.value || undefined)}
                           disabled={isUpdatingUser === u.id}
                           className="text-xs px-2 py-1 rounded border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                         >
                           <option value="">Unassigned</option>
                           {teamOptions.map(team => (
                             <option key={team} value={team}>{team}</option>
                           ))}
                         </select>
                       </td>
                       <td className="px-3 py-2">
                         {userCanBeOwner ? (
                           <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded" title={`Assigned to ${ownerCount} initiative(s)`}>
                             {ownerCount}
                           </span>
                         ) : (
                           <span className="text-xs text-slate-400">-</span>
                         )}
                       </td>
                       <td className="px-3 py-2 text-right">
                         <button 
                           onClick={() => handleDeleteUser(u.id)}
                           disabled={isDeletingUser === u.id}
                           className="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                           title="Remove User"
                         >
                           {isDeletingUser === u.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                         </button>
                       </td>
                     </tr>
                   );
                 })}
               </tbody>
             </table>
           </div>
         )}
                    </>
                  )}
                </div>
              </div>
            )}

            {activeSection === 'authorization-matrix' && (
              <div className="animate-fadeIn">
                <div className="px-3 py-1.5 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-purple-50">
                  <div className="flex items-center gap-1.5">
                    <div className="p-0.5 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg">
                      <Shield size={16} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">Authorization Levels Management Center</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Click badges to cycle through permission levels. Organized by category for easier management.</p>
                    </div>
                  </div>
                </div>
                <div className="p-0">
                  {/* Tabs */}
         <div className="border-b border-slate-200 bg-slate-50">
           <div className="flex">
             <button
               onClick={() => setActivePermissionTab('tabs')}
               className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                 activePermissionTab === 'tabs'
                   ? 'border-indigo-500 text-indigo-600 bg-white'
                   : 'border-transparent text-slate-600 hover:text-slate-800'
               }`}
             >
               <div className="flex items-center gap-1.5">
                 <LayoutDashboard size={16} />
                 Tab Access
               </div>
             </button>
             <button
               onClick={() => setActivePermissionTab('tasks')}
               className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                 activePermissionTab === 'tasks'
                   ? 'border-blue-500 text-blue-600 bg-white'
                   : 'border-transparent text-slate-600 hover:text-slate-800'
               }`}
             >
               <div className="flex items-center gap-1.5">
                 <ClipboardList size={16} />
                 Task Management
               </div>
             </button>
             <button
               onClick={() => setActivePermissionTab('admin')}
               className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 ${
                 activePermissionTab === 'admin'
                   ? 'border-purple-500 text-purple-600 bg-white'
                   : 'border-transparent text-slate-600 hover:text-slate-800'
               }`}
             >
               <div className="flex items-center gap-1.5">
                 <Shield size={16} />
                 Admin & System
               </div>
             </button>
           </div>
         </div>

         <div ref={permissionsTableRef} className="overflow-x-auto">
           <table className="w-full text-left text-sm">
             <thead className="bg-slate-50 border-b border-slate-200">
               <tr>
                 <th className="px-3 py-2 font-semibold text-slate-700 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 min-w-[150px]">Role</th>
                 {activePermissionTab === 'tabs' && tabPermissions.map(perm => (
                   <th key={perm.key} className="px-3 py-2 font-semibold text-slate-600 whitespace-nowrap text-center min-w-[100px]">
                     <div className="flex items-center justify-center gap-1.5">
                       {perm.key === 'accessAllTasks' && <LayoutDashboard size={14} />}
                       {perm.key === 'accessDependencies' && <GitBranch size={14} />}
                       {perm.key === 'accessTimeline' && <Calendar size={14} />}
                       {perm.key === 'accessWorkflows' && <Zap size={14} />}
                       {perm.key === 'accessWorkplanHealth' && <Gauge size={14} />}
                       <span>{perm.label}</span>
                     </div>
                   </th>
                 ))}
                 {activePermissionTab === 'tasks' && taskManagementPermissions.map(perm => (
                   <th key={perm.key} className="px-3 py-2 font-semibold text-slate-600 whitespace-nowrap text-center min-w-[100px]">
                     {perm.label}
                   </th>
                 ))}
                 {activePermissionTab === 'admin' && adminPermissions.map(perm => (
                   <th key={perm.key} className="px-3 py-2 font-semibold text-slate-600 whitespace-nowrap text-center min-w-[100px]">
                     {perm.label}
                   </th>
                 ))}
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
               {Object.values(Role).map(role => (
                 <tr key={role} className="hover:bg-slate-50/50">
                   <td className="px-3 py-2 font-medium bg-white sticky left-0 z-10 border-r border-slate-200 shadow-sm">{role}</td>
                   {activePermissionTab === 'tabs' && tabPermissions.map(perm => {
                     const value = getPermissionValue(role, perm.key) as TabAccessLevel;
                     return (
                       <td key={perm.key} className="px-3 py-2 text-center">
                         <BadgePermission
                           value={value}
                           onChange={(newValue) => handlePermissionChange(role, perm.key, newValue)}
                           type="tab"
                         />
                       </td>
                     );
                   })}
                   {activePermissionTab === 'tasks' && taskManagementPermissions.map(perm => {
                     let value = getPermissionValue(role, perm.key);
                     // Ensure value is a valid TaskManagementScope
                     if (typeof value === 'boolean') {
                       value = value ? 'yes' : 'no';
                     } else if (value !== 'no' && value !== 'yes' && value !== 'own') {
                       value = 'no';
                     }
                     return (
                       <td key={perm.key} className="px-3 py-2 text-center">
                         <BadgePermission
                           value={value as TaskManagementScope}
                           onChange={(newValue) => handlePermissionChange(role, perm.key, newValue)}
                           type="taskManagement"
                         />
                       </td>
                     );
                   })}
                   {activePermissionTab === 'admin' && adminPermissions.map(perm => {
                     let value = getPermissionValue(role, perm.key);
                     // Ensure value is a valid TaskManagementScope
                     if (typeof value === 'boolean') {
                       value = value ? 'yes' : 'no';
                     } else if (value !== 'no' && value !== 'yes' && value !== 'own') {
                       value = 'no';
                     }
                     return (
                       <td key={perm.key} className="px-3 py-2 text-center">
                         <BadgePermission
                           value={value as TaskManagementScope}
                           onChange={(newValue) => handlePermissionChange(role, perm.key, newValue)}
                           type="taskManagement"
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
              </div>
            )}

            {activeSection === 'capacity-planning' && (
              <div className="animate-fadeIn">
                <div className="px-3 py-1.5 border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-teal-50">
                  <div className="flex items-center gap-1.5">
                    <div className="p-0.5 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg">
                      <Gauge size={16} className="text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">Team Capacity Planning (Per Quarter)</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Set the weekly capacity and buffer (reserved for BAU/unplanned) for each Team Lead **per quarter**</p>
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <table className="w-full text-left text-sm">
           <thead className="bg-slate-50 border-b border-slate-200">
             <tr>
               <th className="px-3 py-2 font-semibold text-slate-600">Team Lead</th>
               <th className="px-3 py-2 font-semibold text-slate-600">Base Capacity (wks/quarter)</th>
               <th className="px-3 py-2 font-semibold text-slate-600">Adjustment (wks)</th>
               <th className="px-3 py-2 font-semibold text-slate-600">Adjusted Capacity</th>
               <th className="px-3 py-2 font-semibold text-slate-600">Buffer (wks)</th>
               <th className="px-3 py-2 font-semibold text-slate-600">Effective Capacity</th>
               <th className="px-3 py-2 font-semibold text-slate-600">WP Load</th>
               <th className="px-3 py-2 font-semibold text-slate-600">BAU Load</th>
               <th className="px-3 py-2 font-semibold text-slate-600">WP Actual</th>
               <th className="px-3 py-2 font-semibold text-slate-600">BAU Actual</th>
               <th className="px-3 py-2 font-semibold text-slate-600">Utilization</th>
               <th className="px-3 py-2 font-semibold text-slate-600">Actual Utilization</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-100">
             {users.filter(u => u.role === Role.TeamLead).map(user => {
               const baseCapacity = config.teamCapacities[user.id] || 0;
               const adjustment = config.teamCapacityAdjustments?.[user.id] || 0;
               const adjustedCapacity = Math.max(0, baseCapacity - adjustment);
               const buffer = config.teamBuffers?.[user.id] || 0;
               const effectiveCapacity = Math.max(0, adjustedCapacity - buffer);
               // Calculate WP load (planned effort, exclude BAU and deleted)
               const wpLoad = initiatives.filter(i => i.ownerId === user.id && i.status !== Status.Deleted && i.initiativeType === InitiativeType.WP).reduce((sum, i) => sum + (i.estimatedEffort ?? 0), 0);
               // Calculate BAU load (planned effort, exclude WP and deleted)
               const bauLoad = initiatives.filter(i => i.ownerId === user.id && i.status !== Status.Deleted && i.initiativeType === InitiativeType.BAU).reduce((sum, i) => sum + (i.estimatedEffort ?? 0), 0);
               // Calculate WP actual (actual effort, exclude BAU and deleted)
               const wpActual = initiatives.filter(i => i.ownerId === user.id && i.status !== Status.Deleted && i.initiativeType === InitiativeType.WP).reduce((sum, i) => sum + (i.actualEffort ?? 0), 0);
               // Calculate BAU actual (actual effort, exclude WP and deleted)
               const bauActual = initiatives.filter(i => i.ownerId === user.id && i.status !== Status.Deleted && i.initiativeType === InitiativeType.BAU).reduce((sum, i) => sum + (i.actualEffort ?? 0), 0);
               // Planned Utilization = (WP Load + BAU Load) / Total Capacity
               const totalLoad = wpLoad + bauLoad;
               const utilization = baseCapacity > 0 ? Math.round((totalLoad / baseCapacity) * 100) : 0;
               // Actual Utilization = (WP Actual + BAU Actual) / Total Capacity
               const totalActual = wpActual + bauActual;
               const actualUtilization = baseCapacity > 0 ? Math.round((totalActual / baseCapacity) * 100) : 0;
               let utilColor = 'text-emerald-600';
               if (utilization > 80) utilColor = 'text-amber-600';
               if (utilization > 100) utilColor = 'text-red-600 font-bold';
               let actualUtilColor = 'text-emerald-600';
               if (actualUtilization > 80) actualUtilColor = 'text-amber-600';
               if (actualUtilization > 100) actualUtilColor = 'text-red-600 font-bold';

               return (
                 <tr key={user.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                         {user.name.charAt(0)}
                      </div>
                      {user.name}
                    </div>
                  </td>
                   <td className="px-3 py-2">
                     <input 
                       type="number" 
                       className="w-24 px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                       value={baseCapacity}
                       onChange={(e) => setConfig((prev: AppConfig) => ({...prev, teamCapacities: {...prev.teamCapacities, [user.id]: parseFloat(e.target.value)||0}}))}
                     />
                   </td>
                   <td className="px-3 py-2">
                     <input 
                       type="number" 
                       className="w-24 px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                       value={adjustment}
                       placeholder="0"
                       onChange={(e) => setConfig((prev: AppConfig) => ({
                         ...prev, 
                         teamCapacityAdjustments: {...(prev.teamCapacityAdjustments || {}), [user.id]: parseFloat(e.target.value) || 0}
                       }))}
                     />
                   </td>
                   <td className="px-3 py-2 text-slate-600 font-medium">{adjustedCapacity.toFixed(1)} wks</td>
                   <td className="px-3 py-2">
                     <input 
                       type="number" 
                       className="w-24 px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                       value={buffer}
                       placeholder="0"
                       onChange={(e) => setConfig((prev: AppConfig) => ({
                         ...prev, 
                         teamBuffers: {...(prev.teamBuffers || {}), [user.id]: parseFloat(e.target.value) || 0}
                       }))}
                     />
                   </td>
                   <td className="px-3 py-2 text-slate-600">{effectiveCapacity.toFixed(1)} wks</td>
                   <td className="px-3 py-2">{wpLoad.toFixed(1)} wks</td>
                   <td className="px-3 py-2">{bauLoad.toFixed(1)} wks</td>
                   <td className="px-3 py-2 text-slate-500">{wpActual.toFixed(1)} wks</td>
                   <td className="px-3 py-2 text-slate-500">{bauActual.toFixed(1)} wks</td>
                   <td className={`px-3 py-2 ${utilColor}`}>{utilization}%</td>
                   <td className={`px-3 py-2 ${actualUtilColor}`}>{actualUtilization}%</td>
                 </tr>
               );
             })}
           </tbody>
         </table>
                  <div className="mt-3 p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs text-blue-700">
                      <strong>Note:</strong> Capacity values are per quarter. Base capacity is set by admin. Team leads can set adjustments (deductions) via their profile menu. Adjusted Capacity = Base Capacity - Adjustment. Effective Capacity = Adjusted Capacity - Buffer.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Backup Details Modal */}
      {selectedBackup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedBackup(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center">
              <h4 className="font-bold text-slate-800">Backup Details: {selectedBackup.date}</h4>
              <button onClick={() => setSelectedBackup(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-3 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-xs text-slate-500">Status</p>
                  <p className="font-semibold text-slate-700 capitalize">{selectedBackup.status}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <p className="text-xs text-slate-500">Total Size</p>
                  <p className="font-semibold text-slate-700">{formatBytes(selectedBackup.totalSize)}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <p className="text-xs text-slate-500">Files</p>
                  <p className="font-semibold text-slate-700">{selectedBackup.files.length}</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <p className="text-xs text-slate-500">Duration</p>
                  <p className="font-semibold text-slate-700">{selectedBackup.duration}ms</p>
                </div>
              </div>
              
              <h5 className="font-semibold text-slate-700 mb-2">Files:</h5>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-slate-500">Name</th>
                      <th className="px-2 py-1.5 text-right font-medium text-slate-500">Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedBackup.files.map((file, idx) => (
                      <tr key={idx}>
                        <td className="px-2 py-1.5 text-slate-700">{file.name}</td>
                        <td className="px-2 py-1.5 text-right text-slate-500">{formatBytes(file.size)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {selectedBackup.errors && selectedBackup.errors.length > 0 && (
                <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs font-medium text-red-700 mb-1">Errors:</p>
                  {selectedBackup.errors.map((err, idx) => (
                    <p key={idx} className="text-xs text-red-600">{err}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setSelectedBackup(null)}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-800"
              >
                Close
              </button>
              <button
                onClick={() => {
                  restoreFromBackup(selectedBackup.date);
                  setSelectedBackup(null);
                }}
                disabled={isRestoring}
                className="px-3 py-1.5 text-sm font-medium text-white bg-violet-500 rounded-lg hover:bg-violet-600 disabled:opacity-50"
              >
                Restore This Backup
              </button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
};
