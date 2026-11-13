import { useState, useEffect, useRef } from 'react';
import { GraduationCap, Loader2, CheckCircle2, XCircle, ArrowRight, ExternalLink, AlertCircle, MapPin, Globe, Search } from 'lucide-react';
import { inaturalistService, QuizGeographicFilter, TaxonPhoto } from '../../services/inaturalistService';
import { geminiService } from '../../services/geminiService';
import { iNatObservation, QuizQuestionData, NavigationTarget, PlaceRef, PlaceScopeType } from '../../types';
import { SearchInput } from '../shared/SearchInput';
import { InfoCard } from '../shared/InfoCard';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { PlaceContextChip } from '../shared/PlaceContextChip';

interface QuizModuleProps {
  onNavigate: (target: NavigationTarget) => void;
  initialTaxon?: string;
  initialLocality?: string;
  initialPlace?: PlaceRef;
  navRequestId?: number;
}

interface SelectedQuizPlace {
  kind: 'global' | 'place' | 'point';
  id: number | null;
  name: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  scopeType?: PlaceScopeType;
}

const QUICK_PLACES = [
  { name: '🌐 Global', id: null },
  { name: '🍁 North America', id: 97394 },
  { name: '🏰 Europe', id: 97395 },
  { name: '🇬🇧 United Kingdom', id: 6857 },
  { name: '☀️ California', id: 14 },
  { name: '🦘 Australia', id: 6744 },
  { name: '🇿🇦 South Africa', id: 6986 },
];

const QUICK_TAXA = [
  { label: '🌱 All Plants', query: 'Plantae' },
  { label: '🌸 Flowering Plants', query: 'Angiospermae' },
  { label: '🌿 Vascular Plants', query: 'Tracheophyta' },
  { label: '🌲 Conifers', query: 'Pinophyta' },
  { label: '🌿 Ferns', query: 'Polypodiopsida' },
];

export function QuizModule({
  onNavigate,
  initialTaxon,
  initialLocality,
  initialPlace,
  navRequestId,
}: QuizModuleProps) {
  const [targetTaxon, setTargetTaxon] = useState(initialTaxon || 'Plantae');
  const [status, setStatus] = useState<'setup' | 'loading' | 'playing' | 'feedback'>('setup');
  const [observations, setObservations] = useState<iNatObservation[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestionData | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Geographic filters
  const [selectedPlace, setSelectedPlace] = useState<SelectedQuizPlace>({
    kind: 'global',
    id: null,
    name: 'Global',
  });
  const [activePlaceRef, setActivePlaceRef] = useState<PlaceRef | null>(initialPlace || null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<{ id: number; name: string }[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [isResolvingPlace, setIsResolvingPlace] = useState(false);
  const [placeFilterNotice, setPlaceFilterNotice] = useState<string | null>(null);
  const [placeResolutionError, setPlaceResolutionError] = useState<string | null>(null);

  const placeSearchInputRef = useRef<HTMLInputElement | null>(null);
  const resolveRequestIdRef = useRef<number>(0);

  useEffect(() => {
    if (initialTaxon) {
      setTargetTaxon(initialTaxon);
    }
  }, [initialTaxon]);

  useEffect(() => {
    const incomingName = (initialPlace?.displayName || initialLocality || '').trim();
    if (!incomingName && !initialPlace) return;

    const reqId = ++resolveRequestIdRef.current;

    // Reset any in-progress quiz back to setup so the user starts cleanly with the resolved place filter
    setStatus('setup');
    setObservations([]);
    setCurrentIndex(0);
    setCurrentQuestion(null);
    setSelectedAnswer(null);
    setFeedbackText('');
    setDistractorPhoto(null);
    setErrorText(null);
    setPlaceResults([]);
    setPlaceResolutionError(null);
    setPlaceFilterNotice(null);

    if (initialPlace) {
      setActivePlaceRef(initialPlace);
    } else if (incomingName) {
      setActivePlaceRef({ displayName: incomingName, scopeType: 'unknown' });
    }

    // 1. Pre-resolved iNaturalist boundary ID
    if (initialPlace?.providerPlaceId) {
      setIsResolvingPlace(false);
      setSelectedPlace({
        kind: 'place',
        id: initialPlace.providerPlaceId,
        name: initialPlace.providerPlaceName || initialPlace.displayName,
        lat: initialPlace.coordinates?.latitude,
        lng: initialPlace.coordinates?.longitude,
        scopeType: initialPlace.scopeType,
      });
      setPlaceFilterNotice(
        `iNaturalist place filter applied (${initialPlace.providerPlaceName || initialPlace.displayName}).`
      );
      return;
    }

    // 2. Explicit coordinate point query -> use 35 km point filter
    if (initialPlace?.scopeType === 'point' && initialPlace.coordinates) {
      setIsResolvingPlace(false);
      setSelectedPlace({
        kind: 'point',
        id: null,
        name: initialPlace.displayName,
        lat: initialPlace.coordinates.latitude,
        lng: initialPlace.coordinates.longitude,
        radiusKm: 35,
        scopeType: 'point',
      });
      setPlaceFilterNotice(
        `Filtered to iNaturalist observations within 35 km of ${initialPlace.displayName}.`
      );
      return;
    }

    // 3. Auto-resolve place boundary on iNaturalist before allowing quiz start
    setIsResolvingPlace(true);
    (async () => {
      try {
        const matches = await inaturalistService.searchPlacesDetailed(incomingName);
        if (resolveRequestIdRef.current !== reqId) return;

        if (matches.length > 0) {
          const top = matches[0];
          const updatedPlaceRef: PlaceRef = {
            ...(initialPlace || { displayName: incomingName, scopeType: 'locality' }),
            displayName: initialPlace?.displayName || top.display_name || top.name,
            providerPlaceId: top.id,
            providerPlaceName: top.display_name || top.name,
            boundingBox: initialPlace?.boundingBox || top.bounding_box,
            coordinates:
              initialPlace?.coordinates ||
              (typeof top.latitude === 'number' && typeof top.longitude === 'number'
                ? { latitude: top.latitude, longitude: top.longitude }
                : undefined),
          };
          setActivePlaceRef(updatedPlaceRef);
          setSelectedPlace({
            kind: 'place',
            id: top.id,
            name: top.display_name || top.name,
            lat: top.latitude,
            lng: top.longitude,
            scopeType: updatedPlaceRef.scopeType,
          });
          setPlaceFilterNotice(`Resolved and applied iNaturalist boundary: ${top.display_name || top.name}.`);
        } else if (initialPlace?.coordinates) {
          setSelectedPlace({
            kind: 'point',
            id: null,
            name: initialPlace.displayName,
            lat: initialPlace.coordinates.latitude,
            lng: initialPlace.coordinates.longitude,
            radiusKm: 35,
            scopeType: initialPlace.scopeType,
          });
          setPlaceFilterNotice(
            initialPlace.scopeType === 'region'
              ? `Couldn’t match an iNaturalist boundary for ${initialPlace.displayName}; applied a 35 km centre-point filter instead.`
              : `Applied a 35 km filter around ${initialPlace.displayName}.`
          );
        } else {
          setPlaceResolutionError(
            `Couldn’t match "${incomingName}" to an iNaturalist place boundary. Search for a nearby region below or clear to practice globally.`
          );
        }
      } catch {
        if (resolveRequestIdRef.current !== reqId) return;
        if (initialPlace?.coordinates) {
          setSelectedPlace({
            kind: 'point',
            id: null,
            name: initialPlace.displayName,
            lat: initialPlace.coordinates.latitude,
            lng: initialPlace.coordinates.longitude,
            radiusKm: 35,
            scopeType: initialPlace.scopeType,
          });
          setPlaceFilterNotice(
            `Boundary lookup failed; using a 35 km centre-point filter around ${initialPlace.displayName}.`
          );
        } else {
          setPlaceResolutionError(
            `Couldn’t resolve an iNaturalist filter for "${incomingName}". Choose a place below or reset to Global.`
          );
        }
      } finally {
        if (resolveRequestIdRef.current === reqId) {
          setIsResolvingPlace(false);
        }
      }
    })();
  }, [initialLocality, initialPlace, navRequestId]);

  // Feedback state
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState<string>('');
  const [isGeneratingFeedback, setIsGeneratingFeedback] = useState(false);
  const [distractorPhoto, setDistractorPhoto] = useState<TaxonPhoto | null>(null);

  const handlePlaceSearch = async (val: string) => {
    setPlaceQuery(val);
    if (val.trim().length < 3) {
      setPlaceResults([]);
      return;
    }
    setSearchingPlaces(true);
    try {
      const results = await inaturalistService.searchPlaces(val);
      setPlaceResults(results);
    } catch (e) {
      console.error(e);
    } finally {
      setSearchingPlaces(false);
    }
  };

  const resetToGlobal = () => {
    setSelectedPlace({ kind: 'global', id: null, name: 'Global' });
    setActivePlaceRef(null);
    setPlaceQuery('');
    setPlaceResults([]);
    setPlaceFilterNotice(null);
    setPlaceResolutionError(null);
  };

  const startQuiz = async () => {
    if (!targetTaxon.trim() || isResolvingPlace || placeResolutionError) return;
    setStatus('loading');
    setErrorText(null);
    try {
      const taxonId = await inaturalistService.getTaxonId(targetTaxon);
      if (!taxonId) {
        throw new Error(
          'Taxon not found on iNaturalist. Please try a different name (e.g. Plantae, Quercus, Orchidaceae).'
        );
      }

      const geoFilter: QuizGeographicFilter | undefined =
        selectedPlace.kind === 'place' && selectedPlace.id
          ? { placeId: selectedPlace.id }
          : selectedPlace.kind === 'point' &&
            typeof selectedPlace.lat === 'number' &&
            typeof selectedPlace.lng === 'number'
          ? { lat: selectedPlace.lat, lng: selectedPlace.lng, radiusKm: selectedPlace.radiusKm || 35 }
          : undefined;

      const obs = await inaturalistService.getQuizObservations(taxonId, 5, geoFilter);
      if (obs.length === 0) {
        let msg = `No Research Grade observations with photos found for "${targetTaxon}"`;
        if (selectedPlace.kind === 'place') msg += ` within ${selectedPlace.name}`;
        else if (selectedPlace.kind === 'point') {
          msg += ` within ${selectedPlace.radiusKm || 35} km of ${selectedPlace.name}`;
        }
        msg += '. Try selecting a broader region, a wider plant group (such as Plantae), or Global.';
        throw new Error(msg);
      }

      setObservations(obs);
      setCurrentIndex(0);
      await loadQuestion(obs[0]);
    } catch (error: any) {
      setErrorText(error.message || 'An error occurred while setting up the quiz.');
      setStatus('setup');
    }
  };

  const loadQuestion = async (obs: iNatObservation) => {
    setStatus('loading');
    setErrorText(null);
    try {
      const correct = obs.taxon.name;
      const distractors = await geminiService.generateQuizDistractors(correct);
      
      // Shuffle options ensuring uniqueness
      const filteredDistractors = (distractors || []).filter(d => d !== correct);
      const options = [correct, ...filteredDistractors].slice(0, 4).sort(() => Math.random() - 0.5);
      
      setCurrentQuestion({ observation: obs, options, correctAnswer: correct });
      setSelectedAnswer(null);
      setFeedbackText('');
      setDistractorPhoto(null);
      setStatus('playing');
    } catch (error: any) {
      console.error(error);
      setErrorText(error.message || "Failed to generate quiz question and distractors.");
      setStatus('setup');
    }
  };

  const handleAnswer = async (answer: string) => {
    setSelectedAnswer(answer);
    setStatus('feedback');
    
    if (answer !== currentQuestion?.correctAnswer) {
      setIsGeneratingFeedback(true);
      
      // Fetch distractor photo asynchronously
      inaturalistService.getTaxonPhotos(answer).then((photos) => {
        if (photos && photos.length > 0) {
          setDistractorPhoto(photos[0]);
        }
      }).catch((e) => console.error("Error fetching distractor photo:", e));

      try {
        const explanation = await geminiService.evaluateQuizAnswer(currentQuestion!.correctAnswer, answer);
        setFeedbackText(explanation);
      } catch (e) {
        setFeedbackText("Unable to generate custom feedback comparing these two species.");
      } finally {
        setIsGeneratingFeedback(false);
      }
    }
  };

  const nextQuestion = async () => {
    const nextIdx = currentIndex + 1;
    if (nextIdx < observations.length) {
      setCurrentIndex(nextIdx);
      await loadQuestion(observations[nextIdx]);
    } else {
      // End of batch, go back to setup
      setStatus('setup');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-lg">
          <GraduationCap size={24} className="text-fuchsia-400" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Field ID Challenge</h1>
          <p className="text-slate-400">Practice identification using Research Grade observations with photos from iNaturalist.</p>
        </div>
      </div>

      {(activePlaceRef || selectedPlace.kind !== 'global') && (
        <div className="mb-6">
          <PlaceContextChip
            place={
              activePlaceRef || {
                displayName: selectedPlace.name,
                scopeType: selectedPlace.scopeType || 'locality',
                providerPlaceId: selectedPlace.id || undefined,
                coordinates:
                  typeof selectedPlace.lat === 'number' && typeof selectedPlace.lng === 'number'
                    ? { latitude: selectedPlace.lat, longitude: selectedPlace.lng }
                    : undefined,
              }
            }
            onOpenOverview={() =>
              onNavigate({
                module: 'localities',
                ...(activePlaceRef ? { place: activePlaceRef } : {}),
                ...(activePlaceRef?.geographicScopeSummary || activePlaceRef?.providerPlaceId
                  ? { scrollBehavior: 'restore' as const }
                  : { query: activePlaceRef?.displayName || selectedPlace.name }),
              })
            }
            onChange={() => {
              setStatus('setup');
              setTimeout(() => placeSearchInputRef.current?.focus(), 40);
            }}
            onClear={resetToGlobal}
          />
        </div>
      )}

      {status === 'setup' && (
        <div className="space-y-6">
          {errorText && (
            <div className="bg-rose-950/30 border border-rose-900/50 rounded-2xl p-4 flex gap-3 items-start text-rose-300">
              <AlertCircle className="shrink-0 text-rose-400 mt-0.5" size={18} />
              <div>
                <div className="font-semibold text-white">Quiz Loading Error</div>
                <div className="text-sm">{errorText}</div>
              </div>
            </div>
          )}

          {placeResolutionError && (
            <div className="bg-amber-950/30 border border-amber-800/50 rounded-2xl p-4 flex gap-3 items-start text-amber-200 text-sm">
              <AlertCircle className="shrink-0 text-amber-400 mt-0.5" size={18} />
              <div className="flex-1">
                <p>{placeResolutionError}</p>
                <button
                  type="button"
                  onClick={resetToGlobal}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Use Global filter instead
                </button>
              </div>
            </div>
          )}

          <InfoCard className="bg-slate-900/60 border-fuchsia-900/30">
            <h3 className="text-lg font-semibold text-white mb-4">Select a Target Group</h3>
            <p className="text-slate-400 mb-6 text-sm leading-relaxed">
              Enter a Family, Genus, or broad botanical category (e.g., <code className="text-fuchsia-300">Asteraceae</code>, <code className="text-fuchsia-300">Quercus</code>, <code className="text-fuchsia-300">Pinaceae</code>). 
              Real field photos are pulled from iNaturalist, and Gemini generates custom options and questions to test diagnostic skills.
            </p>
            
            <div className="flex flex-wrap gap-2 mb-4">
              {QUICK_TAXA.map((taxa) => (
                <button
                  key={taxa.query}
                  type="button"
                  onClick={() => setTargetTaxon(taxa.query)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center cursor-pointer border ${
                    targetTaxon === taxa.query
                      ? 'bg-fuchsia-950/40 border-fuchsia-500/60 text-fuchsia-300 shadow-sm shadow-fuchsia-900/10'
                      : 'bg-slate-800/40 border-slate-800 hover:bg-slate-850 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  {taxa.label}
                </button>
              ))}
            </div>

            <SearchInput
              value={targetTaxon}
              onChange={setTargetTaxon}
              onSubmit={startQuiz}
              isLoading={isResolvingPlace}
              placeholder="e.g. Pinaceae, Acer, Orchidaceae..."
            />

            {isResolvingPlace && (
              <div className="mt-3 flex items-center gap-2 text-xs text-cyan-300">
                <Loader2 size={14} className="animate-spin" />
                <span>Resolving iNaturalist geographic filter before starting…</span>
              </div>
            )}

            <div className="border-t border-slate-800/80 pt-6 mt-6">
              <div className="flex items-center gap-2 mb-3">
                <MapPin size={18} className="text-fuchsia-400" />
                <h4 className="text-sm font-semibold text-slate-200">Geographic Filter</h4>
              </div>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Narrow observations to an iNaturalist boundary or 35 km point sample to practise localized field identification.
              </p>

              {/* Quick Preset Pills */}
              <div className="flex flex-wrap gap-2 mb-4">
                {QUICK_PLACES.map((place) => {
                  const isSelected =
                    place.id === null
                      ? selectedPlace.kind === 'global'
                      : selectedPlace.kind === 'place' && selectedPlace.id === place.id;
                  return (
                    <button
                      key={place.name}
                      type="button"
                      onClick={() => {
                        if (place.id === null) {
                          resetToGlobal();
                        } else {
                          const cleanName = place.name.replace(/^[^\s]+\s+/, '');
                          setSelectedPlace({ kind: 'place', id: place.id, name: cleanName });
                          setActivePlaceRef({
                            displayName: cleanName,
                            scopeType: 'region',
                            providerPlaceId: place.id,
                            providerPlaceName: cleanName,
                          });
                          setPlaceQuery('');
                          setPlaceResults([]);
                          setPlaceFilterNotice(null);
                          setPlaceResolutionError(null);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1 cursor-pointer border ${
                        isSelected
                          ? 'bg-fuchsia-950/40 border-fuchsia-500/60 text-fuchsia-300 shadow-sm shadow-fuchsia-900/10'
                          : 'bg-slate-800/40 border-slate-800 hover:bg-slate-850 hover:border-slate-700 text-slate-400'
                      }`}
                    >
                      {place.name}
                    </button>
                  );
                })}
              </div>

              {/* Advanced Custom Search */}
              <div className="relative max-w-md">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-500">
                  <Search size={14} />
                </div>
                <input
                  ref={placeSearchInputRef}
                  type="text"
                  value={placeQuery}
                  onChange={(e) => handlePlaceSearch(e.target.value)}
                  placeholder="Or search custom region (e.g. Costa Rica, Texas)..."
                  className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-fuchsia-500/50 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-300 placeholder-slate-600 focus:outline-none transition-colors"
                />
                
                {searchingPlaces && (
                  <div className="absolute right-3 inset-y-0 flex items-center">
                    <Loader2 size={12} className="animate-spin text-fuchsia-400" />
                  </div>
                )}

                {placeResults.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1.5 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl z-20 max-h-48 overflow-y-auto">
                    {placeResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedPlace({ kind: 'place', id: p.id, name: p.name });
                          setActivePlaceRef({
                            displayName: p.name,
                            scopeType: 'locality',
                            providerPlaceId: p.id,
                            providerPlaceName: p.name,
                          });
                          setPlaceResults([]);
                          setPlaceQuery('');
                          setPlaceFilterNotice(`Resolved and applied iNaturalist boundary: ${p.name}.`);
                          setPlaceResolutionError(null);
                        }}
                        className="w-full p-2.5 text-left text-xs text-slate-300 hover:bg-slate-800/80 hover:text-white transition-colors border-b border-slate-800/40 last:border-b-0 cursor-pointer flex items-center gap-2"
                      >
                        <MapPin size={12} className="text-slate-500 shrink-0" />
                        <span>{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Filter Display Badge */}
              <div className="flex flex-wrap items-center gap-2 mt-4 text-xs">
                <span className="text-slate-500 font-mono">Active filter:</span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-fuchsia-400 font-medium">
                  {selectedPlace.kind === 'global' ? <Globe size={12} /> : <MapPin size={12} />}
                  {selectedPlace.kind === 'point'
                    ? `${selectedPlace.name} (${selectedPlace.radiusKm || 35} km radius)`
                    : selectedPlace.name}
                </span>
                {selectedPlace.kind !== 'global' && (
                  <button
                    type="button"
                    onClick={resetToGlobal}
                    className="text-[10px] text-fuchsia-500 hover:text-fuchsia-400 hover:underline transition-all cursor-pointer font-medium ml-1"
                  >
                    Reset to global
                  </button>
                )}
              </div>

              {placeFilterNotice && (
                <p className="text-xs text-slate-400 mt-2">{placeFilterNotice}</p>
              )}
            </div>
          </InfoCard>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Loader2 size={48} className="text-fuchsia-500 animate-spin" />
          <p className="text-slate-400 text-center">
            Loading Research Grade observations with photos and preparing question options...
          </p>
        </div>
      )}

      {(status === 'playing' || status === 'feedback') && currentQuestion && (
        <div className="space-y-6">
          {/* Photo Gallery with scroll behavior */}
          <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
            <div className="flex overflow-x-auto gap-4 snap-x pb-2 scrollbar-thin scrollbar-thumb-slate-800">
              {currentQuestion.observation.photos.length === 0 ? (
                <div className="w-full h-64 flex items-center justify-center text-slate-500 italic">No images available for this observation</div>
              ) : (
                currentQuestion.observation.photos.map((photo, idx) => (
                  <div key={idx} className="relative shrink-0 w-full md:w-2/3 snap-center">
                    <img 
                      src={photo.url} 
                      alt="Field Specimen" 
                      className="w-full h-64 md:h-96 object-cover rounded-xl border border-slate-800"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute bottom-2 left-2 right-2 bg-black/75 backdrop-blur-md text-xs text-slate-300 p-2 rounded-lg border border-slate-800">
                      &copy; {photo.attribution}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="text-sm font-medium text-slate-400 flex justify-between items-center px-2">
            <span>Challenge {currentIndex + 1} of {observations.length}</span>
            <span className="text-fuchsia-400 italic font-serif">Identify this specimen:</span>
          </div>

          {/* Multiple Choice Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentQuestion.options.map((opt, idx) => {
              const isSelected = selectedAnswer === opt;
              const isCorrect = opt === currentQuestion.correctAnswer;
              
              let btnClass = "bg-slate-900/60 border-slate-800 hover:bg-slate-800 hover:border-slate-700 text-slate-200 hover:text-cyan-300 cursor-pointer";
              
              if (status === 'feedback') {
                if (isCorrect) btnClass = "bg-emerald-950/40 border-emerald-500/80 text-emerald-100 font-semibold";
                else if (isSelected && !isCorrect) btnClass = "bg-rose-950/40 border-rose-500/80 text-rose-100 font-semibold";
                else btnClass = "bg-slate-950/40 border-slate-900 text-slate-600 opacity-40 cursor-default";
              }

              return (
                <button
                  key={idx}
                  disabled={status === 'feedback'}
                  onClick={() => handleAnswer(opt)}
                  className={`p-4 rounded-xl border text-left font-serif text-lg transition-all flex justify-between items-center ${btnClass}`}
                >
                  <i>{opt}</i>
                  {status === 'feedback' && isCorrect && <CheckCircle2 className="text-emerald-400 shrink-0 ml-2" size={18} />}
                  {status === 'feedback' && isSelected && !isCorrect && <XCircle className="text-rose-400 shrink-0 ml-2" size={18} />}
                </button>
              );
            })}
          </div>

          {/* Feedback Panel */}
          {status === 'feedback' && (
            <div className="animate-in slide-in-from-bottom-4 duration-500">
              <InfoCard 
                highlight 
                className={selectedAnswer === currentQuestion.correctAnswer ? "border-emerald-500/50" : "border-rose-500/50"}
              >
                <div className="flex flex-col md:flex-row items-stretch justify-between gap-6">
                  <div className="space-y-4 flex-1 w-full flex flex-col justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-3">
                        {selectedAnswer === currentQuestion.correctAnswer ? (
                          <>
                            <CheckCircle2 className="text-emerald-400" />
                            Correct!
                          </>
                        ) : (
                          <>
                            <XCircle className="text-rose-400" />
                            Not quite.
                          </>
                        )}
                      </h3>
                      
                      {selectedAnswer === currentQuestion.correctAnswer ? (
                        <p className="text-slate-300 text-sm">
                          Superb job! You correctly identified this specimen as <i className="text-emerald-300 font-semibold">{currentQuestion.correctAnswer}</i>.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-slate-300 text-sm font-medium">
                            The correct answer is <i className="text-emerald-300 font-semibold">{currentQuestion.correctAnswer}</i>, not your guess of <i className="text-rose-300 font-semibold">{selectedAnswer}</i>.
                          </p>
                          {isGeneratingFeedback ? (
                            <div className="flex items-center gap-2 text-slate-400 text-sm animate-pulse">
                              <Loader2 size={14} className="animate-spin text-fuchsia-400" /> AI analyzing diagnostic differences...
                            </div>
                          ) : (
                            feedbackText && (
                              <div className="text-slate-300 text-sm bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                                <MarkdownRenderer content={feedbackText} />
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 pt-3 mt-3 border-t border-slate-800/50">
                      <a 
                        href={`https://www.inaturalist.org/observations/${currentQuestion.observation.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 bg-cyan-950/30 px-3 py-1.5 rounded-lg border border-cyan-900/50 transition-colors"
                      >
                        View original observation <ExternalLink size={12} />
                      </a>
                      
                      <button
                        onClick={() =>
                          onNavigate({
                            module: 'profiles',
                            query: currentQuestion.correctAnswer,
                            ...(selectedPlace.kind !== 'global'
                              ? {
                                  locality: activePlaceRef?.displayName || selectedPlace.name,
                                  place: activePlaceRef || undefined,
                                }
                              : {}),
                          })
                        }
                        className="text-xs flex items-center gap-1.5 text-fuchsia-400 hover:text-fuchsia-300 bg-fuchsia-950/30 px-3 py-1.5 rounded-lg border border-fuchsia-900/50 transition-colors"
                      >
                        Read Taxon Profile <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Visual Distractor Feedback */}
                  {selectedAnswer !== currentQuestion.correctAnswer && distractorPhoto && (
                    <div className="w-full md:w-48 shrink-0 space-y-2 self-center animate-in fade-in duration-300 bg-slate-950/35 p-3 rounded-2xl border border-slate-800/60">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">
                        What you guessed:
                      </div>
                      <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
                        <img 
                          src={distractorPhoto.url} 
                          alt={selectedAnswer!} 
                          className="w-full h-32 md:h-36 object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/85 backdrop-blur-sm p-1.5 border-t border-slate-800/50">
                          <p className="text-[9px] text-slate-400 truncate text-center">&copy; {distractorPhoto.attribution}</p>
                        </div>
                      </div>
                      <div className="text-xs font-serif italic text-rose-400 text-center truncate font-semibold">
                        {selectedAnswer}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center">
                    <button
                      onClick={nextQuestion}
                      className="w-full md:w-auto bg-white text-black px-6 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 shrink-0 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      {currentIndex + 1 < observations.length ? "Next Species" : "Finish Challenge"} <ArrowRight size={18} />
                    </button>
                  </div>
                </div>
              </InfoCard>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
