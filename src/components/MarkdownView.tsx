import React, { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure once at module load instead of on every render.
marked.setOptions({ gfm: true, breaks: true });

interface MarkdownViewProps {
  content: string;
  className?: string;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, className = '' }) => {
  const htmlContent = useMemo(() => {
    if (!content) return '';
    try {
      // Content comes from the model (which reads user screenshots), so it can carry
      // injected HTML such as <img onerror>. Always sanitize before innerHTML.
      return DOMPurify.sanitize(marked.parse(content) as string);
    } catch (e) {
      console.error('Markdown parse error:', e);
      return DOMPurify.sanitize(content);
    }
  }, [content]);

  return (
    <div
      className={`prose prose-invert max-w-none text-xs sm:text-sm text-slate-300 leading-relaxed font-sans
        [&_h1]:text-lg [&_h1]:font-black [&_h1]:text-white [&_h1]:border-b [&_h1]:border-slate-800 [&_h1]:pb-2 [&_h1]:mt-4 [&_h1]:mb-2
        [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-3 [&_h2]:mb-2
        [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-emerald-400 [&_h3]:mt-2.5 [&_h3]:mb-1.5
        [&_h4]:text-xs [&_h4]:font-bold [&_h4]:text-cyan-400 [&_h4]:mt-2 [&_h4]:mb-1
        [&_p]:my-1.5 [&_p]:leading-relaxed
        [&_strong]:text-emerald-300 [&_strong]:font-bold
        [&_em]:text-amber-300 [&_em]:italic
        [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5 [&_ul]:space-y-1
        [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5 [&_ol]:space-y-1
        [&_li]:text-slate-300
        [&_blockquote]:border-l-2 [&_blockquote]:border-emerald-500 [&_blockquote]:bg-slate-950/60 [&_blockquote]:pl-3 [&_blockquote]:py-1 [&_blockquote]:my-2 [&_blockquote]:text-slate-300 [&_blockquote]:italic
        [&_table]:w-full [&_table]:my-2 [&_table]:border-collapse [&_table]:text-xs
        [&_th]:border [&_th]:border-slate-800 [&_th]:bg-slate-950 [&_th]:p-2 [&_th]:font-bold [&_th]:text-white
        [&_td]:border [&_td]:border-slate-800 [&_td]:p-2 [&_td]:text-slate-300
        [&_code]:bg-slate-950 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-emerald-300 [&_code]:font-mono [&_code]:text-[11px]
        [&_pre]:bg-slate-950 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-slate-800 [&_pre]:overflow-x-auto [&_pre]:my-2
        [&_hr]:border-slate-800 [&_hr]:my-3
        ${className}`}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
};
