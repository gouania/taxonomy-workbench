import { 
  Leaf, 
  Microscope, 
  Key, 
  UserCircle, 
  AlertCircle, 
  BookOpen, 
  MapPin, 
  GraduationCap, 
  Star,
  ChevronDown,
  MoreHorizontal,
  X
} from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { GEMINI_MODEL } from './constants';
import { AuthoritiesModule } from './components/authorities/AuthoritiesModule';
import { IdentifyModule } from './components/identify/IdentifyModule';
import { ProfilesModule } from './components/profiles/ProfilesModule';
import { GuideModule } from './components/guide/GuideModule';
import { LocalitiesModule } from './components/localities/LocalitiesModule';
import { QuizModule } from './components/quiz/QuizModule';
import { BackToTop } from './components/shared/BackToTop';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { FavoritesDrawer } from './components/shared/FavoritesDrawer';
import { historyFavoritesService } from './services/historyFavoritesService';
import { syncRuntimeCacheNamespace } from './services/geminiService';
import { ModuleType, NavigationTarget, PlaceRef } from './types';

export default function App() {
  const [activeModule, setActiveModule] = useState<ModuleType>('landing');
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | null>(null);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  const moreMenuRef = useRef<HTMLDivElement>(null);
  const navCounterRef = useRef<number>(0);
  const localitiesScrollYRef = useRef<number>(0);
  const activeModuleRef = useRef<ModuleType>('landing');

  useEffect(() => {
    activeModuleRef.current = activeModule;
  }, [activeModule]);

  const [favoritesCount, setFavoritesCount] = useState<number>(() => 
    historyFavoritesService.getFavorites().length
  );
  const [isMobileMoreOpen, setIsMobileMoreOpen] = useState(false);

  // Sync browser cache namespace with active server-side model, thinking level, and prompt/schema version
  useEffect(() => {
    const controller = new AbortController();
    void syncRuntimeCacheNamespace(controller.signal);
    return () => controller.abort();
  }, []);

  // Keep header Bookmarks count synced whenever favorites are added or removed
  useEffect(() => {
    const syncFavorites = () => {
      setFavoritesCount(historyFavoritesService.getFavorites().length);
    };
    window.addEventListener('favorites-updated', syncFavorites);
    window.addEventListener('storage', syncFavorites);
    return () => {
      window.removeEventListener('favorites-updated', syncFavorites);
      window.removeEventListener('storage', syncFavorites);
    };
  }, []);

  // Unconditionally enforce dark theme and remove any legacy saved preference
  useEffect(() => {
    localStorage.removeItem('taxonomy_theme');
    document.documentElement.classList.remove('light-theme');
  }, []);

  // Close 'More' menus on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMoreMenuOpen(false);
        setIsMobileMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Listen to popstate (Browser Back/Forward navigation)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (activeModuleRef.current === 'localities') {
        localitiesScrollYRef.current = window.scrollY;
      }

      const historyState = event.state as NavigationTarget | null;
      const params = new URLSearchParams(window.location.search);
      const module = (historyState?.module || params.get('module')) as ModuleType;
      const query = historyState?.query ?? (params.get('q') || undefined);
      const mode = (historyState?.mode ?? (params.get('mode') as 'single' | 'compare')) || undefined;
      const locality = historyState?.locality ?? (params.get('loc') || undefined);
      const place = historyState?.place;
      const specimenContext = historyState?.specimenContext;
      const specimenRecord = historyState?.specimenRecord;
      const taxonConcept = historyState?.taxonConcept;
      const compareTaxa = historyState?.compareTaxa;

      if (module && ['profiles', 'identify', 'authorities', 'guide', 'localities', 'quiz'].includes(module)) {
        const shouldRestoreLocalities = module === 'localities';
        setActiveModule(module);
        setNavigationTarget({
          module,
          query,
          mode,
          locality,
          place,
          specimenContext,
          specimenRecord,
          taxonConcept,
          compareTaxa,
          navRequestId: ++navCounterRef.current,
          scrollBehavior: shouldRestoreLocalities ? 'restore' : 'top',
        });
        if (shouldRestoreLocalities) {
          requestAnimationFrame(() => {
            window.scrollTo({ top: localitiesScrollYRef.current, behavior: 'auto' });
          });
        }
      } else {
        setActiveModule('landing');
        setNavigationTarget(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    // Parse URL params for initial state
    const params = new URLSearchParams(window.location.search);
    const module = params.get('module') as ModuleType;
    const query = params.get('q');
    const mode = params.get('mode') as 'single' | 'compare' | undefined;
    const locality = params.get('loc') || undefined;

    if (module && ['profiles', 'identify', 'authorities', 'guide', 'localities', 'quiz'].includes(module)) {
      setActiveModule(module);
      if (query || locality) {
        const place: PlaceRef | undefined = locality
          ? { displayName: locality, scopeType: 'unknown' }
          : undefined;
        setNavigationTarget({
          module,
          query: query || undefined,
          mode,
          locality,
          place,
          navRequestId: ++navCounterRef.current,
        });
      }
    }
  }, []);

  const handleNavigate = (target: NavigationTarget) => {
    if (activeModule === 'localities' && target.module !== 'localities') {
      localitiesScrollYRef.current = window.scrollY;
    }

    const isReturningToPlaceOverview =
      target.module === 'localities' &&
      (target.scrollBehavior === 'restore' || (!target.query && !target.place && !target.locality));

    const enrichedTarget: NavigationTarget = {
      ...target,
      locality: target.place?.displayName || target.locality,
      navRequestId: ++navCounterRef.current,
      scrollBehavior: isReturningToPlaceOverview ? 'restore' : target.scrollBehavior || 'top',
    };

    setActiveModule(enrichedTarget.module);
    setNavigationTarget(enrichedTarget);
    setIsMoreMenuOpen(false);
    setIsMobileMoreOpen(false);

    if (isReturningToPlaceOverview) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: localitiesScrollYRef.current, behavior: 'auto' });
      });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Update URL and history state cleanly (preserve PlaceRef in state)
    const url = new URL(window.location.href);
    url.searchParams.set('module', enrichedTarget.module);
    if (enrichedTarget.query) url.searchParams.set('q', enrichedTarget.query);
    else url.searchParams.delete('q');
    if (enrichedTarget.mode) url.searchParams.set('mode', enrichedTarget.mode);
    else url.searchParams.delete('mode');
    if (enrichedTarget.locality) url.searchParams.set('loc', enrichedTarget.locality);
    else url.searchParams.delete('loc');
    window.history.pushState(enrichedTarget, '', url.toString());
  };

  const isMoreActive = activeModule === 'authorities' || activeModule === 'localities' || activeModule === 'quiz';

  return (
    <div className="min-h-screen font-sans bg-slate-950 text-slate-200 selection:bg-cyan-500/30">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl border-b bg-slate-950/80 border-slate-800/60 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Logo / Brand */}
          <button
            onClick={() => {
              setActiveModule('landing');
              setNavigationTarget(null);
              window.history.pushState({}, '', window.location.pathname);
            }}
            className="flex items-center gap-2.5 group cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-md bg-gradient-to-br from-cyan-600 to-teal-700 text-white transition-all">
              <Leaf size={18} />
            </div>
            <span className="font-display font-bold text-xl tracking-tight text-white group-hover:text-cyan-400">
              Taxonomy Workbench
            </span>
          </button>

          {/* Primary Navigation: Guides, Identify, Explore + More Dropdown */}
          <nav className="hidden md:flex items-center gap-1 p-1 rounded-xl border bg-slate-900/60 border-slate-800">
            
            {/* Primary 1: Guides (Primary Center of Gravity) */}
            <button
              onClick={() => handleNavigate({ module: 'guide' })}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                activeModule === 'guide'
                  ? 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <BookOpen size={16} /> Guides
            </button>

            {/* Primary 2: Identify */}
            <button
              onClick={() => handleNavigate({ module: 'identify' })}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                activeModule === 'identify'
                  ? 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Key size={16} /> Identify
            </button>

            {/* Primary 3: Explore Taxa */}
            <button
              onClick={() => handleNavigate({ module: 'profiles' })}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                activeModule === 'profiles'
                  ? 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Microscope size={16} /> Explore
            </button>

            {/* More Menu Dropdown: Authorities, Localities, Quiz */}
            <div className="relative" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                  isMoreActive
                    ? 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <span>More</span>
                <ChevronDown size={14} className={`transition-transform ${isMoreMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isMoreMenuOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-2xl shadow-2xl border p-1.5 z-50 animate-in fade-in duration-150 bg-slate-900 border-slate-800 text-slate-200">
                  <button
                    onClick={() => handleNavigate({ module: 'localities' })}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left ${
                      activeModule === 'localities'
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : 'hover:bg-slate-800'
                    }`}
                  >
                    <MapPin size={15} className="text-cyan-400 shrink-0" />
                    <div>
                      <div className="font-semibold">Places &amp; flora</div>
                      <div className="text-[10px] text-slate-400 font-normal">Habitats, plants &amp; workflows</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleNavigate({ module: 'authorities' })}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left ${
                      activeModule === 'authorities'
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : 'hover:bg-slate-800'
                    }`}
                  >
                    <UserCircle size={15} className="text-amber-400 shrink-0" />
                    <div>
                      <div className="font-semibold">Authorities</div>
                      <div className="text-[10px] text-slate-400 font-normal">Botanical author index</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleNavigate({ module: 'quiz' })}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left ${
                      activeModule === 'quiz'
                        ? 'bg-fuchsia-500/20 text-fuchsia-400'
                        : 'hover:bg-slate-800'
                    }`}
                  >
                    <GraduationCap size={15} className="text-fuchsia-400 shrink-0" />
                    <div>
                      <div className="font-semibold">Field Quiz</div>
                      <div className="text-[10px] text-slate-400 font-normal">Photo ID trainer</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

          </nav>

          {/* Right Utilities: Bookmarks */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setIsFavoritesOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer shadow-sm transition-all bg-slate-900/80 border-slate-800 text-slate-300 hover:text-amber-300 hover:bg-slate-800"
              title="View saved Field Bookmarks"
            >
              <Star size={15} className={favoritesCount > 0 ? 'fill-amber-400 text-amber-400' : 'text-slate-400'} />
              <span className="hidden sm:inline">Bookmarks</span>
              {favoritesCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-400 font-mono text-[11px] border border-amber-500/30 font-bold">
                  {favoritesCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="pb-24">

        {/* Landing Page with Guides Featured First */}
        <div className={activeModule === 'landing' ? 'block' : 'hidden'}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16 animate-in fade-in slide-in-from-bottom-3 duration-500">
            
            <div className="text-center max-w-3xl mx-auto mb-12">
              <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4 text-white">
                Taxonomy Workbench
              </h1>
              <p className="text-base sm:text-lg leading-relaxed text-slate-400">
                Explore plant diversity, build regional identification guides, and compare the diagnostic features that distinguish similar taxa.
              </p>
            </div>

            {/* Featured Primary Workspaces Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              
              {/* Card 1: Guides (Primary Center of Gravity) */}
              <button
                onClick={() => handleNavigate({ module: 'guide' })}
                className="group p-6 sm:p-7 rounded-2xl border text-left transition-all duration-200 cursor-pointer bg-slate-900/60 border-slate-800 hover:border-cyan-500/60 hover:shadow-xl hover:shadow-cyan-950/20"
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-5 border transition-colors bg-slate-800 border-slate-700 text-cyan-400 group-hover:border-cyan-500/40">
                  <BookOpen size={22} />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-display text-xl font-bold text-white">Guides</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-cyan-950/60 text-cyan-400 border border-cyan-800/40">
                    Primary
                  </span>
                </div>
                <p className="text-xs sm:text-sm leading-relaxed mb-4 text-slate-400">
                  Choose a plant group and locality to construct parallel dichotomous keys, diagnostic taxa profiles, and subset comparison matrices.
                </p>
                <span className="text-cyan-400 font-semibold text-xs flex items-center gap-1.5 group-hover:translate-x-1 transition-transform">
                  Open Field Guides →
                </span>
              </button>

              {/* Card 2: Identify */}
              <button
                onClick={() => handleNavigate({ module: 'identify' })}
                className="group p-6 sm:p-7 rounded-2xl border text-left transition-all duration-200 cursor-pointer bg-slate-900/60 border-slate-800 hover:border-emerald-500/60 hover:shadow-xl hover:shadow-emerald-950/20"
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-5 border transition-colors bg-slate-800 border-slate-700 text-emerald-400 group-hover:border-emerald-500/40">
                  <Key size={22} />
                </div>
                <h3 className="font-display text-xl font-bold mb-2 text-white">Identify</h3>
                <p className="text-xs sm:text-sm leading-relaxed mb-4 text-slate-400">
                  Identify a plant from its observable characters, find out what to examine next, and connect candidates to regional guides.
                </p>
                <span className="text-emerald-400 font-semibold text-xs flex items-center gap-1.5 group-hover:translate-x-1 transition-transform">
                  Identify plant →
                </span>
              </button>

              {/* Card 3: Explore */}
              <button
                onClick={() => handleNavigate({ module: 'profiles' })}
                className="group p-6 sm:p-7 rounded-2xl border text-left transition-all duration-200 cursor-pointer bg-slate-900/60 border-slate-800 hover:border-cyan-500/60 hover:shadow-xl hover:shadow-cyan-950/20"
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-5 border transition-colors bg-slate-800 border-slate-700 text-cyan-400 group-hover:border-cyan-500/40">
                  <Microscope size={22} />
                </div>
                <h3 className="font-display text-xl font-bold mb-2 text-white">Explore Taxa</h3>
                <p className="text-xs sm:text-sm leading-relaxed mb-4 text-slate-400">
                  Detailed botanical reference profiles with morphological diagnosis, confusable taxa, literature, and side-by-side comparison.
                </p>
                <span className="text-cyan-400 font-semibold text-xs flex items-center gap-1.5 group-hover:translate-x-1 transition-transform">
                  Explore Profiles →
                </span>
              </button>

            </div>

            {/* Secondary Destinations bar (More tools: Localities, Authorities, Quiz) */}
            <div className="p-4 rounded-2xl border border-slate-800 bg-slate-900/40 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-300">Additional Reference Modules:</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleNavigate({ module: 'localities' })}
                  className="bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 hover:border-slate-600 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer shadow-sm transition-all"
                >
                  <MapPin size={13} className="text-cyan-400" />
                  <span>Places &amp; flora</span>
                </button>
                <button
                  onClick={() => handleNavigate({ module: 'authorities' })}
                  className="bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 hover:border-slate-600 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer shadow-sm transition-all"
                >
                  <UserCircle size={13} className="text-amber-400" />
                  <span>Taxonomic Authorities</span>
                </button>
                <button
                  onClick={() => handleNavigate({ module: 'quiz' })}
                  className="bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 hover:border-slate-600 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer shadow-sm transition-all"
                >
                  <GraduationCap size={13} className="text-fuchsia-400" />
                  <span>Field Photo Quiz</span>
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Guides Module (Primary Workspace) */}
        <div className={activeModule === 'guide' ? 'block' : 'hidden'}>
          <ErrorBoundary>
            <GuideModule 
              onNavigate={handleNavigate} 
              initialTaxon={navigationTarget?.module === 'guide' ? navigationTarget.query : undefined}
              initialLocality={navigationTarget?.module === 'guide' ? navigationTarget.locality : undefined}
              initialPlace={navigationTarget?.module === 'guide' ? navigationTarget.place : undefined}
              initialSpecimenContext={navigationTarget?.module === 'guide' ? navigationTarget.specimenContext : undefined}
              initialSpecimenRecord={navigationTarget?.module === 'guide' ? navigationTarget.specimenRecord : undefined}
              initialTaxonConcept={navigationTarget?.module === 'guide' ? navigationTarget.taxonConcept : undefined}
              navRequestId={navigationTarget?.module === 'guide' ? navigationTarget.navRequestId : undefined}
            />
          </ErrorBoundary>
        </div>

        {/* Explore Module */}
        <div className={activeModule === 'profiles' ? 'block' : 'hidden'}>
          <ErrorBoundary>
            <ProfilesModule
              initialQuery={navigationTarget?.module === 'profiles' ? navigationTarget.query : undefined}
              initialMode={navigationTarget?.module === 'profiles' ? navigationTarget.mode : undefined}
              initialLocality={navigationTarget?.module === 'profiles' ? navigationTarget.locality : undefined}
              initialPlace={navigationTarget?.module === 'profiles' ? navigationTarget.place : undefined}
              initialCompareTaxa={navigationTarget?.module === 'profiles' ? navigationTarget.compareTaxa : undefined}
              initialSpecimenContext={navigationTarget?.module === 'profiles' ? navigationTarget.specimenContext : undefined}
              initialSpecimenRecord={navigationTarget?.module === 'profiles' ? navigationTarget.specimenRecord : undefined}
              navRequestId={navigationTarget?.module === 'profiles' ? navigationTarget.navRequestId : undefined}
              onNavigate={handleNavigate}
            />
          </ErrorBoundary>
        </div>

        {/* Identify Module */}
        <div className={activeModule === 'identify' ? 'block' : 'hidden'}>
          <ErrorBoundary>
            <IdentifyModule 
              onNavigate={handleNavigate} 
              initialLocality={navigationTarget?.module === 'identify' ? navigationTarget.locality : undefined}
              initialPlace={navigationTarget?.module === 'identify' ? navigationTarget.place : undefined}
              navRequestId={navigationTarget?.module === 'identify' ? navigationTarget.navRequestId : undefined}
            />
          </ErrorBoundary>
        </div>

        {/* Authorities Module (Under More) */}
        <div className={activeModule === 'authorities' ? 'block' : 'hidden'}>
          <ErrorBoundary>
            <AuthoritiesModule
              initialQuery={navigationTarget?.module === 'authorities' ? navigationTarget.query : undefined}
              onNavigate={handleNavigate}
            />
          </ErrorBoundary>
        </div>

        {/* Places & flora Module (Under More) */}
        <div className={activeModule === 'localities' ? 'block' : 'hidden'}>
          <ErrorBoundary>
            <LocalitiesModule 
              initialQuery={navigationTarget?.module === 'localities' ? navigationTarget.query : undefined}
              initialPlace={navigationTarget?.module === 'localities' ? navigationTarget.place : undefined}
              navRequestId={navigationTarget?.module === 'localities' ? navigationTarget.navRequestId : undefined}
              scrollBehavior={navigationTarget?.module === 'localities' ? navigationTarget.scrollBehavior : undefined}
              onNavigate={handleNavigate}
            />
          </ErrorBoundary>
        </div>

        {/* Quiz Module (Under More) */}
        <div className={activeModule === 'quiz' ? 'block' : 'hidden'}>
          <ErrorBoundary>
            <QuizModule 
              onNavigate={handleNavigate} 
              initialTaxon={navigationTarget?.module === 'quiz' ? navigationTarget.query : undefined}
              initialLocality={navigationTarget?.module === 'quiz' ? navigationTarget.locality : undefined}
              initialPlace={navigationTarget?.module === 'quiz' ? navigationTarget.place : undefined}
              navRequestId={navigationTarget?.module === 'quiz' ? navigationTarget.navRequestId : undefined}
            />
          </ErrorBoundary>
        </div>
      </main>

      {/* Mobile Navigation (Clean 4-item primary bar) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 backdrop-blur-xl border-t z-50 pb-safe print:hidden bg-slate-950/95 border-slate-800">
        <div className="flex justify-around p-2">
          <button
            onClick={() => handleNavigate({ module: 'guide' })}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors cursor-pointer ${
              activeModule === 'guide' ? 'text-cyan-400 font-bold' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <BookOpen size={20} />
            <span className="text-[10px] font-medium">Guides</span>
          </button>
          <button
            onClick={() => handleNavigate({ module: 'identify' })}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors cursor-pointer ${
              activeModule === 'identify' ? 'text-cyan-400 font-bold' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Key size={20} />
            <span className="text-[10px] font-medium">Identify</span>
          </button>
          <button
            onClick={() => handleNavigate({ module: 'profiles' })}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors cursor-pointer ${
              activeModule === 'profiles' ? 'text-cyan-400 font-bold' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Microscope size={20} />
            <span className="text-[10px] font-medium">Explore</span>
          </button>
          <button
            type="button"
            onClick={() => setIsMobileMoreOpen((v) => !v)}
            aria-expanded={isMobileMoreOpen}
            aria-label="More modules"
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors cursor-pointer ${
              isMoreActive || isMobileMoreOpen ? 'text-cyan-400 font-bold' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <MoreHorizontal size={20} />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* Mobile "More" Bottom Sheet (renders outside desktop-only nav so mobile users can reach every module) */}
      {isMobileMoreOpen && (
        <div
          data-testid="mobile-more-sheet"
          className="md:hidden fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm print:hidden"
          onClick={() => setIsMobileMoreOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Additional modules"
        >
          <div
            className="w-full rounded-t-2xl bg-slate-950 border-t border-slate-800 p-4 pb-20 space-y-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-1 pb-2 border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-300">Additional Modules</span>
              <button
                type="button"
                onClick={() => setIsMobileMoreOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                aria-label="Close menu"
              >
                <X size={16} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleNavigate({ module: 'localities' })}
              className={`w-full min-h-[48px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                activeModule === 'localities'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'bg-slate-900/70 text-slate-200 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <MapPin size={18} className="text-cyan-400 shrink-0" />
              <div>
                <div className="text-sm font-semibold">Places &amp; flora</div>
                <div className="text-xs text-slate-400">Habitats, characteristic plants, and local workflows</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleNavigate({ module: 'authorities' })}
              className={`w-full min-h-[48px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                activeModule === 'authorities'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'bg-slate-900/70 text-slate-200 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <UserCircle size={18} className="text-amber-400 shrink-0" />
              <div>
                <div className="text-sm font-semibold">Authorities</div>
                <div className="text-xs text-slate-400">Botanical author index and abbreviations</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleNavigate({ module: 'quiz' })}
              className={`w-full min-h-[48px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                activeModule === 'quiz'
                  ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30'
                  : 'bg-slate-900/70 text-slate-200 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <GraduationCap size={18} className="text-fuchsia-400 shrink-0" />
              <div>
                <div className="text-sm font-semibold">Field Quiz</div>
                <div className="text-xs text-slate-400">Photo identification trainer</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t py-8 text-center text-sm print:hidden mb-16 md:mb-0 bg-slate-950 border-slate-900 text-slate-500">
        <p className="mb-2">Taxonomy Workbench &bull; Developed by Daniel Cahen</p>
        <p className="mb-4 text-xs opacity-80">Content generated using Gemini 4 Hydrogen</p>
        <p className="text-xs max-w-2xl mx-auto px-4 leading-relaxed">
          Disclaimer: This tool uses AI to generate taxonomic information. Always check literature and specimens for critical identifications.
        </p>
      </footer>

      <BackToTop />

      <FavoritesDrawer
        isOpen={isFavoritesOpen}
        onClose={() => setIsFavoritesOpen(false)}
        onNavigate={handleNavigate}
      />
    </div>
  );
}
