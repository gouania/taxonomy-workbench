import React, { useEffect, useState } from 'react';
import { Loader2, Image as ImageIcon, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
import { inaturalistService, TaxonPhoto } from '../../services/inaturalistService';
import { ImageLightbox } from '../shared/ImageLightbox';

interface TaxonGalleryProps {
  taxonName: string;
}

export function TaxonGallery({ taxonName }: TaxonGalleryProps) {
  const [photos, setPhotos] = useState<TaxonPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setActiveIndex(0);
    
    inaturalistService.getTaxonPhotos(taxonName).then((data) => {
      if (isMounted) {
        setPhotos(data);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [taxonName]);

  if (loading) {
    return (
      <div className="w-full h-80 bg-slate-900/30 rounded-3xl border border-slate-800/50 flex flex-col items-center justify-center mb-8 animate-pulse print:hidden">
        <Loader2 className="animate-spin text-slate-600 mb-2" size={32} />
        <span className="text-slate-500 text-sm font-medium">Loading field images...</span>
      </div>
    );
  }

  if (photos.length === 0) {
    return null; // Fail gracefully if no photos exist
  }

  const currentPhoto = photos[activeIndex];

  const handleNext = () => {
    setActiveIndex((prev) => (prev + 1) % photos.length);
  };

  const handlePrev = () => {
    setActiveIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  return (
    <div className="mb-8 print:hidden flex flex-col gap-4">
      {/* Large Main Featured Image */}
      <div 
        onClick={() => setIsLightboxOpen(true)}
        className="relative w-full h-80 md:h-[385px] rounded-3xl overflow-hidden border border-slate-800 bg-slate-950/80 shadow-2xl group flex items-center justify-center cursor-zoom-in"
        title="Click to view fullscreen high-resolution specimen"
      >
        {/* Ambient background blur to prevent grainy empty space */}
        <img 
          src={currentPhoto.url} 
          alt="" 
          className="absolute inset-0 w-full h-full object-cover filter blur-2xl opacity-25 scale-105 pointer-events-none select-none"
          referrerPolicy="no-referrer"
        />

        {/* Sharp foreground image maintaining true aspect ratio and resolution limits */}
        <img 
          src={currentPhoto.url} 
          alt={`${taxonName} field image`} 
          className="relative z-10 max-w-full max-h-full h-full object-contain transition-all duration-500 group-hover:scale-[1.015]"
          referrerPolicy="no-referrer"
        />

        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30 opacity-70 transition-opacity duration-300 pointer-events-none" />

        {/* Expand button badge */}
        <div className="absolute top-4 left-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-950/80 text-white border border-slate-700 text-xs font-medium backdrop-blur-md shadow-lg">
            <Maximize2 size={13} className="text-cyan-400" />
            Inspect Morphology
          </span>
        </div>

        {/* Floating details and copyright */}
        <div className="absolute bottom-0 left-0 right-0 p-5 md:p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3 z-10 pointer-events-none">
          <div className="space-y-1">
            <h4 className="text-lg md:text-xl font-display font-bold text-white tracking-tight">
              <i>{taxonName}</i>
            </h4>
          </div>
          <p className="text-xs text-slate-300 font-mono flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800/30 backdrop-blur-sm self-start sm:self-auto max-w-full truncate">
            <ImageIcon size={14} className="text-cyan-400 shrink-0" />
            <span className="truncate">&copy; {currentPhoto.attribution}</span>
          </p>
        </div>

        {/* Photo Counter */}
        <div className="absolute top-4 right-4 bg-slate-950/70 border border-slate-800/50 backdrop-blur-md px-3 py-1 rounded-full text-xs font-mono font-semibold text-slate-300 z-10">
          {activeIndex + 1} / {photos.length}
        </div>

        {/* Navigation Arrows for convenient scrolling */}
        {photos.length > 1 && (
          <>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-950/70 border border-slate-800 hover:bg-slate-900 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-105 backdrop-blur-sm z-20 cursor-pointer"
              aria-label="Previous photo"
            >
              <ChevronLeft size={20} />
            </button>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-950/70 border border-slate-800 hover:bg-slate-900 text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:scale-105 backdrop-blur-sm z-20 cursor-pointer"
              aria-label="Next photo"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>

      {/* Horizontal Scroll row of clickable thumbnails */}
      {photos.length > 1 && (
        <div className="flex flex-col gap-2">
          <div className="flex overflow-x-auto gap-3 py-1 px-1 [&::-webkit-scrollbar]:hidden">
            {photos.map((photo, idx) => {
              const isActive = idx === activeIndex;
              return (
                <button
                  key={idx}
                  onClick={() => setActiveIndex(idx)}
                  className={`relative shrink-0 w-24 h-16 rounded-2xl overflow-hidden border-2 transition-all duration-300 hover:scale-105 cursor-pointer ${
                    isActive 
                      ? 'border-cyan-400 shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-400' 
                      : 'border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <img 
                    src={photo.url} 
                    alt={`Thumbnail preview ${idx + 1}`} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  {isActive && (
                    <div className="absolute inset-0 bg-cyan-950/20" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-500 font-medium tracking-wide">
              Click photo to zoom or use thumbnails to inspect {photos.length} field images from iNaturalist
            </p>
          </div>
        </div>
      )}

      {/* Fullscreen Botanical Lightbox */}
      <ImageLightbox
        isOpen={isLightboxOpen}
        photos={photos}
        currentIndex={activeIndex}
        taxonName={taxonName}
        onClose={() => setIsLightboxOpen(false)}
        onNavigate={(newIdx) => setActiveIndex(newIdx)}
      />
    </div>
  );
}
