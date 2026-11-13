import React from 'react';
import { MapPin, Pencil, X, ArrowUpRight } from 'lucide-react';
import { PlaceRef } from '../../types';

interface PlaceContextChipProps {
  place?: PlaceRef | null;
  fallbackLabel?: string;
  onChange?: () => void;
  onClear?: () => void;
  onOpenOverview?: () => void;
  className?: string;
}

export function PlaceContextChip({
  place,
  fallbackLabel,
  onChange,
  onClear,
  onOpenOverview,
  className = '',
}: PlaceContextChipProps) {
  const displayName = place?.displayName || fallbackLabel?.trim();
  if (!displayName) return null;

  const scopeHint =
    place?.providerPlaceId
      ? 'iNat boundary'
      : place?.scopeType === 'point'
      ? '35 km point'
      : place?.scopeType && place.scopeType !== 'unknown'
      ? place.scopeType
      : null;

  return (
    <div
      data-testid="place-context-chip"
      className={`inline-flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-cyan-800/50 text-xs text-slate-200 shadow-sm ${className}`}
    >
      <MapPin size={13} className="text-cyan-400 shrink-0" />
      <span className="font-medium">
        <span className="text-slate-400">Place:</span>{' '}
        <span className="text-white font-semibold">{displayName}</span>
      </span>

      {scopeHint && (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700/80">
          {scopeHint}
        </span>
      )}

      {onOpenOverview && (
        <>
          <span className="text-slate-600" aria-hidden="true">&middot;</span>
          <button
            type="button"
            onClick={onOpenOverview}
            className="text-cyan-400 hover:text-cyan-300 font-medium inline-flex items-center gap-0.5 cursor-pointer focus:outline-none focus:underline"
          >
            <span>Overview</span>
            <ArrowUpRight size={11} />
          </button>
        </>
      )}

      {onChange && (
        <>
          <span className="text-slate-600" aria-hidden="true">&middot;</span>
          <button
            type="button"
            onClick={onChange}
            className="text-slate-300 hover:text-cyan-300 font-medium inline-flex items-center gap-1 cursor-pointer focus:outline-none focus:underline"
          >
            <Pencil size={11} />
            <span>Change</span>
          </button>
        </>
      )}

      {onClear && (
        <>
          <span className="text-slate-600" aria-hidden="true">&middot;</span>
          <button
            type="button"
            onClick={onClear}
            className="text-slate-400 hover:text-rose-300 font-medium inline-flex items-center gap-0.5 cursor-pointer focus:outline-none focus:underline"
          >
            <X size={11} />
            <span>Clear</span>
          </button>
        </>
      )}
    </div>
  );
}
