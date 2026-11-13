import React from 'react';
import Markdown from 'react-markdown';
import {
  GeneratedGuideStructured,
  GroundingSource,
  KeyValidationReport,
} from '../../types';
import { buildSourceProvenance } from '../../utils/guideValidation';

interface GuidePrintViewProps {
  guide: GeneratedGuideStructured;
  sources?: GroundingSource[];
  activeFilters?: string[];
  keyValidation?: KeyValidationReport;
}

export function GuidePrintView({
  guide,
  sources = [],
  activeFilters = [],
  keyValidation,
}: GuidePrintViewProps) {
  const targetTaxon = guide.guide_metadata?.target_taxon || 'Unknown Taxon';
  const targetLocality = guide.guide_metadata?.target_locality || 'Unknown Locality';
  const profiles = guide.species_profiles || [];
  const keyItems = guide.dichotomous_key || [];
  const fieldDocs = guide.field_documentation_guide || [];
  const literature = guide.recommended_literature || [];
  const provenance =
    guide.provenance || buildSourceProvenance(sources.length > 0, sources, 'guide');

  return (
    <article
      data-testid="guide-print-view"
      className="hidden print:block text-black bg-white space-y-6 p-0 max-w-none"
      aria-label="Printable Complete Field Identification Guide"
    >
      {/* 1. Title, Locality, Scope & Verification */}
      <div className="border-b-2 border-gray-800 pb-4 space-y-2">
        <div className="text-xs font-mono uppercase tracking-wider text-gray-700">
          Taxonomy Workbench • Regional Botanical Field Handbook
        </div>
        <h1 className="text-2xl font-bold text-black">
          Identification Guide to <i>{targetTaxon}</i>
        </h1>
        <div className="text-sm text-gray-800 flex flex-wrap gap-x-4 gap-y-1">
          <span>
            <strong>Locality:</strong> {targetLocality}
          </span>
          <span>
            <strong>Taxa Treated:</strong> {profiles.length}
          </span>
          {guide.guide_metadata?.coverage_scope && (
            <span>
              <strong>Scope:</strong> {guide.guide_metadata.coverage_scope}
            </span>
          )}
        </div>
        {guide.guide_metadata?.verification_summary && (
          <p className="text-xs text-gray-700">
            <strong>Taxonomic Basis:</strong> {guide.guide_metadata.verification_summary}
          </p>
        )}
        {activeFilters.length > 0 && (
          <p className="text-xs text-gray-700">
            <strong>Active Constraints:</strong> {activeFilters.join('; ')}
          </p>
        )}
        {keyValidation && (
          <p className="text-xs text-gray-700">
            <strong>Key Structure Check:</strong> {keyValidation.validityNote}
          </p>
        )}
      </div>

      {/* 2. Botanical Overview & Setting */}
      {guide.taxon_overview && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold border-b border-gray-300 pb-1">
            Botanical Overview &amp; Regional Setting
          </h2>
          <div className="prose prose-sm max-w-none text-gray-900">
            <Markdown>{guide.taxon_overview}</Markdown>
          </div>
        </section>
      )}

      {/* 3. Complete Dichotomous Key */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold border-b border-gray-300 pb-1">
          Complete Dichotomous Identification Key ({keyItems.length} couplets)
        </h2>
        {keyItems.length === 0 ? (
          <p className="text-sm italic text-gray-700">No dichotomous key couplets present.</p>
        ) : (
          <div className="space-y-3 font-mono text-xs leading-relaxed">
            {keyItems.map((couplet, idx) => (
              <div
                key={`${couplet.couplet_id}-${idx}`}
                className="border-l-2 border-gray-400 pl-3 break-inside-avoid"
              >
                <div className="font-bold text-black">{couplet.couplet_id}.</div>
                <div className="flex justify-between gap-4 ml-2">
                  <span>
                    <strong>a.</strong> {couplet.lead_a?.statement}
                  </span>
                  <span className="font-bold shrink-0">{couplet.lead_a?.destination}</span>
                </div>
                <div className="flex justify-between gap-4 ml-2 mt-1">
                  <span>
                    <strong>b.</strong> {couplet.lead_b?.statement}
                  </span>
                  <span className="font-bold shrink-0">{couplet.lead_b?.destination}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. All Treated Taxon Profiles */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold border-b border-gray-300 pb-1">
          Treated Taxon Profiles ({profiles.length})
        </h2>
        <div className="space-y-4">
          {profiles.map((sp, idx) => (
            <div
              key={`${sp.scientific_name}-${idx}`}
              className="border border-gray-300 rounded p-3 space-y-1.5 break-inside-avoid"
            >
              <h3 className="text-base font-bold text-black">
                <i>{sp.scientific_name}</i>
                {sp.common_name ? (
                  <span className="font-normal text-gray-700 text-sm"> ({sp.common_name})</span>
                ) : null}
              </h3>
              <p className="text-xs leading-relaxed text-gray-900">
                <strong>Key Diagnostics:</strong> {sp.key_diagnostics}
              </p>
              <p className="text-xs leading-relaxed text-gray-800">
                <strong>Habitat &amp; Ecology:</strong> {sp.habitat_and_ecology}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. Field documentation */}
      {fieldDocs.length > 0 && (
        <section className="space-y-2 break-inside-avoid">
          <h2 className="text-lg font-bold border-b border-gray-300 pb-1">
            Field documentation: What to photograph, measure, and record
          </h2>
          <ol className="list-decimal list-inside space-y-1 text-xs text-gray-900">
            {fieldDocs.map((tip, idx) => (
              <li key={idx}>{tip}</li>
            ))}
          </ol>
        </section>
      )}

      {/* 6. Supporting web references & suggested literature */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold border-b border-gray-300 pb-1">
          References &amp; provenance
        </h2>

        {/* Suggested literature */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-black">
            Suggested literature (not verified unless listed below)
          </h3>
          {literature.length === 0 ? (
            <p className="text-xs italic text-gray-700">
              No suggested literature references listed.
            </p>
          ) : (
            <ul className="list-disc list-inside space-y-1.5 text-xs text-gray-900">
              {literature.map((item, idx) => (
                <li key={idx}>
                  {item.type ? <strong>[{item.type}] </strong> : null}
                  <span>{item.citation}</span>
                  {item.scope ? <span className="text-gray-700"> ({item.scope})</span> : null}
                  {item.notes ? <div className="ml-4 text-gray-700">{item.notes}</div> : null}
                  {item.url ? <div className="ml-4 text-gray-700 underline">{item.url}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Supporting web references */}
        <div className="space-y-1.5">
          <h3 className="text-sm font-bold text-black">
            Supporting web references
          </h3>
          {provenance.retrievedSources.length === 0 ? (
            <p className="text-xs italic text-gray-700">{provenance.basisNote}</p>
          ) : (
            <ul className="list-disc list-inside space-y-1 text-xs text-gray-900">
              {provenance.retrievedSources.map((src, idx) => (
                <li key={idx}>
                  <span>{src.title}</span> — <span className="underline">{src.uri}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <footer className="border-t border-gray-400 pt-2 text-[10px] text-gray-700">
        Taxonomy Workbench • Content generated using Gemini 4 Hydrogen • Structural completeness
        does not guarantee botanical accuracy; verify critical identifications against primary
        literature and herbarium specimens.
      </footer>
    </article>
  );
}
