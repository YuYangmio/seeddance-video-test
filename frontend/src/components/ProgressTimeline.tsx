import { STEPS, getStepIndex, getStepState } from './steps';
import type { StepKey } from '@/types';

interface Props {
  step: StepKey;
  failed: boolean;
}

export default function ProgressTimeline({ step, failed }: Props) {
  const activeIndex = getStepIndex(step);
  const activeDisplayIndex = activeIndex < 0 ? 0 : activeIndex;

  return (
    <div className="relative">
      <ol className="flex items-start w-full">
        {STEPS.map((s, i) => {
          const state = getStepState(i, activeDisplayIndex, failed);
          const isLast = i === STEPS.length - 1;
          return (
            <li key={s.key} className="flex-1 min-w-0 relative flex flex-col items-center">
              {/* 连接线（到下一项） */}
              {!isLast && (
                <div
                  className={`absolute top-4 left-1/2 w-full h-[2px] ${
                    state === 'done' ? 'bg-result-true' : 'bg-healing-border'
                  }`}
                  aria-hidden
                />
              )}
              {/* 步骤圆点 */}
              <div
                className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 text-xs font-semibold transition-all duration-300 ${
                  state === 'done'
                    ? 'bg-result-true border-result-true text-white'
                    : state === 'active'
                    ? failed
                      ? 'bg-red-50 border-red-400 text-red-500 animate-pulse-slow'
                      : 'bg-brand-50 border-brand-500 text-brand-500 animate-pulse-slow shadow-pop'
                    : 'bg-white border-healing-border text-healing-muted'
                }`}
              >
                {state === 'done' ? (
                  <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none">
                    <path
                      d="M5 10.5L8.5 14L15 7"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : failed && state === 'active' ? (
                  <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none">
                    <path
                      d="M10 6v5M10 14.2h.01"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              {/* 文字 */}
              <div className="mt-2.5 text-center px-1">
                <div
                  className={`text-sm font-medium ${
                    state === 'done'
                      ? 'text-healing-text'
                      : state === 'active'
                      ? failed
                        ? 'text-red-500'
                        : 'text-brand-600'
                      : 'text-healing-muted'
                  }`}
                >
                  {s.label}
                </div>
                <div className="mt-0.5 text-xs text-healing-muted leading-relaxed line-clamp-2">
                  {s.description}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
