import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
import { Initiative, User, Comment } from '../../types';
import { generateId, parseMentions } from '../../utils';

interface CommentPopoverProps {
  initiative: Initiative;
  currentUser: User;
  users: User[];
  onAddComment: (initiativeId: string, comment: Comment) => void;
  lastReadTimestamp?: string;
  onMarkAsRead: (initiativeId: string) => void;
}

export const CommentPopover: React.FC<CommentPopoverProps> = ({
  initiative,
  currentUser,
  users,
  onAddComment,
  lastReadTimestamp,
  onMarkAsRead
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Mention autocomplete state
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  const comments = initiative.comments || [];
  const commentCount = comments.length;

  // Calculate unread comments - those newer than lastReadTimestamp
  const unreadCount = lastReadTimestamp
    ? comments.filter(c => new Date(c.timestamp) > new Date(lastReadTimestamp)).length
    : commentCount; // All unread if never viewed

  const hasUnread = unreadCount > 0;

  // Sort comments by timestamp (newest first for display, oldest first for popover)
  const sortedCommentsNewestFirst = [...comments].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const sortedCommentsOldestFirst = [...comments].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Get recent comments for hover preview (show 2-3 most recent)
  const recentComments = sortedCommentsNewestFirst.slice(0, 3);

  // Filter users for mention dropdown
  const filteredMentionUsers = users.filter(user => {
    if (!mentionQuery) return true;
    const query = mentionQuery.toLowerCase();
    return (
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query)
    );
  }).slice(0, 5); // Limit to 5 suggestions

  // Position popover when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Calculate position - prefer to open below and to the right
      let top = rect.bottom + 8;
      let left = rect.left;
      
      // Adjust if would go off right edge
      if (left + 320 > viewportWidth) {
        left = viewportWidth - 330;
      }
      
      // Adjust if would go off bottom
      if (top + 400 > viewportHeight) {
        top = rect.top - 408;
      }
      
      setPopoverPosition({ top, left });
    }
  }, [isOpen]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle hover with delay
  const handleMouseEnter = () => {
    if (!isOpen) {
      hoverTimeoutRef.current = setTimeout(() => {
        setIsHovered(true);
      }, 300);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setIsHovered(false);
  };

  // Handle click to open popover
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsHovered(false);
    setIsOpen(!isOpen);
    if (!isOpen && hasUnread) {
      // Mark as read when opening
      onMarkAsRead(initiative.id);
    }
  };

  // Handle input change with mention detection
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    
    setNewComment(value);
    
    // Detect @ mention
    const textBeforeCursor = value.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atIndex !== -1) {
      // Check if there's a space before @ or it's at the start
      const charBeforeAt = textBeforeCursor[atIndex - 1];
      if (atIndex === 0 || charBeforeAt === ' ' || charBeforeAt === '\n') {
        const queryAfterAt = textBeforeCursor.substring(atIndex + 1);
        
        // Only show dropdown if query doesn't contain space (user is still typing the mention)
        if (!queryAfterAt.includes(' ')) {
          setMentionStartIndex(atIndex);
          setMentionQuery(queryAfterAt);
          setShowMentionDropdown(true);
          setSelectedMentionIndex(0);
          return;
        }
      }
    }
    
    // Hide dropdown if no valid mention context
    setShowMentionDropdown(false);
    setMentionQuery('');
    setMentionStartIndex(-1);
  };

  // Insert mention into comment
  const insertMention = useCallback((user: User) => {
    const beforeMention = newComment.substring(0, mentionStartIndex);
    const afterMention = newComment.substring(mentionStartIndex + 1 + mentionQuery.length);
    
    // Insert @email format (will be parsed and displayed as @Name)
    const newValue = `${beforeMention}@${user.email}${afterMention ? ' ' + afterMention.trim() : ' '}`;
    
    setNewComment(newValue);
    setShowMentionDropdown(false);
    setMentionQuery('');
    setMentionStartIndex(-1);
    
    // Focus back on input
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newCursorPos = beforeMention.length + user.email.length + 2; // +2 for @ and space
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  }, [newComment, mentionStartIndex, mentionQuery]);

  // Handle keyboard navigation in mention dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showMentionDropdown && filteredMentionUsers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex(prev => 
          prev < filteredMentionUsers.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex(prev => 
          prev > 0 ? prev - 1 : filteredMentionUsers.length - 1
        );
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMentionUsers[selectedMentionIndex]);
      } else if (e.key === 'Escape') {
        setShowMentionDropdown(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      handleAddComment();
    }
  };

  // Handle adding a comment
  const handleAddComment = () => {
    if (!newComment.trim()) return;

    const mentionedUserIds = parseMentions(newComment, users);

    const comment: Comment = {
      id: generateId(),
      text: newComment,
      authorId: currentUser.id,
      timestamp: new Date().toISOString(),
      mentionedUserIds: mentionedUserIds.length > 0 ? mentionedUserIds : undefined
    };

    onAddComment(initiative.id, comment);
    setNewComment('');
    setShowMentionDropdown(false);
  };

  // Format relative time
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Format comment text with mentions highlighted
  const formatCommentText = (text: string) => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    const emailPattern = /@([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const matches = Array.from(text.matchAll(emailPattern));

    for (const match of matches) {
      const matchIndex = match.index || 0;
      const matchLength = match[0].length;
      const email = match[1];
      const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

      if (matchIndex > lastIndex) {
        parts.push(text.substring(lastIndex, matchIndex));
      }

      if (user) {
        parts.push(
          <span key={matchIndex} className="font-semibold text-blue-600 bg-blue-50 px-1 rounded">
            @{user.name}
          </span>
        );
      } else {
        parts.push(match[0]);
      }

      lastIndex = matchIndex + matchLength;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  // Get author info
  const getAuthor = (authorId: string) => users.find(u => u.id === authorId);

  return (
    <>
      {/* Comment Badge Button */}
      <button
        ref={buttonRef}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`relative flex items-center gap-1 px-2 py-1 rounded transition-all ${
          commentCount > 0
            ? hasUnread
              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
        }`}
        title={`${commentCount} comment${commentCount !== 1 ? 's' : ''}${hasUnread ? ` (${unreadCount} new)` : ''}`}
      >
        <MessageSquare size={14} />
        {commentCount > 0 && (
          <span className={`text-xs font-semibold ${hasUnread ? 'text-blue-700' : 'text-slate-600'}`}>
            {commentCount}
          </span>
        )}
        {/* Unread indicator dot */}
        {hasUnread && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
        )}
      </button>

      {/* Hover Tooltip - Recent Comments Preview */}
      {isHovered && !isOpen && commentCount > 0 && (
        <div
          className="fixed z-50 w-72 bg-white rounded-lg shadow-xl border border-slate-200 p-3 pointer-events-none"
          style={{
            top: buttonRef.current ? buttonRef.current.getBoundingClientRect().bottom + 8 : 0,
            left: buttonRef.current ? buttonRef.current.getBoundingClientRect().left : 0
          }}
        >
          <div className="space-y-2">
            {recentComments.map((comment, idx) => {
              const author = getAuthor(comment.authorId);
              return (
                <div key={comment.id} className={idx > 0 ? 'pt-2 border-t border-slate-100' : ''}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-semibold text-slate-700">{author?.name || 'Unknown'}</span>
                    <span className="text-[10px] text-slate-400">•</span>
                    <span className="text-[10px] text-slate-400">{formatTime(comment.timestamp)}</span>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2">{comment.text}</p>
                </div>
              );
            })}
          </div>
          {commentCount > 3 && (
            <div className="mt-2 pt-2 border-t border-slate-100 text-center">
              <span className="text-xs text-blue-600 font-medium">Click to view all {commentCount} comments →</span>
            </div>
          )}
        </div>
      )}

      {/* Full Popover - Comment Thread */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          
          {/* Popover */}
          <div
            ref={popoverRef}
            className="fixed z-50 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col"
            style={{
              top: popoverPosition.top,
              left: popoverPosition.left,
              maxHeight: '400px'
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white rounded-t-xl">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-slate-600" />
                <span className="font-semibold text-slate-800">Comments</span>
                <span className="bg-slate-200 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">
                  {commentCount}
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-slate-100 rounded transition-colors text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            {/* Comments List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar" style={{ maxHeight: '250px' }}>
              {commentCount === 0 ? (
                <div className="text-center py-6 text-slate-400">
                  <MessageSquare size={24} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No comments yet</p>
                  <p className="text-xs mt-1">Be the first to comment!</p>
                </div>
              ) : (
                sortedCommentsOldestFirst.map(comment => {
                  const author = getAuthor(comment.authorId);
                  const isNewComment = lastReadTimestamp
                    ? new Date(comment.timestamp) > new Date(lastReadTimestamp)
                    : false;
                  
                  return (
                    <div
                      key={comment.id}
                      className={`flex gap-2.5 ${isNewComment ? 'bg-blue-50/50 -mx-1 px-1 py-1 rounded-lg' : ''}`}
                    >
                      <div className="flex-shrink-0">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-xs font-bold text-slate-600 border border-slate-300">
                          {author?.name?.charAt(0) || '?'}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-semibold text-slate-800">{author?.name || 'Unknown'}</span>
                          <span className="text-[10px] text-slate-400">{formatTime(comment.timestamp)}</span>
                          {isNewComment && (
                            <span className="bg-blue-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">NEW</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-700 whitespace-pre-wrap break-words">
                          {formatCommentText(comment.text)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Add Comment Input */}
            <div className="p-3 border-t border-slate-200 bg-slate-50 rounded-b-xl relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newComment}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Add a comment..."
                    className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  
                  {/* Mention Autocomplete Dropdown */}
                  {showMentionDropdown && filteredMentionUsers.length > 0 && (
                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-50">
                      <div className="px-2 py-1.5 bg-slate-50 border-b border-slate-100">
                        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Mention someone</span>
                      </div>
                      {filteredMentionUsers.map((user, index) => (
                        <button
                          key={user.id}
                          onClick={() => insertMention(user)}
                          onMouseEnter={() => setSelectedMentionIndex(index)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                            index === selectedMentionIndex
                              ? 'bg-blue-50 text-blue-700'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center text-[10px] font-bold text-slate-600 border border-slate-300 flex-shrink-0">
                            {user.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{user.name}</div>
                            <div className="text-[10px] text-slate-400 truncate">{user.email}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleAddComment}
                  disabled={!newComment.trim()}
                  className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={16} />
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1.5">
                Type @ to mention someone
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default CommentPopover;
