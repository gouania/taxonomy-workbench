import { Book, GraduationCap, MapPin, Award, Network } from 'lucide-react';
import React from 'react';
import { AuthorProfile as AuthorProfileType, NavigationTarget } from '../../types';
import { CrossLink } from '../shared/CrossLink';
import { InfoCard } from '../shared/InfoCard';
import { MarkdownRenderer } from '../shared/MarkdownRenderer';
import { SourcesBar } from '../shared/SourcesBar';
import { TaxonomicLegacy } from './TaxonomicLegacy';

interface AuthorProfileProps {
  profile: AuthorProfileType;
  sources: any[];
  onNavigate: (target: NavigationTarget) => void;
}

export function AuthorProfile({ profile, sources, onNavigate }: AuthorProfileProps) {
  if (!profile) return null;

  const nationalityParts = profile.nationality ? profile.nationality.split(' ') : [];
  const nationalityEmoji = nationalityParts[0] || '';
  const nationalityText = nationalityParts.slice(1).join(' ') || nationalityParts[0] || '';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-slate-900/60 border border-slate-800/50 rounded-3xl p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-4 mb-4">
              <h2 className="font-display text-4xl md:text-5xl font-bold text-white">
                {profile.fullName || 'Unknown Author'}
              </h2>
              {profile.standardAbbreviation && (
                <span className="px-3 py-1 bg-cyan-900/30 text-cyan-400 font-mono text-lg rounded-xl border border-cyan-800/50">
                  {profile.standardAbbreviation}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-4 text-slate-400">
              {profile.nationality && (
                <span className="flex items-center gap-1.5">
                  {nationalityEmoji && <span className="text-lg">{nationalityEmoji}</span>}
                  {nationalityText !== nationalityEmoji && <span>{nationalityText}</span>}
                </span>
              )}
              {profile.lifespan && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-700"></span>
                  <span>{profile.lifespan}</span>
                </>
              )}
              {(profile.birthPlace || profile.deathPlace) && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-700"></span>
                  <span className="flex items-center gap-1.5">
                    <MapPin size={14} />
                    {profile.birthPlace || 'Unknown'} {profile.deathPlace ? `→ ${profile.deathPlace}` : ''}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          <InfoCard highlight className="bg-slate-900/60 border-cyan-900/30">
            {profile.mainContribution && (
              <p className="text-lg text-slate-200 leading-relaxed font-medium mb-6">
                {profile.mainContribution}
              </p>
            )}
            <div className="space-y-4">
              {profile.biography && <MarkdownRenderer content={profile.biography} />}
              {profile.historicalContext && (
                <div className="pt-4 border-t border-slate-800/50">
                  <h4 className="text-sm font-semibold text-slate-400 mb-2">Historical Context</h4>
                  <MarkdownRenderer content={profile.historicalContext} className="text-sm" />
                </div>
              )}
            </div>
          </InfoCard>

          <TaxonomicLegacy profile={profile} onNavigate={onNavigate} />

          {profile.majorWorks && profile.majorWorks.length > 0 && (
            <InfoCard title="Major Publications" icon={<Book size={20} />}>
              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-700 before:to-transparent">
                {profile.majorWorks.map((work, idx) => (
                  <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-900 group-[.is-active]:bg-cyan-900 text-slate-500 group-[.is-active]:text-cyan-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                      <Book size={16} />
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-2xl border border-slate-800/50 bg-slate-900/40 shadow">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-cyan-400 text-sm font-semibold">{work.year}</span>
                      </div>
                      <div className="text-slate-300 italic text-sm">{work.title}</div>
                    </div>
                  </div>
                ))}
              </div>
            </InfoCard>
          )}
        </div>

        <div className="lg:col-span-4 space-y-6">
          <InfoCard title="Career & Education" icon={<GraduationCap size={20} />}>
            <div className="space-y-6">
              {profile.institutions && profile.institutions.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-400 mb-2">Institutions</h4>
                  <ul className="space-y-1">
                    {profile.institutions.map((inst, idx) => (
                      <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                        <span className="text-cyan-500 mt-1">•</span> {inst}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {profile.almaMater && profile.almaMater.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-400 mb-2">Alma Mater</h4>
                  <ul className="space-y-1">
                    {profile.almaMater.map((alma, idx) => (
                      <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                        <span className="text-cyan-500 mt-1">•</span> {alma}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {profile.focusAreas && profile.focusAreas.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-400 mb-2">Focus Areas</h4>
                  <div className="flex flex-wrap gap-2">
                    {profile.focusAreas.map((area, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-slate-800/50 text-slate-300 text-xs rounded-lg border border-slate-700/50">
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {profile.fieldWorkRegions && profile.fieldWorkRegions.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-400 mb-2">Field Work</h4>
                  <div className="flex flex-wrap gap-2">
                    {profile.fieldWorkRegions.map((region, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-slate-800/50 text-slate-300 text-xs rounded-lg border border-slate-700/50 flex items-center gap-1">
                        <MapPin size={12} className="text-cyan-500" /> {region}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {profile.awards && profile.awards.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-400 mb-2">Awards & Honors</h4>
                  <ul className="space-y-2">
                    {profile.awards.map((award, idx) => (
                      <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                        <Award size={16} className="text-amber-500 shrink-0 mt-0.5" />
                        <span>{award}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </InfoCard>

          <InfoCard title="Network" icon={<Network size={20} />}>
            <div className="space-y-6">
              {profile.notableMentors && profile.notableMentors.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-400 mb-2">Mentors</h4>
                  <div className="flex flex-wrap gap-2">
                    {profile.notableMentors.map((mentor, idx) => (
                      <div key={idx}>
                        <CrossLink target={{ module: 'authorities', query: mentor }} onNavigate={onNavigate}>
                          {mentor}
                        </CrossLink>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {profile.notableStudents && profile.notableStudents.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-400 mb-2">Notable Students</h4>
                  <div className="flex flex-wrap gap-2">
                    {profile.notableStudents.map((student, idx) => (
                      <div key={idx}>
                        <CrossLink target={{ module: 'authorities', query: student }} onNavigate={onNavigate}>
                          {student}
                        </CrossLink>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {profile.relatedBotanists && profile.relatedBotanists.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-400 mb-3">Related Botanists</h4>
                  <div className="space-y-3">
                    {profile.relatedBotanists.map((related, idx) => (
                      <div key={idx} className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
                        <CrossLink target={{ module: 'authorities', query: related.name }} onNavigate={onNavigate}>
                          {related.name}
                        </CrossLink>
                        {related.connection && <p className="text-xs text-slate-400 mt-1.5">{related.connection}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </InfoCard>
        </div>
      </div>

      <SourcesBar sources={sources} mode="sticky" />
    </div>
  );
}
