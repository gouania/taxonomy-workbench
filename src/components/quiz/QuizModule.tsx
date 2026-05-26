import { useState } from 'react';
import { GraduationCap, Loader2, CheckCircle2, XCircle, ArrowRight, ExternalLink, AlertCircle, MapPin, Globe, Search } from 'lucide-react';
import { inaturalistService, TaxonPhoto } from '../../services/inaturalistService';
import { geminiService } from '../../services/geminiService';
import { iNatObservation, QuizQuestionData, NavigationTarget } from '../../types';
import { SearchInput } from '../shared/SearchInput';
import { InfoCard } from '../shared/InfoCard';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';

interface QuizModuleProps {
  onNavigate: (target: NavigationTarget) => void;
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

export function QuizModule({ onNavigate }: QuizModuleProps) {
  const [targetTaxon, setTargetTaxon] = useState('');
  const [status, setStatus] = useState<'setup' | 'loading' | 'playing' | 'feedback'>('setup');
  const [observations, setObservations] = useState<iNatObservation[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestionData | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [distractorsMap, setDistractorsMap] = useState<Record<string, string[]>>({});
  
  // Geographic filters
  const [selectedPlace, setSelectedPlace] = useState<{ id: number | null; name: string }>({ id: null, name: 'Global' });
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<{ id: number; name: string }[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);

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

  const startQuiz = async () => {
    if (!targetTaxon.trim()) return;
    setStatus('loading');
    setErrorText(null);
    try {
      const taxonId = await inaturalistService.getTaxonId(targetTaxon);
      if (!taxonId) throw new Error("Taxon not found on iNaturalist. Please try a different name (e.g. Plantae, Quercus, Orchidaceae).");
      
      const obs = await inaturalistService.getQuizObservations(taxonId, 5, selectedPlace.id || undefined);
      if (obs.length === 0) {
        let msg = `No research-grade photos found for "${targetTaxon}"`;
        if (selectedPlace.id) msg += ` in ${selectedPlace.name}`;
        msg += ". Try selecting a broader geographic region or search a more common taxon.";
        throw new Error(msg);
      }
      
      // Batch generate all distractors at once to avoid hitting API Rate Limits over 5 iterations
      const uniqueTaxa = [...new Set(obs.map(o => o.taxon.name))];
      const batchMap = await geminiService.generateQuizDistractorsBatch(uniqueTaxa);
      setDistractorsMap(batchMap);
      
      setObservations(obs);
      setCurrentIndex(0);
      await loadQuestion(obs[0], batchMap);
    } catch (error: any) {
      setErrorText(error.message || "An error occurred while setting up the quiz.");
      setStatus('setup');
    }
  };

  const loadQuestion = async (obs: iNatObservation, dMap?: Record<string, string[]>) => {
    setStatus('loading');
    setErrorText(null);
    try {
      const correct = obs.taxon.name;
      const cachedDistractors = (dMap || distractorsMap)[correct] || [];
      const distractors = cachedDistractors.length > 0 ? cachedDistractors : await geminiService.generateQuizDistractors(correct);
      
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
      setTargetTaxon('');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-lg">
          <GraduationCap size={24} className="text-fuchsia-400" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Field ID Challenge</h1>
          <p className="text-slate-400">Train your eye using real Research-Grade iNaturalist observations.</p>
        </div>
      </div>

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
              placeholder="e.g. Pinaceae, Acer, Orchidaceae..."
            />

            <div className="border-t border-slate-800/80 pt-6 mt-6">
              <div className="flex items-center gap-2 mb-3">
                <MapPin size={18} className="text-fuchsia-400" />
                <h4 className="text-sm font-semibold text-slate-200">Geographic Preference (Optional)</h4>
              </div>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                Narrow down observations to a continent, nation, or custom state/county to practice localized field identification.
              </p>

              {/* Quick Preset Pills */}
              <div className="flex flex-wrap gap-2 mb-4">
                {QUICK_PLACES.map((place) => {
                  const isSelected = selectedPlace.id === place.id && (place.id !== null || selectedPlace.name === 'Global');
                  return (
                    <button
                      key={place.name}
                      type="button"
                      onClick={() => {
                        setSelectedPlace({ id: place.id, name: place.name.replace(/^[^\s]+\s+/, '') });
                        setPlaceQuery('');
                        setPlaceResults([]);
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
                  type="text"
                  value={placeQuery}
                  onChange={(e) => handlePlaceSearch(e.target.value)}
                  placeholder="Or search custom region (e.g. Costa Rica, Texas)..."
                  className="w-full bg-slate-950 border border-slate-850 hover:border-slate-700 focus:border-fuchsia-500/50 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-300 placeholder-slate-600 focus:outline-none transition-colors"
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
                          setSelectedPlace({ id: p.id, name: p.name });
                          setPlaceResults([]);
                          setPlaceQuery('');
                        }}
                        className="w-full p-2.5 text-left text-xs text-slate-300 hover:bg-slate-805/80 hover:text-white transition-colors border-b border-slate-800/40 last:border-b-0 cursor-pointer flex items-center gap-2"
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
                <span className="text-slate-500 font-mono">Current Region:</span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-850 text-fuchsia-400 font-medium">
                  {selectedPlace.id === null ? <Globe size={12} /> : <MapPin size={12} />}
                  {selectedPlace.name}
                </span>
                {selectedPlace.id !== null && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlace({ id: null, name: 'Global' });
                    }}
                    className="text-[10px] text-fuchsia-500 hover:text-fuchsia-400 hover:underline transition-all cursor-pointer font-medium ml-1"
                  >
                    Reset to global
                  </button>
                )}
              </div>
            </div>
          </InfoCard>
        </div>
      )}

      {status === 'loading' && (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <Loader2 size={48} className="text-fuchsia-500 animate-spin" />
          <p className="text-slate-400 text-center">
            Curating research-grade field observations & generating diagnostic options...
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
              
              let btnClass = "bg-slate-900/40 border-slate-800 hover:bg-slate-800/60 hover:border-slate-600 text-slate-200 cursor-pointer";
              
              if (status === 'feedback') {
                if (isCorrect) btnClass = "bg-emerald-950/30 border-emerald-500/70 text-emerald-100";
                else if (isSelected && !isCorrect) btnClass = "bg-rose-950/30 border-rose-500/70 text-rose-100";
                else btnClass = "bg-slate-950/20 border-slate-900 text-slate-600 opacity-40 cursor-default";
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
                        onClick={() => onNavigate({ module: 'profiles', query: currentQuestion.correctAnswer })}
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
