import React, { useEffect, useState } from 'react';
import { Loader2, Image as ImageIcon } from 'lucide-react';
import { inaturalistService, TaxonPhoto } from '../../services/inaturalistService';

interface TaxonGalleryProps {
  taxonName: string;
}

export function TaxonGallery({ taxonName }: TaxonGalleryProps) {
  const [photos, setPhotos] = useState<TaxonPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    
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
      <div className="w-full h-72 bg-slate-900/30 rounded-3xl border border-slate-800/50 flex flex-col items-center justify-center mb-8 animate-pulse print:hidden">
        <Loader2 className="animate-spin text-slate-600 mb-2" size={32} />
        <span className="text-slate-500 text-sm font-medium">Loading field images...</span>
      </div>
    );
  }

  if (photos.length === 0) {
    return null; // Fail gracefully if no photos exist
  }

  return (
    <div className="mb-8 print:hidden">
      {/* 
        Horizontal scroll container with CSS snap points.
        The [&::-webkit-scrollbar]:hidden class hides the ugly default scrollbar 
        while keeping the scrolling functionality intact.
      */}
      <div className="flex overflow-x-auto gap-4 snap-x pb-4 [&::-webkit-scrollbar]:hidden">
        {photos.map((photo, idx) => (
          <div 
            key={idx} 
            className="relative shrink-0 w-[85%] md:w-[60%] lg:w-[45%] snap-center group rounded-3xl overflow-hidden border border-slate-800/50 shadow-xl bg-slate-900"
          >
            <img 
              src={photo.url} 
              alt={`${taxonName} representative image ${idx + 1}`} 
              className="w-full h-72 md:h-80 object-cover transition-transform duration-700 group-hover:scale-105"
              loading={idx === 0 ? "eager" : "lazy"}
              referrerPolicy="no-referrer"
            />
            
            {/* Elegant gradient overlay for attribution that appears on hover */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
              <p className="text-xs text-slate-300 font-medium truncate w-full flex items-center gap-2">
                <ImageIcon size={14} className="text-cyan-400 shrink-0" />
                &copy; {photo.attribution}
              </p>
            </div>
          </div>
        ))}
      </div>
      
      <div className="text-center mt-2">
        <p className="text-xs text-slate-500 font-medium">
          Swipe to view {photos.length} representative images from iNaturalist
        </p>
      </div>
    </div>
  );
}
