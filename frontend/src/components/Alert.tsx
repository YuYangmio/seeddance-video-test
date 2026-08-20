type Tone = 'error' | 'warn' | 'info' | 'success';

interface Props {
  tone?: Tone;
  title?: string;
  message: string;
  code?: string;
  onClose?: () => void;
}

const toneStyles: Record<Tone, { bg: string; border: string; icon: string; title: string }> = {
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'bg-red-100 text-red-600',
    title: 'text-red-800',
  },
  warn: {
    bg: 'bg-result-falseBg',
    border: 'border-amber-200',
    icon: 'bg-amber-100 text-result-false',
    title: 'text-amber-800',
  },
  info: {
    bg: 'bg-brand-50',
    border: 'border-brand-100',
    icon: 'bg-brand-100 text-brand-600',
    title: 'text-brand-800',
  },
  success: {
    bg: 'bg-result-trueBg',
    border: 'border-emerald-200',
    icon: 'bg-emerald-100 text-result-true',
    title: 'text-emerald-800',
  },
};

export default function Alert({ tone = 'error', title, message, code, onClose }: Props) {
  const s = toneStyles[tone];
  return (
    <div className={`animate-slide-up rounded-xl2 border px-4 py-3 flex gap-3 items-start ${s.bg} ${s.border}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-none ${s.icon}`}>
        {tone === 'error' ? (
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none">
            <path d="M10 6v5M10 14.2h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        ) : tone === 'warn' ? (
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
            <path d="M12 9v5M12 17.5h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : tone === 'success' ? (
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none">
            <path d="M5 10.5L8.5 14L15 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none">
            <path d="M10 6v5M10 14.2h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {title && <div className={`text-sm font-semibold ${s.title}`}>{title}</div>}
        <div className="text-sm text-healing-text leading-relaxed break-words whitespace-pre-wrap">
          {message}
        </div>
        {code && (
          <div className="mt-1 text-xs text-healing-muted font-mono break-all">错误码: {code}</div>
        )}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="flex-none text-healing-muted hover:text-healing-text transition-colors"
          aria-label="关闭"
        >
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
