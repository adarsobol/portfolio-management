import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, useParams, Routes, Route } from 'react-router-dom';
import { Search, Plus, ChevronDown } from 'lucide-react';

import { USERS, INITIAL_INITIATIVES, INITIAL_CONFIG, migratePermissions, getAssetClassFromTeam } from './constants';
import { Initiative, Status, WorkType, AppConfig, ChangeRecord, TradeOffAction, User, ViewType, Role, PermissionKey, Notification, NotificationType, Comment, UserCommentReadState, InitiativeType, AssetClass, UnplannedTag, Task, WorkflowTrigger, ActivityType } from './types';
import { getOwnerName, generateId, parseMentions, logger, canCreateTasks, canViewTab, canDeleteInitiative, getTaskManagementScope } from './utils';
import { formatError } from './utils/errorUtils';
import { useLocalStorage, useVersionCheck } from './hooks';
import { useUrlState } from './hooks/useUrlState';
import { slackService, workflowEngine, realtimeService, sheetsSync, notificationService, logService } from './services';
import { getVersionService } from './services/versionService';
import { validateWeeklyTeamEffort, getCurrentWeekKey, ValidationResult } from './services/weeklyEffortValidation';
import { useAuth, useToast } from './contexts';
import InitiativeModal from './components/modals/InitiativeModal';
import AtRiskReasonModal from './components/modals/AtRiskReasonModal';
import { WeeklyEffortWarningModal } from './components/modals/WeeklyEffortWarningModal';
import { EffortExceededModal } from './components/modals/EffortExceededModal';

// Components
import { TopNav } from './components/shared/TopNav';
import { FilterBar } from './components/shared/FilterBar';
import { NotificationMenu } from './components/shared/NotificationMenu';
import { ExportDropdown } from './components/shared/ExportDropdown';
import { PresenceIndicator } from './components/shared/PresenceIndicator';
import { LoadingSpinner, SupportWidget } from './components/shared';
import { MetricsDashboard } from './components/views/MetricsDashboard';
import { ResourcesDashboard } from './components/views/ResourcesDashboard';
import { TaskTable } from './components/views/TaskTable';
import { CalendarView } from './components/views/CalendarView';
import { AdminPanel } from './components/views/AdminPanel';
import { WorkflowsView } from './components/views/WorkflowsView';
import { DependenciesView } from './components/views/DependenciesView';
import { LoginPage } from './components/auth';

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || '';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { user: authUser, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { showSuccess, showError, showInfo, showErrorWithDetails } = useToast();
  
  // Check for app updates and auto-refresh if new version detected
  useVersionCheck();
  
  // Ref for main scrollable container
  const mainContainerRef = useRef<HTMLElement>(null);
  
  // Ref to track latest initiatives for workflow execution (prevents race conditions)
  const initiativesRef = useRef<Initiative[]>([]);
  
  // State for Users - start with hardcoded as fallback, load from API
  const [users, setUsers] = useState<User[]>(USERS);
  const [usersLoaded, setUsersLoaded] = useState(false);
  
  // Use authenticated user or fallback
  const currentUser = authUser || users.find(u => u.email === 'adar.sobol@pagaya.com') || users[0]; 
  
  // Data loading state
  const [isDataLoading, setIsDataLoading] = useState(true);
  
  // Initiatives - loaded from localStorage
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  
  // Helper function to deduplicate initiatives by ID (keeps first occurrence)
  const deduplicateInitiatives = (initiatives: Initiative[]): Initiative[] => {
    const seenIds = new Set<string>();
    const duplicates: string[] = [];
    const deduplicated = initiatives.filter(init => {
      if (seenIds.has(init.id)) {
        duplicates.push(init.id);
        return false;
      }
      seenIds.add(init.id);
      return true;
    });
    if (duplicates.length > 0) {
      console.warn(`[DEBUG] Found ${duplicates.length} duplicate initiative IDs: ${duplicates.join(', ')}`);
    }
    return deduplicated;
  };

  // Keep ref in sync with state and detect duplicates
  useEffect(() => {
    initiativesRef.current = initiatives;
    
    // Safety check: if duplicates are detected in state, deduplicate immediately
    const duplicateIds = initiatives.map(i => i.id).filter((id, idx, arr) => arr.indexOf(id) !== idx);
    if (duplicateIds.length > 0) {
      console.error(`[DEBUG] CRITICAL: Duplicates detected in state! IDs: ${[...new Set(duplicateIds)].join(', ')}. Deduplicating...`);
      const deduplicated = deduplicateInitiatives(initiatives);
      // Only update if the deduplicated array is different (prevents infinite loop)
      if (deduplicated.length !== initiatives.length) {
        setInitiatives(deduplicated);
      }
    }
  }, [initiatives]);
  const [config, setConfig] = useLocalStorage<AppConfig>('portfolio-config', INITIAL_CONFIG);
  
  // Load value lists from backend on startup (all authenticated users need them)
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const loadValueLists = async () => {
      try {
        const token = localStorage.getItem('portfolio-auth-token');
        const response = await fetch(`${API_ENDPOINT}/api/config/value-lists`, {
          headers: {
            'Authorization': `Bearer ${token || ''}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.valueLists) {
            // Merge backend value lists with local config
            // Backend is source of truth for value lists
            // Note: getPriorities, getUnplannedTags, getInitiativeTypes, getQuarters
            // will automatically ensure required UI values are included
            setConfig(prev => ({
              ...prev,
              valueLists: data.valueLists,
              valueListsMigrated: true
            }));
          }
        }
      } catch (error) {
        console.error('Failed to load value lists from backend:', error);
        // Continue with local config if backend fails
      }
    };

    loadValueLists();
  }, [isAuthenticated, setConfig]);
  
  // Audit State (changeLog is maintained for internal tracking but not displayed in UI)
  const [changeLog, setChangeLog] = useState<ChangeRecord[]>([]);
  void changeLog; // Used by setChangeLog for internal tracking
  
  // Notifications State - synced with server
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoaded, setNotificationsLoaded] = useState(false);
  
  // Comment Read State - tracks when each user last viewed comments on each initiative
  const [commentReadState, setCommentReadState] = useLocalStorage<UserCommentReadState>('portfolio-comment-read-state', {});


  // Load users from API
  useEffect(() => {
    if (!isAuthenticated || usersLoaded) return;

    const loadUsers = async () => {
      try {
        const response = await fetch(`${API_ENDPOINT}/api/auth/users`);
        if (response.ok) {
          const data = await response.json();
          if (data.users && data.users.length > 0) {
            // Merge API users with any missing hardcoded users (as fallback)
            const apiUserEmails = new Set(data.users.map((u: User) => u.email.toLowerCase()));
            const fallbackUsers = USERS.filter(u => !apiUserEmails.has(u.email.toLowerCase()));
            setUsers([...data.users, ...fallbackUsers]);
          }
        }
      } catch (error) {
        logger.error('Failed to load users from API', { context: 'App.loadUsers', error: error instanceof Error ? error : new Error(String(error)) });
        // Keep using USERS as fallback
      } finally {
        setUsersLoaded(true);
      }
    };

    loadUsers();
  }, [isAuthenticated, usersLoaded]);

  // Load notifications from server
  useEffect(() => {
    console.log('[APP] Notification useEffect triggered:', {
      isAuthenticated,
      currentUserId: currentUser?.id,
      currentUserEmail: currentUser?.email,
      notificationsLoaded
    });
    
    if (!isAuthenticated || !currentUser?.id || notificationsLoaded) {
      console.log('[APP] Skipping notification load:', {
        reason: !isAuthenticated ? 'not authenticated' : !currentUser?.id ? 'no user id' : 'already loaded'
      });
      return;
    }

    const loadNotifications = async () => {
      try {
        console.log('[APP] Loading notifications for user:', currentUser.id, 'email:', currentUser.email);
        const serverNotifications = await notificationService.fetchNotifications(currentUser.id);
        console.log('[APP] Loaded notifications from server:', serverNotifications.length, 'notifications');
        if (serverNotifications.length > 0) {
          console.log('[APP] Notification details:', serverNotifications.map(n => ({
            id: n.id,
            title: n.title,
            userId: n.userId,
            type: n.type
          })));
        }
        setNotifications(serverNotifications);
      } catch (error) {
        console.error('[APP] Failed to load notifications:', error);
        logger.error('Failed to load notifications from server', { 
          context: 'App.loadNotifications', 
          error: error instanceof Error ? error : new Error(String(error)) 
        });
        // Fall back to empty array
        setNotifications([]);
      } finally {
        setNotificationsLoaded(true);
      }
    };

    loadNotifications();
  }, [isAuthenticated, currentUser?.id, notificationsLoaded]);

  // Load initiatives from Google Sheets on startup (with localStorage fallback)
  useEffect(() => {
    if (!isAuthenticated) {
      setIsDataLoading(false);
      return;
    }

    let isMounted = true;

    const loadData = async () => {
      setIsDataLoading(true);
      try {
        // Use sheetsSync which fetches from Google Sheets with localStorage fallback
        const loadedInitiatives = await sheetsSync.loadInitiatives();
        
        if (!isMounted) return;
        
        // Deduplicate by ID (keep first occurrence)
        const deduplicatedInitiatives = deduplicateInitiatives(loadedInitiatives);
        
        const duplicatesRemoved = loadedInitiatives.length - deduplicatedInitiatives.length;
        if (duplicatesRemoved > 0) {
          console.log(`[DEBUG] loadData: Setting ${deduplicatedInitiatives.length} initiatives (removed ${duplicatesRemoved} duplicates)`);
        }
        
        // #region agent log
        const sampleOwnerIds = deduplicatedInitiatives.slice(0, 5).map(i => ({ id: i.id, title: i.title, ownerId: i.ownerId }));
        fetch('http://127.0.0.1:7242/ingest/30bff00f-1252-4a6a-a1a1-ff6715802d11',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'App.tsx:loadData',message:'Data loaded - current user and sample initiatives',data:{currentUserId:currentUser?.id,currentUserEmail:currentUser?.email,currentUserRole:currentUser?.role,sampleOwnerIds,totalInitiatives:deduplicatedInitiatives.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,D'})}).catch(()=>{});
        // #endregion
        setInitiatives(deduplicatedInitiatives);
      } catch (error) {
        logger.error('Failed to load initiatives', { context: 'App.loadData', error: error instanceof Error ? error : new Error(String(error)) });
        if (isMounted) {
          setInitiatives([]);
        }
      } finally {
        if (isMounted) {
          setIsDataLoading(false);
        }
      }
    };

    loadData();
    
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated]);

  // Connect to real-time collaboration service
  useEffect(() => {
    if (isAuthenticated && currentUser) {
      realtimeService.connect(currentUser);

      // Subscribe to real-time initiative updates
      const unsubUpdate = realtimeService.onInitiativeUpdate(({ initiative }) => {
        setInitiatives(prev => {
          return prev.map(i => i.id === initiative.id ? initiative : i);
        });
      });

      const unsubCreate = realtimeService.onInitiativeCreate(({ initiative }) => {
        setInitiatives(prev => {
          const existing = prev.find(i => i.id === initiative.id);
          if (existing) {
            console.warn(`[DEBUG] realtime create: Initiative ${initiative.id} already exists, skipping duplicate`);
            return prev;
          }
          console.log(`[DEBUG] realtime create: Adding new initiative ${initiative.id}`);
          return [...prev, initiative];
        });
      });

      const unsubComment = realtimeService.onCommentAdded(({ initiativeId, comment }) => {
        setInitiatives(prev => prev.map(i => {
          if (i.id === initiativeId) {
            const existingComments = i.comments || [];
            if (existingComments.find(c => c.id === comment.id)) return i;
            return { ...i, comments: [...existingComments, comment] };
          }
          return i;
        }));
      });

      // Subscribe to real-time notifications
      const unsubNotification = realtimeService.onNotificationReceived(({ notification }) => {
        console.log('[APP] Received notification via Socket.IO:', {
          notificationId: notification.id,
          notificationTitle: notification.title,
          notificationUserId: notification.userId,
          currentUserId: currentUser.id,
          currentUserEmail: currentUser.email
        });
        
        // Add the notification to local state (it's already been filtered for current user)
        setNotifications(prev => {
          // Avoid duplicates
          if (prev.find(n => n.id === notification.id)) {
            console.log('[APP] Notification already exists, skipping:', notification.id);
            return prev;
          }
          console.log('[APP] Adding notification to state, new count:', prev.length + 1);
          return [notification, ...prev];
        });
      });

      return () => {
        unsubUpdate();
        unsubCreate();
        unsubComment();
        unsubNotification();
        realtimeService.disconnect();
      };
    }
  }, [isAuthenticated, currentUser]);


  // Migrate config to ensure all new permissions and fields are present
  useEffect(() => {
    let needsUpdate = false;
    const updatedConfig = JSON.parse(JSON.stringify(config)); // Deep clone
    
    // Ensure workflows array exists
    if (!updatedConfig.workflows) {
      updatedConfig.workflows = INITIAL_CONFIG.workflows || [];
      needsUpdate = true;
    }
    
    // Check if permissions need migration from old structure to new structure
    const allRoles = Object.values(Role);
    const hasOldPermissions = allRoles.some(role => {
      const perms = updatedConfig.rolePermissions[role];
      if (!perms) return false;
      // Check if it has old permission keys (including old editAllTasks/editOwnTasks)
      return 'createPlanned' in perms || 'createUnplanned' in perms || 'editUnplanned' in perms || 'manageCapacity' in perms || 'createWorkflows' in perms || 'editAllTasks' in perms || 'editOwnTasks' in perms;
    });
    
    if (hasOldPermissions) {
      // Migrate old permissions to new structure
      updatedConfig.rolePermissions = migratePermissions(updatedConfig.rolePermissions as any);
      needsUpdate = true;
    }
    
    // Ensure all roles have all new permissions and migrate editAllTasks/editOwnTasks to editTasks
    for (const role of allRoles) {
      if (!updatedConfig.rolePermissions[role]) {
        updatedConfig.rolePermissions[role] = { ...INITIAL_CONFIG.rolePermissions[role] };
        needsUpdate = true;
      } else {
        const currentPerms = updatedConfig.rolePermissions[role];
        // Migrate editAllTasks/editOwnTasks to editTasks if needed
        if ('editAllTasks' in currentPerms || 'editOwnTasks' in currentPerms) {
          const editAll = (currentPerms as any).editAllTasks === true || (currentPerms as any).editAllTasks === 'yes';
          const editOwn = (currentPerms as any).editOwnTasks === true || (currentPerms as any).editOwnTasks === 'own';
          (currentPerms as any).editTasks = editAll ? 'yes' : (editOwn ? 'own' : 'no');
          delete (currentPerms as any).editAllTasks;
          delete (currentPerms as any).editOwnTasks;
          needsUpdate = true;
        }
        // Migrate 'full' to 'edit' for tab permissions
        for (const key in currentPerms) {
          if (key.startsWith('access') && (currentPerms as any)[key] === 'full') {
            (currentPerms as any)[key] = 'edit';
            needsUpdate = true;
          }
        }
        // Migrate boolean values to TaskManagementScope
        const taskManagementKeys: PermissionKey[] = ['createNewTasks', 'deleteTasks', 'accessAdmin', 'manageWorkflows'];
        for (const key of taskManagementKeys) {
          if (key in currentPerms) {
            const val = (currentPerms as any)[key];
            if (typeof val === 'boolean') {
              (currentPerms as any)[key] = val ? 'yes' : 'no';
              needsUpdate = true;
            }
          }
        }
        // Merge missing permissions from INITIAL_CONFIG
        const initialPerms = INITIAL_CONFIG.rolePermissions[role];
        for (const key in initialPerms) {
          if (!(key in currentPerms)) {
            (updatedConfig.rolePermissions[role] as any)[key] = initialPerms[key as PermissionKey];
            needsUpdate = true;
          }
        }
      }
    }
    
    // Fix Team Lead's deleteTasks permission - should be 'own' to allow deleting own initiatives/tasks
    if (updatedConfig.rolePermissions[Role.TeamLead]?.deleteTasks === 'no') {
      updatedConfig.rolePermissions[Role.TeamLead].deleteTasks = 'own';
      needsUpdate = true;
      logger.info('Fixed Team Lead deleteTasks permission: no -> own', { context: 'App.configMigration' });
    }
    
    // Migrate Slack config if it's missing or outdated
    if (INITIAL_CONFIG.slack) {
      const needsSlackUpdate = !updatedConfig.slack || 
        !updatedConfig.slack.webhookUrl || 
        updatedConfig.slack.webhookUrl !== INITIAL_CONFIG.slack.webhookUrl ||
        updatedConfig.slack.enabled !== INITIAL_CONFIG.slack.enabled;
      
      if (needsSlackUpdate) {
        updatedConfig.slack = {
          enabled: INITIAL_CONFIG.slack.enabled,
          webhookUrl: INITIAL_CONFIG.slack.webhookUrl
        };
        needsUpdate = true;
        logger.debug('Migrating Slack config', { context: 'App.configMigration' });
      }
    }
    
    if (needsUpdate) {
      logger.debug('Config migration - updating', { context: 'App.configMigration' });
      setConfig(updatedConfig);
    }
  }, []); // Run once on mount

  // Initialize Slack service when config changes
  useEffect(() => {
    const slackConfig = config.slack && config.slack.enabled && config.slack.webhookUrl
      ? config.slack
      : INITIAL_CONFIG.slack;
    
    if (slackConfig && slackConfig.enabled && slackConfig.webhookUrl) {
      slackService.initializeFromConfig({ ...config, slack: slackConfig });
    } else if (INITIAL_CONFIG.slack && INITIAL_CONFIG.slack.enabled && INITIAL_CONFIG.slack.webhookUrl) {
      slackService.initializeFromConfig({ ...config, slack: INITIAL_CONFIG.slack });
    } else {
      slackService.initializeFromConfig(config);
    }
  }, [config]);

  // Initialize changelog from mock data history
  useEffect(() => {
    const historyChanges = INITIAL_INITIATIVES.flatMap(i => i.history || []);
    if (historyChanges.length > 0) {
      // sort by date desc
      historyChanges.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setChangeLog(historyChanges);
    }
  }, []);

  // Check for delays and create notifications
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const checkDelays = () => {
      initiatives.forEach(initiative => {
        if (initiative.eta && initiative.eta < today && 
            initiative.status !== Status.Done && 
            initiative.status !== Status.AtRisk) {
          setNotifications(prev => {
            const todayStr = new Date().toDateString();
            const existingDelayNotification = prev.find(
              n => n.initiativeId === initiative.id && 
                   n.type === NotificationType.Delay &&
                   new Date(n.timestamp).toDateString() === todayStr
            );
            
            if (!existingDelayNotification) {
              const notification = createNotification(
                NotificationType.Delay,
                'Initiative delayed',
                `${initiative.title} has passed its ETA (${initiative.eta}) and is now delayed`,
                initiative.id,
                initiative.title,
                initiative.ownerId,
                { eta: initiative.eta, ownerId: initiative.ownerId }
              );
              return [notification, ...prev];
            }
            return prev;
          });
        }
      });
    };

    checkDelays();
    const delayCheckInterval = setInterval(checkDelays, 60000);
    return () => clearInterval(delayCheckInterval);
  }, [initiatives]);

  // View State - sync with route
  const getViewFromPath = (pathname: string): ViewType => {
    if (pathname === '/admin') return 'admin';
    if (pathname === '/timeline') return 'timeline';
    if (pathname === '/workflows') return 'workflows';
    if (pathname === '/dependencies') return 'dependencies';
    if (pathname === '/resources') return 'resources';
    if (pathname.startsWith('/item/')) return 'all'; // Item detail opens in 'all' view
    return 'all'; // Default to 'all' (dashboard)
  };
  
  const [currentView, setCurrentView] = useState<ViewType>(getViewFromPath(location.pathname));
  const [viewLayout, setViewLayout] = useState<'table' | 'tree'>('table');
  
  // Sync currentView with route changes
  useEffect(() => {
    const viewFromRoute = getViewFromPath(location.pathname);
    if (viewFromRoute !== currentView) {
      setCurrentView(viewFromRoute);
    }
  }, [location.pathname]);
  
  // Effort Display Unit State (Days vs Weeks)
  const [effortDisplayUnit, setEffortDisplayUnit] = useLocalStorage<'weeks' | 'days'>('effort-display-unit', 'weeks');
  
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter State
  const [filterAssetClass, setFilterAssetClass] = useState<string>('');
  const [filterOwners, setFilterOwners] = useState<string[]>([]);
  const [filterWorkType, setFilterWorkType] = useState<string[]>([]);
  const [filterQuarter, setFilterQuarter] = useState<string[]>([]);
  const [filterPriority, setFilterPriority] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  
  // URL State Management
  const { getFilterFromUrl, getSingleFilterFromUrl, updateUrlFilters } = useUrlState();
  
  // Initialize filters from URL on mount
  useEffect(() => {
    const urlAssetClass = getSingleFilterFromUrl('assetClass');
    const urlOwners = getFilterFromUrl('owners');
    const urlWorkType = getFilterFromUrl('workType');
    const urlQuarter = getFilterFromUrl('quarter');
    const urlPriority = getFilterFromUrl('priority');
    const urlStatus = getFilterFromUrl('status');
    const urlSearch = getSingleFilterFromUrl('search');
    
    if (urlAssetClass) setFilterAssetClass(urlAssetClass);
    if (urlOwners.length > 0) setFilterOwners(urlOwners);
    if (urlWorkType.length > 0) setFilterWorkType(urlWorkType);
    if (urlQuarter.length > 0) setFilterQuarter(urlQuarter);
    if (urlPriority.length > 0) setFilterPriority(urlPriority);
    if (urlStatus.length > 0) setFilterStatus(urlStatus);
    if (urlSearch) setSearchQuery(urlSearch);
  }, []); // Only on mount
  
  // Update URL when filters change
  useEffect(() => {
    updateUrlFilters({
      assetClass: filterAssetClass,
      owners: filterOwners,
      workType: filterWorkType,
      quarter: filterQuarter,
      priority: filterPriority,
      status: filterStatus,
      searchQuery: searchQuery
    });
  }, [filterAssetClass, filterOwners, filterWorkType, filterQuarter, filterPriority, filterStatus, searchQuery, updateUrlFilters]);

  // Sort State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  
  // Calendar State
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Initiative | null>(null);
  const [newButtonDropdownOpen, setNewButtonDropdownOpen] = useState(false);
  const [initialModalMode, setInitialModalMode] = useState<'single' | 'bulk'>('single');
  const newButtonRef = useRef<HTMLDivElement>(null);
  
  // At Risk Reason Modal State
  const [isAtRiskModalOpen, setIsAtRiskModalOpen] = useState(false);
  const [pendingAtRiskInitiative, setPendingAtRiskInitiative] = useState<{ id: string; oldStatus: Status } | null>(null);
  
  // Weekly Effort Validation State
  const [weeklyEffortFlags, setWeeklyEffortFlags] = useState<Map<string, ValidationResult>>(new Map());
  const [showEffortWarningPopup, setShowEffortWarningPopup] = useState(false);
  const [currentEffortFlag, setCurrentEffortFlag] = useState<ValidationResult | null>(null);
  const [showEffortExceededModal, setShowEffortExceededModal] = useState(false);
  const [effortExceededInitiative, setEffortExceededInitiative] = useState<Initiative | null>(null);

  // Optimistic Updates State
  const [optimisticUpdates, setOptimisticUpdates] = useState<Map<string, {
    field: string;
    value: any;
    timestamp: number;
  }>>(new Map());

  // Handle route-based navigation for initiative links (e.g., /item/Q425-003)
  // Also handle legacy hash-based navigation for backward compatibility
  useEffect(() => {
    if (!isAuthenticated || initiatives.length === 0) return;

    // Handle route-based navigation: /item/:id
    // Extract ID from pathname or params (params.id may not work if Routes are nested)
    const itemMatch = location.pathname.match(/^\/item\/(.+)$/);
    const initiativeId = itemMatch ? decodeURIComponent(itemMatch[1]) : (params.id ? decodeURIComponent(params.id) : null);
    
    if (initiativeId) {
      const initiative = initiatives.find(i => i.id === initiativeId);
      
      if (initiative) {
        // Ensure we're on dashboard view (set view state without navigating away from /item/:id)
        if (location.pathname.startsWith('/item/') && currentView !== 'all') {
          setCurrentView('all');
        }
        
        // Open the modal with the initiative
        setEditingItem(initiative);
        setIsModalOpen(true);
      } else {
        logger.warn('Initiative not found for route navigation', {
          context: 'App.routeNavigation',
          metadata: { initiativeId, availableIds: initiatives.map(i => i.id).slice(0, 5) }
        });
        // Redirect to dashboard if initiative not found
        navigate('/dashboard', { replace: true });
      }
    }

    // Handle legacy hash-based navigation for backward compatibility
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (!hash) return;

      // Parse hash format: #initiative=Q425-003
      const match = hash.match(/^#initiative=(.+)$/);
      if (!match) return;

      const initiativeId = decodeURIComponent(match[1]);
      // Redirect to route-based URL
      navigate(`/item/${encodeURIComponent(initiativeId)}`, { replace: true });
      window.location.hash = ''; // Clear hash
    };

    // Check hash on mount
    if (window.location.hash) {
      handleHashChange();
    }

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [isAuthenticated, initiatives, params.id, location.pathname, currentView, navigate]);
  
  // Close modal when navigating away from /item/:id
  useEffect(() => {
    if (!location.pathname.startsWith('/item/') && isModalOpen && editingItem) {
      setIsModalOpen(false);
      setEditingItem(null);
    }
  }, [location.pathname, isModalOpen, editingItem]);

  // Keep editingItem in sync with initiatives state when modal is open
  useEffect(() => {
    if (isModalOpen && editingItem) {
      const updatedInitiative = initiatives.find(i => i.id === editingItem.id);
      if (updatedInitiative) {
        // Only update if history changed (to avoid unnecessary re-renders)
        const historyChanged = (updatedInitiative.history?.length || 0) !== (editingItem.history?.length || 0);
        const lastUpdatedChanged = updatedInitiative.lastUpdated !== editingItem.lastUpdated;
        if (historyChanged || lastUpdatedChanged) {
          setEditingItem(updatedInitiative);
        }
      }
    }
  }, [initiatives, isModalOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (newButtonRef.current && !newButtonRef.current.contains(event.target as Node)) {
        setNewButtonDropdownOpen(false);
      }
    };

    if (newButtonDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [newButtonDropdownOpen]);

  // Wrapper function to handle view changes
  const handleViewChange = (view: ViewType) => {
    // Map view to route
    const routeMap: Record<ViewType, string> = {
      'all': '/dashboard',
      'admin': '/admin',
      'timeline': '/timeline',
      'workflows': '/workflows',
      'dependencies': '/dependencies',
      'resources': '/resources'
    };
    
    navigate(routeMap[view] || '/dashboard');
  };

  // --- Workflow Execution (Scheduled) ---
  useEffect(() => {
    // Execute scheduled workflows
    const workflows = config.workflows || [];
    const enabledWorkflows = workflows.filter(w => w.enabled && w.trigger === 'on_schedule');
    
    if (enabledWorkflows.length === 0) return;

    const executeScheduledWorkflows = async () => {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      for (const workflow of enabledWorkflows) {
        const shouldRun = 
          (workflow.triggerConfig?.schedule === 'daily' && workflow.triggerConfig?.time === currentTime) ||
          (workflow.triggerConfig?.schedule === 'hourly');
        
        if (shouldRun) {
          try {
            // Use ref to get latest initiatives (always current, avoids stale closure)
            const currentInitiatives = initiativesRef.current;
            const initiativesCopy = currentInitiatives.map(i => ({ ...i }));
            
            const log = await workflowEngine.executeWorkflow(workflow, initiativesCopy, recordChange);
            
            if (log.initiativesAffected.length > 0) {
              // Use functional update to merge workflow changes with latest state
              // This prevents overwriting state that changed during async execution
              setInitiatives(prevInitiatives => {
                // Create a map of workflow-modified initiatives
                const workflowModifiedMap = new Map(
                  initiativesCopy.filter(i => log.initiativesAffected.includes(i.id)).map(i => [i.id, i])
                );
                
                // Merge: use workflow-modified version if available, otherwise keep current
                return prevInitiatives.map(i => workflowModifiedMap.get(i.id) || i);
              });
              
              // Update workflow execution log
              setConfig(prev => ({
                ...prev,
                workflows: (prev.workflows || []).map(w => 
                  w.id === workflow.id 
                    ? { 
                        ...w, 
                        lastRun: new Date().toISOString(),
                        runCount: w.runCount + 1,
                        executionLog: [...(w.executionLog || []), log].slice(-10)
                      }
                    : w
                )
              }));
            }
          } catch (error) {
            logger.error(`Error executing workflow ${workflow.name}`, { context: 'App.executeScheduledWorkflows', error: error instanceof Error ? error : new Error(String(error)) });
          }
        }
      }
    };

    // Set up interval for hourly checks (check every minute)
    const interval = setInterval(executeScheduledWorkflows, 60000);
    
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.workflows, initiatives]);

  // Derived Data
  const _userPermissions = config.rolePermissions[currentUser.role];
  void _userPermissions; // Reserved for future permission checks
  const canCreate = canCreateTasks(config, currentUser.role);

  const getOwnerNameById = (id?: string) => getOwnerName(users, id);

  // Memoized set of valid initiative IDs for filtering notifications of deleted initiatives
  const validInitiativeIds = useMemo(() => {
    return new Set(initiatives.filter(i => i.status !== Status.Deleted).map(i => i.id));
  }, [initiatives]);

  const filteredInitiatives = useMemo(() => {
    // Deduplicate initiatives first to prevent React key warnings and display issues
    const deduplicatedInitiatives = deduplicateInitiatives(initiatives);
    let data = [...deduplicatedInitiatives];

    // Exclude deleted items from regular views (trash is now in AdminPanel)
    data = data.filter(i => i.status !== Status.Deleted);

    // Filter by Asset Class
    if (filterAssetClass) data = data.filter(i => i.l1_assetClass === filterAssetClass);
    
    // Filter by Owners
    if (filterOwners.length > 0) {
      data = data.filter(i => filterOwners.includes(i.ownerId));
    }
    
    // Filter by Work Type (including unplanned tags) - multi-select support
    if (filterWorkType.length > 0) {
      data = data.filter(i => {
        return filterWorkType.some(filter => {
          if (filter === 'WP') {
            return i.initiativeType === InitiativeType.WP;
          } else if (filter === 'BAU') {
            return i.initiativeType === InitiativeType.BAU;
          } else if (filter === 'Planned') {
            return i.workType === WorkType.Planned;
          } else if (filter === 'Unplanned') {
            return i.workType === WorkType.Unplanned;
          } else {
            // Filter by specific unplanned tag (Risk, PM, etc.)
            return i.workType === WorkType.Unplanned && 
                   i.unplannedTags?.includes(filter as any);
          }
        });
      });
    }

    // Filter by Quarter
    if (filterQuarter.length > 0) {
      data = data.filter(i => filterQuarter.includes(i.quarter));
    }

    // Filter by Priority
    if (filterPriority.length > 0) {
      data = data.filter(i => filterPriority.includes(i.priority));
    }

    // Filter by Status
    if (filterStatus.length > 0) {
      data = data.filter(i => filterStatus.includes(i.status));
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(i => 
        i.title.toLowerCase().includes(q) || 
        i.ownerId.toLowerCase().includes(q) ||
        (i.assignee && i.assignee.toLowerCase().includes(q)) ||
        i.l2_pillar.toLowerCase().includes(q)
      );
    }

    // Sorting Logic
    if (sortConfig) {
      data.sort((a, b) => {
        let aValue: any = '';
        let bValue: any = '';

        switch (sortConfig.key) {
          case 'owner':
            aValue = getOwnerNameById(a.ownerId).toLowerCase();
            bValue = getOwnerNameById(b.ownerId).toLowerCase();
            break;
          case 'priority':
            aValue = a.priority;
            bValue = b.priority;
            break;
          default:
            aValue = (a as any)[sortConfig.key];
            bValue = (b as any)[sortConfig.key];
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return data;
  }, [initiatives, searchQuery, filterAssetClass, filterOwners, filterWorkType, filterQuarter, filterPriority, filterStatus, sortConfig, users, currentView]);

  const metrics = useMemo(() => {
    const totalEst = filteredInitiatives.reduce((sum, i) => sum + (i.estimatedEffort || 0), 0);
    const totalAct = filteredInitiatives.reduce((sum, i) => sum + (i.actualEffort || 0), 0);
    
    // Get relevant owners based on owner filter or derive from filtered initiatives
    let relevantOwners: string[] = [];
    if (filterOwners.length > 0) {
      // Use explicit owner filter
      relevantOwners = filterOwners;
    } else if (filterAssetClass || filterWorkType.length > 0) {
      // When filtering by asset class or work type, only consider owners who have initiatives in the filtered set
      const uniqueOwners = new Set(filteredInitiatives.map(i => i.ownerId).filter(Boolean));
      relevantOwners = Array.from(uniqueOwners);
    } else {
      // No filters: use all owners
      relevantOwners = Object.keys(config.teamCapacities);
    }

    // Helper function to get adjusted capacity (base - adjustment)
    const getAdjustedCapacity = (userId: string): number => {
      const baseCapacity = config.teamCapacities[userId] || 0;
      const adjustment = config.teamCapacityAdjustments?.[userId] || 0;
      return Math.max(0, baseCapacity - adjustment);
    };

    // Calculate total quarterly capacity for filtered owners (using adjusted capacity)
    const totalCapacity = relevantOwners.reduce((sum, id) => sum + getAdjustedCapacity(id), 0);
    // Capacity load: estimated effort vs quarterly capacity
    const capacityLoad = totalCapacity > 0 ? (totalEst / totalCapacity) * 100 : 0;
    const actualRate = totalCapacity > 0 ? (totalAct / totalCapacity) * 100 : 0;
    const usage = totalEst > 0 ? (totalAct / totalEst) * 100 : 0;
    
    const countNotStarted = filteredInitiatives.filter(i => i.status === Status.NotStarted).length;
    const countInProgress = filteredInitiatives.filter(i => i.status === Status.InProgress).length;
    const countAtRisk = filteredInitiatives.filter(i => i.status === Status.AtRisk).length;
    const countDone = filteredInitiatives.filter(i => i.status === Status.Done).length;
    
    const plannedItems = filteredInitiatives.filter(i => i.workType === WorkType.Planned);
    const unplannedItems = filteredInitiatives.filter(i => i.workType === WorkType.Unplanned);
    
    const _countPlannedWork = plannedItems.length;
    const _countUnplannedWork = unplannedItems.length;
    void _countPlannedWork; void _countUnplannedWork;

    const _effortPlanned = plannedItems.reduce((sum, i) => sum + (i.estimatedEffort || 0), 0);
    const _effortUnplanned = unplannedItems.reduce((sum, i) => sum + (i.estimatedEffort || 0), 0);
    void _effortPlanned; void _effortUnplanned;

    // Get all tasks from all initiatives
    const allTasks = filteredInitiatives.flatMap(i => i.tasks || []);
    
    // Calculate risk/PM breakdown for unplanned items (initiatives + tasks)
    const unplannedRiskItems = unplannedItems.filter(i => 
      i.unplannedTags?.includes(UnplannedTag.RiskItem)
    );
    const unplannedPMItems = unplannedItems.filter(i => 
      i.unplannedTags?.includes(UnplannedTag.PMItem)
    );
    
    // Count tasks with Risk/PM tags
    const tasksWithRiskTag = allTasks.filter(t => 
      t.tags?.includes(UnplannedTag.RiskItem)
    );
    const tasksWithPMTag = allTasks.filter(t => 
      t.tags?.includes(UnplannedTag.PMItem)
    );
    
    const unplannedRiskCount = unplannedRiskItems.length + tasksWithRiskTag.length;
    const unplannedPMCount = unplannedPMItems.length + tasksWithPMTag.length;

    // Calculate WP vs BAU totals (simple mix - initiatives only)
    const wpItemsAll = filteredInitiatives.filter(i => i.initiativeType === InitiativeType.WP);
    const bauItemsAll = filteredInitiatives.filter(i => i.initiativeType === InitiativeType.BAU);
    
    const countWP = wpItemsAll.length;
    const countBAU = bauItemsAll.length;
    
    const totalWPBAU = countWP + countBAU;
    const wpPercentage = totalWPBAU > 0 ? Math.round((countWP / totalWPBAU) * 100) : 0;
    const bauPercentage = totalWPBAU > 0 ? Math.round((countBAU / totalWPBAU) * 100) : 0;
    
    // Calculate effort
    const effortWP = wpItemsAll.reduce((sum, i) => sum + (i.estimatedEffort || 0), 0);
    const effortBAU = bauItemsAll.reduce((sum, i) => sum + (i.estimatedEffort || 0), 0);
    
    // Legacy calculations for other parts of the app (keeping for compatibility)
    const wpTasks = wpItemsAll.flatMap(i => i.tasks || []);
    const bauTasks = bauItemsAll.flatMap(i => i.tasks || []);
    const wpItemsUnplanned = wpItemsAll.filter(i => i.unplannedTags?.includes(UnplannedTag.Unplanned));
    const wpItemsPlanned = wpItemsAll.filter(i => !i.unplannedTags?.includes(UnplannedTag.Unplanned));
    const bauItemsUnplanned = bauItemsAll.filter(i => i.unplannedTags?.includes(UnplannedTag.Unplanned));
    const bauItemsPlanned = bauItemsAll.filter(i => !i.unplannedTags?.includes(UnplannedTag.Unplanned));
    const wpTasksUnplanned = wpTasks.filter(t => t.tags?.includes(UnplannedTag.Unplanned));
    const wpTasksPlanned = wpTasks.filter(t => !t.tags?.includes(UnplannedTag.Unplanned));
    const bauTasksUnplanned = bauTasks.filter(t => t.tags?.includes(UnplannedTag.Unplanned));
    const bauTasksPlanned = bauTasks.filter(t => !t.tags?.includes(UnplannedTag.Unplanned));
    
    // For backward compatibility with other metrics
    const countWPUnplanned = wpItemsUnplanned.length + wpTasksUnplanned.length;
    const countBAUUnplanned = bauItemsUnplanned.length + bauTasksUnplanned.length;
    const _countWPPlanned = wpItemsPlanned.length + wpTasksPlanned.length;
    const _countBAUPlanned = bauItemsPlanned.length + bauTasksPlanned.length;
    void _countWPPlanned; void _countBAUPlanned;
    const wpUnplannedPercentage = countWP > 0 ? Math.round((countWPUnplanned / countWP) * 100) : 0;
    const bauUnplannedPercentage = countBAU > 0 ? Math.round((countBAUUnplanned / countBAU) * 100) : 0;
    const _effortWPPlanned = wpItemsPlanned.reduce((sum, i) => sum + (i.estimatedEffort || 0), 0) +
      wpTasksPlanned.reduce((sum, t) => sum + (t.estimatedEffort || 0), 0);
    const _effortWPUnplanned = wpItemsUnplanned.reduce((sum, i) => sum + (i.estimatedEffort || 0), 0) +
      wpTasksUnplanned.reduce((sum, t) => sum + (t.estimatedEffort || 0), 0);
    const _effortBAUPlanned = bauItemsPlanned.reduce((sum, i) => sum + (i.estimatedEffort || 0), 0) +
      bauTasksPlanned.reduce((sum, t) => sum + (t.estimatedEffort || 0), 0);
    const _effortBAUUnplanned = bauItemsUnplanned.reduce((sum, i) => sum + (i.estimatedEffort || 0), 0) +
      bauTasksUnplanned.reduce((sum, t) => sum + (t.estimatedEffort || 0), 0);
    void _effortWPPlanned; void _effortWPUnplanned; void _effortBAUPlanned; void _effortBAUUnplanned;

      // BAU Buffer = sum of filtered team leads' buffer assignments
      const bauBufferTotal = relevantOwners.reduce(
        (sum, id) => sum + (config.teamBuffers?.[id] || 0), 
        0
      );
      // Include both Unplanned work and BAU initiatives in buffer usage
      const unplannedActuals = filteredInitiatives
        .filter(i => i.workType === WorkType.Unplanned)
        .reduce((sum, i) => sum + (i.actualEffort || 0), 0);
      // Calculate BAU effort: planned effort is manually set, actual effort is auto-calculated from tasks (if tasks exist)
      const bauInitiativeEstimated = filteredInitiatives
        .filter(i => i.initiativeType === InitiativeType.BAU)
        .reduce((sum, i) => sum + (i.estimatedEffort || 0), 0);
      const bauInitiativeActuals = filteredInitiatives
        .filter(i => i.initiativeType === InitiativeType.BAU)
        .reduce((sum, i) => sum + (i.actualEffort || 0), 0);
      
      // Calculate BAU effort as percentage of total buffer for filtered users
      const bauPlannedEffortPercentOfBuffer = bauBufferTotal > 0 
        ? (bauInitiativeEstimated / bauBufferTotal) * 100 
        : 0;
      const bauActualEffortPercentOfBuffer = bauBufferTotal > 0 
        ? (bauInitiativeActuals / bauBufferTotal) * 100 
        : 0;
      
      // Calculate WP excess per owner (when WP effort exceeds allocated capacity)
      const wpExcessByOwner = relevantOwners.reduce((acc, ownerId) => {
        const wpEffort = filteredInitiatives
          .filter(i => i.initiativeType === InitiativeType.WP && i.ownerId === ownerId)
          .reduce((sum, i) => sum + (i.estimatedEffort || 0), 0);
        const capacity = getAdjustedCapacity(ownerId);
        const excess = Math.max(0, wpEffort - capacity);
        return acc + excess;
      }, 0);
    
    const totalBufferUsed = unplannedActuals + bauInitiativeActuals + bauInitiativeEstimated + wpExcessByOwner;
    const bauRemaining = bauBufferTotal - totalBufferUsed;
    const bauHealth = bauBufferTotal > 0 ? (bauRemaining / bauBufferTotal) * 100 : 0;

    return {
      usage,
      capacityLoad,
      actualRate,
      totalCapacity,
      totalEst,
      totalAct,
      countAtRisk,
      countUnplanned: filteredInitiatives.filter(i => i.workType === WorkType.Unplanned).length,
      countOpen: countNotStarted + countInProgress + countAtRisk,
      totalCount: filteredInitiatives.length,
      bauBufferTotal,
      unplannedActuals,
      bauInitiativeActuals,
      bauInitiativeEstimated,
      bauRemaining,
      bauHealth,
      bauPlannedEffortPercentOfBuffer,
      bauActualEffortPercentOfBuffer,
      unplannedRiskCount,
      unplannedPMCount,
      countWP,
      countBAU,
      wpPercentage,
      bauPercentage,
      wpUnplannedPercentage,
      bauUnplannedPercentage,
      statusBreakdown: [
        { name: 'Not Started', value: countNotStarted, color: '#94a3b8' },  // Slate-400
        { name: 'In Progress', value: countInProgress, color: '#3b82f6' },  // Blue-500
        { name: 'At Risk', value: countAtRisk, color: '#f59e0b' },          // Amber-500 (more visible)
        { name: 'Done', value: countDone, color: '#059669' }                 // Emerald-600 (muted)
      ],
      workMix: [
         { name: 'WP', value: countWP, effort: effortWP, color: '#3b82f6' },
         { name: 'BAU', value: countBAU, effort: effortBAU, color: '#9a3412' }
      ]
    };
  }, [filteredInitiatives, config.teamCapacities, config.teamBuffers, filterOwners, filterAssetClass, filterWorkType.join(',')]);

  // Notification Helpers - memoized to prevent infinite useEffect loops
  const createNotification = useCallback((
    type: NotificationType,
    title: string,
    message: string,
    initiativeId: string,
    initiativeTitle: string,
    userId?: string,
    metadata?: Record<string, any>
  ): Notification => {
    return {
      id: generateId(),
      type,
      title,
      message,
      initiativeId,
      initiativeTitle,
      timestamp: new Date().toISOString(),
      read: false,
      userId,
      metadata
    };
  }, []);

  const addNotification = useCallback((notification: Notification) => {
    // Add to local state for immediate UI update
    setNotifications(prev => [notification, ...prev]);
    
    // Save to server for persistence
    // Determine the target user: use notification.userId or metadata.ownerId
    const targetUserId = notification.userId || notification.metadata?.ownerId;
    if (targetUserId && typeof targetUserId === 'string') {
      notificationService.createNotification(targetUserId, notification)
        .catch(error => {
          logger.error('Failed to save notification to server', { 
            context: 'App.addNotification', 
            error: error instanceof Error ? error : new Error(String(error)) 
          });
        });
    }
  }, []);

  // Weekly Effort Validation for Team Leads
  useEffect(() => {
    const checkWeeklyValidation = () => {
      // Only validate if feature is enabled and user is a Team Lead
      if (!config.weeklyEffortValidation?.enabled || currentUser.role !== Role.TeamLead) {
        if (currentUser.role === Role.TeamLead) {
          console.log('[Weekly Validation] Feature disabled or user not Team Lead', {
            enabled: config.weeklyEffortValidation?.enabled,
            role: currentUser.role
          });
        }
        return;
      }

      const result = validateWeeklyTeamEffort(initiatives, config, currentUser.id);
      
      // Debug logging
      console.log('[Weekly Validation] Result:', {
        flagged: result.flagged,
        deviationPercent: result.deviationPercent,
        averageWeeklyEffort: result.averageWeeklyEffort,
        currentWeekEffort: result.currentWeekEffort,
        teamLeadId: result.teamLeadId,
        quarter: result.quarter,
        threshold: config.weeklyEffortValidation?.thresholdPercent || 15
      });
      
      if (result.flagged) {
        // Store flag for UI display
        setWeeklyEffortFlags(prev => new Map(prev).set(currentUser.id, result));
        
        // Create notification for Team Lead
        addNotification(createNotification(
          NotificationType.WeeklyEffortExceeded,
          'Weekly Effort Exceeded',
          `Your weekly effort update (${result.currentWeekEffort.toFixed(1)}w) exceeds the average (${result.averageWeeklyEffort.toFixed(1)}w) by ${result.deviationPercent.toFixed(1)}%`,
          '', // No specific initiative
          'Weekly Effort Validation',
          currentUser.id,
          { 
            deviationPercent: result.deviationPercent,
            averageWeeklyEffort: result.averageWeeklyEffort,
            currentWeekEffort: result.currentWeekEffort,
            quarter: result.quarter
          }
        ));
        
        // Show popup immediately if not already shown for this week
        const weekKey = getCurrentWeekKey();
        const lastShown = localStorage.getItem(`effort-warning-shown-${currentUser.id}-${weekKey}`);
        if (!lastShown) {
          setCurrentEffortFlag(result);
          setShowEffortWarningPopup(true);
          localStorage.setItem(`effort-warning-shown-${currentUser.id}-${weekKey}`, 'true');
        }
        
        // Log to admin/backend
        logger.warn('Weekly effort validation flagged', {
          context: 'App.weeklyValidation',
          metadata: {
            teamLeadId: currentUser.id,
            deviation: result.deviationPercent,
            averageWeeklyEffort: result.averageWeeklyEffort,
            currentWeekEffort: result.currentWeekEffort
          }
        });
      } else {
        // Clear flag if no longer exceeded
        setWeeklyEffortFlags(prev => {
          const updated = new Map(prev);
          updated.delete(currentUser.id);
          return updated;
        });
      }
    };
    
    // Check on mount and when initiatives/config change
    checkWeeklyValidation();
    
    // Also check periodically (every hour)
    const interval = setInterval(checkWeeklyValidation, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [initiatives, config, currentUser, addNotification, createNotification]);

  // Actions
  const recordChange = (initiative: Initiative, field: string, oldValue: any, newValue: any, taskId?: string, tradeOffSourceId?: string, tradeOffSourceTitle?: string): ChangeRecord => {
    const change: ChangeRecord = {
      id: generateId(),
      issueType: taskId ? 'Task' : 'Initiative',
      parentId: initiative.id, // Parent initiative ID for connecting items
      initiativeId: initiative.id,
      initiativeTitle: initiative.title,
      taskId,
      field,
      oldValue,
      newValue,
      changedBy: currentUser.name,
      timestamp: new Date().toISOString(),
      tradeOffSourceId,
      tradeOffSourceTitle
    };
    
    // Create notification for field changes - only notify the initiative owner
    // (unless the change was made by the owner themselves, then skip)
    if (initiative.ownerId && initiative.ownerId !== currentUser.id) {
      if (field === 'Status') {
        addNotification(createNotification(
          NotificationType.StatusChange,
          `Status changed: ${oldValue} → ${newValue}`,
          `${initiative.title} status was changed from "${oldValue}" to "${newValue}" by ${currentUser.name}`,
          initiative.id,
          initiative.title,
          initiative.ownerId, // Notify the owner
          { field, oldValue, newValue, ownerId: initiative.ownerId }
        ));
      } else if (field === 'ETA') {
        addNotification(createNotification(
          NotificationType.EtaChange,
          `ETA updated`,
          `${initiative.title} ETA was changed from "${oldValue}" to "${newValue}" by ${currentUser.name}`,
          initiative.id,
          initiative.title,
          initiative.ownerId, // Notify the owner
          { field, oldValue, newValue, ownerId: initiative.ownerId }
        ));
      } else if (field === 'Effort') {
        addNotification(createNotification(
          NotificationType.EffortChange,
          `Effort updated`,
          `${initiative.title} estimated effort was changed from ${oldValue}w to ${newValue}w by ${currentUser.name}`,
          initiative.id,
          initiative.title,
          initiative.ownerId, // Notify the owner
          { field, oldValue, newValue, ownerId: initiative.ownerId }
        ));
      } else {
        addNotification(createNotification(
          NotificationType.FieldChange,
          `${field} changed`,
          `${initiative.title} ${field.toLowerCase()} was changed by ${currentUser.name}`,
          initiative.id,
          initiative.title,
          initiative.ownerId, // Notify the owner
          { field, oldValue, newValue, ownerId: initiative.ownerId }
        ));
      }
    }
    
    // Notify Slack if ETA changed (always, regardless of owner)
    if (field === 'ETA') {
      slackService.notifyEtaChange(change, initiative, users).catch(err => {
        logger.error('Failed to notify Slack about ETA change', { context: 'App.recordChange', error: err instanceof Error ? err : new Error(String(err)) });
      });
    }
    
    // Log to activity logs
    const activityType = taskId ? ActivityType.UPDATE_TASK : ActivityType.UPDATE_INITIATIVE;
    const description = taskId 
      ? `Task ${field} changed from ${oldValue ?? 'N/A'} to ${newValue ?? 'N/A'}`
      : `Initiative ${field} changed from ${oldValue ?? 'N/A'} to ${newValue ?? 'N/A'}`;
    
    console.log('[ACTIVITY] Logging change:', { activityType, description, initiativeId: initiative.id, field });
    logService.logActivity(activityType, description, {
      initiativeId: initiative.id,
      taskId: taskId,
      field,
      oldValue: String(oldValue ?? ''),
      newValue: String(newValue ?? ''),
      initiativeTitle: initiative.title
    }, true); // Send immediately instead of batching
    
    return change;
  };

  const handleDeleteInitiative = async (id: string) => {
    const initiative = initiatives.find(i => i.id === id);
    if (!initiative) {
      showError('Initiative not found');
      return;
    }

    // Permission check: Use permission system
    const canDelete = canDeleteInitiative(config, currentUser.role, initiative.ownerId, currentUser.id, currentUser.email);
    if (!canDelete) {
      const deleteScope = getTaskManagementScope(config, currentUser.role, 'deleteTasks');
      if (deleteScope === 'own') {
        showError('You can only delete initiatives that you own.');
      } else {
        showError('You do not have permission to delete initiatives.');
      }
      return;
    }

    // Confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to delete "${initiative.title}"?\n\nYou can restore it from the Trash later.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsDataLoading(true);
      
      // Soft delete in Google Sheets
      const result = await sheetsSync.deleteInitiative(id);
      
      if (result.success) {
        // Update local state to mark as deleted
        setInitiatives(prev => prev.map(i => 
          i.id === id 
            ? { ...i, status: Status.Deleted, deletedAt: result.deletedAt } 
            : i
        ));
        
        // Update localStorage cache
        const cached = localStorage.getItem('portfolio-initiatives-cache');
        if (cached) {
          const cachedInitiatives: Initiative[] = JSON.parse(cached);
          const updated = cachedInitiatives.map(i => 
            i.id === id 
              ? { ...i, status: Status.Deleted, deletedAt: result.deletedAt } 
              : i
          );
          localStorage.setItem('portfolio-initiatives-cache', JSON.stringify(updated));
        }
        
        showSuccess(`Initiative "${initiative.title}" has been moved to Trash`);
      } else {
        showError('Failed to delete initiative. Please try again.');
      }
    } catch (error) {
      logger.error('Failed to delete initiative', { context: 'App.handleDeleteInitiative', error: error instanceof Error ? error : new Error(String(error)) });
      const errorDetails = formatError(error, {
        retry: () => handleDeleteInitiative(id)
      });
      showErrorWithDetails(errorDetails);
    } finally {
      setIsDataLoading(false);
    }
  };

  const handleRestoreInitiative = async (id: string) => {
    const initiative = initiatives.find(i => i.id === id);
    if (!initiative) {
      showError('Initiative not found');
      return;
    }

    try {
      setIsDataLoading(true);
      
      const success = await sheetsSync.restoreInitiative(id);
      
      if (success) {
        // Update local state to restore
        setInitiatives(prev => prev.map(i => 
          i.id === id 
            ? { ...i, status: Status.NotStarted, deletedAt: undefined } 
            : i
        ));
        
        // Update localStorage cache
        const cached = localStorage.getItem('portfolio-initiatives-cache');
        if (cached) {
          const cachedInitiatives: Initiative[] = JSON.parse(cached);
          const updated = cachedInitiatives.map(i => 
            i.id === id 
              ? { ...i, status: Status.NotStarted, deletedAt: undefined } 
              : i
          );
          localStorage.setItem('portfolio-initiatives-cache', JSON.stringify(updated));
        }
        
        showSuccess(`Initiative "${initiative.title}" has been restored`);
      } else {
        showError('Failed to restore initiative. Please try again.');
      }
    } catch (error) {
      logger.error('Failed to restore initiative', { context: 'App.handleRestoreInitiative', error: error instanceof Error ? error : new Error(String(error)) });
      const errorDetails = formatError(error, {
        retry: () => handleRestoreInitiative(id)
      });
      showErrorWithDetails(errorDetails);
    } finally {
      setIsDataLoading(false);
    }
  };

  const handleSave = (item: Initiative, tradeOffAction?: TradeOffAction, skipImmediateSync = false) => {
    const today = new Date().toISOString().split('T')[0];
    
    // Check if this is a new initiative and apply Team-Based Asset Class Assignment workflow
    const isNewInitiative = !initiatives.some(i => i.id === item.id);
    if (isNewInitiative) {
      // Find the Team-Based Asset Class Assignment workflow
      const assetClassWorkflow = config.workflows?.find(
        w => w.name === 'Team-Based Asset Class Assignment' && w.enabled
      );
      
      if (assetClassWorkflow) {
        // Get the selected owner's team (not current user's team)
        const owner = users.find(u => u.id === item.ownerId);
        const ownerTeam = owner?.team;
        
        // Use shared utility to map team to asset class
        const mappedAssetClass = getAssetClassFromTeam(ownerTeam);
        
        // Apply asset class if owner's team matches and no explicit asset class was provided
        // Note: This is a backup check - the modal's useEffect should handle this in real-time
        // but we keep this as a safety net for edge cases
        if (mappedAssetClass && (!item.l1_assetClass || item.l1_assetClass === AssetClass.PL)) {
          item.l1_assetClass = mappedAssetClass;
        }
      }
    }
    
    if ((item.actualEffort || 0) > 0 && item.status === Status.NotStarted) item.status = Status.InProgress;
    if (item.eta && item.eta < today && item.status !== Status.Done && item.status !== Status.AtRisk) {
      item.status = Status.AtRisk;
    }

    setInitiatives(prev => {
      // Safety check: deduplicate existing initiatives first
      const deduplicatedPrev = deduplicateInitiatives(prev);
      let nextInitiatives = [...deduplicatedPrev];
      const existingIndex = nextInitiatives.findIndex(i => i.id === item.id);
      
      if (existingIndex > -1) {
        const existing = nextInitiatives[existingIndex];
        const changes: ChangeRecord[] = [];
        // Record status changes
        if (existing.status !== item.status) {
          changes.push(recordChange(existing, 'Status', existing.status, item.status));
        }
        // Record priority changes
        if (existing.priority !== item.priority) {
          changes.push(recordChange(existing, 'Priority', existing.priority, item.priority));
        }
        if ((existing.estimatedEffort || 0) !== (item.estimatedEffort || 0)) {
          changes.push(recordChange(existing, 'Effort', existing.estimatedEffort || 0, item.estimatedEffort || 0));
        }
        if (existing.eta !== item.eta) {
           changes.push(recordChange(existing, 'ETA', existing.eta || '', item.eta || ''));
           // Track overlooked items: if ETA is pushed back, increment overlookedCount
           if (existing.eta && item.eta && existing.eta < item.eta) {
             item.overlookedCount = (existing.overlookedCount || 0) + 1;
             item.lastDelayDate = today;
             // Create notification for repeatedly overlooked items
             if (item.overlookedCount > 2) {
               addNotification(createNotification(
                 NotificationType.OverlookedItem,
                 'Repeatedly overlooked item',
                 `${item.title} has been delayed ${item.overlookedCount} times`,
                 item.id,
                 item.title,
                 item.ownerId,
                 { overlookedCount: item.overlookedCount, lastDelayDate: item.lastDelayDate }
               ));
             }
           }
        }
        
        // Track weekly update: if it's Thursday or later in the week, update lastWeeklyUpdate
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 = Sunday, 4 = Thursday
        if (dayOfWeek >= 4) { // Thursday (4), Friday (5), Saturday (6)
          item.lastWeeklyUpdate = today;
        } else if (existing.lastWeeklyUpdate) {
          // Preserve existing lastWeeklyUpdate if not Thursday yet
          item.lastWeeklyUpdate = existing.lastWeeklyUpdate;
        }

        if (changes.length > 0) {
          setChangeLog(prevLog => [...changes, ...prevLog]);
          item.history = [...(existing.history || []), ...changes];
          // Sync change records to Google Sheets
          changes.forEach(change => sheetsSync.queueChangeLog(change));
        } else {
          item.history = existing.history;
        }

        // Check for mentions in new comments
        const existingComments = existing.comments || [];
        const newComments = (item.comments || []).filter(
          c => !existingComments.find(ec => ec.id === c.id)
        );
        
        newComments.forEach(comment => {
          const mentionedUserIds = parseMentions(comment.text, users);
          mentionedUserIds.forEach(userId => {
            // Create mention notification (including self-mentions for testing/visibility)
            addNotification(createNotification(
              NotificationType.Mention,
              `You were mentioned`,
              `${currentUser.name} mentioned you in a comment on "${item.title}"`,
              item.id,
              item.title,
              userId,
              { commentId: comment.id, commentText: comment.text }
            ));
          });
          
          // Notify initiative owner about new comment (if commenter is not the owner)
          if (item.ownerId && comment.authorId !== item.ownerId) {
            const commenter = users.find(u => u.id === comment.authorId);
            addNotification(createNotification(
              NotificationType.NewComment,
              `New comment on your initiative`,
              `${commenter?.name || 'Someone'} commented on "${item.title}"`,
              item.id,
              item.title,
              item.ownerId,
              { commentId: comment.id, commentText: comment.text }
            ));
          }
        });

        // Check for "At Risk" status changes
        if (existing.status !== Status.AtRisk && item.status === Status.AtRisk) {
          addNotification(createNotification(
            NotificationType.AtRisk,
            'Initiative marked as At Risk',
            `${item.title} has been marked as "At Risk"`,
            item.id,
            item.title,
            item.ownerId,
            { ownerId: item.ownerId }
          ));
        }

        // Preserve overlookedCount and lastDelayDate if not being updated
        if (!item.overlookedCount && existing.overlookedCount) {
          item.overlookedCount = existing.overlookedCount;
        }
        if (!item.lastDelayDate && existing.lastDelayDate) {
          item.lastDelayDate = existing.lastDelayDate;
        }
        // Preserve createdAt if not being updated
        if (!item.createdAt && existing.createdAt) {
          item.createdAt = existing.createdAt;
        }
        
        nextInitiatives[existingIndex] = item;
        } else {
          // New initiative: check for duplicates before adding (safety check)
          const duplicateExists = nextInitiatives.some(i => i.id === item.id);
          if (duplicateExists) {
            console.warn(`[DEBUG] handleSave: Initiative ${item.id} already exists, updating instead of adding`);
            const duplicateIndex = nextInitiatives.findIndex(i => i.id === item.id);
            nextInitiatives[duplicateIndex] = item;
          } else {
            // New initiative: initialize overlookedCount to 0 and set createdAt if not already set
            item.overlookedCount = 0;
            if (!item.createdAt) {
              item.createdAt = new Date().toISOString();
            }
            nextInitiatives.push(item);
            
            // Execute OnCreate workflows for new initiatives
            const onCreateWorkflows = (config.workflows || []).filter(
              w => w.enabled && w.trigger === WorkflowTrigger.OnCreate
            );
            
            // Execute workflows asynchronously without blocking state update
            onCreateWorkflows.forEach(workflow => {
              const initiativeCopy = { ...item };
              workflowEngine.executeWorkflow(workflow, [initiativeCopy], recordChange)
                .then(() => {
                  // Update the initiative if it was modified by the workflow
                  setInitiatives(prev => {
                    const updated = [...prev];
                    const modifiedIndex = updated.findIndex(i => i.id === item.id);
                    if (modifiedIndex >= 0) {
                      updated[modifiedIndex] = initiativeCopy;
                    }
                    return updated;
                  });
                  
                  // Update workflow execution log
                  setConfig(prev => ({
                    ...prev,
                    workflows: (prev.workflows || []).map(w => 
                      w.id === workflow.id 
                        ? { 
                            ...w, 
                            lastRun: new Date().toISOString(),
                            runCount: w.runCount + 1,
                          }
                        : w
                    )
                  }));
                })
                .catch(error => {
                  logger.error(`Error executing OnCreate workflow ${workflow.name}`, { context: 'App.handleSave', error: error instanceof Error ? error : new Error(String(error)) });
                });
            });
          }
        }

      // Update localStorage cache
      const cached = localStorage.getItem('portfolio-initiatives-cache');
      if (cached) {
        const cachedInitiatives: Initiative[] = JSON.parse(cached);
        const index = cachedInitiatives.findIndex(i => i.id === item.id);
        if (index >= 0) {
          cachedInitiatives[index] = item;
        } else {
          cachedInitiatives.push(item);
        }
        localStorage.setItem('portfolio-initiatives-cache', JSON.stringify(cachedInitiatives));
      } else {
        localStorage.setItem('portfolio-initiatives-cache', JSON.stringify([item]));
      }
      
      // Broadcast to other users in real-time
      if (existingIndex > -1) {
        realtimeService.broadcastUpdate(item);
      } else {
        realtimeService.broadcastCreate(item);
      }
      
      // Sync to Google Sheets
      sheetsSync.queueInitiativeSync(item);
      
      // Sync tasks to separate Tasks sheet
      if (item.tasks && item.tasks.length > 0) {
        sheetsSync.queueTasksSync(item.tasks, item);
      }
      
      // Force immediate sync for new initiatives to prevent data loss on refresh
      // Skip immediate sync for bulk operations to prevent race conditions
      if (existingIndex === -1 && !skipImmediateSync) {
        sheetsSync.forceSyncNow();
      }

      // Create automatic version (debounced) after save
      // Extract all tasks from all initiatives for complete snapshot
      const allTasks: Task[] = [];
      nextInitiatives.forEach(init => {
        if (init.tasks && Array.isArray(init.tasks)) {
          allTasks.push(...init.tasks);
        }
      });
      // Deduplicate tasks by ID
      const uniqueTasks = Array.from(
        new Map(allTasks.map(task => [task.id, task])).values()
      );
      
      try {
        const versionService = getVersionService();
        versionService.createVersionDebounced(nextInitiatives, uniqueTasks);
      } catch (error) {
        // Log but don't fail the save if versioning fails
        logger.warn('Failed to create automatic version', { 
          context: 'App.handleSave', 
          metadata: { error: error instanceof Error ? error.message : String(error) }
        });
      }

      if (tradeOffAction) {
        const targetIndex = nextInitiatives.findIndex(i => i.id === tradeOffAction.targetInitiativeId);
        if (targetIndex > -1) {
          const target = nextInitiatives[targetIndex];
          const fieldMap = { 'status': 'Status', 'eta': 'ETA', 'priority': 'Priority' };
          const fieldLabel = fieldMap[tradeOffAction.field];
          const oldValue = target[tradeOffAction.field];
          
          const updatedTarget = { 
            ...target, 
            [tradeOffAction.field]: tradeOffAction.newValue,
            lastUpdated: today
          };

          // Pass trade-off context: the initiative being saved is the source of the trade-off
          const changeRecord = recordChange(target, fieldLabel, oldValue, tradeOffAction.newValue, undefined, item.id, item.title);
          updatedTarget.history = [...(target.history || []), changeRecord];
          setChangeLog(prevLog => [changeRecord, ...prevLog]);
          // Sync trade-off change record to Google Sheets
          sheetsSync.queueChangeLog(changeRecord);
          nextInitiatives[targetIndex] = updatedTarget;
          
          // Update localStorage cache
          const cached = localStorage.getItem('portfolio-initiatives-cache');
          if (cached) {
            const cachedInitiatives: Initiative[] = JSON.parse(cached);
            const cacheIndex = cachedInitiatives.findIndex(i => i.id === updatedTarget.id);
            if (cacheIndex >= 0) {
              cachedInitiatives[cacheIndex] = updatedTarget;
            } else {
              cachedInitiatives.push(updatedTarget);
            }
            localStorage.setItem('portfolio-initiatives-cache', JSON.stringify(cachedInitiatives));
          }
          
          // Sync trade-off target to Google Sheets
          sheetsSync.queueInitiativeSync(updatedTarget);
        }
      }
      return nextInitiatives;
    });

    // Update editingItem if modal is open and we're editing this item
    if (isModalOpen && editingItem && editingItem.id === item.id) {
      setEditingItem(item);
    }
  };

  // Execute workflows triggered by field changes
  const executeFieldChangeWorkflows = async (initiative: Initiative, changedField: string) => {
    const workflows = config.workflows || [];
    const relevantWorkflows = workflows.filter(w => {
      if (!w.enabled) return false;
      
      // Handle on_field_change trigger
      if (w.trigger === 'on_field_change' && w.triggerConfig?.fields?.includes(changedField)) {
        return true;
      }
      
      // Handle on_effort_change trigger
      if (w.trigger === 'on_effort_change' && (changedField === 'actualEffort' || changedField === 'estimatedEffort')) {
        return true;
      }
      
      return false;
    });

    for (const workflow of relevantWorkflows) {
      try {
        const initiativeCopy = { ...initiative };
        await workflowEngine.executeWorkflow(workflow, [initiativeCopy], recordChange);
        
        // Update the initiative in state if it was modified
        setInitiatives(prev => prev.map(i => i.id === initiative.id ? initiativeCopy : i));
        
        // Sync workflow-modified initiative to Google Sheets
        sheetsSync.queueInitiativeSync(initiativeCopy);
        
        setConfig(prev => ({
          ...prev,
          workflows: (prev.workflows || []).map(w => 
            w.id === workflow.id 
              ? { 
                  ...w, 
                  lastRun: new Date().toISOString(),
                  runCount: w.runCount + 1,
                }
              : w
          )
        }));
      } catch (error) {
        logger.error(`Error executing field-change workflow ${workflow.name}`, { context: 'App.executeFieldChangeWorkflows', error: error instanceof Error ? error : new Error(String(error)) });
      }
    }
  };

  const handleInlineUpdate = (id: string, field: keyof Initiative, value: any, suppressNotification?: boolean, tradeOffSourceId?: string, tradeOffSourceTitle?: string) => {
    // Intercept status changes to At Risk - show modal first
    if (field === 'status' && value === Status.AtRisk) {
      const initiative = initiatives.find(i => i.id === id);
      if (initiative && initiative.status !== Status.AtRisk) {
        // Store pending change and show modal
        setPendingAtRiskInitiative({ id, oldStatus: initiative.status });
        setIsAtRiskModalOpen(true);
        return; // Don't proceed with status change yet
      }
    }
    
    const initiative = initiatives.find(i => i.id === id);
    if (!initiative) return;
    
    // Optimistic update - update UI immediately
    setOptimisticUpdates(prev => new Map(prev).set(id, {
      field: field as string,
      value,
      timestamp: Date.now()
    }));

    // Set timeout to clear optimistic marker if sync takes too long (10s)
    const timeoutId = setTimeout(() => {
      setOptimisticUpdates(prev => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }, 10000);
    
    // Proceed with normal update
    const today = new Date().toISOString().split('T')[0];
    setInitiatives(prev => prev.map(i => {
      if (i.id === id) {
        const oldValue = i[field];
        const fieldName = field === 'estimatedEffort' ? 'Effort' : field === 'eta' ? 'ETA' : field === 'status' ? 'Status' : field;
        
        let updatedHistory = i.history || [];
        if (oldValue !== value && (field === 'estimatedEffort' || field === 'eta' || field === 'status' || field === 'priority')) {
           const change = recordChange(i, fieldName, oldValue, value, undefined, tradeOffSourceId, tradeOffSourceTitle);
           setChangeLog(prevLog => [change, ...prevLog]);
           updatedHistory = [...updatedHistory, change];
           // Sync change record to Google Sheets
           sheetsSync.queueChangeLog(change);
        }
        
        const updated = { ...i, [field]: value, lastUpdated: today, history: updatedHistory };
        
        // Log task updates for debugging
        if (field === 'tasks') {
          console.log(`[APP] Task update for ${id}: ${(value as any)?.length || 0} tasks`);
        }
        
        // Create notification center entry (only if not suppressed)
        if (!suppressNotification) {
          const isTaskUpdate = field === 'tasks';
          const notificationTitle = isTaskUpdate ? 'Task Updated' : 'Initiative Updated';
          const notificationMessage = isTaskUpdate ? 'Task was updated' : 'Initiative was updated';
          const fieldName = field === 'estimatedEffort' ? 'Effort' : field === 'eta' ? 'ETA' : field === 'status' ? 'Status' : field === 'priority' ? 'Priority' : field;
          
          addNotification(createNotification(
            NotificationType.FieldChange,
            notificationTitle,
            notificationMessage,
            updated.id,
            updated.title,
            updated.ownerId,
            { field: fieldName, isTaskUpdate }
          ));
        }
        
        // Track overlooked items: if ETA is pushed back, increment overlookedCount
        if (field === 'eta' && oldValue && value && oldValue < value) {
          updated.overlookedCount = (i.overlookedCount || 0) + 1;
          updated.lastDelayDate = today;
          // Create notification for repeatedly overlooked items
          if (updated.overlookedCount > 2) {
            addNotification(createNotification(
              NotificationType.OverlookedItem,
              'Repeatedly overlooked item',
              `${updated.title} has been delayed ${updated.overlookedCount} times`,
              updated.id,
              updated.title,
              updated.ownerId,
              { overlookedCount: updated.overlookedCount, lastDelayDate: updated.lastDelayDate }
            ));
          }
        } else {
          // Preserve existing overlookedCount and lastDelayDate if not updating ETA
          updated.overlookedCount = i.overlookedCount;
          updated.lastDelayDate = i.lastDelayDate;
        }
        
        // Track weekly update: if it's Thursday or later in the week, update lastWeeklyUpdate
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 = Sunday, 4 = Thursday
        if (dayOfWeek >= 4) { // Thursday (4), Friday (5), Saturday (6)
          updated.lastWeeklyUpdate = today;
        } else {
          updated.lastWeeklyUpdate = i.lastWeeklyUpdate;
        }
        
        // Clear notification state if originalEstimatedEffort is updated
        if (field === 'originalEstimatedEffort') {
          const notificationKey = `effortExceededNotified_${updated.id}`;
          localStorage.removeItem(notificationKey);
        }
        
        // Check if actual effort exceeds original allocated effort
        if (field === 'actualEffort' || field === 'tasks') {
          const actualEffort = updated.actualEffort || 0;
          const originalEffort = updated.originalEstimatedEffort || 0;
          
          // Only check if both values are defined and > 0, and actual exceeds original
          if (originalEffort > 0 && actualEffort > originalEffort) {
            // Check if notification has already been shown for this initiative
            const notificationKey = `effortExceededNotified_${updated.id}`;
            const alreadyNotified = localStorage.getItem(notificationKey);
            
            if (!alreadyNotified) {
              // Mark as notified in localStorage
              localStorage.setItem(notificationKey, 'true');
              
              // Create notification
              addNotification(createNotification(
                NotificationType.EffortExceeded,
                'Effort Exceeded',
                `${updated.title} actual effort (${actualEffort.toFixed(2)}w) exceeds original allocation (${originalEffort.toFixed(2)}w)`,
                updated.id,
                updated.title,
                updated.ownerId,
                { 
                  actualEffort, 
                  originalEffort, 
                  variance: actualEffort - originalEffort,
                  variancePercent: ((actualEffort - originalEffort) / originalEffort * 100).toFixed(1)
                }
              ));
              
              // Show modal
              setEffortExceededInitiative(updated);
              setShowEffortExceededModal(true);
            }
          }
        }
        
        // Execute field-change workflows (including effort-based transitions)
        if (field === 'status') {
          executeFieldChangeWorkflows(updated, 'status');
        } else if (field === 'eta') {
          executeFieldChangeWorkflows(updated, 'eta');
        } else if (field === 'actualEffort' || field === 'estimatedEffort') {
          executeFieldChangeWorkflows(updated, 'actualEffort');
        }
        
        // Update localStorage cache
        const cached = localStorage.getItem('portfolio-initiatives-cache');
        if (cached) {
          const cachedInitiatives: Initiative[] = JSON.parse(cached);
          const index = cachedInitiatives.findIndex(i => i.id === updated.id);
          if (index >= 0) {
            cachedInitiatives[index] = updated;
          } else {
            cachedInitiatives.push(updated);
          }
          localStorage.setItem('portfolio-initiatives-cache', JSON.stringify(cachedInitiatives));
        }
        
        // Broadcast to other users in real-time
        realtimeService.broadcastUpdate(updated);
        
        // Sync to Google Sheets (queued, happens asynchronously)
        try {
          sheetsSync.queueInitiativeSync(updated);
          
          // Sync tasks to separate Tasks sheet
          if (updated.tasks && updated.tasks.length > 0) {
            sheetsSync.queueTasksSync(updated.tasks, updated);
          }
          
          // Clear optimistic marker after a short delay (assuming success)
          // The timeout will also clear it if sync takes too long
          setTimeout(() => {
            clearTimeout(timeoutId);
            setOptimisticUpdates(prev => {
              const next = new Map(prev);
              next.delete(id);
              return next;
            });
          }, 2000); // Clear after 2 seconds (sync should complete quickly)
        } catch (error) {
          // Rollback on immediate error
          clearTimeout(timeoutId);
          setInitiatives(prev => prev.map(i => {
            if (i.id === id) {
              return { ...i, [field]: oldValue };
            }
            return i;
          }));
          
          // Clear optimistic marker
          setOptimisticUpdates(prev => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
          
          // Format and show enhanced error toast
          const errorDetails = formatError(error, {
            retry: () => {
              // Retry the update
              handleInlineUpdate(id, field, value);
            },
            retrySync: () => {
              // Retry sync - force sync all pending changes
              sheetsSync.forceSyncNow().catch((syncError) => {
                const syncErrorDetails = formatError(syncError);
                showErrorWithDetails(syncErrorDetails);
              });
            }
          });
          showErrorWithDetails(errorDetails);
          
          logger.error('Failed to sync optimistic update', { 
            context: 'App.handleInlineUpdate', 
            error: error instanceof Error ? error : new Error(String(error)),
            metadata: { id, field, value }
          });
        }
        
        return updated;
      }
      return i;
    }));
  };

  // Handle At Risk reason modal save
  const handleAtRiskReasonSave = (reason: string) => {
    if (!pendingAtRiskInitiative) return;
    
    const today = new Date().toISOString().split('T')[0];
    setInitiatives(prev => prev.map(i => {
      if (i.id === pendingAtRiskInitiative.id) {
        const oldStatus = i.status;
        const updated = { 
          ...i, 
          status: Status.AtRisk, 
          riskActionLog: reason,
          lastUpdated: today 
        };
        
        // Record status change
        const change = recordChange(i, 'Status', oldStatus, Status.AtRisk);
        setChangeLog(prevLog => [change, ...prevLog]);
        updated.history = [...(i.history || []), change];
        // Sync status change to Google Sheets
        sheetsSync.queueChangeLog(change);
        
        // Record riskActionLog change if it's new
        if (!i.riskActionLog || i.riskActionLog !== reason) {
          const riskChange = recordChange(i, 'Risk Action Log', i.riskActionLog || '', reason);
          setChangeLog(prevLog => [riskChange, ...prevLog]);
          updated.history = [...(updated.history || []), riskChange];
          // Sync risk action log change to Google Sheets
          sheetsSync.queueChangeLog(riskChange);
        }
        
        // Track weekly update
        const now = new Date();
        const dayOfWeek = now.getDay();
        if (dayOfWeek >= 4) {
          updated.lastWeeklyUpdate = today;
        } else {
          updated.lastWeeklyUpdate = i.lastWeeklyUpdate;
        }
        
        // Execute field-change workflows
        executeFieldChangeWorkflows(updated, 'status');
        
        // Update localStorage cache
        const cached = localStorage.getItem('portfolio-initiatives-cache');
        if (cached) {
          const cachedInitiatives: Initiative[] = JSON.parse(cached);
          const index = cachedInitiatives.findIndex(i => i.id === updated.id);
          if (index >= 0) {
            cachedInitiatives[index] = updated;
          } else {
            cachedInitiatives.push(updated);
          }
          localStorage.setItem('portfolio-initiatives-cache', JSON.stringify(cachedInitiatives));
        }
        
        // Broadcast update
        realtimeService.broadcastUpdate(updated);
        
        // Sync to Google Sheets
        sheetsSync.queueInitiativeSync(updated);
        
        // Sync tasks to separate Tasks sheet
        if (updated.tasks && updated.tasks.length > 0) {
          sheetsSync.queueTasksSync(updated.tasks, updated);
        }
        
        // Check for "At Risk" status changes notification
        if (oldStatus !== Status.AtRisk) {
          addNotification(createNotification(
            NotificationType.AtRisk,
            'Initiative marked as At Risk',
            `${updated.title} has been marked as "At Risk"`,
            updated.id,
            updated.title,
            updated.ownerId,
            { ownerId: updated.ownerId }
          ));
        }
        
        return updated;
      }
      return i;
    }));
    
    // Close modal and reset state
    setIsAtRiskModalOpen(false);
    setPendingAtRiskInitiative(null);
  };

  // Handle At Risk reason modal cancel
  const handleAtRiskReasonCancel = () => {
    // Just close the modal, don't change status
    setIsAtRiskModalOpen(false);
    setPendingAtRiskInitiative(null);
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Handle data refresh from localStorage
  const handleRefreshData = async () => {
    setIsDataLoading(true);
    showInfo('Refreshing data...');
    try {
      const cached = localStorage.getItem('portfolio-initiatives-cache');
      const loadedInitiatives: Initiative[] = cached ? JSON.parse(cached) : [];
      
      if (loadedInitiatives.length > 0) {
        // Deduplicate by ID (keep first occurrence)
        const deduplicatedInitiatives = deduplicateInitiatives(loadedInitiatives);
        
        const duplicatesRemoved = loadedInitiatives.length - deduplicatedInitiatives.length;
        if (duplicatesRemoved > 0) {
          console.log(`[DEBUG] handleRefreshData: Setting ${deduplicatedInitiatives.length} initiatives (removed ${duplicatesRemoved} duplicates)`);
          showSuccess(`Successfully loaded ${deduplicatedInitiatives.length} initiatives (removed ${duplicatesRemoved} duplicates)`);
        } else {
          showSuccess(`Successfully loaded ${deduplicatedInitiatives.length} initiatives`);
        }
        setInitiatives(deduplicatedInitiatives);
      } else {
        setInitiatives([]);
        showInfo('No initiatives found');
      }
    } catch (error) {
      logger.error('Failed to refresh data', { context: 'App.handleRefreshData', error: error instanceof Error ? error : new Error(String(error)) });
      showError('Failed to refresh data. Please try again.');
    } finally {
      setIsDataLoading(false);
    }
  };

  // Clear corrupted cache and reload
  const handleClearCache = async () => {
    setIsDataLoading(true);
    showInfo('Clearing corrupted cache...');
    
    try {
      // Clear the corrupted cache
      localStorage.removeItem('portfolio-initiatives-cache');
      localStorage.removeItem('portfolio-initiatives-cache-timestamp');
      
      // Reload data from localStorage
      await handleRefreshData();
      showSuccess('Cache cleared and data reloaded');
    } catch (error) {
      logger.error('Failed to clear cache', { context: 'App.handleClearCache', error: error instanceof Error ? error : new Error(String(error)) });
      showError('Failed to clear cache. Please try again.');
    } finally {
      setIsDataLoading(false);
    }
  };

  const resetFilters = () => {
    setFilterAssetClass('');
    setFilterOwners([]);
    setFilterWorkType([]);
    setFilterQuarter([]);
    setFilterPriority([]);
    setFilterStatus([]);
    setSearchQuery('');
  };

  // Notification Handlers
  const handleMarkAsRead = (id: string) => {
    // Update local state immediately
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    
    // Sync with server
    notificationService.markAsRead(id).catch(error => {
      logger.error('Failed to mark notification as read on server', { 
        context: 'App.handleMarkAsRead', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
    });
  };

  const handleMarkAllAsRead = () => {
    // Update local state immediately
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    
    // Sync with server
    notificationService.markAllAsRead().catch(error => {
      logger.error('Failed to mark all notifications as read on server', { 
        context: 'App.handleMarkAllAsRead', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
    });
  };

  const handleClearAll = () => {
    // Update local state immediately
    setNotifications([]);
    
    // Sync with server
    notificationService.clearAll().catch(error => {
      logger.error('Failed to clear notifications on server', { 
        context: 'App.handleClearAll', 
        error: error instanceof Error ? error : new Error(String(error)) 
      });
    });
  };

  const handleNotificationClick = (notification: Notification) => {
    // Find and open the initiative modal
    const initiative = initiatives.find(i => i.id === notification.initiativeId);
    if (initiative) {
      setEditingItem(initiative);
      setIsModalOpen(true);
    }
  };

  // Comment Handlers
  const handleAddComment = (initiativeId: string, comment: Comment) => {
    setInitiatives(prev => prev.map(initiative => {
      if (initiative.id === initiativeId) {
        const updatedInitiative = {
          ...initiative,
          comments: [...(initiative.comments || []), comment],
          lastUpdated: new Date().toISOString().split('T')[0]
        };
        
        // Update localStorage cache
        const cached = localStorage.getItem('portfolio-initiatives-cache');
        if (cached) {
          const cachedInitiatives: Initiative[] = JSON.parse(cached);
          const index = cachedInitiatives.findIndex(i => i.id === updatedInitiative.id);
          if (index >= 0) {
            cachedInitiatives[index] = updatedInitiative;
          } else {
            cachedInitiatives.push(updatedInitiative);
          }
          localStorage.setItem('portfolio-initiatives-cache', JSON.stringify(cachedInitiatives));
        }
        
        // Create notification for the owner if it's not their own comment
        if (initiative.ownerId && initiative.ownerId !== currentUser.id) {
          addNotification(createNotification(
            NotificationType.NewComment,
            'New comment',
            `${currentUser.name} commented on "${initiative.title}"`,
            initiative.id,
            initiative.title,
            initiative.ownerId,
            { commentId: comment.id, commentText: comment.text, ownerId: initiative.ownerId }
          ));
        }
        
        // Handle @mentions in the comment
        const mentionedUserIds = parseMentions(comment.text, users);
        mentionedUserIds.forEach(userId => {
          // Don't notify the owner again (they already get a NewComment notification above)
          if (userId !== initiative.ownerId) {
            addNotification(createNotification(
              NotificationType.Mention,
              'You were mentioned',
              `${currentUser.name} mentioned you in a comment on "${initiative.title}"`,
              initiative.id,
              initiative.title,
              userId,
              { commentId: comment.id, commentText: comment.text }
            ));
          }
        });
        
        // Sync comment to Google Sheets
        sheetsSync.queueInitiativeSync(updatedInitiative);
        
        return updatedInitiative;
      }
      return initiative;
    }));
    
    // Mark as read for the commenter (they've seen the latest since they just commented)
    handleMarkCommentRead(initiativeId);
  };

  const handleMarkCommentRead = (initiativeId: string) => {
    setCommentReadState(prev => ({
      ...prev,
      [initiativeId]: new Date().toISOString()
    }));
  };

  // Show loading state while checking authentication or loading data
  if (authLoading || (isAuthenticated && isDataLoading)) {
    return (
      <LoadingSpinner 
        fullScreen 
        size="lg"
        text={authLoading ? 'Checking authentication...' : 'Loading data...'} 
      />
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col">
      <TopNav 
        currentView={currentView} 
        setCurrentView={handleViewChange} 
        currentUser={currentUser}
        config={config}
        setConfig={setConfig}
        onLogout={logout}
        weeklyEffortFlags={weeklyEffortFlags}
      />

      <Routes>
        <Route path="/item/:id" element={
          <main ref={mainContainerRef} className={`flex-1 overflow-y-auto bg-[#F9FAFB] ${currentView === 'all' ? 'p-4 md:p-8' : 'p-2 md:p-4'}`}>
            <div className={`flex flex-col md:flex-row justify-end items-start md:items-center gap-4 ${currentView === 'all' ? 'mb-8' : 'mb-2'}`}>
          <div className="flex gap-3 w-full md:w-auto">
            {currentView === 'all' && (
              <>
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    type="text" placeholder="Search..." 
                    value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm"
                  />
                </div>
                <ExportDropdown 
                  initiatives={filteredInitiatives} 
                  users={users}
                  filters={{
                    assetClass: filterAssetClass,
                    owners: filterOwners,
                    workType: filterWorkType?.[0] || undefined
                  }}
                />
                {canCreate && (
                  <div className="relative" ref={newButtonRef}>
                    <button 
                      onClick={() => setNewButtonDropdownOpen(!newButtonDropdownOpen)} 
                      className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                    >
                      <Plus size={16} /><span>New</span>
                      <ChevronDown size={14} className={`transition-transform ${newButtonDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {newButtonDropdownOpen && (
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-200 py-2 z-50">
                        <button
                          onClick={() => {
                            setInitialModalMode('single');
                            setEditingItem(null);
                            setIsModalOpen(true);
                            setNewButtonDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                        >
                          <Plus size={16} className="text-blue-600" />
                          <div>
                            <p className="font-medium">New Item</p>
                            <p className="text-xs text-slate-400">Single initiative</p>
                          </div>
                        </button>
                        <button
                          onClick={() => {
                            setInitialModalMode('bulk');
                            setEditingItem(null);
                            setIsModalOpen(true);
                            setNewButtonDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left border-t border-slate-100"
                        >
                          <Plus size={16} className="text-indigo-600" />
                          <div>
                            <p className="font-medium">Plan Mode</p>
                            <p className="text-xs text-slate-400">Spreadsheet view</p>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            <PresenceIndicator currentUserId={currentUser.id} />
            <NotificationMenu
              notifications={notifications}
              onMarkAsRead={handleMarkAsRead}
              onMarkAllAsRead={handleMarkAllAsRead}
              onClearAll={handleClearAll}
              onNotificationClick={handleNotificationClick}
              currentUserId={currentUser.id}
              currentUserEmail={currentUser.email}
              validInitiativeIds={validInitiativeIds}
            />
          </div>
        </div>

        {currentView === 'admin' ? (
          <AdminPanel
            onClearCache={handleClearCache}
            currentUser={currentUser}
            config={config}
            setConfig={setConfig}
            users={users}
            setUsers={setUsers}
            initiatives={initiatives}
            deletedInitiatives={initiatives.filter(i => i.status === Status.Deleted)}
            onRestore={handleRestoreInitiative}
            isDataLoading={isDataLoading}
          />
        ) : (
           <>
             {currentView === 'all' && (
                <MetricsDashboard 
                  metrics={metrics}
                />
             )}
             
             {currentView !== 'workflows' && (
               <FilterBar 
                 filterAssetClass={filterAssetClass} setFilterAssetClass={setFilterAssetClass}
                 filterOwners={filterOwners} setFilterOwners={setFilterOwners}
                 filterWorkType={filterWorkType} setFilterWorkType={setFilterWorkType}
                 filterQuarter={filterQuarter} setFilterQuarter={setFilterQuarter}
                 filterPriority={filterPriority} setFilterPriority={setFilterPriority}
                 filterStatus={filterStatus} setFilterStatus={setFilterStatus}
                 searchQuery={searchQuery} resetFilters={resetFilters}
                 currentView={currentView} viewLayout={viewLayout} setViewLayout={setViewLayout}
                 users={users}
                 initiatives={initiatives}
                 config={config}
               />
             )}

             {currentView === 'resources' ? (
               canViewTab(config, currentUser.role, 'accessWorkplanHealth') ? (
                 <ResourcesDashboard 
                   filteredInitiatives={filteredInitiatives} 
                   config={config} 
                   users={users} 
                 />
               ) : (
                 <div className="p-10 text-center text-red-500 font-bold">Access Denied</div>
               )
             ) : currentView === 'timeline' ? (
               <CalendarView 
                 filteredInitiatives={filteredInitiatives}
                 handleInlineUpdate={handleInlineUpdate}
                 setEditingItem={setEditingItem}
                 setIsModalOpen={setIsModalOpen}
                 calendarDate={calendarDate}
                 setCalendarDate={setCalendarDate}
                 users={users}
                 filterOwners={filterOwners}
                 filterAssetClass={filterAssetClass}
                filterWorkType={filterWorkType?.[0] || ''}
                filterStatus={null}
                searchQuery={searchQuery}
                totalInitiativesCount={initiatives.length}
                showToast={(message: string) => showSuccess(message)}
                config={config}
               />
             ) : currentView === 'workflows' ? (
               <WorkflowsView
                 workflows={config.workflows || []}
                 setWorkflows={(workflows) => setConfig(prev => ({ ...prev, workflows: typeof workflows === 'function' ? workflows(prev.workflows || []) : workflows }))}
                 currentUser={currentUser}
                 initiatives={initiatives}
                 setInitiatives={setInitiatives}
                 recordChange={recordChange}
                 config={config}
                 setConfig={setConfig}
               />
            ) : currentView === 'dependencies' ? (
               <DependenciesView
                 initiatives={filteredInitiatives}
                 users={users}
                 config={config}
                 onInitiativeClick={(initiative) => {
                   setEditingItem(initiative);
                   setIsModalOpen(true);
                 }}
                 onInitiativeUpdate={handleSave}
               />
            ) : (
              <TaskTable 
                filteredInitiatives={filteredInitiatives}
                allInitiatives={initiatives}
                handleInlineUpdate={handleInlineUpdate}
                setEditingItem={setEditingItem}
                setIsModalOpen={setIsModalOpen}
                sortConfig={sortConfig}
                handleSort={handleSort}
                users={users}
                currentUser={currentUser}
                config={config}
                viewMode="flat"
                commentReadState={commentReadState}
                onAddComment={handleAddComment}
                onMarkCommentRead={handleMarkCommentRead}
                onDeleteInitiative={handleDeleteInitiative}
                onOpenAtRiskModal={(initiative) => {
                  setPendingAtRiskInitiative({ id: initiative.id, oldStatus: initiative.status });
                  setIsAtRiskModalOpen(true);
                }}
                effortDisplayUnit={effortDisplayUnit}
                setEffortDisplayUnit={setEffortDisplayUnit}
                optimisticUpdates={optimisticUpdates}
              />
            )}
           </>
        )}
      </main>
        } />
        <Route path="*" element={
          <main ref={mainContainerRef} className={`flex-1 overflow-y-auto bg-[#F9FAFB] ${currentView === 'all' ? 'p-4 md:p-8' : 'p-2 md:p-4'}`}>
            <div className={`flex flex-col md:flex-row justify-end items-start md:items-center gap-4 ${currentView === 'all' ? 'mb-8' : 'mb-2'}`}>
          <div className="flex gap-3 w-full md:w-auto">
            {currentView === 'all' && (
              <>
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    type="text" placeholder="Search..." 
                    value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm"
                  />
                </div>
                <ExportDropdown 
                  initiatives={filteredInitiatives} 
                  users={users}
                  filters={{
                    assetClass: filterAssetClass,
                    owners: filterOwners,
                    workType: filterWorkType?.[0] || undefined
                  }}
                />
                {canCreate && (
                  <div className="relative" ref={newButtonRef}>
                    <button 
                      onClick={() => setNewButtonDropdownOpen(!newButtonDropdownOpen)} 
                      className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                    >
                      <Plus size={16} /><span>New</span>
                      <ChevronDown size={14} className={`transition-transform ${newButtonDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {newButtonDropdownOpen && (
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-200 py-2 z-50">
                        <button
                          onClick={() => {
                            setInitialModalMode('single');
                            setEditingItem(null);
                            setIsModalOpen(true);
                            setNewButtonDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                        >
                          <Plus size={16} className="text-blue-600" />
                          <div>
                            <p className="font-medium">New Item</p>
                            <p className="text-xs text-slate-400">Single initiative</p>
                          </div>
                        </button>
                        <button
                          onClick={() => {
                            setInitialModalMode('bulk');
                            setEditingItem(null);
                            setIsModalOpen(true);
                            setNewButtonDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left border-t border-slate-100"
                        >
                          <Plus size={16} className="text-indigo-600" />
                          <div>
                            <p className="font-medium">Plan Mode</p>
                            <p className="text-xs text-slate-400">Spreadsheet view</p>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            <PresenceIndicator currentUserId={currentUser.id} />
            <NotificationMenu
              notifications={notifications}
              onMarkAsRead={handleMarkAsRead}
              onMarkAllAsRead={handleMarkAllAsRead}
              onClearAll={handleClearAll}
              onNotificationClick={handleNotificationClick}
              currentUserId={currentUser.id}
              currentUserEmail={currentUser.email}
              validInitiativeIds={validInitiativeIds}
            />
          </div>
        </div>

        {currentView === 'admin' ? (
          <AdminPanel
            onClearCache={handleClearCache}
            currentUser={currentUser}
            config={config}
            setConfig={setConfig}
            users={users}
            setUsers={setUsers}
            initiatives={initiatives}
            deletedInitiatives={initiatives.filter(i => i.status === Status.Deleted)}
            onRestore={handleRestoreInitiative}
            isDataLoading={isDataLoading}
          />
        ) : (
           <>
             {currentView === 'all' && (
                <MetricsDashboard 
                  metrics={metrics}
                />
             )}
             
             {currentView !== 'workflows' && (
               <FilterBar 
                 filterAssetClass={filterAssetClass} setFilterAssetClass={setFilterAssetClass}
                 filterOwners={filterOwners} setFilterOwners={setFilterOwners}
                 filterWorkType={filterWorkType} setFilterWorkType={setFilterWorkType}
                 filterQuarter={filterQuarter} setFilterQuarter={setFilterQuarter}
                 filterPriority={filterPriority} setFilterPriority={setFilterPriority}
                 filterStatus={filterStatus} setFilterStatus={setFilterStatus}
                 searchQuery={searchQuery} resetFilters={resetFilters}
                 currentView={currentView} viewLayout={viewLayout} setViewLayout={setViewLayout}
                 users={users}
                 initiatives={initiatives}
                 config={config}
               />
             )}

             {currentView === 'resources' ? (
               canViewTab(config, currentUser.role, 'accessWorkplanHealth') ? (
                 <ResourcesDashboard 
                   filteredInitiatives={filteredInitiatives} 
                   config={config} 
                   users={users} 
                 />
               ) : (
                 <div className="p-10 text-center text-red-500 font-bold">Access Denied</div>
               )
             ) : currentView === 'timeline' ? (
               <CalendarView 
                 filteredInitiatives={filteredInitiatives}
                 handleInlineUpdate={handleInlineUpdate}
                 setEditingItem={setEditingItem}
                 setIsModalOpen={setIsModalOpen}
                 calendarDate={calendarDate}
                 setCalendarDate={setCalendarDate}
                 users={users}
                 filterOwners={filterOwners}
                 filterAssetClass={filterAssetClass}
                filterWorkType={filterWorkType?.[0] || ''}
                filterStatus={null}
                searchQuery={searchQuery}
                totalInitiativesCount={initiatives.length}
                showToast={(message: string) => showSuccess(message)}
                config={config}
               />
             ) : currentView === 'workflows' ? (
               <WorkflowsView
                 workflows={config.workflows || []}
                 setWorkflows={(workflows) => setConfig(prev => ({ ...prev, workflows: typeof workflows === 'function' ? workflows(prev.workflows || []) : workflows }))}
                 currentUser={currentUser}
                 initiatives={initiatives}
                 setInitiatives={setInitiatives}
                 recordChange={recordChange}
                 config={config}
                 setConfig={setConfig}
               />
            ) : currentView === 'dependencies' ? (
               <DependenciesView
                 initiatives={filteredInitiatives}
                 users={users}
                 config={config}
                 onInitiativeClick={(initiative) => {
                   setEditingItem(initiative);
                   setIsModalOpen(true);
                 }}
                 onInitiativeUpdate={handleSave}
               />
            ) : (
              <TaskTable 
                filteredInitiatives={filteredInitiatives}
                allInitiatives={initiatives}
                handleInlineUpdate={handleInlineUpdate}
                setEditingItem={setEditingItem}
                setIsModalOpen={setIsModalOpen}
                sortConfig={sortConfig}
                handleSort={handleSort}
                users={users}
                currentUser={currentUser}
                config={config}
                viewMode="flat"
                commentReadState={commentReadState}
                onAddComment={handleAddComment}
                onMarkCommentRead={handleMarkCommentRead}
                onDeleteInitiative={handleDeleteInitiative}
                onOpenAtRiskModal={(initiative) => {
                  setPendingAtRiskInitiative({ id: initiative.id, oldStatus: initiative.status });
                  setIsAtRiskModalOpen(true);
                }}
                effortDisplayUnit={effortDisplayUnit}
                setEffortDisplayUnit={setEffortDisplayUnit}
                optimisticUpdates={optimisticUpdates}
              />
            )}
           </>
        )}
      </main>
        } />
      </Routes>

      <InitiativeModal 
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingItem(null);
          // Navigate back to dashboard if we're on /item/:id route
          if (location.pathname.startsWith('/item/')) {
            navigate('/dashboard', { replace: true });
          }
        }}
        onSave={handleSave}
        currentUser={currentUser}
        initiativeToEdit={editingItem}
        rolePermissions={config.rolePermissions}
        config={config}
        users={users}
        allInitiatives={initiatives}
        onDelete={handleDeleteInitiative}
        effortDisplayUnit={effortDisplayUnit}
        setEffortDisplayUnit={setEffortDisplayUnit}
        initialMode={editingItem ? 'single' : initialModalMode}
      />
      
      <AtRiskReasonModal
        isOpen={isAtRiskModalOpen}
        initiative={pendingAtRiskInitiative ? initiatives.find(i => i.id === pendingAtRiskInitiative.id) || null : null}
        currentReason={pendingAtRiskInitiative ? initiatives.find(i => i.id === pendingAtRiskInitiative.id)?.riskActionLog || '' : ''}
        onSave={handleAtRiskReasonSave}
        onCancel={handleAtRiskReasonCancel}
      />

      <WeeklyEffortWarningModal
        isOpen={showEffortWarningPopup}
        onClose={() => {
          setShowEffortWarningPopup(false);
          setCurrentEffortFlag(null);
        }}
        validationResult={currentEffortFlag}
      />

      <EffortExceededModal
        isOpen={showEffortExceededModal}
        onClose={() => {
          setShowEffortExceededModal(false);
          setEffortExceededInitiative(null);
        }}
        initiative={effortExceededInitiative}
      />

      {/* Support Widget - floating help button */}
      {isAuthenticated && <SupportWidget />}

    </div>
  );
}