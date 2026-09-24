import React, { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, ExternalLink, Image as ImageIcon } from 'lucide-react';

export interface LightboxPhoto {
  url: string;
  attribution: string;
  originalUrl?: string;
  caption?: string;
}

interface ImageLightboxProps {
  isOpen: boolean;
  photos: LightboxPhoto[];
  currentIndex: number;
  taxonName?: string;
  onClose: () => void;
  onNavigate?: (newIndex: number) => void;
}

export function ImageLightbox({
  isOpen,
  photos,
  currentIndex,
  taxonName,
  onClose,
  onNavigate,
}: ImageLightboxProps) {
  const [mounted, setMounted] = useState(false);
  const hasMultiple = photos.length > 1;
  const currentPhoto = photos[currentIndex] || photos[0];

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleNext = useCallback(() => {
    if (!hasMultiple || !onNavigate) return;
    onNavigate((currentIndex + 1) % photos.length);
  }, [currentIndex, hasMultiple, onNavigate, photos.length]);

  const handlePrev = useCallback(() => {
    if (!hasMultiple || !onNavigate) return;
    onNavigate((currentIndex - 1 + photos.length) % photos.length);
  }, [currentIndex, hasMultiple, onNavigate, photos.length]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, handleNext, handlePrev]);

  if (!isOpen || !currentPhoto || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* Modal Dialog Card (like Explore Taxa styling: dark, clean, beautifully framed) */}
      <div
        className="relative max-w-4xl w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950/90 border-b border-slate-800/80">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <h4 className="font-display text-sm sm:text-base font-semibold text-white truncate">
              {taxonName ? <i className="font-serif text-cyan-300">{taxonName}</i> : 'Botanical Specimen'}
            </h4>
            {hasMultiple && (
              <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700 shrink-0">
                {currentIndex + 1} / {photos.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer border border-slate-700/50"
            title="Close (Esc)"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Image Display Canvas */}
        <div className="relative w-full bg-slate-950 flex items-center justify-center min-h-[260px] max-h-[70vh] overflow-hidden p-2 sm:p-4">
          {/* Ambient blurred backdrop */}
          <img
            src={currentPhoto.url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover filter blur-2xl opacity-20 pointer-events-none select-none"
            referrerPolicy="no-referrer"
          />

          {/* Sharp foreground image */}
          <img
            src={currentPhoto.url}
            alt={taxonName || 'Botanical specimen photo'}
            className="relative z-10 max-w-full max-h-[66vh] w-auto h-auto object-contain rounded-lg shadow-lg border border-slate-800/40"
            referrerPolicy="no-referrer"
          />

          {/* Navigation Controls if multiple images */}
          {hasMultiple && (
            <>
              <button
                onClick={handlePrev}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700 flex items-center justify-center transition-all cursor-pointer z-20 shadow-xl backdrop-blur-sm"
                title="Previous photo"
                aria-label="Previous"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={handleNext}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700 flex items-center justify-center transition-all cursor-pointer z-20 shadow-xl backdrop-blur-sm"
                title="Next photo"
                aria-label="Next"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}
        </div>

        {/* Footer info & attribution */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 bg-slate-950/90 border-t border-slate-800/80 text-xs">
          <div className="flex items-center gap-2 text-slate-400 font-mono truncate max-w-full">
            <ImageIcon size={13} className="text-cyan-400 shrink-0" />
            <span className="truncate">&copy; {currentPhoto.attribution || 'iNaturalist research-grade observation'}</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {currentPhoto.originalUrl && (
              <a
                href={currentPhoto.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 font-medium hover:underline"
              >
                <span>Verify on iNaturalist</span>
                <ExternalLink size={12} />
              </a>
            )}
            <span className="text-[11px] text-slate-500 hidden sm:inline font-mono">
              Esc to close
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
