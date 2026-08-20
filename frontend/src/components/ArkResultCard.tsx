import type { ArkIsOfficial } from '@/types';

interface Props {
  isOfficial?: ArkIsOfficial;
  modelName?: string;
  resolution?: string;
  message?: string;
}

function badgeStyles(official?: ArkIsOfficial) {
  switch (official) {
    case 'True':
      return {
        card: 'from-emerald-50 to-emerald-100/40 border-emerald-200',
        badge: 'bg-result-true text-white shadow-pop',
        label: '命中方舟技术',
        desc: '检测到 Seedance（方舟）生成特征',
      };
    case 'False':
      return {
        card: 'from-amber-50 to-amber-100/40 border-amber-200',
        badge: 'bg-result-false text-white shadow-pop',
        label: '未命中方舟技术',
        desc: '未检测到 Seedance（方舟）生成特征',
      };
    default:
      return {
        card: 'from-slate-50 to-slate-100/40 border-slate-200',
        badge: 'bg-result-null text-white shadow-pop',
        label: '结果未知',
        desc: '方舟暂未能给出明确判定',
      };
  }
}

export default function ArkResultCard({ isOfficial, modelName, resolution, message }: Props) {
  const s = badgeStyles(isOfficial);
  return (
    <div
      className={`rounded-xl3 border p-6 bg-gradient-to-br shadow-card animate-fade-in ${s.card}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-semibold ${s.badge}`}>
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
              <path
                d="M12 2 15.09 8.26l6.91 1-5 4.87L18.18 21 12 17.77 5.82 21 7 14.13l-5-4.87 6.91-1L12 2Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
            {s.label}
          </div>
          <p className="mt-2 text-sm text-healing-muted">{s.desc}</p>
        </div>
        <div className="text-right text-xs text-healing-muted space-y-0.5">
          <div>验证引擎</div>
          <div className="font-medium text-healing-text">
            方舟 · Ark Official Result
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="判定结果 (IsOfficial)">
          <span
            className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-mono font-semibold ${
              isOfficial === 'True'
                ? 'bg-emerald-500/10 text-result-true'
                : isOfficial === 'False'
                ? 'bg-amber-500/10 text-result-false'
                : 'bg-slate-500/10 text-result-null'
            }`}
          >
            {isOfficial ?? 'Null'}
          </span>
        </Field>
        <Field label="命中模型 (ModelName)">
          <span className="text-healing-text font-medium break-words">
            {modelName || <span className="text-healing-muted">—</span>}
          </span>
        </Field>
        <Field label="检测分辨率 (Resolution)">
          <span className="text-healing-text font-medium">
            {resolution || <span className="text-healing-muted">—</span>}
          </span>
        </Field>
      </div>

      {message && (
        <div className="mt-4 rounded-xl bg-white/60 border border-white/80 p-3 text-sm text-healing-text leading-relaxed">
          <div className="text-xs text-healing-muted mb-1">方舟返回 Message</div>
          <div className="break-words whitespace-pre-wrap">{message}</div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl2 bg-white/60 border border-white/80 px-4 py-3">
      <div className="text-xs text-healing-muted mb-1">{label}</div>
      <div className="text-base">{children}</div>
    </div>
  );
}
