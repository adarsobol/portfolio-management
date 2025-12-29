import { io, Socket } from 'socket.io-client';
import { Initiative, Comment, User, Notification } from '../types';

const SOCKET_URL = import.meta.env.VITE_API_ENDPOINT || (typeof window !== 'undefined' ? window.location.origin : '');

export interface UserPresence {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  currentView: string;
  editingInitiativeId: string | null;
  lastActivity: number;
}

export interface EditingIndicator {
  initiativeId: string;
  user: { id: string; name: string; avatar?: string };
}

type PresenceCallback = (users: UserPresence[]) => void;
type InitiativeUpdateCallback = (data: { initiative: Initiative; changedBy: string }) => void;
type InitiativeCreateCallback = (data: { initiative: Initiative; createdBy: string }) => void;
type CommentCallback = (data: { initiativeId: string; comment: Comment; addedBy: string }) => void;
type EditingCallback = (data: EditingIndicator) => void;
type EditEndedCallback = (data: { initiativeId: string; userId: string }) => void;
type NotificationCallback = (data: { userId: string; notification: Notification }) => void;

class RealtimeService {
  private socket: Socket | null = null;
  private currentUser: User | null = null;
  private presenceCallbacks: Set<PresenceCallback> = new Set();
  private initiativeUpdateCallbacks: Set<InitiativeUpdateCallback> = new Set();
  private initiativeCreateCallbacks: Set<InitiativeCreateCallback> = new Set();
  private commentCallbacks: Set<CommentCallback> = new Set();
  private editingCallbacks: Set<EditingCallback> = new Set();
  private editEndedCallbacks: Set<EditEndedCallback> = new Set();
  private notificationCallbacks: Set<NotificationCallback> = new Set();
  private isConnected = false;

  connect(user: User): void {
    if (this.socket?.connected) {
      return;
    }

    // Clean up old socket if it exists but isn't connected
    if (this.socket && !this.socket.connected) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
    }

    this.currentUser = user;
    
    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    this.socket.on('connect', () => {
      console.log('🔌 Connected to realtime service');
      this.isConnected = true;
      
      // Send user info
      this.socket?.emit('user:join', {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      });
    });

    this.socket.on('disconnect', () => {
      console.log('🔌 Disconnected from realtime service');
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.warn('Realtime connection error:', error.message);
    });

    // Handle presence updates
    this.socket.on('users:presence', (users: UserPresence[]) => {
      this.presenceCallbacks.forEach(cb => cb(users));
    });

    // Handle initiative updates
    this.socket.on('initiative:updated', (data: { initiative: Initiative; changedBy: string }) => {
      this.initiativeUpdateCallbacks.forEach(cb => cb(data));
    });

    // Handle initiative creation
    this.socket.on('initiative:created', (data: { initiative: Initiative; createdBy: string }) => {
      this.initiativeCreateCallbacks.forEach(cb => cb(data));
    });

    // Handle comments
    this.socket.on('comment:added', (data: { initiativeId: string; comment: Comment; addedBy: string }) => {
      this.commentCallbacks.forEach(cb => cb(data));
    });

    // Handle editing indicators
    this.socket.on('initiative:editingBy', (data: EditingIndicator) => {
      this.editingCallbacks.forEach(cb => cb(data));
    });

    this.socket.on('initiative:editEnded', (data: { initiativeId: string; userId: string }) => {
      this.editEndedCallbacks.forEach(cb => cb(data));
    });

    // Handle real-time notifications
    this.socket.on('notification:received', (data: { userId: string; notification: Notification }) => {
      console.log('[REALTIME] Received notification:', {
        dataUserId: data.userId,
        notificationUserId: data.notification.userId,
        currentUserId: this.currentUser?.id,
        currentUserEmail: this.currentUser?.email,
        notificationId: data.notification.id,
        notificationTitle: data.notification.title
      });
      
      // Only trigger callback if notification is for the current user
      // Match by user ID or email (for backward compatibility)
      const matches = this.currentUser && (
        data.userId === this.currentUser.id || 
        data.userId === this.currentUser.email ||
        data.notification.userId === this.currentUser.id ||
        data.notification.userId === this.currentUser.email
      );
      
      console.log('[REALTIME] Notification matches current user:', matches);
      
      if (matches) {
        console.log('[REALTIME] Calling notification callbacks, count:', this.notificationCallbacks.size);
        this.notificationCallbacks.forEach(cb => cb(data));
      }
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  // View change notification
  changeView(view: string): void {
    this.socket?.emit('user:viewChange', view);
  }

  // Start editing an initiative
  startEditing(initiativeId: string): void {
    this.socket?.emit('initiative:editStart', initiativeId);
  }

  // Stop editing an initiative
  stopEditing(initiativeId: string): void {
    this.socket?.emit('initiative:editEnd', initiativeId);
  }

  // Broadcast initiative update
  broadcastUpdate(initiative: Initiative): void {
    if (this.currentUser) {
      this.socket?.emit('initiative:update', {
        initiative,
        changedBy: this.currentUser.name
      });
    }
  }

  // Broadcast new initiative
  broadcastCreate(initiative: Initiative): void {
    if (this.currentUser) {
      this.socket?.emit('initiative:create', {
        initiative,
        createdBy: this.currentUser.name
      });
    }
  }

  // Broadcast new comment
  broadcastComment(initiativeId: string, comment: Comment): void {
    if (this.currentUser) {
      this.socket?.emit('comment:add', {
        initiativeId,
        comment,
        addedBy: this.currentUser.name
      });
    }
  }

  // Subscribe to presence updates
  onPresenceUpdate(callback: PresenceCallback): () => void {
    this.presenceCallbacks.add(callback);
    return () => this.presenceCallbacks.delete(callback);
  }

  // Subscribe to initiative updates
  onInitiativeUpdate(callback: InitiativeUpdateCallback): () => void {
    this.initiativeUpdateCallbacks.add(callback);
    return () => this.initiativeUpdateCallbacks.delete(callback);
  }

  // Subscribe to initiative creation
  onInitiativeCreate(callback: InitiativeCreateCallback): () => void {
    this.initiativeCreateCallbacks.add(callback);
    return () => this.initiativeCreateCallbacks.delete(callback);
  }

  // Subscribe to comments
  onCommentAdded(callback: CommentCallback): () => void {
    this.commentCallbacks.add(callback);
    return () => this.commentCallbacks.delete(callback);
  }

  // Subscribe to editing indicators
  onEditingStart(callback: EditingCallback): () => void {
    this.editingCallbacks.add(callback);
    return () => this.editingCallbacks.delete(callback);
  }

  onEditingEnd(callback: EditEndedCallback): () => void {
    this.editEndedCallbacks.add(callback);
    return () => this.editEndedCallbacks.delete(callback);
  }

  // Subscribe to notifications
  onNotificationReceived(callback: NotificationCallback): () => void {
    this.notificationCallbacks.add(callback);
    return () => this.notificationCallbacks.delete(callback);
  }

  // Get connection status
  getIsConnected(): boolean {
    return this.isConnected;
  }
}

export const realtimeService = new RealtimeService();

