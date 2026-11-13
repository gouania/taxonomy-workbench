import { AlertTriangle, RefreshCw } from 'lucide-react';
import React from 'react';

interface ErrorDisplayProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorDisplay({ message, onRetry, className = '' }: ErrorDisplayProps) {
  return (
    <div
      className={`bg-slate-900/40 border border-amber-900/50 rounded-2xl p-8 flex flex-col items-center justify-center text-center ${className}`}
    >
      <div className="w-16 h-16 bg-amber-900/20 rounded-full flex items-center justify-center mb-4">
        <AlertTriangle size={32} className="text-amber-500" />
      </div>
      <h3 className="font-display text-xl font-semibold text-white mb-2">Couldn’t load results</h3>
      <p className="text-slate-400 mb-6 max-w-md">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors border border-slate-700/50"
        >
          <RefreshCw size={18} />
          Try Again
        </button>
      )}
    </div>
  );
}
