import React, { useState, useEffect } from 'react';
import { HelpCircle, X, Bug, MessageSquare, Ticket, Clock, CheckCircle2, AlertCircle, Send, ChevronLeft, RefreshCw, TrendingUp } from 'lucide-react';
import { FeedbackModal } from '../modals/FeedbackModal';
import { SupportTicket, SupportTicketStatus, SupportTicketComment, Feedback, FeedbackComment } from '../../types';
import { supportService } from '../../services/supportService';

type WidgetView = 'menu' | 'my-tickets' | 'ticket-detail' | 'my-feedback' | 'feedback-detail';

export const SupportWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<WidgetView>('menu');
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'bug' | 'improvement'>('improvement');
  
  // My tickets state
  const [myTickets, setMyTickets] = useState<SupportTicket[]>([]);
  const [myFeedback, setMyFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const [newComment, setNewComment] = useState('');
  const [newFeedbackComment, setNewFeedbackComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [submittingFeedbackComment, setSubmittingFeedbackComment] = useState(false);

  const loadMyTickets = async () => {
    setLoading(true);
    try {
      const tickets = await supportService.getMyTickets();
      setMyTickets(tickets);
    } catch (error) {
      console.error('Failed to load tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMyFeedback = async () => {
    setLoading(true);
    try {
      const feedback = await supportService.getMyFeedback();
      setMyFeedback(feedback);
    } catch (error) {
      console.error('Failed to load feedback:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view === 'my-tickets') {
      loadMyTickets();
    } else if (view === 'my-feedback') {
      loadMyFeedback();
    }
  }, [view]);

  const handleClose = () => {
    setIsOpen(false);
    setView('menu');
    setSelectedTicket(null);
    setSelectedFeedback(null);
    setNewComment('');
    setNewFeedbackComment('');
  };

  const handleOpenBugReport = () => {
    setFeedbackType('bug');
    setFeedbackModalOpen(true);
    handleClose();
  };

  const handleOpenFeedback = () => {
    setFeedbackType('improvement');
    setFeedbackModalOpen(true);
    handleClose();
  };

  const handleViewTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setView('ticket-detail');
  };

  const handleAddComment = async () => {
    if (!selectedTicket || !newComment.trim()) return;

    setSubmittingComment(true);
    try {
      const success = await supportService.addComment(selectedTicket.id, newComment.trim());
      if (success) {
        setNewComment('');
        // Refresh tickets to get updated comments
        await loadMyTickets();
        const updated = myTickets.find(t => t.id === selectedTicket.id);
        if (updated) {
          setSelectedTicket(updated);
        }
      }
    } catch (error) {
      console.error('Failed to add comment:', error);
    } finally {
      setSubmittingComment(false);
    }
  };

  const getStatusIcon = (status: SupportTicketStatus) => {
    switch (status) {
      case SupportTicketStatus.OPEN:
        return <AlertCircle className="w-4 h-4 text-blue-500" />;
      case SupportTicketStatus.IN_PROGRESS:
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case SupportTicketStatus.RESOLVED:
      case SupportTicketStatus.CLOSED:
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-slate-500" />;
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
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const getFeedbackStatusColor = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-blue-100 text-blue-700';
      case 'in-progress':
        return 'bg-yellow-100 text-yellow-700';
      case 'resolved':
        return 'bg-green-100 text-green-700';
      case 'closed':
        return 'bg-slate-100 text-slate-700';
      case 'duplicate':
        return 'bg-orange-100 text-orange-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const handleAddFeedbackComment = async () => {
    if (!selectedFeedback || !newFeedbackComment.trim()) return;

    setSubmittingFeedbackComment(true);
    try {
      const success = await supportService.addFeedbackComment(selectedFeedback.id, newFeedbackComment.trim());
      if (success) {
        setNewFeedbackComment('');
        await loadMyFeedback();
        // Reload the selected feedback from the updated list
        const updatedFeedbackList = await supportService.getMyFeedback();
        const updatedFeedback = updatedFeedbackList.find(f => f.id === selectedFeedback.id);
        if (updatedFeedback) {
          setSelectedFeedback(updatedFeedback);
        }
      }
    } catch (error) {
      console.error('Failed to add feedback comment:', error);
    } finally {
      setSubmittingFeedbackComment(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      {/* Floating Support Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors flex items-center justify-center z-40"
        title="Get Help / Report Issue"
      >
        <HelpCircle className="w-6 h-6" />
        {myTickets.filter(t => t.status === SupportTicketStatus.OPEN || t.status === SupportTicketStatus.IN_PROGRESS).length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center">
            {myTickets.filter(t => t.status === SupportTicketStatus.OPEN || t.status === SupportTicketStatus.IN_PROGRESS).length}
          </span>
        )}
      </button>

      {/* Widget Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 bg-white rounded-lg shadow-xl border border-slate-200 z-50 w-80 max-h-[500px] flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            {view !== 'menu' && (
              <button
                onClick={() => {
                  if (view === 'ticket-detail') {
                    setView('my-tickets');
                    setSelectedTicket(null);
                  } else {
                    setView('menu');
                  }
                }}
                className="text-slate-400 hover:text-slate-600 mr-2"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <h3 className="font-semibold text-slate-900 flex-1">
              {view === 'menu' && 'Need Help?'}
              {view === 'my-tickets' && 'My Tickets'}
              {view === 'ticket-detail' && 'Ticket Details'}
              {view === 'my-feedback' && 'My Feedback'}
              {view === 'feedback-detail' && 'Feedback Details'}
            </h3>
            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {view === 'menu' && (
              <div className="p-2">
                <button
                  onClick={handleOpenBugReport}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Bug className="w-5 h-5 text-red-500" />
                  <div>
                    <div className="font-medium text-slate-900">Report a Bug</div>
                    <div className="text-xs text-slate-500">Found an issue?</div>
                  </div>
                </button>
                <button
                  onClick={handleOpenFeedback}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <MessageSquare className="w-5 h-5 text-blue-500" />
                  <div>
                    <div className="font-medium text-slate-900">Send Feedback</div>
                    <div className="text-xs text-slate-500">Share your thoughts</div>
                  </div>
                </button>
                <button
                  onClick={() => setView('my-tickets')}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Ticket className="w-5 h-5 text-purple-500" />
                  <div>
                    <div className="font-medium text-slate-900">My Tickets</div>
                    <div className="text-xs text-slate-500">View your submitted tickets</div>
                  </div>
                </button>
                <button
                  onClick={() => setView('my-feedback')}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <TrendingUp className="w-5 h-5 text-green-500" />
                  <div>
                    <div className="font-medium text-slate-900">My Feedback</div>
                    <div className="text-xs text-slate-500">View your feedback submissions</div>
                  </div>
                </button>
              </div>
            )}

            {view === 'my-tickets' && (
              <div className="p-2">
                <div className="flex items-center justify-between mb-2 px-2">
                  <span className="text-xs text-slate-500">{myTickets.length} ticket(s)</span>
                  <button
                    onClick={loadMyTickets}
                    className="text-slate-400 hover:text-slate-600"
                    title="Refresh"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                {loading ? (
                  <div className="text-center py-8 text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    <p className="text-sm">Loading...</p>
                  </div>
                ) : myTickets.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Ticket className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No tickets yet</p>
                  </div>
                ) : (
                  myTickets.map(ticket => (
                    <button
                      key={ticket.id}
                      onClick={() => handleViewTicket(ticket)}
                      className="w-full text-left p-3 hover:bg-slate-50 rounded-lg transition-colors border-b border-slate-100 last:border-0"
                    >
                      <div className="flex items-start gap-2">
                        {getStatusIcon(ticket.status)}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 text-sm truncate">{ticket.title}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(ticket.status)}`}>
                              {ticket.status}
                            </span>
                            <span className="text-xs text-slate-400">
                              {formatDate(ticket.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {view === 'ticket-detail' && selectedTicket && (
              <div className="p-4">
                <div className="mb-4">
                  <h4 className="font-semibold text-slate-900 mb-2">{selectedTicket.title}</h4>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs px-2 py-1 rounded ${getStatusColor(selectedTicket.status)}`}>
                      {selectedTicket.status}
                    </span>
                    <span className="text-xs text-slate-400">
                      Created {formatDate(selectedTicket.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{selectedTicket.description}</p>
                </div>

                {/* Comments */}
                <div className="border-t border-slate-200 pt-4">
                  <h5 className="text-sm font-semibold text-slate-700 mb-3">Comments</h5>
                  {selectedTicket.comments && selectedTicket.comments.length > 0 ? (
                    <div className="space-y-3 mb-4">
                      {selectedTicket.comments.map((comment: SupportTicketComment) => (
                        <div
                          key={comment.id}
                          className={`p-3 rounded-lg ${
                            comment.authorEmail === selectedTicket.createdByEmail
                              ? 'bg-blue-50'
                              : 'bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-slate-700">
                              {comment.authorEmail === selectedTicket.createdByEmail ? 'You' : 'Admin'}
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

                  {/* Add Comment */}
                  {(selectedTicket.status === SupportTicketStatus.OPEN || selectedTicket.status === SupportTicketStatus.IN_PROGRESS) && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment..."
                        className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
                      />
                      <button
                        onClick={handleAddComment}
                        disabled={submittingComment || !newComment.trim()}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {view === 'my-feedback' && (
              <div className="p-2">
                <div className="flex items-center justify-between mb-2 px-2">
                  <span className="text-xs text-slate-500">{myFeedback.length} feedback item(s)</span>
                  <button
                    onClick={loadMyFeedback}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh
                  </button>
                </div>
                {loading ? (
                  <div className="text-center py-8 text-slate-400">Loading...</div>
                ) : myFeedback.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <MessageSquare className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm">No feedback yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {myFeedback.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setSelectedFeedback(item);
                          setView('feedback-detail');
                        }}
                        className="w-full text-left p-3 bg-white border border-slate-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {item.type === 'bug' ? (
                                <Bug className="w-4 h-4 text-red-500" />
                              ) : (
                                <TrendingUp className="w-4 h-4 text-blue-500" />
                              )}
                              <span className="text-xs font-semibold text-slate-600">{item.type}</span>
                              <span className={`text-xs px-2 py-0.5 rounded ${getFeedbackStatusColor(item.status || 'new')}`}>
                                {item.status || 'new'}
                              </span>
                            </div>
                            <div className="font-medium text-slate-900 text-sm mb-1">{item.title}</div>
                            <div className="text-xs text-slate-500">{formatDate(item.submittedAt)}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === 'feedback-detail' && selectedFeedback && (
              <div className="p-4">
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    {selectedFeedback.type === 'bug' ? (
                      <Bug className="w-5 h-5 text-red-500" />
                    ) : (
                      <TrendingUp className="w-5 h-5 text-blue-500" />
                    )}
                    <span className="text-xs font-semibold px-2 py-1 rounded bg-slate-100 text-slate-700">
                      {selectedFeedback.type}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded ${getFeedbackStatusColor(selectedFeedback.status || 'new')}`}>
                      {selectedFeedback.status || 'new'}
                    </span>
                  </div>
                  <h4 className="font-semibold text-slate-900 mb-2">{selectedFeedback.title}</h4>
                  <p className="text-sm text-slate-600 mb-3">{selectedFeedback.description}</p>
                  <div className="text-xs text-slate-500">
                    Submitted: {formatDate(selectedFeedback.submittedAt)}
                  </div>
                  {selectedFeedback.assignedToEmail && (
                    <div className="text-xs text-slate-500 mt-1">
                      Assigned to: {selectedFeedback.assignedToEmail}
                    </div>
                  )}
                </div>

                {/* Comments */}
                <div className="border-t border-slate-200 pt-4">
                  <h5 className="text-sm font-semibold text-slate-700 mb-3">Comments</h5>
                  {selectedFeedback.comments && selectedFeedback.comments.length > 0 ? (
                    <div className="space-y-3 mb-4">
                      {selectedFeedback.comments.map((comment: FeedbackComment) => (
                        <div
                          key={comment.id}
                          className={`p-3 rounded-lg ${
                            comment.isAdmin
                              ? 'bg-blue-50'
                              : 'bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-slate-700">
                              {comment.isAdmin ? 'Admin' : 'You'}
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

                  {/* Add Comment */}
                  {(selectedFeedback.status !== 'closed' && selectedFeedback.status !== 'duplicate') && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newFeedbackComment}
                        onChange={(e) => setNewFeedbackComment(e.target.value)}
                        placeholder="Add a comment..."
                        className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            handleAddFeedbackComment();
                          }
                        }}
                      />
                      <button
                        onClick={handleAddFeedbackComment}
                        disabled={submittingFeedbackComment || !newFeedbackComment.trim()}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => {
          setFeedbackModalOpen(false);
          setFeedbackType('improvement');
        }}
        type={feedbackType}
      />
    </>
  );
};

export default SupportWidget;
