import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, Plus } from 'lucide-react';

import { USERS, INITIAL_INITIATIVES, INITIAL_CONFIG } from './constants';
import { Initiative, Status, WorkType, AppConfig, ChangeRecord, TradeOffAction, User, ViewType, Role, PermissionKey, Notification, NotificationType, Comment, UserCommentReadState } from './types';
import { getOwnerName, generateId, parseMentions, logger } from './utils';
import { useLocalStorage, useEdgeScrolling, useGlobalEdgeScrolling } from './hooks';
import { sheetsSync, slackService, workflowEngine, realtimeService } from './services';
import { useAuth, useToast } from './contexts';
import InitiativeModal from './components/modals/InitiativeModal';

// Components
import { Sidebar } from './components/shared/Sidebar';
import { FilterBar } from './components/shared/FilterBar';
import { SyncStatusBadge } from './components/shared/SyncStatusBadge';
import { NotificationMenu } from './components/shared/NotificationMenu';
import { ExportDropdown } from './components/shared/ExportDropdown';
import { PresenceIndicator } from './components/shared/PresenceIndicator';
import { LoadingSpinner } from './components/shared';
import { MetricsDashboard } from './components/views/MetricsDashboard';
import { ResourcesDashboard } from './components/views/ResourcesDashboard';
import { TaskTable } from './components/views/TaskTable';
import { CalendarView } from './components/views/CalendarView';
import { AdminPanel } from './components/views/AdminPanel';
import { WorkflowsView } from './components/views/WorkflowsView';
import { DependenciesView } from './components/views/DependenciesView';
import { LoginPage } from './components/auth';

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3001';

export default function App() {
  const { user: authUser, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { showSuccess, showError, showInfo, showWarning } = useToast();
  
  // Ref for main scrollable container
  const mainContainerRef = useRef<HTMLElement>(null);
  
  // Ref to track latest initiatives for workflow execution (prevents race conditions)
  const initiativesRef = useRef<Initiative[]>([]);
  
  // Enable global edge scrolling for the entire platform/viewport
  useGlobalEdgeScrolling({
    threshold: 50,
    maxSpeed: 10,
    horizontal: true,
    vertical: true,
  });
  
  // Also enable edge scrolling for the main container (for containers with their own scroll)
  useEdgeScrolling(mainContainerRef, {
    threshold: 50,
    maxSpeed: 10,
    horizontal: true,
    vertical: true,
  });
  
  // State for Users - start with hardcoded as fallback, load from API
  const [users, setUsers] = useState<User[]>(USERS);
  const [usersLoaded, setUsersLoaded] = useState(false);
  
  // Use authenticated user or fallback
  const currentUser = authUser || users.find(u => u.email === 'adar.sobol@pagaya.com') || users[0]; 
  
  // Data loading state
  const [isDataLoading, setIsDataLoading] = useState(true);
  
  // Initiatives - loaded from Google Sheets (primary) with localStorage fallback
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  
  // Keep ref in sync with state
  useEffect(() => {
    initiativesRef.current = initiatives;
  }, [initiatives]);
  const [config, setConfig] = useLocalStorage<AppConfig>('portfolio-config', INITIAL_CONFIG);
  
  // Audit State
  const [changeLog, setChangeLog] = useState<ChangeRecord[]>([]);
  
  // Notifications State
  const [notifications, setNotifications] = useLocalStorage<Notification[]>('portfolio-notifications', []);
  
  // Comment Read State - tracks when each user last viewed comments on each initiative
  const [commentReadState, setCommentReadState] = useLocalStorage<UserCommentReadState>('portfolio-comment-read-state', {});

  // Load users from Google Sheets API
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

  // Load initiatives from Google Sheets on startup
  useEffect(() => {
    if (!isAuthenticated) {
      setIsDataLoading(false);
      return;
    }

    let isMounted = true;

    const loadData = async () => {
      setIsDataLoading(true);
      try {
        const loadedInitiatives = await sheetsSync.loadInitiatives();
        
        if (!isMounted) return;
        
        if (loadedInitiatives.length > 0) {
          setInitiatives(loadedInitiatives);
        } else {
          setInitiatives(INITIAL_INITIATIVES);
          sheetsSync.queueInitiativesSync(INITIAL_INITIATIVES);
        }
      } catch (error) {
        logger.error('Failed to load initiatives', { context: 'App.loadData', error: error instanceof Error ? error : new Error(String(error)) });
        if (isMounted) {
          setInitiatives(INITIAL_INITIATIVES);
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
        setInitiatives(prev => prev.map(i => i.id === initiative.id ? initiative : i));
      });

      const unsubCreate = realtimeService.onInitiativeCreate(({ initiative }) => {
        setInitiatives(prev => {
          if (prev.find(i => i.id === initiative.id)) return prev;
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

      return () => {
        unsubUpdate();
        unsubCreate();
        unsubComment();
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
    
    // Ensure all roles have the new workflow permissions
    const allRoles = Object.values(Role);
    for (const role of allRoles) {
      if (!updatedConfig.rolePermissions[role]) {
        updatedConfig.rolePermissions[role] = { ...INITIAL_CONFIG.rolePermissions[role] };
        needsUpdate = true;
      } else {
        // Merge missing permissions from INITIAL_CONFIG
        const initialPerms = INITIAL_CONFIG.rolePermissions[role];
        const currentPerms = updatedConfig.rolePermissions[role];
        for (const key in initialPerms) {
          if (!(key in currentPerms)) {
            (updatedConfig.rolePermissions[role] as any)[key] = initialPerms[key as PermissionKey];
            needsUpdate = true;
          }
        }
      }
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
        if (initiative.eta < today && 
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

  // View State
  const [currentView, setCurrentView] = useState<ViewType>('all');
  const [viewLayout, setViewLayout] = useState<'table' | 'tree'>('table'); 
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filter State
  const [filterAssetClass, setFilterAssetClass] = useState<string>('');
  const [filterOwners, setFilterOwners] = useState<string[]>([]);
  const [filterWorkType, setFilterWorkType] = useState<string>('');

  // Sort State
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  
  // Calendar State
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Initiative | null>(null);

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
  const userPermissions = config.rolePermissions[currentUser.role];
  const canCreate = userPermissions.createPlanned || userPermissions.createUnplanned;

  const getOwnerNameById = (id?: string) => getOwnerName(users, id);

  const filteredInitiatives = useMemo(() => {
    let data = [...initiatives];

    // Filter by Asset Class
    if (filterAssetClass) data = data.filter(i => i.l1_assetClass === filterAssetClass);
    
    // Filter by Owners
    if (filterOwners.length > 0) {
      data = data.filter(i => filterOwners.includes(i.ownerId));
    }
    
    // Filter by Work Type (including unplanned tags)
    if (filterWorkType) {
      if (filterWorkType === 'Planned') {
        data = data.filter(i => i.workType === WorkType.Planned);
      } else if (filterWorkType === 'Unplanned') {
        data = data.filter(i => i.workType === WorkType.Unplanned);
      } else {
        // Filter by specific unplanned tag (Risk, PM, etc.)
        data = data.filter(i => 
          i.workType === WorkType.Unplanned && 
          i.unplannedTags?.includes(filterWorkType as any)
        );
      }
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(i => 
        i.title.toLowerCase().includes(q) || 
        i.ownerId.toLowerCase().includes(q) ||
        (i.secondaryOwner && i.secondaryOwner.toLowerCase().includes(q)) ||
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
  }, [initiatives, searchQuery, filterAssetClass, filterOwners, filterWorkType, sortConfig, users]);

  const metrics = useMemo(() => {
    const totalEst = filteredInitiatives.reduce((sum, i) => sum + i.estimatedEffort, 0);
    const totalAct = filteredInitiatives.reduce((sum, i) => sum + i.actualEffort, 0);
    
    // Get relevant owners based on owner filter
    let relevantOwners: string[] = [];
    if (filterOwners.length > 0) {
      relevantOwners = filterOwners;
    } else {
      relevantOwners = Object.keys(config.teamCapacities);
    }

    const totalCapacity = relevantOwners.reduce((sum, id) => sum + (config.teamCapacities[id] || 0), 0);
    const capacityLoad = totalCapacity > 0 ? (totalEst / totalCapacity) * 100 : 0;
    const usage = totalEst > 0 ? (totalAct / totalEst) * 100 : 0;
    
    const countNotStarted = filteredInitiatives.filter(i => i.status === Status.NotStarted).length;
    const countInProgress = filteredInitiatives.filter(i => i.status === Status.InProgress).length;
    const countAtRisk = filteredInitiatives.filter(i => i.status === Status.AtRisk).length;
    const countDone = filteredInitiatives.filter(i => i.status === Status.Done).length;
    
    const plannedItems = filteredInitiatives.filter(i => i.workType === WorkType.Planned);
    const unplannedItems = filteredInitiatives.filter(i => i.workType === WorkType.Unplanned);
    
    const countPlannedWork = plannedItems.length;
    const countUnplannedWork = unplannedItems.length;

    const effortPlanned = plannedItems.reduce((sum, i) => sum + i.estimatedEffort, 0);
      const effortUnplanned = unplannedItems.reduce((sum, i) => sum + i.estimatedEffort, 0);

      // BAU Buffer = sum of filtered team leads' buffer assignments
      const bauBufferTotal = relevantOwners.reduce(
        (sum, id) => sum + (config.teamBuffers?.[id] || 0), 
        0
      );
      const unplannedActuals = filteredInitiatives
        .filter(i => i.workType === WorkType.Unplanned)
        .reduce((sum, i) => sum + i.actualEffort, 0);
    
    const bauRemaining = bauBufferTotal - unplannedActuals;
    const bauHealth = bauBufferTotal > 0 ? (bauRemaining / bauBufferTotal) * 100 : 0;

    return {
      usage,
      capacityLoad,
      totalCapacity,
      totalEst,
      totalAct,
      countAtRisk,
      countUnplanned: filteredInitiatives.filter(i => i.workType === WorkType.Unplanned).length,
      countOpen: countNotStarted + countInProgress + countAtRisk,
      totalCount: filteredInitiatives.length,
      bauBufferTotal,
      unplannedActuals,
      bauHealth,
      statusBreakdown: [
        { name: 'Not Started', value: countNotStarted, color: '#94a3b8' },  // Slate-400
        { name: 'In Progress', value: countInProgress, color: '#3b82f6' },  // Blue-500
        { name: 'At Risk', value: countAtRisk, color: '#f59e0b' },          // Amber-500 (more visible)
        { name: 'Done', value: countDone, color: '#059669' }                 // Emerald-600 (muted)
      ],
      workMix: [
         { name: 'Planned', value: countPlannedWork, effort: effortPlanned, color: '#3b82f6' },
         { name: 'Unplanned', value: countUnplannedWork, effort: effortUnplanned, color: '#f59e0b' }
      ]
    };
  }, [filteredInitiatives, config.teamCapacities, config.teamBuffers, filterOwners]);

  // Notification Helpers
  const createNotification = (
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
  };

  const addNotification = (notification: Notification) => {
    setNotifications(prev => [notification, ...prev]);
  };

  // Actions
  const recordChange = (initiative: Initiative, field: string, oldValue: any, newValue: any): ChangeRecord => {
    const change: ChangeRecord = {
      id: generateId(),
      initiativeId: initiative.id,
      initiativeTitle: initiative.title,
      field,
      oldValue,
      newValue,
      changedBy: currentUser.name,
      timestamp: new Date().toISOString()
    };
    
    // Queue change for Google Sheets sync
    sheetsSync.queueChangeLog(change);
    
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
    
    return change;
  };

  const handleSave = (item: Initiative, tradeOffAction?: TradeOffAction) => {
    const today = new Date().toISOString().split('T')[0];
    
    if (item.actualEffort > 0 && item.status === Status.NotStarted) item.status = Status.InProgress;
    if (item.eta < today && item.status !== Status.Done && item.status !== Status.AtRisk) {
      item.status = Status.AtRisk;
    }

    setInitiatives(prev => {
      let nextInitiatives = [...prev];
      const existingIndex = nextInitiatives.findIndex(i => i.id === item.id);
      
      if (existingIndex > -1) {
        const existing = nextInitiatives[existingIndex];
        const changes: ChangeRecord[] = [];
        if (existing.estimatedEffort !== item.estimatedEffort) {
          changes.push(recordChange(existing, 'Effort', existing.estimatedEffort, item.estimatedEffort));
        }
        if (existing.eta !== item.eta) {
           changes.push(recordChange(existing, 'ETA', existing.eta, item.eta));
        }

        if (changes.length > 0) {
          setChangeLog(prevLog => [...changes, ...prevLog]);
          item.history = [...(existing.history || []), ...changes];
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
            if (userId !== currentUser.id) {
              const mentionedUser = users.find(u => u.id === userId);
              addNotification(createNotification(
                NotificationType.Mention,
                `You were mentioned`,
                `${currentUser.name} mentioned you in a comment on "${item.title}"`,
                item.id,
                item.title,
                userId,
                { commentId: comment.id, commentText: comment.text }
              ));
            }
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

        nextInitiatives[existingIndex] = item;
      } else {
        nextInitiatives.push(item);
      }

      // Queue the saved initiative for Google Sheets sync
      sheetsSync.queueInitiativeSync(item);
      
      // Broadcast to other users in real-time
      if (existingIndex > -1) {
        realtimeService.broadcastUpdate(item);
      } else {
        realtimeService.broadcastCreate(item);
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

          const changeRecord = recordChange(target, fieldLabel, oldValue, tradeOffAction.newValue);
          updatedTarget.history = [...(target.history || []), changeRecord];
          setChangeLog(prevLog => [changeRecord, ...prevLog]);
          nextInitiatives[targetIndex] = updatedTarget;
          
          // Queue the trade-off target for sync as well
          sheetsSync.queueInitiativeSync(updatedTarget);
        }
      }
      return nextInitiatives;
    });
  };

  // Execute workflows triggered by field changes
  const executeFieldChangeWorkflows = async (initiative: Initiative, changedField: string) => {
    const workflows = config.workflows || [];
    const relevantWorkflows = workflows.filter(w => 
      w.enabled && 
      w.trigger === 'on_field_change' &&
      w.triggerConfig?.fields?.includes(changedField)
    );

    for (const workflow of relevantWorkflows) {
      try {
        const initiativeCopy = { ...initiative };
        await workflowEngine.executeWorkflow(workflow, [initiativeCopy], recordChange);
        
        // Update the initiative in state if it was modified
        setInitiatives(prev => prev.map(i => i.id === initiative.id ? initiativeCopy : i));
        
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

  const handleInlineUpdate = (id: string, field: keyof Initiative, value: any) => {
    setInitiatives(prev => prev.map(i => {
      if (i.id === id) {
        const oldValue = i[field];
        const fieldName = field === 'estimatedEffort' ? 'Effort' : field === 'eta' ? 'ETA' : field === 'status' ? 'Status' : field;
        
        if (oldValue !== value && (field === 'estimatedEffort' || field === 'eta')) {
           const change = recordChange(i, fieldName, oldValue, value);
           setChangeLog(prevLog => [change, ...prevLog]);
           i.history = [...(i.history || []), change];
        }
        const updated = { ...i, [field]: value, lastUpdated: new Date().toISOString().split('T')[0] };
        if (updated.actualEffort > 0 && updated.status === Status.NotStarted) updated.status = Status.InProgress;
        
        // Execute field-change workflows
        if (field === 'status') {
          executeFieldChangeWorkflows(updated, 'status');
        } else if (field === 'eta') {
          executeFieldChangeWorkflows(updated, 'eta');
        } else if (field === 'actualEffort' || field === 'estimatedEffort') {
          executeFieldChangeWorkflows(updated, 'actualEffort');
        }
        
        // Queue the updated initiative for Google Sheets sync
        sheetsSync.queueInitiativeSync(updated);
        
        // Broadcast to other users in real-time
        realtimeService.broadcastUpdate(updated);
        
        return updated;
      }
      return i;
    }));
  };

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Handle data refresh from Google Sheets
  const handleRefreshData = async () => {
    setIsDataLoading(true);
    showInfo('Refreshing data from Google Sheets...');
    try {
      const loadedInitiatives = await sheetsSync.loadInitiatives();
      if (loadedInitiatives.length > 0) {
        setInitiatives(loadedInitiatives);
        showSuccess(`Successfully loaded ${loadedInitiatives.length} initiatives`);
      } else {
        showWarning('No initiatives found in Google Sheets');
      }
    } catch (error) {
      logger.error('Failed to refresh data', { context: 'App.handleRefreshData', error: error instanceof Error ? error : new Error(String(error)) });
      showError('Failed to refresh data. Please try again.');
    } finally {
      setIsDataLoading(false);
    }
  };

  const resetFilters = () => {
    setFilterAssetClass('');
    setFilterOwners([]);
    setFilterWorkType('');
    setSearchQuery('');
  };

  // Notification Handlers
  const handleMarkAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const handleMarkAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleClearAll = () => {
    setNotifications([]);
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
        
        // Queue the updated initiative for Google Sheets sync
        sheetsSync.queueInitiativeSync(updatedInitiative);
        
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
          // Don't notify the commenter or the owner (owner already gets a notification)
          if (userId !== currentUser.id && userId !== initiative.ownerId) {
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
        text={authLoading ? 'Checking authentication...' : 'Loading data from Google Sheets...'} 
      />
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col md:flex-row">
      <Sidebar 
        currentView={currentView} 
        setCurrentView={setCurrentView} 
        currentUser={currentUser}
        config={config}
        onLogout={logout}
      />

      {/* Google Sheets Sync Status Badge */}
      <div className="fixed bottom-4 right-4 z-50">
        <SyncStatusBadge 
          initiatives={initiatives} 
          onRefresh={handleRefreshData} 
        />
      </div>

      <main ref={mainContainerRef} className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#F9FAFB]">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
             <h2 className="text-2xl font-bold text-slate-800 capitalize">
               {currentView === 'all' ? 'Comprehensive Dashboard' : 
                currentView === 'resources' ? 'Workplan Health' : currentView}
             </h2>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" placeholder="Search..." 
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>
            <PresenceIndicator currentUserId={currentUser.id} />
            <ExportDropdown 
              initiatives={filteredInitiatives} 
              users={users}
              filters={{
                assetClass: filterAssetClass,
                owners: filterOwners,
                workType: filterWorkType
              }}
            />
            <NotificationMenu
              notifications={notifications}
              onMarkAsRead={handleMarkAsRead}
              onMarkAllAsRead={handleMarkAllAsRead}
              onClearAll={handleClearAll}
              onNotificationClick={handleNotificationClick}
              currentUserId={currentUser.id}
            />
            {canCreate && (
              <button onClick={() => { setEditingItem(null); setIsModalOpen(true); }} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                <Plus size={16} /><span>New</span>
              </button>
            )}
          </div>
        </div>

        {currentView === 'admin' ? (
          <AdminPanel 
            currentUser={currentUser}
            config={config}
            setConfig={setConfig}
            users={users}
            setUsers={setUsers}
            initiatives={initiatives}
            changeLog={changeLog}
          />
        ) : (
           <>
             {currentView === 'all' && (
                <MetricsDashboard 
                  metrics={metrics}
                />
             )}
             
             <FilterBar 
                filterAssetClass={filterAssetClass} setFilterAssetClass={setFilterAssetClass}
                filterOwners={filterOwners} setFilterOwners={setFilterOwners}
                filterWorkType={filterWorkType} setFilterWorkType={setFilterWorkType}
                searchQuery={searchQuery} resetFilters={resetFilters}
                currentView={currentView} viewLayout={viewLayout} setViewLayout={setViewLayout}
                users={users}
             />

             {currentView === 'resources' ? (
               userPermissions.accessWorkplanHealth ? (
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
                 onInitiativeClick={(initiative) => {
                   setEditingItem(initiative);
                   setIsModalOpen(true);
                 }}
                 onInitiativeUpdate={handleSave}
               />
            ) : (
              <TaskTable 
                filteredInitiatives={filteredInitiatives}
                handleInlineUpdate={handleInlineUpdate}
                setEditingItem={setEditingItem}
                setIsModalOpen={setIsModalOpen}
                sortConfig={sortConfig}
                handleSort={handleSort}
                users={users}
                currentUser={currentUser}
                config={config}
                viewMode={viewLayout === 'tree' ? 'grouped' : 'flat'}
                commentReadState={commentReadState}
                onAddComment={handleAddComment}
                onMarkCommentRead={handleMarkCommentRead}
              />
            )}
           </>
        )}
      </main>

      <InitiativeModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        currentUser={currentUser}
        initiativeToEdit={editingItem}
        rolePermissions={config.rolePermissions}
        users={users}
        allInitiatives={initiatives}
      />
    </div>
  );
}