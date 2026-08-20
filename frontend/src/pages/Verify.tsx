import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Vendor,
  VendorConfig,
  Resolution,
  Duration,
  GenerateParams,
  VendorPollResponse,
  VerifyState,
  StepKey,
} from '@/types';
import {
  clearSavedVendorConfig,
  clearAdminToken,
  getAdminToken,
  getSavedVendorConfig,
  pollWithTimeout,
  saveVendorConfig,
  setAdminToken,
  vendorGenerate,
  vendorPoll,
  verifyPoll,
  verifySubmit,
} from '@/api';
import ProgressTimeline from '@/components/ProgressTimeline';
import ArkResultCard from '@/components/ArkResultCard';
import Alert from '@/components/Alert';

const RESOLUTION_OPTIONS: Resolution[] = ['768P', '2K'];
const DURATION_OPTIONS: Duration[] = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const RATIO_OPTIONS = ['16:9', '9:16', '1:1', '4:3', '3:4'];

// ---------- 卡片骨架 ----------
function Card({
  title,
  desc,
  icon,
  children,
  accent,
}: {
  title: string;
  desc?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <section className="glass-card rounded-xl3 shadow-card p-6 animate-fade-in">
      <header className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-start gap-3">
          {icon && (
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-pop ${
                accent ?? 'bg-brand-500'
              }`}
            >
              {icon}
            </div>
          )}
          <div>
            <h2 className="text-base font-semibold text-healing-text leading-7">{title}</h2>
            {desc && <p className="mt-0.5 text-xs text-healing-muted leading-5">{desc}</p>}
          </div>
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}

// ---------- Label / Input ----------
function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-healing-text">
          {required && <span className="text-red-500 mr-0.5">*</span>}
          {label}
        </span>
        {hint && <span className="text-xs text-healing-muted">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-white border border-healing-border text-sm text-healing-text placeholder:text-healing-muted/70 ' +
  'focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition-all';

// ---------- 主页面 ----------
export default function VerifyPage() {
  // --- 管理员 Token (simple 模式) ---
  const [adminToken, setAdminTokenState] = useState<string>(() => getAdminToken());
  const [adminTokenInput, setAdminTokenInput] = useState<string>('');

  // --- 表单: 厂商配置 ---
  const DEFAULT_ENDPOINT = 'https://api.minimaxi.com/v2/video_generation';
  const savedVendor = getSavedVendorConfig();
  // 自动纠正旧的错误域名 (api.minimax.chat -> api.minimaxi.com)
  if (savedVendor?.config?.endpoint?.includes('api.minimax.chat')) {
    savedVendor.config.endpoint = savedVendor.config.endpoint.replace(
      'api.minimax.chat',
      'api.minimaxi.com',
    );
  }
  const [vendor, setVendor] = useState<Vendor>(savedVendor?.vendor ?? 'minimax');
  const [config, setConfig] = useState<VendorConfig>(
    savedVendor?.config ?? {
      apiKey: '',
      endpoint: DEFAULT_ENDPOINT,
      model: 'MiniMax-H3',
    },
  );
  const [rememberVendor, setRememberVendor] = useState<boolean>(!!savedVendor);

  // --- 表单: Prompt + 参数 ---
  const [prompt, setPrompt] = useState<string>('一只小松鼠在樱花树下吃橡果，柔和阳光，治愈系');
  const [resolution, setResolution] = useState<Resolution>('768P');
  const [duration, setDuration] = useState<Duration>(5);
  const [ratio, setRatio] = useState<string>('16:9');

  // --- 运行状态机 ---
  const [state, setState] = useState<VerifyState>({ step: 'idle' });
  const runningRef = useRef<{ cancel: boolean }>({ cancel: false });

  // 工具：推进步骤
  const pushStep = useCallback((patch: Partial<VerifyState> & { step: StepKey }) => {
    setState((s) => ({ ...s, ...patch }));
  }, []);

  const failWith = useCallback((err: any, extra?: Partial<VerifyState>) => {
    const message: string =
      typeof err?.message === 'string' ? err.message : '未知错误';
    const code: string | undefined = typeof err?.code === 'string' ? err.code : undefined;
    setState((s) => ({
      ...s,
      ...extra,
      step: 'failed',
      error: message,
      errorCode: code,
    }));
  }, []);

  // --- 点击开始: 全流程串起来 ---
  const handleStart = useCallback(async () => {
    runningRef.current.cancel = false;
    setState({ step: 'submitted' });

    const params: GenerateParams = { resolution, duration, ratio };

    try {
      // ---- 1) 厂商生成 ----
      pushStep({ step: 'submitted' });
      const genResp = await vendorGenerate({ vendor, config, prompt, params });
      const taskId = genResp.taskId;
      pushStep({ step: 'vendor_processing', vendorTaskId: taskId });

      // 轮询厂商
      const pollResp = await pollWithTimeout({
        fn: () =>
          vendorPoll({ vendor, config, taskId }).catch((e) => {
            // 失败时如果是 401/402/429 直接停止
            if (/401|402|429/.test(e.code ?? '')) throw e;
            // 其他非致命网络问题继续轮询
            const fallback: VendorPollResponse = {
              status: 'running',
              error: e.message,
            };
            return fallback;
          }),
        shouldStop: (r) => r.status === 'succeeded' || r.status === 'failed',
        intervalMs: 3000,
        maxDurationMs: 10 * 60 * 1000, // 厂商最长 10 分钟
        timeoutMessage: '厂商视频生成本次超过 10 分钟仍未完成，请稍后重试',
        onTick: (r) => {
          if (runningRef.current.cancel) throw new Error('已取消');
          setState((s) => ({
            ...s,
            step: 'vendor_processing',
            vendorProgress: r.progress ?? s.vendorProgress,
            error: r.error && r.status !== 'failed' ? r.error : s.error,
          }));
        },
      });

      if (pollResp.status === 'failed') {
        failWith(
          { code: 'VENDOR_FAILED', message: pollResp.error || '厂商返回任务失败' },
          { vendorProgress: pollResp.progress },
        );
        return;
      }
      if (!pollResp.videoUrl) {
        failWith({ code: 'NO_VIDEO_URL', message: '厂商返回成功但未提供 videoUrl' });
        return;
      }
      pushStep({
        step: 'video_ready',
        videoUrl: pollResp.videoUrl,
        vendorProgress: pollResp.progress,
        error: undefined,
      });

      if (runningRef.current.cancel) return;

      // ---- 2) 提交方舟验证 ----
      pushStep({ step: 'verify_submitted' });
      const submitResp = await verifySubmit({ videoUrl: pollResp.videoUrl });
      pushStep({
        step: 'ark_processing',
        arkQueryId: submitResp.arkQueryId,
      });

      // 轮询方舟 (最长 90s)
      const arkResp = await pollWithTimeout({
        fn: () => verifyPoll({ arkQueryId: submitResp.arkQueryId }),
        shouldStop: (r) => r.status === 'succeeded' || r.status === 'failed',
        intervalMs: 2000,
        maxDurationMs: 90_000,
        timeoutMessage: '方舟分析超时（超过 90s），请稍后重试',
        onTick: () => {
          if (runningRef.current.cancel) throw new Error('已取消');
        },
      });

      if (arkResp.status === 'failed') {
        failWith(
          { code: 'ARK_FAILED', message: arkResp.error || arkResp.message || '方舟返回分析失败' },
          { message: arkResp.message },
        );
        return;
      }

      pushStep({
        step: 'result',
        isOfficial: arkResp.isOfficial,
        modelName: arkResp.modelName,
        resolution: arkResp.resolution,
        message: arkResp.message,
      });
    } catch (e: any) {
      if (runningRef.current.cancel) {
        failWith({ code: 'CANCELLED', message: '用户已取消本次流程' });
      } else {
        failWith(e);
      }
    }
  }, [config, duration, failWith, prompt, pushStep, ratio, resolution, vendor]);

  // 取消/重置
  const handleCancel = useCallback(() => {
    runningRef.current.cancel = true;
  }, []);

  const handleReset = useCallback(() => {
    runningRef.current.cancel = true;
    setState({ step: 'idle' });
    runningRef.current = { cancel: false };
  }, []);

  // 切换 rememberVendor -> 同步到 sessionStorage
  useEffect(() => {
    if (rememberVendor) saveVendorConfig(vendor, config);
    else clearSavedVendorConfig();
  }, [rememberVendor, vendor, config]);

  // admin token 保存
  const commitAdminToken = () => {
    const nextToken = adminTokenInput.trim() || adminToken;
    setAdminToken(nextToken);
    setAdminTokenState(nextToken);
  };

  // --- 判断各按钮可用性 ---
  const isBusy = useMemo(() => {
    const s = state.step;
    return (
      s === 'submitted' ||
      s === 'vendor_processing' ||
      s === 'verify_submitted' ||
      s === 'ark_processing'
    );
  }, [state.step]);

  const canStart = useMemo(() => {
    if (isBusy) return false;
    if (!adminToken) return false;
    if (!config.apiKey.trim() || !config.endpoint.trim() || !config.model.trim()) return false;
    if (!prompt.trim()) return false;
    return true;
  }, [adminToken, config, isBusy, prompt]);

  // 结果展示
  const failed = state.step === 'failed';
  const showTimeline = state.step !== 'idle';
  const showResult = state.step === 'result';
  const showVideo =
    state.step === 'video_ready' ||
    state.step === 'verify_submitted' ||
    state.step === 'ark_processing' ||
    state.step === 'result' ||
    (failed && !!state.videoUrl);

  return (
    <div className="min-h-screen">
      {/* 顶部栏 */}
      <header className="sticky top-0 z-30 backdrop-blur bg-white/60 border-b border-white/60">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-pop">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="currentColor">
                <path d="M8 5v14l11-7L8 5z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold text-healing-text leading-5">
                Seedance 产物溯源验证
              </div>
              <div className="text-xs text-healing-muted leading-4">
                Admin Only · 对比第三方厂商 vs 方舟技术特征
              </div>
            </div>
          </div>

          {/* Admin Token 输入 (simple 模式) */}
          <div className="flex items-center gap-2 flex-none">
            <div className="relative w-72 hidden sm:block">
              <input
                type="password"
                placeholder="请输入管理员 X-Admin-Token"
                value={adminToken ? '•••••••••••••• (已配置)' : adminTokenInput}
                onChange={(e) => setAdminTokenInput(e.target.value)}
                onFocus={(e) => {
                  if (adminToken) {
                    setAdminTokenInput('');
                    setAdminTokenState('');
                    clearAdminToken();
                  }
                  e.currentTarget.select();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitAdminToken();
                }}
                className={`w-full pr-20 ${inputCls} ${
                  adminToken ? 'border-emerald-300 bg-emerald-50/60' : ''
                }`}
              />
              <button
                type="button"
                onClick={commitAdminToken}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
              >
                应用
              </button>
            </div>
            <span
              className={`hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs ${
                adminToken
                  ? 'bg-emerald-50 text-result-true'
                  : 'bg-amber-50 text-result-false'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  adminToken ? 'bg-result-true' : 'bg-result-false animate-pulse'
                }`}
              />
              {adminToken ? '已鉴权' : '未鉴权'}
            </span>
          </div>
        </div>

        {/* 手机端 admin token */}
        <div className="sm:hidden px-5 pb-3">
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="X-Admin-Token (simple 模式)"
              value={adminToken ? '•••••••• (已配置)' : adminTokenInput}
              onChange={(e) => setAdminTokenInput(e.target.value)}
              onFocus={(e) => {
                if (adminToken) {
                  setAdminTokenInput('');
                  setAdminTokenState('');
                  clearAdminToken();
                }
                e.currentTarget.select();
              }}
              className={`flex-1 ${inputCls} ${adminToken ? 'border-emerald-300 bg-emerald-50/60' : ''}`}
            />
            <button
              onClick={commitAdminToken}
              className="px-3 py-2 rounded-xl bg-brand-500 text-white text-sm hover:bg-brand-600"
            >
              应用
            </button>
          </div>
        </div>
      </header>

      {/* 主体 */}
      <main className="max-w-6xl mx-auto px-5 py-6 space-y-5 pb-16">
        {/* 错误 Alert */}
        {failed && state.error && (
          <Alert
            tone="error"
            title="流程出错"
            message={state.error}
            code={state.errorCode}
            onClose={handleReset}
          />
        )}

        {/* 进度时间线 */}
        {showTimeline && (
          <Card
            title="执行进度"
              desc="提交 → 厂商生成 → 视频就绪 → 提交方舟 → 方舟分析 → 结果"
            icon={
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                <path
                  d="M4 6h16M4 12h10M4 18h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            }
            accent="bg-gradient-to-br from-brand-400 to-brand-600"
          >
            <ProgressTimeline step={state.step} failed={failed} />
            {(state.step === 'vendor_processing' && typeof state.vendorProgress === 'number') && (
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs text-healing-muted mb-1.5">
                  <span>厂商生成进度</span>
                  <span>{state.vendorProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-healing-border overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all duration-500"
                    style={{ width: `${Math.min(100, state.vendorProgress)}%` }}
                  />
                </div>
              </div>
            )}
          </Card>
        )}

        {/* 表单：厂商配置 + 生成参数（两列） */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 厂商配置 */}
          <Card
            title="厂商配置"
            desc="API Key 仅单次透传，不落库。可选临时保存到浏览器 sessionStorage。"
            icon={
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M7 10h2M7 14h6M15 14h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            }
            accent="bg-gradient-to-br from-violet-400 to-indigo-600"
          >
            <div className="space-y-4">
              <Field label="厂商 / Vendor" required>
                <select
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value as Vendor)}
                  disabled={isBusy}
                  className={inputCls}
                >
                  <option value="minimax">MiniMax (已支持)</option>
                  <option value="seedance" disabled>Seedance (待接入)</option>
                  <option value="custom" disabled>Custom (待接入)</option>
                </select>
              </Field>

              <Field label="API Key" required hint="不会被保存 (除非显式勾选)">
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="MiniMax API Key"
                  value={config.apiKey}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, apiKey: e.target.value }))
                  }
                  disabled={isBusy}
                  className={`${inputCls} font-mono`}
                />
              </Field>

              <Field label="Endpoint" required hint="v2 通常为 https://api.minimaxi.com/v2/video_generation">
                <input
                  type="text"
                  placeholder="https://..."
                  value={config.endpoint}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, endpoint: e.target.value }))
                  }
                  disabled={isBusy}
                  className={`${inputCls} font-mono text-xs`}
                />
              </Field>

              <Field label="Model" required>
                <input
                  type="text"
                  placeholder="如 MiniMax-H3"
                  value={config.model}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, model: e.target.value }))
                  }
                  disabled={isBusy}
                  className={inputCls}
                />
              </Field>

              <label className="inline-flex items-center gap-2 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={rememberVendor}
                  onChange={(e) => setRememberVendor(e.target.checked)}
                  disabled={isBusy}
                  className="w-4 h-4 accent-brand-500 rounded"
                />
                <span className="text-sm text-healing-text">
                  临时保存到浏览器（sessionStorage，标签关闭即清空）
                </span>
              </label>
            </div>
          </Card>

          {/* 生成参数 + Prompt */}
          <Card
            title="生成参数与 Prompt"
            desc="输入你的 Prompt，选择分辨率/时长/画面比例。"
            icon={
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                <path
                  d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
            accent="bg-gradient-to-br from-emerald-400 to-teal-600"
          >
            <div className="space-y-4">
              <Field label="Prompt" required hint={`${prompt.length} / 2000`}>
                <textarea
                  rows={4}
                  placeholder="描述你想生成的视频内容..."
                  value={prompt}
                  onChange={(e) =>
                    setPrompt(e.target.value.slice(0, 2000))
                  }
                  disabled={isBusy}
                  className={`${inputCls} resize-none leading-6`}
                />
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <Field label="分辨率" required>
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value as Resolution)}
                    disabled={isBusy}
                    className={inputCls}
                  >
                    {RESOLUTION_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </Field>
                <Field label="时长 (秒)" required>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value) as Duration)}
                    disabled={isBusy}
                    className={inputCls}
                  >
                    {DURATION_OPTIONS.map((d) => (
                      <option key={d} value={d}>{d}s</option>
                    ))}
                  </select>
                </Field>
                <Field label="画面比例">
                  <select
                    value={ratio}
                    onChange={(e) => setRatio(e.target.value)}
                    disabled={isBusy}
                    className={inputCls}
                  >
                    {RATIO_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </Card>
        </div>

        {/* 操作区按钮 */}
        <div className="glass-card rounded-xl3 shadow-card p-5 flex flex-wrap items-center justify-between gap-4 animate-fade-in">
          <div className="text-sm text-healing-muted leading-6">
            {canStart
                ? '点击「开始验证」将调用厂商生成视频，随后将厂商 URL 提交方舟查询。'
              : !adminToken
              ? '请先在顶部输入管理员 X-Admin-Token 后，再开始。'
              : '请完整填写厂商配置和 Prompt。'}
          </div>
          <div className="flex items-center gap-2">
            {isBusy ? (
              <>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2.5 rounded-xl bg-white border border-healing-border text-healing-text hover:bg-healing-border/40 transition-colors text-sm"
                >
                  取消本次
                </button>
                <button
                  disabled
                  className="px-5 py-2.5 rounded-xl bg-brand-500/80 text-white text-sm inline-flex items-center gap-2"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 animate-spin" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
                    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  处理中…
                </button>
              </>
            ) : (
              <>
                {state.step !== 'idle' && (
                  <button
                    onClick={handleReset}
                    className="px-4 py-2.5 rounded-xl bg-white border border-healing-border text-healing-text hover:bg-healing-border/40 transition-colors text-sm"
                  >
                    重置流程
                  </button>
                )}
                <button
                  onClick={handleStart}
                  disabled={!canStart}
                  className={`px-6 py-2.5 rounded-xl text-white text-sm font-medium inline-flex items-center gap-2 transition-all ${
                    canStart
                      ? 'bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 shadow-pop'
                      : 'bg-healing-muted/60 cursor-not-allowed'
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                    <path d="M8 5v14l11-7L8 5z" />
                  </svg>
                  开始验证
                </button>
              </>
            )}
          </div>
        </div>

        {/* 视频预览 + 方舟结果 */}
        {(showVideo || showResult) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* 视频预览 */}
            <Card
              title="视频预览"
              desc={state.arkQueryId ? '厂商 URL 已提交方舟' : '厂商生成的原始视频 URL'}
              icon={
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                  <rect x="2" y="5" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
                  <path d="M10 9l5 3-5 3V9Z" fill="currentColor" />
                </svg>
              }
              accent="bg-gradient-to-br from-pink-400 to-rose-600"
            >
              {state.videoUrl ? (
                <div className="space-y-3">
                  <div className="rounded-xl2 overflow-hidden bg-black/80 aspect-video relative shadow-card">
                    <video
                      key={state.videoUrl}
                      src={state.videoUrl}
                      controls
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <Row label="厂商 URL">
                      <a
                        href={state.videoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-600 hover:underline break-all font-mono"
                      >
                        {state.videoUrl}
                      </a>
                    </Row>
                    {state.arkQueryId && (
                      <Row label="Ark QueryID">
                        <span className="font-mono text-healing-text">{state.arkQueryId}</span>
                      </Row>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl2 border border-dashed border-healing-border bg-white/50 aspect-video flex items-center justify-center text-healing-muted text-sm">
                  暂无视频
                </div>
              )}
            </Card>

            {/* 方舟验证结果 */}
            <div>
              {showResult ? (
                <ArkResultCard
                  isOfficial={state.isOfficial}
                  modelName={state.modelName}
                  resolution={state.resolution}
                  message={state.message}
                />
              ) : (
                <Card
                  title="方舟验证结果"
                  desc="视频就绪后，将自动提交方舟官方进行技术特征比对"
                  icon={
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                      <path
                        d="M12 2 3 7v6c0 5 3.8 9.3 9 10 5.2-.7 9-5 9-10V7l-9-5Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                      <path
                        d="m9 12 2 2 4-4"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  }
                  accent="bg-gradient-to-br from-emerald-400 to-green-600"
                >
                  {failed ? (
                    <div className="text-sm text-red-600 leading-6">
                      流程在上述步骤中断，尚未得出方舟验证结论。请修正错误后重试。
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                        <div className="text-sm text-healing-text">
                          {state.step === 'verify_submitted'
                            ? '正在将厂商 URL 提交方舟…'
                            : state.step === 'ark_processing'
                            ? '厂商 URL 已提交方舟，正在分析视频特征（通常需要几十秒）…'
                            : '等待将厂商 URL 提交方舟分析…'}
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-healing-border overflow-hidden">
                        <div className="h-full w-1/3 bg-gradient-to-r from-brand-400 to-brand-600 animate-pulse-slow" />
                      </div>
                      <div className="text-xs text-healing-muted leading-6">
                        方舟最长轮询 90s；超时后请稍后再试。
                      </div>
                    </div>
                  )}
                </Card>
              )}
            </div>
          </div>
        )}

        {/* 页脚说明 */}
        <footer className="pt-4 text-center text-xs text-healing-muted leading-5 space-y-0.5">
          <div>本页面为 Admin-only 工具；厂商 API Key 不落库、不写 localStorage；历史记录不持久化。</div>
        </footer>
      </main>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-start">
      <span className="w-24 flex-none text-healing-muted">{label}</span>
      <span className="flex-1 min-w-0 text-healing-text">{children}</span>
    </div>
  );
}
