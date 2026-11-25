import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownRenderer } from '../src/components/shared/MarkdownRenderer';
import { LiteratureSection } from '../src/components/shared/LiteratureSection';
import { SourcesBar } from '../src/components/shared/SourcesBar';
import { getSafeExternalUrl } from '../src/utils/urlValidation';

test('getSafeExternalUrl allows http/https and rejects javascript, data, and malformed URLs', () => {
  assert.equal(getSafeExternalUrl('https://powo.science.kew.org/taxon/123'), 'https://powo.science.kew.org/taxon/123');
  assert.equal(getSafeExternalUrl('http://efloras.org/florataxon.aspx?flora_id=1'), 'http://efloras.org/florataxon.aspx?flora_id=1');
  assert.equal(getSafeExternalUrl('  https://worldfloraonline.org/  '), 'https://worldfloraonline.org/');

  assert.equal(getSafeExternalUrl('javascript:alert(1)'), null);
  assert.equal(getSafeExternalUrl('JAVASCRIPT:alert(1)'), null);
  assert.equal(getSafeExternalUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(getSafeExternalUrl('vbscript:msgbox(1)'), null);
  assert.equal(getSafeExternalUrl('file:///etc/passwd'), null);
  assert.equal(getSafeExternalUrl('not-a-url'), null);
  assert.equal(getSafeExternalUrl(''), null);
  assert.equal(getSafeExternalUrl(null), null);
});

test('MarkdownRenderer neutralizes raw HTML XSS payloads and javascript: links while preserving botanical formatting', () => {
  const maliciousMarkdown = [
    '- **Habit**: Shrub 1–2 m tall',
    '- **Leaves**: *Opposite*, serrate',
    '',
    'Line one\\nLine two',
    '',
    '<script>alert("xss")</script>',
    '<img src="x" onerror="alert(1)" />',
    '',
    '[Click me](javascript:alert(2)) and [POWO](https://powo.science.kew.org/)',
  ].join('\n');

  const html = renderToStaticMarkup(
    React.createElement(MarkdownRenderer, { content: maliciousMarkdown })
  );

  // No unescaped executable HTML tags or inline event handlers
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /<img\b[^>]*onerror=/i);
  assert.doesNotMatch(html, /href="javascript:/i);

  // Botanical Markdown formatting and literal \n line breaks are preserved
  assert.match(html, /<strong>Habit<\/strong>: Shrub 1–2 m tall/);
  assert.match(html, /<em>Opposite<\/em>, serrate/);
  assert.match(html, /Line one<br\s*\/?>\s*Line two/);

  // Safe external link is rendered with rel="noopener noreferrer", unsafe link is downgraded to text
  assert.match(html, /<a href="https:\/\/powo\.science\.kew\.org\/" target="_blank" rel="noopener noreferrer">POWO<\/a>/);
  assert.match(html, /<span>Click me<\/span>/);
});

test('LiteratureSection renders http(s) URLs and omits unsafe javascript/data URLs', () => {
  const html = renderToStaticMarkup(
    React.createElement(LiteratureSection, {
      literature: [
        {
          citation: 'Stace, C. (2019). New Flora of the British Isles.',
          type: 'Flora Account',
          scope: 'British Isles',
          url: 'https://powo.science.kew.org/',
        },
        {
          citation: 'Malicious Entry (2026).',
          type: 'Monograph',
          url: 'javascript:alert(1)',
        },
        {
          citation: 'Data URI Entry (2026).',
          type: 'Checklist',
          url: 'data:text/html,<script>alert(1)</script>',
        },
      ],
    })
  );

  assert.match(html, /href="https:\/\/powo\.science\.kew\.org\/"/);
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.doesNotMatch(html, /href="data:/i);
  // Only one "View Treatment / Resource" link should be rendered
  const treatmentLinks = html.match(/View Treatment \/ Resource/g) || [];
  assert.equal(treatmentLinks.length, 1);
});

test('SourcesBar filters out non-http(s) URIs', () => {
  const html = renderToStaticMarkup(
    React.createElement(SourcesBar, {
      sources: [
        { uri: 'https://powo.science.kew.org/taxon/1', title: 'POWO' },
        { uri: 'javascript:alert(1)', title: 'Bad Source' },
      ],
    })
  );

  assert.match(html, /href="https:\/\/powo\.science\.kew\.org\/taxon\/1"/);
  assert.doesNotMatch(html, /Bad Source/);
  assert.doesNotMatch(html, /javascript:/i);
});
