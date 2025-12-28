import React, { useState, useEffect } from 'react';
import { X, ArrowRight, CheckCircle2 } from 'lucide-react';

interface TourStep {
  target: string; // CSS selector
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

interface OnboardingTourProps {
  steps: TourStep[];
  onComplete?: () => void;
}

export const OnboardingTour: React.FC<OnboardingTourProps> = ({ steps, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has completed onboarding
    const hasCompleted = localStorage.getItem('onboarding-completed') === 'true';
    if (!hasCompleted && steps.length > 0) {
      setIsVisible(true);
    }
  }, [steps.length]);

  if (!isVisible || currentStep >= steps.length) {
    return null;
  }

  const step = steps[currentStep];
  const element = document.querySelector(step.target);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    setIsVisible(false);
    localStorage.setItem('onboarding-completed', 'true');
    onComplete?.();
  };

  if (!element) {
    // Element not found, skip to next step
    if (currentStep < steps.length - 1) {
      setTimeout(() => setCurrentStep(currentStep + 1), 100);
    } else {
      handleComplete();
    }
    return null;
  }

  const rect = element.getBoundingClientRect();
  const position = step.position || 'bottom';

  const getPositionStyles = () => {
    switch (position) {
      case 'top':
        return {
          bottom: window.innerHeight - rect.top + 10,
          left: rect.left + rect.width / 2,
          transform: 'translateX(-50%)',
        };
      case 'bottom':
        return {
          top: rect.bottom + 10,
          left: rect.left + rect.width / 2,
          transform: 'translateX(-50%)',
        };
      case 'left':
        return {
          top: rect.top + rect.height / 2,
          right: window.innerWidth - rect.left + 10,
          transform: 'translateY(-50%)',
        };
      case 'right':
        return {
          top: rect.top + rect.height / 2,
          left: rect.right + 10,
          transform: 'translateY(-50%)',
        };
    }
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" />
      
      {/* Highlight */}
      <div
        className="fixed z-40 border-4 border-blue-500 rounded-lg pointer-events-none"
        style={{
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
        }}
      />

      {/* Tooltip */}
      <div
        className="fixed z-50 bg-white rounded-lg shadow-xl p-6 max-w-sm"
        style={getPositionStyles()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-900">{step.title}</h3>
            <div className="text-xs text-slate-500 mt-1">
              Step {currentStep + 1} of {steps.length}
            </div>
          </div>
          <button
            onClick={handleSkip}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-4">{step.content}</p>
        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Skip tour
          </button>
          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {currentStep === steps.length - 1 ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Complete
              </>
            ) : (
              <>
                Next
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
};

export default OnboardingTour;

