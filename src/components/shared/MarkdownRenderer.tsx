import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getSafeExternalUrl } from '../../utils/urlValidation';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Preserves single-newline line breaks inside plain prose paragraphs (matching the
 * previous `marked` `breaks: true` presentation) without disturbing fenced code blocks,
 * blank-line paragraph breaks, headings, lists, tables, or blockquotes.
 */
function preserveSoftLineBreaks(input: string): string {
  const lines = input.split(/\r?\n/);
  let inCodeFence = false;
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^(`{3,}|~{3,})/.test(trimmed)) {
      inCodeFence = !inCodeFence;
      out.push(line);
      continue;
    }

    const next = i + 1 < lines.length ? lines[i + 1] : null;
    const nextTrimmed = next !== null ? next.trim() : '';

    const isBlockBoundary =
      inCodeFence ||
      trimmed === '' ||
      next === null ||
      nextTrimmed === '' ||
      /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s?|```|~~~|\||---+$|\*\*\*+$)/.test(trimmed) ||
      /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s?|```|~~~|\||---+$|\*\*\*+$)/.test(nextTrimmed);

    out.push(isBlockBoundary ? line : `${line}  `);
  }

  return out.join('\n');
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  if (!content) return null;

  // Replace literal '\n' sequences (backslash followed by 'n') with real newlines
  const processedContent = preserveSoftLineBreaks(String(content).replace(/\\n/g, '\n'));

  return (
    <div
      className={`prose prose-invert prose-slate max-w-none prose-a:text-cyan-500 hover:prose-a:text-cyan-400 prose-strong:text-white prose-headings:font-display ${className}`}
    >
      <Markdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => getSafeExternalUrl(url) ?? ''}
        components={{
          a: ({ href, children }) => {
            const safeHref = getSafeExternalUrl(href);
            if (!safeHref) {
              return <span>{children}</span>;
            }
            return (
              <a href={safeHref} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {processedContent}
      </Markdown>
    </div>
  );
}

