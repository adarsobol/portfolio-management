import React, { useState } from 'react';
import { X, Send, Bug, Lightbulb, MessageSquare, AlertCircle } from 'lucide-react';
import { supportService } from '../../services/supportService';
import { useToast } from '../../contexts';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  type?: 'bug' | 'feature' | 'improvement' | 'other';
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, type: initialType = 'other' }) => {
  const [type, setType] = useState<'bug' | 'feature' | 'improvement' | 'other'>(initialType);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [expectedBehavior, setExpectedBehavior] = useState('');
  const [actualBehavior, setActualBehavior] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { showSuccess, showError } = useToast();

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!title || !description) {
      showError('Please fill in title and description');
      return;
    }

    setSubmitting(true);
    try {
      const metadata: Record<string, unknown> = {};
      if (type === 'bug') {
        metadata.stepsToReproduce = stepsToReproduce;
        metadata.expectedBehavior = expectedBehavior;
        metadata.actualBehavior = actualBehavior;
        metadata.browser = navigator.userAgent;
        metadata.url = window.location.href;
      }

      const result = await supportService.submitFeedback(type, title, description, metadata);
      
      if (result.success) {
        showSuccess('Thank you for your feedback!');
        // Reset form
        setTitle('');
        setDescription('');
        setStepsToReproduce('');
        setExpectedBehavior('');
        setActualBehavior('');
        onClose();
      } else {
        showError('Failed to submit feedback. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting feedback:', error);
      showError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-900">
            {type === 'bug' ? 'Report a Bug' : 'Send Feedback'}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Type Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Type</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: 'bug', label: 'Bug', icon: Bug },
                { value: 'feature', label: 'Feature', icon: Lightbulb },
                { value: 'improvement', label: 'Improvement', icon: MessageSquare },
                { value: 'other', label: 'Other', icon: AlertCircle },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setType(value as any)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                    type === value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief summary..."
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue or suggestion..."
              rows={4}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Bug-specific fields */}
          {type === 'bug' && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Steps to Reproduce
                </label>
                <textarea
                  value={stepsToReproduce}
                  onChange={(e) => setStepsToReproduce(e.target.value)}
                  placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Expected Behavior
                </label>
                <textarea
                  value={expectedBehavior}
                  onChange={(e) => setExpectedBehavior(e.target.value)}
                  placeholder="What should happen?"
                  rows={2}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Actual Behavior
                </label>
                <textarea
                  value={actualBehavior}
                  onChange={(e) => setActualBehavior(e.target.value)}
                  placeholder="What actually happens?"
                  rows={2}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !title || !description}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeedbackModal;

