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
  Sun,
  Moon,
  ChevronDown,
  MoreHorizontal
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
import { ModuleType, NavigationTarget } from './types';

export default function App() {
  const [activeModule, setActiveModule] = useState<ModuleType>('landing');
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | null>(null);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isLightMode, setIsLightMode] = useState<boolean>(() => {
    return localStorage.getItem('taxonomy_theme') === 'light';
  });

  const moreMenuRef = useRef<HTMLDivElement>(null);

  const [favoritesCount, setFavoritesCount] = useState<number>(() => 
    historyFavoritesService.getFavorites().length
  );

  useEffect(() => {
    const updateCount = () => {
      setFavoritesCount(historyFavoritesService.getFavorites().length);
    };
    window.addEventListener('favorites-updated', updateCount);
    return () => window.removeEventListener('favorites-updated', updateCount);
  }, []);

  // Sync theme
  useEffect(() => {
    if (isLightMode) {
      document.documentElement.classList.add('light-theme');
      localStorage.setItem('taxonomy_theme', 'light');
    } else {
      document.documentElement.classList.remove('light-theme');
      localStorage.setItem('taxonomy_theme', 'dark');
    }
  }, [isLightMode]);

  // Close 'More' dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Listen to popstate (Browser Back/Forward navigation)
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const module = params.get('module') as ModuleType;
      const query = params.get('q') || undefined;
      const mode = (params.get('mode') as 'single' | 'compare') || undefined;
      const locality = params.get('loc') || undefined;

      if (module && ['profiles', 'identify', 'authorities', 'guide', 'localities', 'quiz'].includes(module)) {
        setActiveModule(module);
        setNavigationTarget({ module, query, mode, locality });
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
        setNavigationTarget({ module, query: query || undefined, mode, locality });
      }
    }
  }, []);

  const handleNavigate = (target: NavigationTarget) => {
    setActiveModule(target.module);
    setNavigationTarget(target);
    setIsMoreMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set('module', target.module);
    if (target.query) url.searchParams.set('q', target.query);
    else url.searchParams.delete('q');
    if (target.mode) url.searchParams.set('mode', target.mode);
    else url.searchParams.delete('mode');
    if (target.locality) url.searchParams.set('loc', target.locality);
    else url.searchParams.delete('loc');
    window.history.pushState({}, '', url.toString());
  };

  const isMoreActive = activeModule === 'authorities' || activeModule === 'localities' || activeModule === 'quiz';

  return (
    <div className={`min-h-screen font-sans transition-colors duration-200 ${
      isLightMode 
        ? 'bg-stone-100 text-stone-900 selection:bg-teal-200' 
        : 'bg-slate-950 text-slate-200 selection:bg-cyan-500/30'
    }`}>
      {/* Header */}
      <header className={`sticky top-0 z-50 backdrop-blur-xl border-b print:hidden transition-colors ${
        isLightMode
          ? 'bg-stone-50/90 border-stone-200'
          : 'bg-slate-950/80 border-slate-800/60'
      }`}>
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
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-md transition-all ${
              isLightMode ? 'bg-emerald-700 text-white' : 'bg-gradient-to-br from-cyan-600 to-teal-700 text-white'
            }`}>
              <Leaf size={18} />
            </div>
            <span className={`font-display font-bold text-xl tracking-tight ${
              isLightMode ? 'text-stone-900' : 'text-white group-hover:text-cyan-400'
            }`}>
              Taxonomy Workbench
            </span>
          </button>

          {/* Primary Navigation: Guides, Identify, Explore + More Dropdown */}
          <nav className={`hidden md:flex items-center gap-1 p-1 rounded-xl border ${
            isLightMode ? 'bg-stone-200/60 border-stone-300' : 'bg-slate-900/60 border-slate-800'
          }`}>
            
            {/* Primary 1: Guides (Primary Center of Gravity) */}
            <button
              onClick={() => handleNavigate({ module: 'guide' })}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                activeModule === 'guide'
                  ? isLightMode
                    ? 'bg-white text-emerald-800 shadow-sm border border-stone-300'
                    : 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700'
                  : isLightMode
                  ? 'text-stone-600 hover:text-stone-900 hover:bg-stone-200'
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
                  ? isLightMode
                    ? 'bg-white text-emerald-800 shadow-sm border border-stone-300'
                    : 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700'
                  : isLightMode
                  ? 'text-stone-600 hover:text-stone-900 hover:bg-stone-200'
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
                  ? isLightMode
                    ? 'bg-white text-emerald-800 shadow-sm border border-stone-300'
                    : 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700'
                  : isLightMode
                  ? 'text-stone-600 hover:text-stone-900 hover:bg-stone-200'
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
                    ? isLightMode
                      ? 'bg-white text-emerald-800 shadow-sm border border-stone-300'
                      : 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700'
                    : isLightMode
                    ? 'text-stone-600 hover:text-stone-900 hover:bg-stone-200'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <span>More</span>
                <ChevronDown size={14} className={`transition-transform ${isMoreMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isMoreMenuOpen && (
                <div className={`absolute right-0 mt-2 w-52 rounded-2xl shadow-2xl border p-1.5 z-50 animate-in fade-in duration-150 ${
                  isLightMode ? 'bg-white border-stone-300 text-stone-800' : 'bg-slate-900 border-slate-800 text-slate-200'
                }`}>
                  <button
                    onClick={() => handleNavigate({ module: 'localities' })}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left ${
                      activeModule === 'localities'
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : isLightMode ? 'hover:bg-stone-100' : 'hover:bg-slate-800'
                    }`}
                  >
                    <MapPin size={15} className="text-cyan-400 shrink-0" />
                    <div>
                      <div className="font-semibold">Localities</div>
                      <div className="text-[10px] text-slate-400 font-normal">Ecological zonation & floras</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleNavigate({ module: 'authorities' })}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left ${
                      activeModule === 'authorities'
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : isLightMode ? 'hover:bg-stone-100' : 'hover:bg-slate-800'
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
                        : isLightMode ? 'hover:bg-stone-100' : 'hover:bg-slate-800'
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

          {/* Right Utilities: Theme toggle + Bookmarks */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Outdoor Light Theme Toggle */}
            <button
              type="button"
              onClick={() => setIsLightMode(!isLightMode)}
              className={`p-2 rounded-xl border text-xs transition-colors cursor-pointer ${
                isLightMode 
                  ? 'bg-stone-200 border-stone-300 text-stone-700 hover:text-stone-900' 
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
              }`}
              title={isLightMode ? 'Switch to Dark Mode' : 'Switch to Outdoor Reading Light Theme'}
            >
              {isLightMode ? <Moon size={16} /> : <Sun size={16} className="text-amber-400" />}
            </button>

            {/* Field Bookmarks */}
            <button
              onClick={() => setIsFavoritesOpen(true)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer shadow-sm transition-all ${
                isLightMode 
                  ? 'bg-stone-200/80 border-stone-300 text-stone-800 hover:bg-stone-300' 
                  : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:text-amber-300 hover:bg-slate-800'
              }`}
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
              <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
                Taxonomy Workbench
              </h1>
              <p className={`text-base sm:text-lg leading-relaxed ${isLightMode ? 'text-stone-600' : 'text-slate-400'}`}>
                Build regional identification guides, key out unknown specimens, and run decisive morphological comparisons between candidate taxa in the field.
              </p>
            </div>

            {/* Featured Primary Workspaces Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              
              {/* Card 1: Guides (Primary Center of Gravity) */}
              <button
                onClick={() => handleNavigate({ module: 'guide' })}
                className={`group p-6 sm:p-7 rounded-2xl border text-left transition-all duration-200 cursor-pointer ${
                  isLightMode
                    ? 'bg-white border-stone-200 hover:border-emerald-600 hover:shadow-lg'
                    : 'bg-slate-900/60 border-slate-800 hover:border-cyan-500/60 hover:shadow-xl hover:shadow-cyan-950/20'
                }`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-5 border transition-colors ${
                  isLightMode
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-slate-800 border-slate-700 text-cyan-400 group-hover:border-cyan-500/40'
                }`}>
                  <BookOpen size={22} />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-display text-xl font-bold">Guides</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-cyan-950/60 text-cyan-400 border border-cyan-800/40">
                    Primary
                  </span>
                </div>
                <p className={`text-xs sm:text-sm leading-relaxed mb-4 ${isLightMode ? 'text-stone-600' : 'text-slate-400'}`}>
                  Choose a plant group and locality to construct parallel dichotomous keys, diagnostic taxa profiles, and subset comparison matrices.
                </p>
                <span className="text-cyan-400 font-semibold text-xs flex items-center gap-1.5 group-hover:translate-x-1 transition-transform">
                  Open Field Guides →
                </span>
              </button>

              {/* Card 2: Identify */}
              <button
                onClick={() => handleNavigate({ module: 'identify' })}
                className={`group p-6 sm:p-7 rounded-2xl border text-left transition-all duration-200 cursor-pointer ${
                  isLightMode
                    ? 'bg-white border-stone-200 hover:border-emerald-600 hover:shadow-lg'
                    : 'bg-slate-900/60 border-slate-800 hover:border-emerald-500/60 hover:shadow-xl hover:shadow-emerald-950/20'
                }`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-5 border transition-colors ${
                  isLightMode
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-slate-800 border-slate-700 text-emerald-400 group-hover:border-emerald-500/40'
                }`}>
                  <Key size={22} />
                </div>
                <h3 className="font-display text-xl font-bold mb-2">Identify Plants</h3>
                <p className={`text-xs sm:text-sm leading-relaxed mb-4 ${isLightMode ? 'text-stone-600' : 'text-slate-400'}`}>
                  Holding an unfamiliar plant? Describe its morphology and locality in narrative text to determine likely families, then key out exact species.
                </p>
                <span className="text-emerald-400 font-semibold text-xs flex items-center gap-1.5 group-hover:translate-x-1 transition-transform">
                  Identify Specimen →
                </span>
              </button>

              {/* Card 3: Explore */}
              <button
                onClick={() => handleNavigate({ module: 'profiles' })}
                className={`group p-6 sm:p-7 rounded-2xl border text-left transition-all duration-200 cursor-pointer ${
                  isLightMode
                    ? 'bg-white border-stone-200 hover:border-emerald-600 hover:shadow-lg'
                    : 'bg-slate-900/60 border-slate-800 hover:border-cyan-500/60 hover:shadow-xl hover:shadow-cyan-950/20'
                }`}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-5 border transition-colors ${
                  isLightMode
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-slate-800 border-slate-700 text-cyan-400 group-hover:border-cyan-500/40'
                }`}>
                  <Microscope size={22} />
                </div>
                <h3 className="font-display text-xl font-bold mb-2">Explore Taxa</h3>
                <p className={`text-xs sm:text-sm leading-relaxed mb-4 ${isLightMode ? 'text-stone-600' : 'text-slate-400'}`}>
                  Detailed botanical reference profiles with morphological diagnosis, confusable taxa, literature, and side-by-side comparison.
                </p>
                <span className="text-cyan-400 font-semibold text-xs flex items-center gap-1.5 group-hover:translate-x-1 transition-transform">
                  Explore Profiles →
                </span>
              </button>

            </div>

            {/* Secondary Destinations bar (More tools: Localities, Authorities, Quiz) */}
            <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
              isLightMode ? 'bg-stone-200/50 border-stone-300' : 'bg-slate-900/40 border-slate-800'
            }`}>
              <span className="font-semibold text-slate-400">Additional Reference Modules:</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleNavigate({ module: 'localities' })}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <MapPin size={13} className="text-cyan-400" />
                  <span>Localities & Ecoregions</span>
                </button>
                <button
                  onClick={() => handleNavigate({ module: 'authorities' })}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <UserCircle size={13} className="text-amber-400" />
                  <span>Taxonomic Authorities</span>
                </button>
                <button
                  onClick={() => handleNavigate({ module: 'quiz' })}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
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
            />
          </ErrorBoundary>
        </div>

        {/* Explore Module */}
        <div className={activeModule === 'profiles' ? 'block' : 'hidden'}>
          <ErrorBoundary>
            <ProfilesModule
              initialQuery={navigationTarget?.module === 'profiles' ? navigationTarget.query : undefined}
              initialMode={navigationTarget?.module === 'profiles' ? navigationTarget.mode : undefined}
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

        {/* Localities Module (Under More) */}
        <div className={activeModule === 'localities' ? 'block' : 'hidden'}>
          <ErrorBoundary>
            <LocalitiesModule 
              initialQuery={navigationTarget?.module === 'localities' ? navigationTarget.query : undefined}
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
            />
          </ErrorBoundary>
        </div>
      </main>

      {/* Mobile Navigation (Clean 4-item primary bar) */}
      <nav className={`md:hidden fixed bottom-0 left-0 right-0 backdrop-blur-xl border-t z-50 pb-safe print:hidden ${
        isLightMode ? 'bg-stone-50/95 border-stone-200' : 'bg-slate-950/95 border-slate-800'
      }`}>
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
            onClick={() => setIsMoreMenuOpen(true)}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors cursor-pointer ${
              isMoreActive ? 'text-cyan-400 font-bold' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <MoreHorizontal size={20} />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* Footer */}
      <footer className={`border-t py-8 text-center text-sm print:hidden mb-16 md:mb-0 ${
        isLightMode ? 'bg-stone-50 border-stone-200 text-stone-600' : 'bg-slate-950 border-slate-900 text-slate-500'
      }`}>
        <p className="mb-2">Taxonomy Workbench &bull; Developed by Daniel Cahen</p>
        <p className="mb-4 text-xs opacity-80">Content generated using Gemini 3.8 Flash</p>
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
