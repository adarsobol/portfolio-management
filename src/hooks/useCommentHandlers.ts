import { useCallback } from 'react';
import { Initiative, Comment, User, Notification, NotificationType, UserCommentReadState } from '../types';
import { sheetsSync } from '../services';
import { parseMentions, generateId } from '../utils';

interface UseCommentHandlersOptions {
  setInitiatives: React.Dispatch<React.SetStateAction<Initiative[]>>;
  currentUser: User;
  users: User[];
  addNotification: (notification: Notification) => void;
  createNotification: (
    type: NotificationType,
    title: string,
    message: string,
    initiativeId: string,
    initiativeTitle: string,
    userId?: string,
    metadata?: Record<string, unknown>
  ) => Notification;
  setCommentReadState: React.Dispatch<React.SetStateAction<UserCommentReadState>>;
}

interface UseCommentHandlersReturn {
  handleAddComment: (initiativeId: string, comment: Comment) => void;
  handleMarkCommentRead: (initiativeId: string) => void;
}

/**
 * Custom hook for comment-related handlers.
 * Handles:
 * - Adding comments to initiatives
 * - Creating notifications for owners and @mentions
 * - Syncing comments to Google Sheets
 * - Tracking comment read state
 */
export function useCommentHandlers({
  setInitiatives,
  currentUser,
  users,
  addNotification,
  createNotification,
  setCommentReadState,
}: UseCommentHandlersOptions): UseCommentHandlersReturn {

  /**
   * Mark comments as read for a specific initiative
   */
  const handleMarkCommentRead = useCallback((initiativeId: string) => {
    setCommentReadState(prev => ({
      ...prev,
      [initiativeId]: new Date().toISOString()
    }));
  }, [setCommentReadState]);

  /**
   * Add a comment to an initiative
   */
  const handleAddComment = useCallback((initiativeId: string, comment: Comment) => {
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
  }, [setInitiatives, currentUser, users, addNotification, createNotification, handleMarkCommentRead]);

  return {
    handleAddComment,
    handleMarkCommentRead,
  };
}
