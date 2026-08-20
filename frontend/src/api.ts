import axios from 'axios';
import type {
  Vendor,
  VendorConfig,
  GenerateParams,
  VendorGenerateResponse,
  VendorPollResponse,
  VerifySubmitResponse,
  VerifyPollResponse,
  ApiErrorResponse,
} from './types';

// simple 模式下的 admin token（用户手动填，存 sessionStorage）
const ADMIN_TOKEN_KEY = 'verify_admin_token';
export function getAdminToken(): string {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
}
export function setAdminToken(token: string) {
  if (typeof window !== 'undefined') window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}
export function clearAdminToken() {
  if (typeof window !== 'undefined') window.sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

// 厂商配置（临时保存到 sessionStorage，标签关闭即清空）
const VENDOR_CFG_KEY = 'verify_vendor_config';
export function getSavedVendorConfig(): { vendor: Vendor; config: VendorConfig } | null {
  try {
    const raw = window.sessionStorage.getItem(VENDOR_CFG_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
export function saveVendorConfig(vendor: Vendor, config: VendorConfig) {
  window.sessionStorage.setItem(VENDOR_CFG_KEY, JSON.stringify({ vendor, config }));
}
export function clearSavedVendorConfig() {
  window.sessionStorage.removeItem(VENDOR_CFG_KEY);
}

// 统一 axios 实例
const http = axios.create({
  baseURL: '/',
  timeout: 60_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截：注入 X-Admin-Token
http.interceptors.request.use((cfg) => {
  const tok = getAdminToken();
  if (tok) cfg.headers.set('X-Admin-Token', tok);
  return cfg;
});

// 响应拦截：把业务错误标准化抛出
http.interceptors.response.use(
  (resp) => resp,
  (err) => {
    const data = err.response?.data as ApiErrorResponse | undefined;
    const code = data?.error?.code ?? `HTTP_${err.response?.status ?? 'NO_STATUS'}`;
    const msg = data?.error?.message ?? err.message ?? '网络错误';
    const wrapped: any = new Error(msg);
    wrapped.code = code;
    wrapped.status = err.response?.status;
    return Promise.reject(wrapped);
  },
);

// ---- API 封装 ----

export async function vendorGenerate(params: {
  vendor: Vendor;
  config: VendorConfig;
  prompt: string;
  params: GenerateParams;
}): Promise<VendorGenerateResponse> {
  const resp = await http.post<VendorGenerateResponse>('/vendor/generate', params);
  return resp.data;
}

export async function vendorPoll(params: {
  vendor: string;
  config: VendorConfig;
  taskId: string;
}): Promise<VendorPollResponse> {
  const resp = await http.post<VendorPollResponse>('/vendor/poll', params);
  return resp.data;
}

export async function verifySubmit(params: {
  videoUrl: string;
}): Promise<VerifySubmitResponse> {
  const resp = await http.post<VerifySubmitResponse>('/verify/submit', {
    videoUrl: params.videoUrl,
  });
  return resp.data;
}

export async function verifyPoll(params: {
  arkQueryId: string;
}): Promise<VerifyPollResponse> {
  const resp = await http.post<VerifyPollResponse>('/verify/poll', params);
  return resp.data;
}

// 轮询辅助：带次数/间隔；当命中条件返回结果，否则重试
export interface PollOptions<T> {
  fn: () => Promise<T>;
  shouldStop: (r: T) => boolean; // 返回 true 停止
  intervalMs: number;
  maxDurationMs: number;
  onTick?: (r: T, elapsedMs: number) => void;
  timeoutMessage?: string;
}

export async function pollWithTimeout<T>(opts: PollOptions<T>): Promise<T> {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const r = await opts.fn();
    if (opts.shouldStop(r)) return r;
    const elapsed = Date.now() - start;
    opts.onTick?.(r, elapsed);
    if (elapsed >= opts.maxDurationMs) {
      throw new Error(opts.timeoutMessage ?? '轮询超时');
    }
    await sleep(opts.intervalMs);
  }
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
