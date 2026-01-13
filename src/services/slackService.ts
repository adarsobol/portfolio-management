import { Comment, Initiative, User, ChangeRecord, AppConfig } from '../types';
import { logger } from '../utils/logger';

interface SlackConfig {
  webhookUrl: string;
  enabled: boolean;
}

class SlackService {
  private config: SlackConfig | null = null;
  private recentNotifications: Map<string, number> = new Map(); // Track recent notifications to prevent duplicates
  private pendingNotifications: Set<string> = new Set(); // Track notifications currently being sent to prevent race conditions

  /**
   * Initialize Slack service with configuration
   */
  initialize(config: Partial<SlackConfig> | undefined): void {
    logger.debug('SlackService.initialize called', { context: 'Slack', metadata: { hasConfig: !!config, enabled: config?.enabled } });
    
    if (!config || !config.enabled || !config.webhookUrl) {
      logger.debug('SlackService.initialize: Disabling service', { context: 'Slack' });
      this.config = null;
      return;
    }

    this.config = {
      webhookUrl: config.webhookUrl,
      enabled: true,
    };
    
    logger.debug('SlackService.initialize: Service enabled', { context: 'Slack' });
  }

  /**
   * Initialize from AppConfig
   */
  initializeFromConfig(appConfig: AppConfig): void {
    logger.debug('initializeFromConfig called', { context: 'Slack', metadata: { hasSlack: !!appConfig.slack, slackEnabled: appConfig.slack?.enabled } });
    
    // Only update if Slack config is provided and valid
    // Don't reset if config is missing - keep existing config
    if (appConfig.slack) {
      if (appConfig.slack.enabled && appConfig.slack.webhookUrl) {
        this.initialize(appConfig.slack);
        logger.info('Slack service initialized successfully', { context: 'Slack' });
      } else {
        // Only disable if explicitly disabled, don't reset if config is just missing
        if (appConfig.slack.enabled === false) {
          this.config = null;
          logger.warn('Slack service disabled (enabled flag is false)', { context: 'Slack' });
        } else {
          logger.debug('Slack service config incomplete, keeping existing config', { context: 'Slack' });
        }
      }
    } else {
      // No Slack config in AppConfig - keep existing config if it exists
      if (!this.config) {
        logger.debug('No Slack config provided and no existing config', { context: 'Slack' });
      }
    }
  }

  /**
   * Check if Slack integration is enabled and configured
   */
  isEnabled(): boolean {
    return this.config?.enabled === true && !!this.config?.webhookUrl;
  }

  /**
   * Notify Slack channel about ETA change
   */
  async notifyEtaChange(
    change: ChangeRecord,
    initiative: Initiative,
    users: User[]
  ): Promise<void> {
    logger.debug('notifyEtaChange called', { context: 'Slack', metadata: { isEnabled: this.isEnabled(), changeField: change.field } });
    
    if (!this.isEnabled() || change.field !== 'ETA') {
      return;
    }

    // Prevent duplicate notifications for the same change within 30 seconds
    // Use initiative ID + field + old value + new value as key (not change.id which is always unique)
    const notificationKey = `${initiative.id}-ETA-${change.oldValue}-${change.newValue}`;
    const now = Date.now();
    
    // Check if this notification is already pending (being sent)
    if (this.pendingNotifications.has(notificationKey)) {
      logger.debug('Slack notification skipped (already pending)', { context: 'Slack' });
      return;
    }
    
    // Check if this notification was recently sent
    const lastSent = this.recentNotifications.get(notificationKey);
    if (lastSent) {
      const timeSinceLastSent = now - lastSent;
      if (timeSinceLastSent < 30000) { // 30 seconds
        logger.debug('Slack notification skipped (duplicate)', { context: 'Slack' });
        return;
      }
    }
    
    // Mark as pending BEFORE sending (prevents race conditions)
    this.pendingNotifications.add(notificationKey);
    this.recentNotifications.set(notificationKey, now);
    
    logger.debug('Slack notification will send', { context: 'Slack', metadata: { initiative: initiative.title } });
    
    // Clean up old entries (older than 2 minutes) periodically
    if (this.recentNotifications.size > 100) {
      for (const [key, timestamp] of this.recentNotifications.entries()) {
        if (now - timestamp > 120000) { // 2 minutes
          this.recentNotifications.delete(key);
        }
      }
    }

    try {
      const changedByUser = users.find(u => u.name === change.changedBy);
      const owner = users.find(u => u.id === initiative.ownerId);
      
      const oldDate = new Date(change.oldValue as string);
      const newDate = new Date(change.newValue as string);
      const oldDateStr = oldDate.toLocaleDateString();
      const newDateStr = newDate.toLocaleDateString();
      const daysDiff = Math.ceil(
        (newDate.getTime() - oldDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      const daysDiffText = daysDiff > 0 
        ? `+${daysDiff} days later` 
        : daysDiff < 0 
        ? `${Math.abs(daysDiff)} days earlier`
        : 'same date';

      // Create Slack mentions using email format
      // Slack supports email-based mentions: <mailto:email@domain.com|Display Name>
      const ownerMention = owner?.email 
        ? `<mailto:${owner.email}|${owner.name}>`
        : owner?.name || 'Unknown';
      
      const changedByMention = changedByUser?.email
        ? `<mailto:${changedByUser.email}|${changedByUser.name}>`
        : change.changedBy;

      // Create initiative link (using app URL with initiative ID)
      const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://app.portfolio-manager.com';
      const initiativeLink = `${appUrl}#initiative=${initiative.id}`;
      const initiativeIdLink = `<${initiativeLink}|${initiative.id}>`;

      // Slack Block Kit message
      // Note: Incoming webhooks post to the channel configured in the webhook URL
      // The channel field is not supported for incoming webhooks
      const message = {
        text: `ETA Changed: ${initiative.title} (${initiative.id}) - ${ownerMention}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '📅 ETA Changed'
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Initiative:*\n${initiative.title}\n${initiativeIdLink}`
              },
              {
                type: 'mrkdwn',
                text: `*Owner:*\n${ownerMention}`
              },
              {
                type: 'mrkdwn',
                text: `*Old ETA:*\n${oldDateStr}`
              },
              {
                type: 'mrkdwn',
                text: `*New ETA:*\n${newDateStr}`
              }
            ]
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Changed by ${changedByMention} • ${daysDiffText}`
              }
            ]
          }
        ]
      };

      await this.sendToSlack(message, notificationKey);
      
      // Remove from pending after successful send
      this.pendingNotifications.delete(notificationKey);
    } catch (error) {
      logger.error('Error sending ETA change notification to Slack', { context: 'Slack', error: error as Error });
      // Remove from pending even on error
      this.pendingNotifications.delete(notificationKey);
    }
  }

  /**
   * Notify Slack channel about user tagging in comments
   */
  async notifyTagging(
    comment: Comment,
    initiative: Initiative,
    mentionedUserIds: string[],
    users: User[]
  ): Promise<void> {
    if (!this.isEnabled() || mentionedUserIds.length === 0) {
      return;
    }

    try {
      const author = users.find(u => u.id === comment.authorId);
      const mentionedUsers = mentionedUserIds
        .map(id => users.find(u => u.id === id))
        .filter((user): user is User => user !== undefined);

      if (mentionedUsers.length === 0) {
        return;
      }

      // Convert emails to Slack mentions using email format
      // Slack supports email-based mentions: <mailto:email@domain.com|Display Name>
      const slackMentions = mentionedUsers
        .map(user => `<mailto:${user.email}|${user.name}>`)
        .join(' ');

      // Create initiative link (using app URL with initiative ID)
      const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://app.portfolio-manager.com';
      const initiativeLink = `${appUrl}#initiative=${initiative.id}`;
      const initiativeIdLink = `<${initiativeLink}|${initiative.id}>`;

      // Note: Incoming webhooks post to the channel configured in the webhook URL
      // The channel field is not supported for incoming webhooks
      const message = {
        text: `${mentionedUsers.map(u => u.name).join(', ')} mentioned in comment on ${initiative.title} (${initiative.id})`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '💬 New Mention'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${slackMentions} - You were mentioned in a comment`
            }
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Initiative:*\n${initiative.title}\n${initiativeIdLink}`
              },
              {
                type: 'mrkdwn',
                text: `*Comment by:*\n${author?.name || 'Unknown'}`
              }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `> ${comment.text}`
            }
          }
        ]
      };

      await this.sendToSlack(message);
    } catch (error) {
      logger.error('Error sending tagging notification to Slack', { context: 'Slack', error: error as Error });
    }
  }

  /**
   * Send message to Slack via webhook
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async sendToSlack(payload: any, _notificationKey?: string): Promise<void> {
    if (!this.config?.webhookUrl) {
      logger.warn('Slack webhook URL not configured', { context: 'Slack' });
      return;
    }

    try {
      logger.debug('Sending Slack notification', { context: 'Slack' });

      // Use backend proxy to avoid CORS issues
      const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || '';
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${API_ENDPOINT}/api/slack/webhook`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          webhookUrl: this.config.webhookUrl,
          payload: payload
        })
      });

      const responseData = await response.json();
      
      if (!response.ok) {
        logger.error('Slack notification failed', { context: 'Slack', metadata: { status: response.status, error: responseData.error } });
      } else {
        logger.info('Slack notification sent successfully', { context: 'Slack' });
      }
    } catch (error) {
      logger.error('Error sending Slack notification', { context: 'Slack', error: error as Error });
      // Don't throw - we don't want Slack failures to break the app
    }
  }
}

export const slackService = new SlackService();

// Expose test function for debugging
if (typeof window !== 'undefined') {
  (window as any).testSlackWebhook = async () => {
    logger.debug('Testing Slack webhook...', { context: 'Slack' });
    const testMessage = {
      text: '🧪 Test message from Portfolio Management App',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '*Test Notification*\nThis is a test message to verify Slack integration is working.'
          }
        }
      ]
    };
    
    if (!slackService.isEnabled()) {
      logger.error('Slack service is not enabled or configured', { context: 'Slack' });
      return false;
    }
    
    try {
      // Use backend proxy to avoid CORS issues (same as sendToSlack)
      const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3001';
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${API_ENDPOINT}/api/slack/webhook`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({
          webhookUrl: slackService['config']?.webhookUrl,
          payload: testMessage
        })
      });
      
      const result = await response.json();
      logger.debug('Test response', { context: 'Slack', metadata: { status: response.status, result } });
      return response.ok;
    } catch (error) {
      logger.error('Test error', { context: 'Slack', error: error as Error });
      return false;
    }
  };
}

