import { useState, useEffect } from 'react';
import { Camera, ExternalLink, Loader2 } from 'lucide-react';
import { inaturalistService } from '../../services/inaturalistService';

interface INatSpeciesImageProps {
  scientificName: string;
  className?: string; // For customized sizing/layout
  aspectRatio?: string; // Tailwind aspect class (e.g. "aspect-video", "aspect-[4/3]")
}

export function INatSpeciesImage({ scientificName, className = '', aspectRatio = 'aspect-[16/10]' }: INatSpeciesImageProps) {
  const [photoData, setPhotoData] = useState<{ url: string; attribution: string; originalUrl: string } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setPhotoData(null);

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

  if (!photoData) {
    // Elegant descriptive botanical fallback placeholder
    return (
      <div className={`w-full rounded-2xl bg-slate-900/40 border border-slate-800/80 p-6 flex flex-col items-center justify-center text-center relative overflow-hidden group ${aspectRatio} ${className}`}>
        <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mb-3 border border-slate-700/50 text-slate-500 group-hover:text-cyan-500 transition-colors group-hover:bg-slate-850">
          <Camera size={20} />
        </div>
        <p className="text-slate-400 text-sm font-medium mb-1 font-serif"><i>{scientificName}</i></p>
        <p className="text-slate-500 text-xs font-mono">No research-grade photo on iNaturalist</p>
      </div>
    );
  }

  return (
    <div className={`w-full rounded-2xl border border-slate-800 bg-slate-900 relative overflow-hidden group shadow-lg ${aspectRatio} ${className}`}>
      <img
        src={photoData.url}
        alt={`Field photo of ${scientificName}`}
        className="w-full h-full object-cover transition-all duration-700 group-hover:scale-[1.03]"
        referrerPolicy="no-referrer"
      />
      
      {/* Absolute Badges */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <a
          href={photoData.originalUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="px-2.5 py-1 rounded-full bg-slate-950/80 hover:bg-slate-950 text-white border border-slate-800 flex items-center gap-1.5 text-[10px] font-medium transition-colors backdrop-blur-md opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-300 shadow-md"
          title="Verify Research Grade on iNaturalist"
        >
          iNaturalist <ExternalLink size={10} className="text-cyan-400" />
        </a>
      </div>

      {/* Attribution Overlay in fine-print */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-8 flex items-end justify-between transition-all duration-300">
        <div className="text-[10px] text-slate-300 font-mono truncate max-w-full font-light" title={photoData.attribution}>
          &copy; {photoData.attribution || 'Unknown Photographer'}
        </div>
      </div>
    </div>
  );
}
