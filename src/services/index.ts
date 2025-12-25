export { sheetsSync, flattenInitiative, flattenChangeRecord } from './googleSheetsSync';
export type { SyncStatus, SheetsPullData, SyncConflict } from './googleSheetsSync';
export { slackService } from './slackService';
export { workflowEngine } from './workflowEngine';
export { authService } from './authService';
export type { AuthUser, LoginResponse } from './authService';
export { realtimeService } from './realtimeService';
export type { UserPresence, EditingIndicator } from './realtimeService';
export { notificationService } from './notificationService';

// Data service abstraction (for GCS migration)
export { 
  cacheToLocalStorage, 
  loadFromLocalStorageCache, 
  getCacheTimestamp,
  getDefaultServiceConfig 
} from './dataService';
export type { DataService, DataServiceConfig } from './dataService';

