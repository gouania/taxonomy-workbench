import React from 'react';
import Markdown from 'react-markdown';
import { Loader2, AlertCircle, ListTree, Info, MapPin, Camera, FileText, Sprout, Filter } from 'lucide-react';
import { AppStatus, GeneratedGuideStructured, NavigationTarget } from '../../types';
import { SourcesBar } from '../shared/SourcesBar';
import { CrossLink } from '../shared/CrossLink';
import { CopyTextButton, PrintPDFButton } from '../shared/ExportTools';
import { INatSpeciesImage } from '../shared/INatSpeciesImage';

interface StructuredResultPanelProps {
  status: AppStatus;
  guide: GeneratedGuideStructured | null;
  sources?: any[];
  onNavigate?: (target: NavigationTarget) => void;
  error?: string | null;
  activeFilters?: string[];
}

function cleanTipText(text: string): string {
  const cleaned = text.replace(/^(PHOTOGRAPH|COLLECT|RECORD\s+NOTES|NOTES|FIELD\s+NOTES|RECORD|WRITE)\s*[:\-]\s*/i, '');
  if (!cleaned) return text;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function formatStructuredGuideAsMarkdown(guide: GeneratedGuideStructured): string {
  const targetTaxon = guide?.guide_metadata?.target_taxon || 'Unknown Taxon';
  const targetLocality = guide?.guide_metadata?.target_locality || 'Unknown Locality';
  const overview = guide?.taxon_overview || '';
  const keyItems = guide?.dichotomous_key || [];
  const profiles = guide?.species_profiles || [];
  const fieldGuides = (guide?.field_documentation_guide || []).slice(0, 4);

  return `
# Identification Guide to ${targetTaxon}
**Locality:** ${targetLocality}
***
## Taxon Overview
${overview}

${fieldGuides.length > 0 ? `***
## Field documentation
${fieldGuides.map((tip) => `- ${cleanTipText(tip)}`).join('\n')}
` : ''}
***
## Dichotomous Key
${keyItems.map(couplet => `
${couplet.couplet_id || ''}.
- a. ${couplet.lead_a?.statement || ''} -> **${couplet.lead_a?.destination || ''}**
- b. ${couplet.lead_b?.statement || ''} -> **${couplet.lead_b?.destination || ''}**
`).join('\n')}

***
## Species Profiles
${profiles.map(sp => `
### *${sp.scientific_name || ''}* (${sp.common_name || 'N/A'})
- **Key Diagnostics:** ${sp.key_diagnostics || ''}
- **Habitat & Ecology:** ${sp.habitat_and_ecology || ''}
`).join('\n')}
  `.trim();
}

function getFieldworkCategory(text: string) {
  const lower = text.toLowerCase();
  
  // Photography checks
  if (
    lower.includes('photo') || 
    lower.includes('camera') || 
    lower.includes('image') || 
    lower.includes('shoot') || 
    lower.includes('close-up') || 
    lower.includes('picture') || 
    lower.includes('lens') ||
    lower.includes('macro') ||
    lower.includes('magnification')
  ) {
    return {
      label: 'Photograph',
      icon: <Camera size={11} />,
      badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      iconClass: 'text-cyan-400 bg-cyan-950/30 border-cyan-900/40'
    };
  }

  // Collection checks
  if (
    lower.includes('collect') || 
    lower.includes('harvest') || 
    lower.includes('voucher') || 
    lower.includes('specimen') || 
    lower.includes('press') || 
    lower.includes('physical') || 
    lower.includes('sample') || 
    lower.includes('twig') || 
    lower.includes('branch') || 
    lower.includes('deposit') || 
    lower.includes('bag') ||
    lower.includes('herbarium')
  ) {
    return {
      label: 'Collect',
      icon: <Sprout size={11} />,
      badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      iconClass: 'text-amber-400 bg-amber-950/30 border-amber-900/40'
    };
  }

  // Default block for qualitative / quantitative written field observations
  return {
    label: 'Record Notes',
    icon: <FileText size={11} />,
    badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    iconClass: 'text-indigo-400 bg-indigo-950/30 border-indigo-900/40'
  };
}

export function StructuredResultPanel({ status, guide, sources, onNavigate, error, activeFilters }: StructuredResultPanelProps) {
  if (status === AppStatus.IDLE) {
    return (
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-8 shadow-xl backdrop-blur-sm h-full flex flex-col items-center justify-center text-center min-h-[400px]">
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-6">
          <ListTree size={32} className="text-slate-600" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Ready to Build Key</h3>
        <p className="text-slate-400 max-w-md">
          Enter a Taxon and Locality to generate a verified, region-specific dichotomous key and identification guide.
        </p>
      </div>
    );
  }

  if (status === AppStatus.LOADING) {
    return (
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-8 shadow-xl backdrop-blur-sm h-full flex flex-col items-center justify-center text-center min-h-[400px]">
        <Loader2 size={48} className="text-cyan-500 animate-spin mb-6" />
        <h3 className="text-xl font-semibold text-white mb-2">Synthesizing Regional Guide...</h3>
        <p className="text-slate-400 max-w-md">
          Querying botanical databases, verifying local species, and constructing identification keys. This may take a moment.
        </p>
      </div>
    );
  }

  if (status === AppStatus.ERROR || !guide || !guide.guide_metadata) {
    return (
      <div className="bg-rose-950/30 border border-rose-900/50 rounded-2xl p-8 shadow-xl backdrop-blur-sm h-full flex flex-col items-center justify-center text-center min-h-[400px]">
        <div className="w-16 h-16 rounded-full bg-rose-900/50 flex items-center justify-center mb-6">
          <AlertCircle size={32} className="text-rose-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Generation Failed</h3>
        <p className="text-rose-300 max-w-md">
          {error || "There was an error generating the structured guide. Please check your API key and try again."}
        </p>
      </div>
    );
  }

  const targetTaxon = guide.guide_metadata?.target_taxon || 'Unknown Taxon';
  const targetLocality = guide.guide_metadata?.target_locality || 'Unknown Locality';
  const overview = guide.taxon_overview || '';
  const keyItems = guide.dichotomous_key || [];
  const profiles = guide.species_profiles || [];

  return (
    <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6 md:p-8 shadow-xl backdrop-blur-sm h-full overflow-y-auto print:bg-white print:text-black print:shadow-none print:border-none space-y-8 text-slate-200">
      
      {/* Header */}
      <div className="text-center pb-6 border-b border-slate-800 print:border-slate-300">
        <h2 className="text-3xl font-display font-bold text-white mb-2 print:text-black">
           Identification Guide to <i className="text-cyan-400 font-normal print:text-black">{targetTaxon}</i>
        </h2>
        <div className="flex flex-col items-center justify-center gap-1.5 mb-4">
          <div className="flex items-center gap-2 text-slate-400 font-medium">
             <MapPin size={18} />
             {targetLocality}
          </div>
          {activeFilters && activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5 mt-2">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono flex items-center gap-1 mr-1">
                <Filter size={10} className="text-cyan-500" />
                Constraints:
              </span>
              {activeFilters.map((flt, i) => (
                <span key={i} className="text-[11px] bg-cyan-950/40 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded-full font-medium">
                  {flt}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 print:hidden">
          <CopyTextButton 
            text={formatStructuredGuideAsMarkdown(guide)} 
            label="Copy Guide Markdown" 
            title="Copy the entire Dichotomous Key and Diagnostic species profiles as Markdown" 
          />
          <PrintPDFButton label="Export / Print PDF" />
        </div>
      </div>

      {/* Target Taxon Representative Cover Photo */}
      {targetTaxon && (
        <div className="max-w-xl mx-auto print:hidden animate-in fade-in duration-500">
          <INatSpeciesImage 
            scientificName={targetTaxon} 
            className="w-full shadow-lg border border-slate-800 bg-slate-900" 
            aspectRatio="aspect-video md:aspect-[16/8]" 
          />
          <p className="text-center text-[11px] text-slate-500 font-medium tracking-wide mt-2">
            Photograph of <i>{targetTaxon}</i> from iNaturalist
          </p>
        </div>
      )}

      {/* Overview */}
      <div className="space-y-4">
        <h3 className="text-xl font-display font-semibold text-white border-b border-slate-800 pb-2 flex items-center gap-2">
          <Info size={20} className="text-indigo-400" />
          Taxon Overview
        </h3>
        <div className="prose prose-invert prose-p:text-slate-300 print:prose-p:text-black max-w-none">
           <Markdown>{overview}</Markdown>
        </div>
      </div>

      {/* Bespoke Fieldwork Instructions */}
      {guide.field_documentation_guide && guide.field_documentation_guide.length > 0 && (() => {
        const displayedGuides = guide.field_documentation_guide.slice(0, 4);
        return (
          <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 space-y-5 mt-8 print:bg-white print:text-black print:border-none print:p-0 animate-in fade-in duration-300">
            <div className="border-b border-slate-800/80 pb-3 flex items-center justify-between print:border-slate-300">
              <h4 className="text-lg font-display font-semibold text-white flex items-center gap-2.5 print:text-black">
                <Camera size={20} className="text-cyan-400 print:text-black" />
                <span>Field documentation</span>
              </h4>
              <span className="text-xs text-slate-500 font-mono hidden sm:inline">Priority list (1 to {displayedGuides.length})</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:block print:space-y-4">
              {displayedGuides.map((tip, index) => {
                const cat = getFieldworkCategory(tip);
                return (
                  <div 
                    key={index} 
                    className="group bg-slate-950/30 hover:bg-slate-950/60 border border-slate-800/40 hover:border-slate-700/50 p-4 rounded-xl flex gap-3.5 items-start transition-all duration-300 shadow-sm print:bg-white print:text-black print:border-none print:p-0"
                  >
                    {/* Step visual cues */}
                    <div className="flex flex-col items-center gap-1.5 shrink-0 select-none">
                      <div className="w-6.5 h-6.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-xs font-mono font-bold text-slate-400 group-hover:text-cyan-400 group-hover:border-cyan-500/20 transition-all">
                        {index + 1}
                      </div>
                      <div className={`flex items-center justify-center w-5 h-5 rounded-md border border-slate-800/30 text-xs ${cat.iconClass}`}>
                        {cat.icon}
                      </div>
                    </div>

                    {/* Text descriptions */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                         <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider uppercase border ${cat.badgeClass}`}>
                          {cat.label}
                         </span>
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed font-sans group-hover:text-slate-200 transition-colors print:text-black">
                        {cleanTipText(tip)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Dichotomous Key */}
      <div className="space-y-4 mt-8">
        <h3 className="text-xl font-display font-semibold text-white border-b border-slate-800 pb-2 flex items-center gap-2">
          <ListTree size={20} className="text-emerald-400" />
          Dichotomous Key
        </h3>

        <div className="bg-emerald-950/25 border border-emerald-500/20 rounded-xl p-3.5 flex gap-3 items-start text-xs text-emerald-300 shadow-sm animate-in fade-in duration-300 print:hidden">
          <Info size={16} className="text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block text-emerald-200 mb-0.5">Selective Regional Key</span>
            Of the total documented species pool in <span className="font-medium text-slate-200">{targetLocality}</span>, this diagnostic key is optimized specifically to distinguish the <span className="text-white font-semibold">{profiles.length} most common or representative species</span> detailed in this guide.
          </div>
        </div>

        <div className="font-mono text-sm leading-relaxed text-slate-300">
          {keyItems.length === 0 ? (
            <div className="text-slate-400 italic">No dichotomous key items available.</div>
          ) : (
            keyItems.map((couplet, i) => {
              const renderDestination = (dest: string) => {
                const cleanDest = dest || '';
                if (/^\d+[a-zA-Z]*$/.test(cleanDest.trim())) {
                  return <span className="text-cyan-400 font-bold justify-self-end text-right">{cleanDest}</span>;
                }
                return (
                  <CrossLink 
                    target={{ module: 'profiles', query: cleanDest }} 
                    onNavigate={onNavigate} 
                    className="italic text-cyan-400 font-bold hover:underline underline-offset-4 text-right justify-self-end mt-1 md:mt-0"
                  >
                    {cleanDest}
                  </CrossLink>
                );
              };

              return (
                <div key={i} className="mb-4 pl-4 border-l-2 border-slate-700/50 hover:border-slate-500 transition-colors">
                   <div className="font-bold text-slate-400 mb-1">{couplet.couplet_id || ''}.</div>
                   <div className="flex flex-col md:flex-row md:justify-between items-start md:items-end gap-1 md:gap-4 mb-3 group">
                     <div className="flex-1">
                       <span className="text-slate-500 mr-2">a.</span>
                       <span className="group-hover:text-cyan-200 transition-colors">{couplet.lead_a?.statement || ''}</span>
                     </div>
                     <div className="shrink-0 md:self-end md:mb-0.5 self-start ml-6 md:ml-0 flex">
                       {renderDestination(couplet.lead_a?.destination || '')}
                     </div>
                   </div>
                   <div className="flex flex-col md:flex-row md:justify-between items-start md:items-end gap-1 md:gap-4 group">
                     <div className="flex-1">
                       <span className="text-slate-500 mr-2">b.</span>
                       <span className="group-hover:text-cyan-200 transition-colors">{couplet.lead_b?.statement || ''}</span>
                     </div>
                     <div className="shrink-0 md:self-end md:mb-0.5 self-start ml-6 md:ml-0 flex">
                       {renderDestination(couplet.lead_b?.destination || '')}
                     </div>
                   </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Species Profiles */}
      <div className="space-y-6 mt-12 bg-slate-950/30 p-6 rounded-2xl border border-slate-800/50">
        <h3 className="text-2xl font-display font-semibold text-white print:text-black">Diagnostic Profiles</h3>
        <div className="grid gap-6">
          {profiles.length === 0 ? (
            <div className="text-slate-400 italic">No diagnostic species profiles available.</div>
          ) : (
            profiles.map((sp, idx) => (
              <div key={idx} className="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col md:flex-row gap-5 items-stretch">
                 <div className="flex-1 min-w-0">
                   <h4 className="text-lg font-bold font-display text-white mb-1">
                     {sp.scientific_name ? (
                       <CrossLink target={{ module: 'profiles', query: sp.scientific_name }} onNavigate={onNavigate} className="inline-block hover:underline underline-offset-4 transition-colors">
                         <i className="text-cyan-400">{sp.scientific_name}</i>
                       </CrossLink>
                     ) : (
                       <span className="text-slate-400">Unnamed Species</span>
                     )}
                   </h4>
                   {sp.common_name && <div className="text-slate-400 text-sm mb-3 font-medium">{sp.common_name}</div>}
                   <div className="space-y-3 mt-4 text-sm">
                     <div>
                       <strong className="text-xs uppercase tracking-widest text-slate-500 block mb-1">Key Diagnostics</strong>
                       <span className="text-slate-300">{sp.key_diagnostics || ''}</span>
                     </div>
                     <div>
                       <strong className="text-xs uppercase tracking-widest text-slate-500 block mb-1">Habitat & Ecology</strong>
                       <span className="text-slate-300">{sp.habitat_and_ecology || ''}</span>
                     </div>
                   </div>
                 </div>
                 {sp.scientific_name && (
                   <div className="w-full md:w-48 shrink-0 flex items-center md:self-center">
                     <INatSpeciesImage 
                       scientificName={sp.scientific_name} 
                       className="w-full h-36 md:h-full rounded-xl"
                       aspectRatio="aspect-video md:aspect-[4/3]"
                     />
                   </div>
                 )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Sources */}
      {sources && sources.length > 0 && (
         <div className="pt-8 w-full block">
           <SourcesBar sources={sources} />
         </div>
      )}
    </div>
  );
}
