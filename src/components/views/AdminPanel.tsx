import React, { useState, useRef, useEffect } from 'react';
import { Settings, History, Trash2, Plus, MessageSquare, FileSpreadsheet, Upload, AlertCircle, CheckCircle2, X, Loader2, Users, ClipboardList, Gauge, ClipboardCopy, Eye, Edit, Check, XCircle, LayoutDashboard, GitBranch, Calendar, Zap, Shield, Clock, RefreshCw } from 'lucide-react';
import { User, Role, AppConfig, Initiative, ChangeRecord, PermissionKey, TabAccessLevel, TaskManagementScope, PermissionValue } from '../../types';
import { generateId, exportToExcel } from '../../utils';
import * as XLSX from 'xlsx';

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

interface AdminPanelProps {
  currentUser: User;
  config: AppConfig;
  setConfig: (config: AppConfig | ((prev: AppConfig) => AppConfig)) => void;
  users: User[];
  setUsers: (users: User[]) => void;
  initiatives: Initiative[];
  changeLog: ChangeRecord[];
  onGenerate30Initiatives?: () => Promise<void>;
  onClearCache?: () => Promise<void>;
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

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || '';

export const AdminPanel: React.FC<AdminPanelProps> = ({
  currentUser,
  config,
  setConfig,
  users,
  setUsers,
  initiatives,
  changeLog,
  onGenerate30Initiatives,
  onClearCache: _onClearCache
}) => {
  void _onClearCache; // Reserved for cache clearing feature
  const [newUser, setNewUser] = useState<Partial<User>>({ role: Role.TeamLead });
  
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
  
  // Fetch login history
  const fetchLoginHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const response = await fetch(`${API_ENDPOINT}/api/admin/login-history`, {
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setLoginHistory(data.users || []);
      }
    } catch (error) {
      console.error('Failed to fetch login history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };
  
  // Initial fetch
  useEffect(() => {
    fetchLoginHistory();
  }, []);
  
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
     return <div className="p-10 text-center text-red-500 font-bold">Access Denied</div>;
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
        const usersResponse = await fetch(`${API_ENDPOINT}/api/auth/users`);
        const usersData = await usersResponse.json();
        if (usersData.users) {
          setUsers(usersData.users);
        }
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

  const handleAddUser = () => {
    if (!newUser.name || !newUser.email) return;
    const id = 'u_' + generateId().substring(0, 5);
    const user: User = {
      id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role as Role,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(newUser.name)}&background=random`,
      team: newUser.team
    };
    setUsers([...users, user]);
    setNewUser({ role: Role.TeamLead });
  };

  const handleDeleteUser = (id: string) => {
    if (id === currentUser.id) {
      alert("You cannot delete yourself.");
      return;
    }
    if (confirm("Are you sure you want to delete this user?")) {
      setUsers(users.filter(u => u.id !== id));
    }
  };

  // Update user role or team inline
  const handleUpdateUser = (userId: string, field: keyof User, value: any) => {
    setUsers(users.map(u => 
      u.id === userId ? { ...u, [field]: value } : u
    ));
  };

  // Team options based on asset classes + custom options
  const teamOptions = ['PL', 'Auto', 'POS', 'Advisory', 'Platform', 'Operations', 'Other'];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl shadow-md">
            <Settings className="text-white" size={22} />
          </div>
          Admin Configuration
        </h2>

        <div className="flex items-center gap-3">
          {onGenerate30Initiatives && (
            <button
              onClick={onGenerate30Initiatives}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 shadow-md hover:shadow-lg transition-all font-semibold text-sm"
            >
              <Plus size={18} /> Generate 30 Initiatives
            </button>
          )}
          <button 
            onClick={() => exportToExcel(initiatives, users, 'full-data-export')}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl hover:from-emerald-600 hover:to-emerald-700 shadow-md hover:shadow-lg transition-all font-semibold text-sm"
          >
            <FileSpreadsheet size={18} /> Export All Data
          </button>
        </div>
      </div>

      {/* Slack Integration */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
         <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-slate-200">
           <h3 className="font-bold text-slate-800 flex items-center gap-2">
             <div className="p-1.5 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-lg">
               <MessageSquare size={16} className="text-white" />
             </div>
             Slack Integration
           </h3>
         </div>
         <div className="p-6">
         <div className="space-y-4">
           <div className="flex items-center gap-3">
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
             <div className="pt-4 border-t border-slate-200">
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
                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                 />
                 <p className="text-xs text-slate-500 mt-1">Slack incoming webhook URL. The webhook determines which channel receives notifications.</p>
               </div>
               
               <div className="mt-4">
                 <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
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
      
      {/* Audit Log */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
         <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-amber-50 to-orange-50">
           <h3 className="font-bold text-slate-800 flex items-center gap-2">
             <div className="p-1.5 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg">
               <History size={14} className="text-white" />
             </div>
             Recent Changes (Audit Log)
           </h3>
         </div>
         <div className="max-h-80 overflow-y-auto custom-scrollbar">
           <table className="w-full text-left text-sm">
              <thead className="bg-gradient-to-b from-slate-50 to-white sticky top-0 shadow-sm">
                <tr>
                  <th className="px-4 py-3 text-xs font-bold text-slate-600 tracking-wider">Initiative</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-600 tracking-wider">Change</th>
                  <th className="px-4 py-3 text-xs font-bold text-slate-600 tracking-wider">By</th>
                </tr>
              </thead>
              <tbody>
                {changeLog.length === 0 ? (
                  <tr><td colSpan={3} className="p-4 text-center text-slate-400 text-xs">No recorded changes in this session.</td></tr>
                ) : changeLog.map(log => (
                  <tr key={log.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2 truncate max-w-[150px]" title={log.initiativeTitle}>{log.initiativeTitle}</td>
                    <td className="px-4 py-2 text-xs">
                      <span className="font-semibold text-slate-700">{log.field}:</span> 
                      <span className="text-red-500 mx-1">{String(log.oldValue ?? '')}</span>
                      &rarr;
                      <span className="text-emerald-500 mx-1">{String(log.newValue ?? '')}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">{log.changedBy}</td>
                  </tr>
                ))}
              </tbody>
           </table>
         </div>
      </div>

      {/* Login History Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-cyan-50 to-teal-50 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <div className="p-1.5 bg-gradient-to-br from-cyan-500 to-teal-500 rounded-lg">
                <Clock size={16} className="text-white" />
              </div>
              Login History
            </h3>
            <p className="text-xs text-slate-500 mt-1 ml-8">Track when users last logged in</p>
          </div>
          <button
            onClick={fetchLoginHistory}
            disabled={isLoadingHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={14} className={isLoadingHistory ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
        
        {isLoadingHistory ? (
          <div className="text-center py-8 text-slate-400">
            <Loader2 size={32} className="mx-auto mb-2 animate-spin" />
            <p className="text-sm">Loading login history...</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-600">User</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Email</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Role</th>
                  <th className="px-4 py-3 font-semibold text-slate-600">Last Login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loginHistory.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <img 
                          src={user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`}
                          alt={user.name}
                          className="w-7 h-7 rounded-full bg-slate-200"
                        />
                        <span className="font-medium text-slate-700">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {user.lastLogin ? (
                        <div>
                          <p className="text-sm">{formatRelativeTime(user.lastLogin)}</p>
                          <p className="text-xs text-slate-400">
                            {new Date(user.lastLogin).toLocaleString()}
                          </p>
                        </div>
                      ) : (
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

      {/* Bulk Import Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* User Import */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Users size={18} className="text-blue-600" /> Bulk Import Users
            </h3>
            <p className="text-xs text-slate-500 mt-1">Upload Excel/CSV with columns: Email, Name, Role</p>
          </div>
          
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
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
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer text-sm font-medium"
              >
                <Upload size={16} /> Select File
              </label>
              <button
                onClick={copyUserTemplate}
                className="flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 hover:border-slate-400 text-sm font-medium transition-colors"
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
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Status</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Email</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Name</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {userImportData.map((user, idx) => (
                        <tr key={idx} className={user.isValid ? '' : 'bg-red-50'}>
                          <td className="px-3 py-2">
                            {user.isValid ? (
                              <CheckCircle2 size={14} className="text-emerald-500" />
                            ) : (
                              <span title={user.error}>
                                <AlertCircle size={14} className="text-red-500" />
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 truncate max-w-[120px]">{user.email}</td>
                          <td className="px-3 py-2 truncate max-w-[100px]">{user.name}</td>
                          <td className="px-3 py-2">{user.role}</td>
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
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    {userImportLoading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    Import {userImportData.filter(u => u.isValid).length} Users
                  </button>
                </div>
              </>
            )}
            
            {userImportResult && (
              <div className={`p-3 rounded-lg text-sm ${userImportResult.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
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
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-amber-50 to-orange-50">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <ClipboardList size={18} className="text-amber-600" /> Bulk Import Tasks
            </h3>
            <p className="text-xs text-slate-500 mt-1">Upload workplan Excel with initiative data</p>
          </div>
          
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
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
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 cursor-pointer text-sm font-medium"
              >
                <Upload size={16} /> Select File
              </label>
              <button
                onClick={copyTaskTemplate}
                className="flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 hover:border-slate-400 text-sm font-medium transition-colors"
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
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Status</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Title</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Owner</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Asset</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Priority</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {taskImportData.map((task, idx) => (
                        <tr key={idx} className={task.isValid ? '' : 'bg-red-50'}>
                          <td className="px-3 py-2">
                            {task.isValid ? (
                              <CheckCircle2 size={14} className="text-emerald-500" />
                            ) : (
                              <span title={task.error}>
                                <AlertCircle size={14} className="text-red-500" />
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 truncate max-w-[150px]" title={task.title}>{task.title}</td>
                          <td className="px-3 py-2 truncate max-w-[100px]">{task.ownerEmail}</td>
                          <td className="px-3 py-2">{task.assetClass}</td>
                          <td className="px-3 py-2">{task.priority}</td>
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
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    {taskImportLoading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    Import {taskImportData.filter(t => t.isValid).length} Tasks
                  </button>
                </div>
              </>
            )}
            
            {taskImportResult && (
              <div className={`p-3 rounded-lg text-sm ${taskImportResult.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
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

      {/* User Management */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
         <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-cyan-50 flex justify-between items-center">
           <div>
             <h3 className="font-bold text-slate-800 flex items-center gap-2">
               <div className="p-1.5 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg">
                 <Users size={16} className="text-white" />
               </div>
               User Management
             </h3>
             <p className="text-xs text-slate-500 mt-1 ml-8">Add, edit, or remove users and assign roles.</p>
           </div>
         </div>
         
         <div className="p-4 bg-slate-50 border-b border-slate-100 grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
           <div>
             <label className="block text-xs font-medium text-slate-500 mb-1">Full Name</label>
             <input 
               type="text" 
               placeholder="Jane Doe"
               value={newUser.name || ''}
               onChange={(e) => setNewUser(prev => ({...prev, name: e.target.value}))}
               className="w-full text-sm rounded border-slate-300 p-2"
             />
           </div>
           <div>
             <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
             <input 
               type="email" 
               placeholder="jane@company.com"
               value={newUser.email || ''}
               onChange={(e) => setNewUser(prev => ({...prev, email: e.target.value}))}
               className="w-full text-sm rounded border-slate-300 p-2"
             />
           </div>
           <div>
             <label className="block text-xs font-medium text-slate-500 mb-1">Role</label>
             <select 
               value={newUser.role}
               onChange={(e) => setNewUser(prev => ({...prev, role: e.target.value as Role}))}
               className="w-full text-sm rounded border-slate-300 p-2"
             >
               {Object.values(Role).map(r => <option key={r} value={r}>{r}</option>)}
             </select>
           </div>
           <div>
             <label className="block text-xs font-medium text-slate-500 mb-1">Team</label>
             <select 
               value={newUser.team || ''}
               onChange={(e) => setNewUser(prev => ({...prev, team: e.target.value || undefined}))}
               className="w-full text-sm rounded border-slate-300 p-2"
             >
               <option value="">Unassigned</option>
               {teamOptions.map(team => <option key={team} value={team}>{team}</option>)}
             </select>
           </div>
           <button 
             onClick={handleAddUser}
             disabled={!newUser.name || !newUser.email}
             className="bg-blue-600 text-white text-sm px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
           >
             <Plus size={16} /> Add User
           </button>
         </div>

         <div className="max-h-80 overflow-y-auto custom-scrollbar">
           <table className="w-full text-left text-sm">
             <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
               <tr>
                 <th className="px-6 py-3 font-semibold text-slate-600">User</th>
                 <th className="px-6 py-3 font-semibold text-slate-600">Email</th>
                 <th className="px-6 py-3 font-semibold text-slate-600">Role</th>
                 <th className="px-6 py-3 font-semibold text-slate-600">Team</th>
                 <th className="px-6 py-3 font-semibold text-slate-600 text-right">Actions</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
               {users.map(u => (
                 <tr key={u.id} className="hover:bg-slate-50">
                   <td className="px-6 py-3 font-medium flex items-center gap-2">
                     <img src={u.avatar} alt={u.name} className="w-6 h-6 rounded-full bg-slate-200" />
                     {u.name}
                   </td>
                   <td className="px-6 py-3 text-slate-500">{u.email}</td>
                   <td className="px-6 py-3">
                     <select
                       value={u.role}
                       onChange={(e) => handleUpdateUser(u.id, 'role', e.target.value as Role)}
                       className="text-xs px-2 py-1 rounded border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer"
                     >
                       {Object.values(Role).map(r => (
                         <option key={r} value={r}>{r}</option>
                       ))}
                     </select>
                   </td>
                   <td className="px-6 py-3">
                     <select
                       value={u.team || ''}
                       onChange={(e) => handleUpdateUser(u.id, 'team', e.target.value || undefined)}
                       className="text-xs px-2 py-1 rounded border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none cursor-pointer"
                     >
                       <option value="">Unassigned</option>
                       {teamOptions.map(team => (
                         <option key={team} value={team}>{team}</option>
                       ))}
                     </select>
                   </td>
                   <td className="px-6 py-3 text-right">
                     <button 
                       onClick={() => handleDeleteUser(u.id)}
                       className="text-slate-400 hover:text-red-500 transition-colors"
                       title="Remove User"
                     >
                       <Trash2 size={16} />
                     </button>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>
      </div>

      {/* Authorization Matrix */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
         <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-purple-50">
           <h3 className="font-bold text-slate-800 flex items-center gap-2">
             <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg">
               <Settings size={16} className="text-white" />
             </div>
             Authorization Levels Management Center
           </h3>
           <p className="text-xs text-slate-500 mt-1 ml-8">Click badges to cycle through permission levels. Organized by category for easier management.</p>
         </div>
         
         {/* Tabs */}
         <div className="border-b border-slate-200 bg-slate-50">
           <div className="flex">
             <button
               onClick={() => setActivePermissionTab('tabs')}
               className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                 activePermissionTab === 'tabs'
                   ? 'border-indigo-500 text-indigo-600 bg-white'
                   : 'border-transparent text-slate-600 hover:text-slate-800'
               }`}
             >
               <div className="flex items-center gap-2">
                 <LayoutDashboard size={16} />
                 Tab Access
               </div>
             </button>
             <button
               onClick={() => setActivePermissionTab('tasks')}
               className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                 activePermissionTab === 'tasks'
                   ? 'border-blue-500 text-blue-600 bg-white'
                   : 'border-transparent text-slate-600 hover:text-slate-800'
               }`}
             >
               <div className="flex items-center gap-2">
                 <ClipboardList size={16} />
                 Task Management
               </div>
             </button>
             <button
               onClick={() => setActivePermissionTab('admin')}
               className={`px-6 py-3 text-sm font-medium transition-colors border-b-2 ${
                 activePermissionTab === 'admin'
                   ? 'border-purple-500 text-purple-600 bg-white'
                   : 'border-transparent text-slate-600 hover:text-slate-800'
               }`}
             >
               <div className="flex items-center gap-2">
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
                 <th className="px-4 py-3 font-semibold text-slate-700 sticky left-0 bg-slate-50 z-10 border-r border-slate-200 min-w-[150px]">Role</th>
                 {activePermissionTab === 'tabs' && tabPermissions.map(perm => (
                   <th key={perm.key} className="px-3 py-3 font-semibold text-slate-600 whitespace-nowrap text-center min-w-[100px]">
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
                   <th key={perm.key} className="px-3 py-3 font-semibold text-slate-600 whitespace-nowrap text-center min-w-[100px]">
                     {perm.label}
                   </th>
                 ))}
                 {activePermissionTab === 'admin' && adminPermissions.map(perm => (
                   <th key={perm.key} className="px-3 py-3 font-semibold text-slate-600 whitespace-nowrap text-center min-w-[100px]">
                     {perm.label}
                   </th>
                 ))}
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
               {Object.values(Role).map(role => (
                 <tr key={role} className="hover:bg-slate-50/50">
                   <td className="px-4 py-3 font-medium bg-white sticky left-0 z-10 border-r border-slate-200 shadow-sm">{role}</td>
                   {activePermissionTab === 'tabs' && tabPermissions.map(perm => {
                     const value = getPermissionValue(role, perm.key) as TabAccessLevel;
                     return (
                       <td key={perm.key} className="px-3 py-3 text-center">
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
                       <td key={perm.key} className="px-3 py-3 text-center">
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
                       <td key={perm.key} className="px-3 py-3 text-center">
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

      {/* Capacity Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
         <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-teal-50">
           <h3 className="font-bold text-slate-800 flex items-center gap-2">
             <div className="p-1.5 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg">
               <Gauge size={16} className="text-white" />
             </div>
             Team Capacity Planning
           </h3>
           <p className="text-xs text-slate-500 mt-1 ml-8">Set the weekly capacity and buffer (reserved for BAU/unplanned) for each Team Lead.</p>
         </div>
         <table className="w-full text-left text-sm">
           <thead className="bg-slate-50 border-b border-slate-200">
             <tr>
               <th className="px-6 py-3 font-semibold text-slate-600">Team Lead</th>
               <th className="px-6 py-3 font-semibold text-slate-600">Total Capacity (wks)</th>
               <th className="px-6 py-3 font-semibold text-slate-600">Buffer (wks)</th>
               <th className="px-6 py-3 font-semibold text-slate-600">Effective Capacity</th>
               <th className="px-6 py-3 font-semibold text-slate-600">Assigned Load</th>
               <th className="px-6 py-3 font-semibold text-slate-600">Utilization</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-100">
             {users.filter(u => u.role === Role.TeamLead).map(user => {
               const capacity = config.teamCapacities[user.id] || 0;
               const buffer = config.teamBuffers?.[user.id] || 0;
               const effectiveCapacity = Math.max(0, capacity - buffer);
               const load = initiatives.filter(i => i.ownerId === user.id).reduce((sum, i) => sum + (i.estimatedEffort ?? 0), 0);
               const utilization = effectiveCapacity > 0 ? Math.round((load / effectiveCapacity) * 100) : 0;
               let utilColor = 'text-emerald-600';
               if (utilization > 80) utilColor = 'text-amber-600';
               if (utilization > 100) utilColor = 'text-red-600 font-bold';

               return (
                 <tr key={user.id} className="hover:bg-slate-50">
                   <td className="px-6 py-3 font-medium flex items-center gap-2">
                     <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                        {user.name.charAt(0)}
                     </div>
                     {user.name}
                   </td>
                   <td className="px-6 py-3">
                     <input 
                       type="number" 
                       className="w-24 px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                       value={capacity}
                       onChange={(e) => setConfig((prev: AppConfig) => ({...prev, teamCapacities: {...prev.teamCapacities, [user.id]: parseFloat(e.target.value)||0}}))}
                     />
                   </td>
                   <td className="px-6 py-3">
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
                   <td className="px-6 py-3 text-slate-600">{effectiveCapacity} wks</td>
                   <td className="px-6 py-3">{load} wks</td>
                   <td className={`px-6 py-3 ${utilColor}`}>{utilization}%</td>
                 </tr>
               );
             })}
           </tbody>
         </table>
      </div>
    </div>
  );
};
