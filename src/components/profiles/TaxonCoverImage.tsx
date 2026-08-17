import React, { useEffect, useState } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';
import { inaturalistService, TaxonPhoto } from '../../services/inaturalistService';

interface TaxonCoverImageProps {
  taxonName: string;
}

export function TaxonCoverImage({ taxonName }: TaxonCoverImageProps) {
  const [photo, setPhoto] = useState<TaxonPhoto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    
    inaturalistService.getTaxonPhotos(taxonName).then((data) => {
      if (isMounted) {
        if (data.length > 0) {
          setPhoto(data[0]);
        } else {
          setPhoto(null);
        }
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [taxonName]);

  if (loading) {
    return (
      <div className="w-full h-48 bg-slate-900/30 rounded-2xl border border-slate-800/50 flex flex-col items-center justify-center animate-pulse print:hidden mb-6">
        <Loader2 className="animate-spin text-slate-600" size={24} />
      </div>
    );
  }

  if (!photo) {
    return null;
  }

  return (
    <div className="relative w-full h-48 md:h-56 rounded-2xl overflow-hidden border border-slate-800 bg-slate-950/80 mb-6 print:hidden group flex items-center justify-center shadow-lg">
      <img 
        src={photo.url} 
        alt="" 
        className="absolute inset-0 w-full h-full object-cover filter blur-xl opacity-25 scale-105 pointer-events-none select-none"
        referrerPolicy="no-referrer"
      />
      <img 
        src={photo.url} 
        alt={`${taxonName} cover image`} 
        className="relative z-10 max-w-full max-h-full h-full object-contain transition-all duration-500 group-hover:scale-105"
        referrerPolicy="no-referrer"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-70 transition-opacity duration-300" />
      <div className="absolute bottom-0 left-0 right-0 p-3 z-10 flex justify-end">
        <p className="text-[10px] text-slate-300 font-mono flex items-center gap-1.5 bg-slate-950/60 px-2 py-1 rounded-lg border border-slate-800/30 backdrop-blur-sm max-w-full truncate">
          <ImageIcon size={10} className="text-cyan-400 shrink-0" />
          <span className="truncate">&copy; {photo.attribution}</span>
        </p>
      </div>
    </div>
  );
}
