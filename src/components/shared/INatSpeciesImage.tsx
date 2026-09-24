import { useState, useEffect } from 'react';
import { Camera, ExternalLink, Loader2, Maximize2 } from 'lucide-react';
import { inaturalistService } from '../../services/inaturalistService';
import { ImageLightbox } from './ImageLightbox';

interface INatSpeciesImageProps {
  scientificName: string;
  className?: string; // For customized sizing/layout
  aspectRatio?: string; // Tailwind aspect class (e.g. "aspect-video", "aspect-[4/3]")
}

export function INatSpeciesImage({ scientificName, className = '', aspectRatio = 'aspect-[16/10]' }: INatSpeciesImageProps) {
  const [photoData, setPhotoData] = useState<{ url: string; attribution: string; originalUrl: string } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasImageError, setHasImageError] = useState<boolean>(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);

  const cleanDisplayName = scientificName ? scientificName.replace(/[\*\_\"\'\`]/g, '').trim() : '';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setPhotoData(null);
    setHasImageError(false);

    async function fetchImage() {
      if (!scientificName) {
        setLoading(false);
        return;
      }
      try {
        const data = await inaturalistService.getRepresentativePhoto(scientificName);
        if (active) {
          setPhotoData(data);
        }
      } catch (e) {
        console.error('Failed to load dynamic iNaturalist species photo', e);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchImage();

    return () => {
      active = false;
    };
  }, [scientificName]);

  if (loading) {
    return (
      <div className={`w-full rounded-2xl bg-slate-900/60 border border-slate-800/80 flex flex-col items-center justify-center relative overflow-hidden ${aspectRatio} ${className}`}>
        {/* Animated Shimmer background */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-800/10 to-transparent -translate-x-full animate-[shimmer_1.5s_infinite]" />
        <Loader2 className="w-6 h-6 text-cyan-500 animate-spin opacity-55" />
        <span className="text-slate-500 text-xs mt-2 font-mono uppercase tracking-wider">Locating specimen photos...</span>
      </div>
    );
  }

  if (!photoData || hasImageError) {
    // Elegant descriptive botanical fallback placeholder
    return (
      <div className={`w-full rounded-2xl bg-slate-900/40 border border-slate-800/80 p-6 flex flex-col items-center justify-center text-center relative overflow-hidden group ${aspectRatio} ${className}`}>
        <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mb-3 border border-slate-700/50 text-slate-500 group-hover:text-cyan-500 transition-colors group-hover:bg-slate-850">
          <Camera size={20} />
        </div>
        <p className="text-slate-400 text-sm font-medium mb-1 font-serif"><i>{cleanDisplayName}</i></p>
        <p className="text-slate-500 text-xs font-mono">No research-grade photo on iNaturalist</p>
      </div>
    );
  }

  return (
    <>
      <div 
        onClick={() => setIsLightboxOpen(true)}
        className={`w-full rounded-2xl border border-slate-800 bg-slate-950 relative overflow-hidden group shadow-lg cursor-zoom-in flex items-center justify-center ${aspectRatio} ${className}`}
        title="Click to view specimen photo"
      >
        {/* Ambient blurred background to gracefully frame varied aspect ratios */}
        <img
          src={photoData.url}
          alt=""
          className="absolute inset-0 w-full h-full object-cover filter blur-xl opacity-25 scale-105 pointer-events-none select-none"
          referrerPolicy="no-referrer"
        />

        {/* Crisp foreground specimen photo */}
        <img
          src={photoData.url}
          alt={`Field photo of ${cleanDisplayName}`}
          className="relative z-10 max-w-full max-h-full h-full object-contain transition-all duration-500 group-hover:scale-[1.015]"
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setHasImageError(true)}
        />
        
        {/* Badges */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-20">
          <span className="p-1.5 rounded-lg bg-slate-950/80 text-white border border-slate-800 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-md">
            <Maximize2 size={12} className="text-cyan-400" />
          </span>
          <a
            href={photoData.originalUrl}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => e.stopPropagation()}
            className="px-2 py-1 rounded-lg bg-slate-950/80 hover:bg-slate-950 text-white border border-slate-800 flex items-center gap-1 text-[10px] font-medium transition-colors backdrop-blur-md opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shadow-md"
            title="Verify Research Grade on iNaturalist"
          >
            iNaturalist <ExternalLink size={9} className="text-cyan-400" />
          </a>
        </div>

        {/* Attribution Overlay */}
        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2.5 pt-6 flex items-end justify-between transition-all duration-300 pointer-events-none z-10">
          <div className="text-[10px] text-slate-300 font-mono truncate max-w-full font-light" title={photoData.attribution}>
            &copy; {photoData.attribution || 'iNaturalist observation'}
          </div>
        </div>
      </div>

      <ImageLightbox
        isOpen={isLightboxOpen}
        photos={[{ url: photoData.url, attribution: photoData.attribution, originalUrl: photoData.originalUrl }]}
        currentIndex={0}
        taxonName={cleanDisplayName}
        onClose={() => setIsLightboxOpen(false)}
      />
    </>
  );
}
