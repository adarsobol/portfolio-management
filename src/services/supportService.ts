/**
 * Support Service
 * Handles support tickets and feedback
 */

import { SupportTicket, Feedback, SupportTicketStatus, SupportTicketPriority } from '../types';
import { API_ENDPOINT } from '../config';
import { authService } from './authService';
import { logger } from '../utils/logger';

class SupportService {
  async createTicket(
    title: string,
    description: string,
    priority: SupportTicketPriority = SupportTicketPriority.MEDIUM
  ): Promise<{ success: boolean; ticket?: SupportTicket }> {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/support/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader(),
        },
        body: JSON.stringify({ title, description, priority }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create ticket: ${response.statusText}`);
      }

      const data = await response.json();
      return { success: data.success, ticket: data.ticket };
    } catch (error) {
      logger.error('Error creating support ticket', { context: 'Support', error: error as Error });
      return { success: false };
    }
  }

  async getTickets(status?: SupportTicketStatus): Promise<SupportTicket[]> {
    try {
      logger.debug('Fetching tickets...', { context: 'Support' });
      const queryParams = status ? `?status=${status}` : '';
      const response = await fetch(`${API_ENDPOINT}/api/support/tickets${queryParams}`, {
        headers: {
          ...authService.getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch tickets: ${response.statusText}`);
      }

      const data = await response.json();
      return data.tickets || [];
    } catch (error) {
      logger.error('Error fetching support tickets', { context: 'Support', error: error as Error });
      return [];
    }
  }

  async updateTicket(
    ticketId: string,
    updates: Partial<SupportTicket>
  ): Promise<boolean> {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/support/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader(),
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`Failed to update ticket: ${response.statusText}`);
      }

      const data = await response.json();
      return data.success || false;
    } catch (error) {
      logger.error('Error updating support ticket', { context: 'Support', error: error as Error });
      return false;
    }
  }

  async submitFeedback(
    type: 'bug' | 'improvement',
    title: string,
    description: string,
    metadata?: Record<string, unknown>,
    screenshot?: string
  ): Promise<{ success: boolean; feedback?: Feedback }> {
    try {
      logger.debug('Submitting feedback', { context: 'Feedback', metadata: { type, title } });
      
      const response = await fetch(`${API_ENDPOINT}/api/support/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader(),
        },
        body: JSON.stringify({ type, title, description, metadata, screenshot }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Feedback submit failed', { context: 'Feedback', metadata: { status: response.status, errorText } });
        throw new Error(`Failed to submit feedback: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      return { success: data.success, feedback: data.feedback };
    } catch (error) {
      logger.error('Error submitting feedback', { context: 'Feedback', error: error as Error });
      return { success: false };
    }
  }

  async getFeedback(): Promise<Feedback[]> {
    try {
      logger.debug('Fetching feedback...', { context: 'Feedback' });
      const response = await fetch(`${API_ENDPOINT}/api/support/feedback`, {
        headers: {
          ...authService.getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch feedback: ${response.statusText}`);
      }

      const data = await response.json();
      return data.feedback || [];
    } catch (error) {
      logger.error('Error fetching feedback', { context: 'Feedback', error: error as Error });
      return [];
    }
  }

  async getMyTickets(): Promise<SupportTicket[]> {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/support/my-tickets`, {
        headers: {
          ...authService.getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch my tickets: ${response.statusText}`);
      }

      const data = await response.json();
      return data.tickets || [];
    } catch (error) {
      logger.error('Error fetching my tickets', { context: 'Support', error: error as Error });
      return [];
    }
  }

  async addComment(
    ticketId: string,
    content: string
  ): Promise<boolean> {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/support/tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader(),
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error(`Failed to add comment: ${response.statusText}`);
      }

      const data = await response.json();
      return data.success || false;
    } catch (error) {
      logger.error('Error adding comment', { context: 'Support', error: error as Error });
      return false;
    }
  }

  async getTicket(ticketId: string): Promise<SupportTicket | null> {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/support/tickets/${ticketId}`, {
        headers: {
          ...authService.getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch ticket: ${response.statusText}`);
      }

      const data = await response.json();
      return data.ticket || null;
    } catch (error) {
      logger.error('Error fetching ticket', { context: 'Support', error: error as Error });
      return null;
    }
  }

  async updateFeedback(
    feedbackId: string,
    updates: { status?: string; assignedTo?: string; assignedToEmail?: string }
  ): Promise<boolean> {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/support/feedback/${feedbackId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader(),
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`Failed to update feedback: ${response.statusText}`);
      }

      const data = await response.json();
      return data.success || false;
    } catch (error) {
      logger.error('Error updating feedback', { context: 'Feedback', error: error as Error });
      return false;
    }
  }

  async addFeedbackComment(feedbackId: string, content: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_ENDPOINT}/api/support/feedback/${feedbackId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader(),
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error(`Failed to add comment: ${response.statusText}`);
      }

      const data = await response.json();
      return data.success || false;
    } catch (error) {
      logger.error('Error adding feedback comment', { context: 'Feedback', error: error as Error });
      return false;
    }
  }

  async getMyFeedback(): Promise<Feedback[]> {
    // Uses the same endpoint as getFeedback, but filters on server side
    return this.getFeedback();
  }
}

export const supportService = new SupportService();

