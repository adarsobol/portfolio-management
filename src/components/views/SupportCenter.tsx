import React, { useState, useEffect } from 'react';
import { MessageSquare, RefreshCw, CheckCircle2, Clock, AlertCircle, XCircle, ChevronDown, ChevronUp, Send, MessageCircle } from 'lucide-react';
import { SupportTicket, SupportTicketStatus, SupportTicketComment, User as UserType } from '../../types';
import { supportService } from '../../services/supportService';

interface SupportCenterProps {
  currentUser: UserType;
  users: UserType[];
}

export const SupportCenter: React.FC<SupportCenterProps> = ({ currentUser, users }) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | 'all'>('all');
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState<{ [ticketId: string]: string }>({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(null);

  useEffect(() => {
    loadTickets();
  }, [statusFilter]);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const allTickets = await supportService.getTickets(statusFilter === 'all' ? undefined : statusFilter);
      setTickets(allTickets);
    } catch (error) {
      console.error('Failed to load support tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (ticketId: string, newStatus: SupportTicketStatus) => {
    const success = await supportService.updateTicket(ticketId, { status: newStatus });
    if (success) {
      loadTickets();
    }
  };

  const handleAddComment = async (ticketId: string) => {
    const content = newComment[ticketId];
    if (!content || content.trim() === '') return;

    setSubmittingComment(ticketId);
    try {
      const success = await supportService.addComment(ticketId, content.trim());
      if (success) {
        setNewComment({ ...newComment, [ticketId]: '' });
        await loadTickets();
      }
    } catch (error) {
      console.error('Failed to add comment:', error);
    } finally {
      setSubmittingComment(null);
    }
  };

  const getStatusIcon = (status: SupportTicketStatus) => {
    switch (status) {
      case SupportTicketStatus.OPEN:
        return <AlertCircle className="w-4 h-4 text-blue-500" />;
      case SupportTicketStatus.IN_PROGRESS:
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case SupportTicketStatus.RESOLVED:
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case SupportTicketStatus.CLOSED:
        return <XCircle className="w-4 h-4 text-slate-500" />;
    }
  };

  const getStatusColor = (status: SupportTicketStatus) => {
    switch (status) {
      case SupportTicketStatus.OPEN:
        return 'bg-blue-100 text-blue-700';
      case SupportTicketStatus.IN_PROGRESS:
        return 'bg-yellow-100 text-yellow-700';
      case SupportTicketStatus.RESOLVED:
        return 'bg-green-100 text-green-700';
      case SupportTicketStatus.CLOSED:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const filteredTickets = tickets;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquare className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-slate-900">Support Center</h1>
          <span className="text-sm text-slate-500">({filteredTickets.length} tickets)</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SupportTicketStatus | 'all')}
            className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value={SupportTicketStatus.OPEN}>Open</option>
            <option value={SupportTicketStatus.IN_PROGRESS}>In Progress</option>
            <option value={SupportTicketStatus.RESOLVED}>Resolved</option>
            <option value={SupportTicketStatus.CLOSED}>Closed</option>
          </select>
          <button
            onClick={loadTickets}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading support tickets...</p>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-600">No support tickets found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTickets.map((ticket) => (
            <div
              key={ticket.id}
              className="bg-white rounded-lg shadow border-l-4 border-blue-500"
            >
              {/* Ticket Header */}
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusIcon(ticket.status)}
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(ticket.status)}`}>
                        {ticket.status}
                      </span>
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        ticket.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                        ticket.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                        ticket.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {ticket.priority}
                      </span>
                      {ticket.comments && ticket.comments.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <MessageCircle className="w-3 h-3" />
                          {ticket.comments.length}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-slate-900 mb-1">{ticket.title}</h3>
                    <p className="text-sm text-slate-600 mb-2">{ticket.description}</p>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>Created by: {ticket.createdByEmail}</span>
                      <span>Created: {formatDate(ticket.createdAt)}</span>
                      {ticket.assignedToEmail && (
                        <span>Assigned to: {ticket.assignedToEmail}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 ml-4">
                    {currentUser.role === 'Admin' && (
                      <select
                        value={ticket.status}
                        onChange={(e) => handleStatusChange(ticket.id, e.target.value as SupportTicketStatus)}
                        className="px-3 py-1 text-xs border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={SupportTicketStatus.OPEN}>Open</option>
                        <option value={SupportTicketStatus.IN_PROGRESS}>In Progress</option>
                        <option value={SupportTicketStatus.RESOLVED}>Resolved</option>
                        <option value={SupportTicketStatus.CLOSED}>Closed</option>
                      </select>
                    )}
                    <button
                      onClick={() => setExpandedTicketId(expandedTicketId === ticket.id ? null : ticket.id)}
                      className="flex items-center gap-1 px-3 py-1 text-xs text-slate-600 hover:text-slate-800 border border-slate-300 rounded hover:bg-slate-50"
                    >
                      {expandedTicketId === ticket.id ? (
                        <>
                          <ChevronUp className="w-3 h-3" />
                          Hide
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3 h-3" />
                          Details
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded Section with Comments */}
              {expandedTicketId === ticket.id && (
                <div className="border-t border-slate-200 p-4 bg-slate-50">
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <MessageCircle className="w-4 h-4" />
                    Comments ({ticket.comments?.length || 0})
                  </h4>
                  
                  {/* Comment Thread */}
                  {ticket.comments && ticket.comments.length > 0 ? (
                    <div className="space-y-3 mb-4">
                      {ticket.comments.map((comment: SupportTicketComment) => (
                        <div
                          key={comment.id}
                          className={`p-3 rounded-lg ${
                            comment.authorEmail === ticket.createdByEmail
                              ? 'bg-blue-50 border-l-2 border-blue-300'
                              : 'bg-white border-l-2 border-green-300'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-slate-700">
                              {comment.authorEmail === ticket.createdByEmail 
                                ? `User (${comment.authorEmail})`
                                : `Admin (${comment.authorEmail})`
                              }
                            </span>
                            <span className="text-xs text-slate-400">{formatDate(comment.timestamp)}</span>
                          </div>
                          <p className="text-sm text-slate-600">{comment.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 mb-4">No comments yet</p>
                  )}

                  {/* Add Comment Form */}
                  {(ticket.status === SupportTicketStatus.OPEN || ticket.status === SupportTicketStatus.IN_PROGRESS) && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newComment[ticket.id] || ''}
                        onChange={(e) => setNewComment({ ...newComment, [ticket.id]: e.target.value })}
                        placeholder="Type your reply..."
                        className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                        onKeyPress={(e) => e.key === 'Enter' && handleAddComment(ticket.id)}
                      />
                      <button
                        onClick={() => handleAddComment(ticket.id)}
                        disabled={submittingComment === ticket.id || !newComment[ticket.id]?.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <Send className="w-4 h-4" />
                        Send
                      </button>
                    </div>
                  )}
                  
                  {(ticket.status === SupportTicketStatus.RESOLVED || ticket.status === SupportTicketStatus.CLOSED) && (
                    <p className="text-xs text-slate-400 italic">This ticket is {ticket.status.toLowerCase()}. Reopen it to add comments.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SupportCenter;
