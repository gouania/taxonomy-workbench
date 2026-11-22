import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';

interface TaskProgressCardProps {
  title: string;
  stages: string[];
  onCancel?: () => void;
  variant?: 'card' | 'banner';
  testId?: string;
  className?: string;
}

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function TaskProgressCard({
  title,
  stages,
  onCancel,
  variant = 'card',
  testId,
  className = '',
}: TaskProgressCardProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    setElapsedSeconds(0);
    const interval = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [title]);

  const stageIndex =
    stages.length <= 1
      ? 0
      : elapsedSeconds < 8
      ? 0
      : elapsedSeconds < 22
      ? Math.min(1, stages.length - 1)
      : stages.length - 1;

  const activeStage = stages[stageIndex] || '';

  if (variant === 'banner') {
    return (
      <div
        data-testid={testId}
        className={`p-4 rounded-xl bg-cyan-950/30 border border-cyan-800/50 text-cyan-200 text-xs flex flex-wrap items-center justify-between gap-3 ${className}`}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <Loader2 size={16} className="animate-spin text-cyan-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5 min-w-0">
            <div className="font-semibold text-cyan-100 flex flex-wrap items-center gap-2">
              <span>{title}</span>
              <span className="font-mono tabular-nums text-[11px] text-cyan-400/90">
                {formatElapsed(elapsedSeconds)}
              </span>
            </div>
            {activeStage && <p className="text-cyan-200/80 leading-relaxed">{activeStage}</p>}
          </div>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-medium transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          >
            <X size={13} />
            <span>Cancel</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid={testId}
      className={`bg-slate-900/50 border border-slate-800/70 rounded-2xl p-8 shadow-xl h-full flex flex-col items-center justify-center text-center min-h-[340px] space-y-5 ${className}`}
    >
      <Loader2 size={44} className="text-cyan-400 animate-spin" />

      <div className="space-y-2 max-w-md">
        <h3 className="text-xl font-display font-semibold text-white">{title}</h3>
        {activeStage && (
          <p className="text-slate-300 text-sm leading-relaxed">{activeStage}</p>
        )}
        <div className="text-xs text-slate-400 font-mono tabular-nums pt-1">
          Elapsed {formatElapsed(elapsedSeconds)} · Thorough botanical synthesis typically takes 25–55s
        </div>
      </div>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
        >
          <X size={14} />
          <span>Cancel request</span>
        </button>
      )}
    </div>
  );
}
