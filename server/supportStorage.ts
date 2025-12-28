/**
 * Support Storage Service
 * Stores support tickets and feedback in Google Cloud Storage
 */

import { Storage } from '@google-cloud/storage';
import { SupportTicket, Feedback, SupportTicketStatus, SupportTicketPriority, SupportTicketComment } from '../src/types/index.js';

interface SupportStorageConfig {
  bucketName: string;
  projectId?: string;
  keyFilename?: string;
}

class SupportStorageService {
  private storage: Storage | null = null;
  private bucketName: string;
  private initialized = false;

  constructor(config: SupportStorageConfig) {
    this.bucketName = config.bucketName;
    
    try {
      this.storage = new Storage({
        projectId: config.projectId,
        keyFilename: config.keyFilename,
      });
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize GCS for support storage:', error);
      this.initialized = false;
    }
  }

  private getTicketsPath(): string {
    return 'support/tickets.json';
  }

  private getFeedbackPath(): string {
    return 'support/feedback.json';
  }

  async createTicket(ticket: SupportTicket): Promise<boolean> {
    if (!this.initialized || !this.storage) {
      console.warn('Support storage not initialized, skipping ticket creation');
      return false;
    }

    try {
      const bucket = this.storage.bucket(this.bucketName);
      const filePath = this.getTicketsPath();
      const file = bucket.file(filePath);

      // Read existing tickets
      let tickets: SupportTicket[] = [];
      try {
        const [exists] = await file.exists();
        if (exists) {
          const [contents] = await file.download();
          tickets = JSON.parse(contents.toString());
        }
      } catch (error) {
        console.warn('Could not read existing tickets, starting fresh:', error);
      }

      // Add new ticket
      tickets.push(ticket);

      // Write back to storage
      await file.save(JSON.stringify(tickets, null, 2), {
        contentType: 'application/json',
        metadata: {
          cacheControl: 'no-cache',
        },
      });

      return true;
    } catch (error) {
      console.error('Failed to create support ticket:', error);
      return false;
    }
  }

  async getTickets(status?: SupportTicketStatus): Promise<SupportTicket[]> {
    if (!this.initialized || !this.storage) {
      return [];
    }

    try {
      const bucket = this.storage.bucket(this.bucketName);
      const filePath = this.getTicketsPath();
      const file = bucket.file(filePath);

      const [exists] = await file.exists();
      if (!exists) {
        return [];
      }

      const [contents] = await file.download();
      const tickets: SupportTicket[] = JSON.parse(contents.toString());

      if (status) {
        return tickets.filter(t => t.status === status);
      }

      return tickets.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      console.error('Failed to get support tickets:', error);
      return [];
    }
  }

  async updateTicket(ticketId: string, updates: Partial<SupportTicket>): Promise<boolean> {
    if (!this.initialized || !this.storage) {
      return false;
    }

    try {
      const bucket = this.storage.bucket(this.bucketName);
      const filePath = this.getTicketsPath();
      const file = bucket.file(filePath);

      const [contents] = await file.download();
      const tickets: SupportTicket[] = JSON.parse(contents.toString());

      const index = tickets.findIndex(t => t.id === ticketId);
      if (index === -1) {
        return false;
      }

      tickets[index] = {
        ...tickets[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      await file.save(JSON.stringify(tickets, null, 2), {
        contentType: 'application/json',
      });

      return true;
    } catch (error) {
      console.error('Failed to update support ticket:', error);
      return false;
    }
  }

  async createFeedback(feedback: Feedback): Promise<boolean> {
    if (!this.initialized || !this.storage) {
      console.warn('Support storage not initialized, skipping feedback');
      return false;
    }

    try {
      const bucket = this.storage.bucket(this.bucketName);
      const filePath = this.getFeedbackPath();
      const file = bucket.file(filePath);

      // Read existing feedback
      let feedbackList: Feedback[] = [];
      try {
        const [exists] = await file.exists();
        if (exists) {
          const [contents] = await file.download();
          feedbackList = JSON.parse(contents.toString());
        }
      } catch (error) {
        console.warn('Could not read existing feedback, starting fresh:', error);
      }

      // Add new feedback
      feedbackList.push(feedback);

      // Write back to storage
      await file.save(JSON.stringify(feedbackList, null, 2), {
        contentType: 'application/json',
      });

      return true;
    } catch (error) {
      console.error('Failed to create feedback:', error);
      return false;
    }
  }

  async getFeedback(): Promise<Feedback[]> {
    if (!this.initialized || !this.storage) {
      return [];
    }

    try {
      const bucket = this.storage.bucket(this.bucketName);
      const filePath = this.getFeedbackPath();
      const file = bucket.file(filePath);

      const [exists] = await file.exists();
      if (!exists) {
        return [];
      }

      const [contents] = await file.download();
      const feedback: Feedback[] = JSON.parse(contents.toString());

      return feedback.sort((a, b) => 
        new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      );
    } catch (error) {
      console.error('Failed to get feedback:', error);
      return [];
    }
  }

  async addComment(ticketId: string, comment: SupportTicketComment): Promise<boolean> {
    if (!this.initialized || !this.storage) {
      return false;
    }

    try {
      const bucket = this.storage.bucket(this.bucketName);
      const filePath = this.getTicketsPath();
      const file = bucket.file(filePath);

      const [contents] = await file.download();
      const tickets: SupportTicket[] = JSON.parse(contents.toString());

      const index = tickets.findIndex(t => t.id === ticketId);
      if (index === -1) {
        return false;
      }

      // Initialize comments array if not exists
      if (!tickets[index].comments) {
        tickets[index].comments = [];
      }

      // Add comment
      tickets[index].comments!.push(comment);
      tickets[index].updatedAt = new Date().toISOString();

      await file.save(JSON.stringify(tickets, null, 2), {
        contentType: 'application/json',
      });

      return true;
    } catch (error) {
      console.error('Failed to add comment to ticket:', error);
      return false;
    }
  }

  async getTicketById(ticketId: string): Promise<SupportTicket | null> {
    if (!this.initialized || !this.storage) {
      return null;
    }

    try {
      const tickets = await this.getTickets();
      return tickets.find(t => t.id === ticketId) || null;
    } catch (error) {
      console.error('Failed to get ticket:', error);
      return null;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

// Singleton instance
let supportStorageInstance: SupportStorageService | null = null;

export function initializeSupportStorage(config: SupportStorageConfig): SupportStorageService {
  supportStorageInstance = new SupportStorageService(config);
  return supportStorageInstance;
}

export function getSupportStorage(): SupportStorageService | null {
  return supportStorageInstance;
}

export function isSupportStorageEnabled(): boolean {
  return supportStorageInstance?.isInitialized() ?? false;
}

