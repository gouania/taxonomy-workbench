import { Leaf, Microscope, Key, UserCircle, AlertCircle, BookOpen, MapPin, GraduationCap } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { GEMINI_MODEL } from './constants';
import { AuthoritiesModule } from './components/authorities/AuthoritiesModule';
import { IdentifyModule } from './components/identify/IdentifyModule';
import { ProfilesModule } from './components/profiles/ProfilesModule';
import { GuideModule } from './components/guide/GuideModule';
import { LocalitiesModule } from './components/localities/LocalitiesModule';
import { QuizModule } from './components/quiz/QuizModule';
import { BackToTop } from './components/shared/BackToTop';
import { ModuleType, NavigationTarget } from './types';

export default function App() {
  const [activeModule, setActiveModule] = useState<ModuleType>('landing');
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | null>(null);

  useEffect(() => {
    // Parse URL params for initial state
    const params = new URLSearchParams(window.location.search);
    const module = params.get('module') as ModuleType;
    const query = params.get('q');
    const mode = params.get('mode') as 'single' | 'compare' | undefined;

    if (module && ['profiles', 'identify', 'authorities', 'guide', 'localities', 'quiz'].includes(module)) {
      setActiveModule(module);
      if (query) {
        setNavigationTarget({ module, query, mode });
      }
    }
  }, []);

  const handleNavigate = (target: NavigationTarget) => {
    setActiveModule(target.module);
    setNavigationTarget(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set('module', target.module);
    if (target.query) url.searchParams.set('q', target.query);
    if (target.mode) url.searchParams.set('mode', target.mode);
    window.history.pushState({}, '', url.toString());
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-cyan-500/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <button
            onClick={() => {
              setActiveModule('landing');
              setNavigationTarget(null);
              window.history.pushState({}, '', window.location.pathname);
            }}
            className="flex items-center gap-2 text-white hover:text-cyan-400 transition-colors group"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shadow-lg group-hover:shadow-cyan-500/25 transition-all">
              <Leaf size={18} className="text-white" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight">Taxonomy Workbench</span>
          </button>

          <nav className="hidden md:flex items-center gap-1 bg-slate-900/50 p-1 rounded-xl border border-slate-800/50">
            <button
              onClick={() => handleNavigate({ module: 'profiles' })}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeModule === 'profiles'
                  ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Microscope size={16} /> Explore Taxa
            </button>
            <button
              onClick={() => handleNavigate({ module: 'authorities' })}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeModule === 'authorities'
                  ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <UserCircle size={16} /> Taxonomic Authorities
            </button>
            <button
              onClick={() => handleNavigate({ module: 'identify' })}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeModule === 'identify'
                  ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Key size={16} /> Identify Plants
            </button>
            <button
              onClick={() => handleNavigate({ module: 'guide' })}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeModule === 'guide'
                  ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <BookOpen size={16} /> Generate Guides
            </button>
            <button
              onClick={() => handleNavigate({ module: 'localities' })}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeModule === 'localities'
                  ? 'bg-slate-800 text-cyan-400 shadow-sm border border-slate-700/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <MapPin size={16} /> Localities
            </button>
            <button
              onClick={() => handleNavigate({ module: 'quiz' })}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeModule === 'quiz'
                  ? 'bg-slate-800 text-fuchsia-400 shadow-sm border border-slate-700/50'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <GraduationCap size={16} /> Field Quiz
            </button>
          </nav>

          <div className="flex items-center gap-4">
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-24">

        <div className={activeModule === 'landing' ? 'block' : 'hidden'}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="text-center max-w-4xl mx-auto mb-16">
              <h1 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight flex flex-row items-center justify-center gap-3 md:gap-4">
                <div className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-teal-600/20 border border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.15)] shrink-0">
                  <Leaf className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-cyan-400" />
                </div>
                <span>Taxonomy Workbench</span>
              </h1>
              <p className="text-xl text-slate-400 font-light leading-relaxed max-w-3xl mx-auto">
                Your unified biological reference workbench. Analyze taxa, identify specimens, generate dichotomous keys, explore localities from a botanical perspective, and test your skills with field quizzes.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <button
                onClick={() => handleNavigate({ module: 'profiles' })}
                className="group bg-slate-900/40 hover:bg-slate-800/60 border border-slate-800/50 hover:border-cyan-500/50 rounded-3xl p-8 text-left transition-all duration-300 hover:shadow-[0_0_30px_rgba(6,182,212,0.1)]"
              >
                <div className="w-12 h-12 rounded-xl bg-slate-800 group-hover:bg-cyan-900/50 flex items-center justify-center mb-6 transition-colors border border-slate-700 group-hover:border-cyan-700/50">
                  <Microscope size={24} className="text-slate-400 group-hover:text-cyan-400 transition-colors" />
                </div>
                <h3 className="font-display text-2xl font-semibold text-white mb-3">Explore Taxa</h3>
                <p className="text-slate-400 mb-6 line-clamp-2">
                  Analyze a single taxon or compare multiple taxa side-by-side with detailed diagnostic features.
                </p>
                <span className="text-cyan-500 font-medium text-sm group-hover:text-cyan-400 flex items-center gap-2">
                  Get Started <span className="group-hover:translate-x-1 transition-transform">→</span>
                </span>
              </button>

              <button
                onClick={() => handleNavigate({ module: 'authorities' })}
                className="group bg-slate-900/40 hover:bg-slate-800/60 border border-slate-800/50 hover:border-amber-500/50 rounded-3xl p-8 text-left transition-all duration-300 hover:shadow-[0_0_30px_rgba(245,158,11,0.1)]"
              >
                <div className="w-12 h-12 rounded-xl bg-slate-800 group-hover:bg-amber-900/50 flex items-center justify-center mb-6 transition-colors border border-slate-700 group-hover:border-amber-700/50">
                  <UserCircle size={24} className="text-slate-400 group-hover:text-amber-400 transition-colors" />
                </div>
                <h3 className="font-display text-2xl font-semibold text-white mb-3">Taxonomic Authorities</h3>
                <p className="text-slate-400 mb-6 line-clamp-2">
                  Look up botanical taxonomic authors by name or standard abbreviation to see their legacy.
                </p>
                <span className="text-amber-500 font-medium text-sm group-hover:text-amber-400 flex items-center gap-2">
                  Get Started <span className="group-hover:translate-x-1 transition-transform">→</span>
                </span>
              </button>

              <button
                onClick={() => handleNavigate({ module: 'identify' })}
                className="group bg-slate-900/40 hover:bg-slate-800/60 border border-slate-800/50 hover:border-emerald-500/50 rounded-3xl p-8 text-left transition-all duration-300 hover:shadow-[0_0_30px_rgba(16,185,129,0.1)]"
              >
                <div className="w-12 h-12 rounded-xl bg-slate-800 group-hover:bg-emerald-900/50 flex items-center justify-center mb-6 transition-colors border border-slate-700 group-hover:border-emerald-700/50">
                  <Key size={24} className="text-slate-400 group-hover:text-emerald-400 transition-colors" />
                </div>
                <h3 className="font-display text-2xl font-semibold text-white mb-3">Identify Plants</h3>
                <p className="text-slate-400 mb-6 line-clamp-2">
                  Multi-access character-based identification tool to find the most likely plant family.
                </p>
                <span className="text-emerald-500 font-medium text-sm group-hover:text-emerald-400 flex items-center gap-2">
                  Get Started <span className="group-hover:translate-x-1 transition-transform">→</span>
                </span>
              </button>

              <button
                onClick={() => handleNavigate({ module: 'guide' })}
                className="group bg-slate-900/40 hover:bg-slate-800/60 border border-slate-800/50 hover:border-indigo-500/50 rounded-3xl p-8 text-left transition-all duration-300 hover:shadow-[0_0_30px_rgba(99,102,241,0.1)]"
              >
                <div className="w-12 h-12 rounded-xl bg-slate-800 group-hover:bg-indigo-900/50 flex items-center justify-center mb-6 transition-colors border border-slate-700 group-hover:border-indigo-700/50">
                  <BookOpen size={24} className="text-slate-400 group-hover:text-indigo-400 transition-colors" />
                </div>
                <h3 className="font-display text-2xl font-semibold text-white mb-3">Generate Guides</h3>
                <p className="text-slate-400 mb-6 line-clamp-2">
                  Generate detailed taxonomic guides and dichotomous keys using AI.
                </p>
                <span className="text-indigo-500 font-medium text-sm group-hover:text-indigo-400 flex items-center gap-2">
                  Get Started <span className="group-hover:translate-x-1 transition-transform">→</span>
                </span>
              </button>
              
              <button
                onClick={() => handleNavigate({ module: 'localities' })}
                className="group bg-slate-900/40 hover:bg-slate-800/60 border border-slate-800/50 hover:border-rose-500/50 rounded-3xl p-8 text-left transition-all duration-300 hover:shadow-[0_0_30px_rgba(244,63,94,0.1)]"
              >
                <div className="w-12 h-12 rounded-xl bg-slate-800 group-hover:bg-rose-900/50 flex items-center justify-center mb-6 transition-colors border border-slate-700 group-hover:border-rose-700/50">
                  <MapPin size={24} className="text-slate-400 group-hover:text-rose-400 transition-colors" />
                </div>
                <h3 className="font-display text-2xl font-semibold text-white mb-3">Localities</h3>
                <p className="text-slate-400 mb-6 line-clamp-2">
                  Explore the ecological, biological, and geographical context of specific regions.
                </p>
                <span className="text-rose-500 font-medium text-sm group-hover:text-rose-400 flex items-center gap-2">
                  Get Started <span className="group-hover:translate-x-1 transition-transform">→</span>
                </span>
              </button>

              <button
                onClick={() => handleNavigate({ module: 'quiz' })}
                className="group bg-slate-900/40 hover:bg-slate-800/60 border border-slate-800/50 hover:border-fuchsia-500/50 rounded-3xl p-8 text-left transition-all duration-300 hover:shadow-[0_0_30px_rgba(217,70,239,0.1)]"
              >
                <div className="w-12 h-12 rounded-xl bg-slate-800 group-hover:bg-fuchsia-900/50 flex items-center justify-center mb-6 transition-colors border border-slate-700 group-hover:border-fuchsia-700/50">
                  <GraduationCap size={24} className="text-slate-400 group-hover:text-fuchsia-400 transition-colors" />
                </div>
                <h3 className="font-display text-2xl font-semibold text-white mb-3">Field Quiz</h3>
                <p className="text-slate-400 mb-6 line-clamp-2">
                  Test your ID skills with real iNaturalist photos and AI-powered diagnostic feedback.
                </p>
                <span className="text-fuchsia-500 font-medium text-sm group-hover:text-fuchsia-400 flex items-center gap-2">
                  Start Training <span className="group-hover:translate-x-1 transition-transform">→</span>
                </span>
              </button>
            </div>
          </div>
        </div>

        <div className={activeModule === 'profiles' ? 'block' : 'hidden'}>
          <ProfilesModule
            initialQuery={navigationTarget?.module === 'profiles' ? navigationTarget.query : undefined}
            initialMode={navigationTarget?.module === 'profiles' ? navigationTarget.mode : undefined}
            onNavigate={handleNavigate}
          />
        </div>

        <div className={activeModule === 'identify' ? 'block' : 'hidden'}>
          <IdentifyModule onNavigate={handleNavigate} />
        </div>

        <div className={activeModule === 'authorities' ? 'block' : 'hidden'}>
          <AuthoritiesModule
            initialQuery={navigationTarget?.module === 'authorities' ? navigationTarget.query : undefined}
            onNavigate={handleNavigate}
          />
        </div>

        <div className={activeModule === 'guide' ? 'block' : 'hidden'}>
          <GuideModule 
            onNavigate={handleNavigate} 
            initialTaxon={navigationTarget?.module === 'guide' ? navigationTarget.query : undefined}
            initialLocality={navigationTarget?.module === 'guide' ? navigationTarget.locality : undefined}
          />
        </div>

        <div className={activeModule === 'localities' ? 'block' : 'hidden'}>
          <LocalitiesModule 
            initialQuery={navigationTarget?.module === 'localities' ? navigationTarget.query : undefined}
            onNavigate={handleNavigate}
          />
        </div>

        <div className={activeModule === 'quiz' ? 'block' : 'hidden'}>
          <QuizModule onNavigate={handleNavigate} />
        </div>
      </main>

      {/* Mobile Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-950/90 backdrop-blur-xl border-t border-slate-800/50 z-50 pb-safe print:hidden">
        <div className="flex justify-around p-2">
          <button
            onClick={() => handleNavigate({ module: 'profiles' })}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
              activeModule === 'profiles' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Microscope size={20} />
            <span className="text-[10px] font-medium">Explore</span>
          </button>
          <button
            onClick={() => handleNavigate({ module: 'authorities' })}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
              activeModule === 'authorities' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <UserCircle size={20} />
            <span className="text-[10px] font-medium">Authorities</span>
          </button>
          <button
            onClick={() => handleNavigate({ module: 'identify' })}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
              activeModule === 'identify' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Key size={20} />
            <span className="text-[10px] font-medium">Identify</span>
          </button>
          <button
            onClick={() => handleNavigate({ module: 'guide' })}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
              activeModule === 'guide' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <BookOpen size={20} />
            <span className="text-[10px] font-medium">Guide</span>
          </button>
          <button
            onClick={() => handleNavigate({ module: 'localities' })}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
              activeModule === 'localities' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <MapPin size={20} />
            <span className="text-[10px] font-medium">Localities</span>
          </button>
          <button
            onClick={() => handleNavigate({ module: 'quiz' })}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${
              activeModule === 'quiz' ? 'text-fuchsia-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <GraduationCap size={20} />
            <span className="text-[10px] font-medium">Quiz</span>
          </button>
        </div>
      </nav>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 py-8 text-center text-slate-500 text-sm print:hidden mb-16 md:mb-0">
        <p className="mb-2">Taxonomy Workbench Beta &bull; Developed by Daniel Cahen</p>
        <p className="mb-4 text-xs text-slate-600">Content generated using Gemini 3.6 Flash</p>
        <p className="text-xs max-w-2xl mx-auto px-4">
          Disclaimer: This tool uses AI to generate taxonomic information. Always check literature and specimens for critical identifications.
        </p>
      </footer>

      <BackToTop />
    </div>
  );
}
