import React, { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  if (!content) return null;

  // Split content by code blocks ```lang ... ```
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let blockCounter = 0;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index);
    if (textBefore) {
      parts.push(renderFormattedText(textBefore, `text-${blockCounter}`));
    }

    const language = match[1] || 'code';
    const codeContent = match[2].trimEnd();
    const currentIndex = blockCounter;

    parts.push(
      <div key={`code-${currentIndex}`} className="my-3 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 font-mono text-xs shadow-md">
        <div className="flex items-center justify-between px-3.5 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-cyan-400" />
            <span className="font-semibold uppercase tracking-wider text-slate-300">{language}</span>
          </div>
          <button
            onClick={() => copyToClipboard(codeContent, currentIndex)}
            className="flex items-center gap-1 text-[11px] hover:text-white transition-colors px-2 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300"
          >
            {copiedIndex === currentIndex ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
        <pre className="p-3.5 overflow-x-auto text-slate-200 font-mono leading-relaxed select-text">
          <code>{codeContent}</code>
        </pre>
      </div>
    );

    blockCounter++;
    lastIndex = match.index + match[0].length;
  }

  const remainingText = content.substring(lastIndex);
  if (remainingText) {
    parts.push(renderFormattedText(remainingText, `text-final`));
  }

  return <div className="space-y-2 text-slate-200 leading-relaxed text-sm select-text">{parts}</div>;
};

function renderFormattedText(text: string, keyPrefix: string): React.ReactNode {
  const lines = text.split('\n');
  return (
    <div key={keyPrefix} className="space-y-1.5">
      {lines.map((line, idx) => {
        const trimmed = line.trim();

        // Headers
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={`${keyPrefix}-${idx}`} className="text-sm font-bold text-white pt-2 pb-0.5">
              {formatInline(trimmed.slice(4))}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={`${keyPrefix}-${idx}`} className="text-base font-extrabold text-white pt-2.5 pb-1">
              {formatInline(trimmed.slice(3))}
            </h3>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={`${keyPrefix}-${idx}`} className="text-lg font-black text-white pt-3 pb-1">
              {formatInline(trimmed.slice(2))}
            </h2>
          );
        }

        // Bullet points
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={`${keyPrefix}-${idx}`} className="flex items-start gap-2 pl-2">
              <span className="text-cyan-400 font-bold leading-tight mt-1 text-xs">•</span>
              <span className="flex-1 text-slate-200">{formatInline(trimmed.slice(2))}</span>
            </div>
          );
        }

        // Numbered list
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
          return (
            <div key={`${keyPrefix}-${idx}`} className="flex items-start gap-2 pl-2">
              <span className="text-cyan-400 font-mono text-xs font-bold shrink-0 mt-0.5">{numMatch[1]}.</span>
              <span className="flex-1 text-slate-200">{formatInline(numMatch[2])}</span>
            </div>
          );
        }

        // Empty line
        if (!trimmed) {
          return <div key={`${keyPrefix}-${idx}`} className="h-1.5" />;
        }

        // Standard paragraph line
        return (
          <p key={`${keyPrefix}-${idx}`} className="text-slate-200">
            {formatInline(line)}
          </p>
        );
      })}
    </div>
  );
}

function formatInline(str: string): React.ReactNode[] {
  // Parse inline `code` and **bold**
  const tokens = str.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return tokens.map((token, i) => {
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code key={i} className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300 font-mono text-xs font-medium">
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={i} className="font-bold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    }
    return token;
  });
}
