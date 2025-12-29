/**
 * Support Service
 * Handles support tickets and feedback
 */

import { SupportTicket, Feedback, SupportTicketStatus, SupportTicketPriority } from '../types';
import { API_ENDPOINT } from '../config';
import { authService } from './authService';

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
      console.error('Error creating support ticket:', error);
      return { success: false };
    }
  }

  async getTickets(status?: SupportTicketStatus): Promise<SupportTicket[]> {
    try {
      console.log('[TICKETS GET] Fetching tickets...');
      const token = authService.getToken();
      console.log('[TICKETS GET] Token from authService:', token ? `${token.substring(0, 20)}...` : 'none');
      const queryParams = status ? `?status=${status}` : '';
      const response = await fetch(`${API_ENDPOINT}/api/support/tickets${queryParams}`, {
        headers: {
          ...authService.getAuthHeader(),
        },
      });

      console.log('[TICKETS GET] Response status:', response.status);
      if (!response.ok) {
        throw new Error(`Failed to fetch tickets: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[TICKETS GET] Response data:', data);
      return data.tickets || [];
    } catch (error) {
      console.error('Error fetching support tickets:', error);
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
      console.error('Error updating support ticket:', error);
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
      console.log('[FEEDBACK] Submitting feedback:', { type, title, endpoint: `${API_ENDPOINT}/api/support/feedback` });
      
      const response = await fetch(`${API_ENDPOINT}/api/support/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader(),
        },
        body: JSON.stringify({ type, title, description, metadata, screenshot }),
      });

      console.log('[FEEDBACK] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[FEEDBACK] Error response:', errorText);
        throw new Error(`Failed to submit feedback: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log('[FEEDBACK] Response data:', data);
      return { success: data.success, feedback: data.feedback };
    } catch (error) {
      console.error('[FEEDBACK] Exception occurred:', error);
      return { success: false };
    }
  }

  async getFeedback(): Promise<Feedback[]> {
    try {
      console.log('[FEEDBACK GET] Fetching feedback...');
      const token = authService.getToken();
      console.log('[FEEDBACK GET] Token from authService:', token ? `${token.substring(0, 20)}...` : 'none');
      const response = await fetch(`${API_ENDPOINT}/api/support/feedback`, {
        headers: {
          ...authService.getAuthHeader(),
        },
      });

      console.log('[FEEDBACK GET] Response status:', response.status);
      if (!response.ok) {
        throw new Error(`Failed to fetch feedback: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[FEEDBACK GET] Response data:', data);
      return data.feedback || [];
    } catch (error) {
      console.error('Error fetching feedback:', error);
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
      console.error('Error fetching my tickets:', error);
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
      console.error('Error adding comment:', error);
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
      console.error('Error fetching ticket:', error);
      return null;
    }
  }
}

export const supportService = new SupportService();

