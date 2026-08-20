import axios, { AxiosError } from 'axios';
import type {
  GenerateParams,
  VendorConfig,
  VendorPollResponse,
} from '../types';

/**
 * MiniMax 视频生成适配
 *
 * 当前支持模型: MiniMax-H3 (v2 端点)
 * Create:
 *   POST {base}/v2/video_generation
 *   (如果 endpoint 已经带了路径，则直接 POST endpoint)
 *
 * Poll:
 *   GET {base}/v2/query/video_generation/{taskId}  (H3 v2)
 *   GET {base}/v1/query/video_generation           (旧模型兼容)
 *
 * H3 v2 响应结构 (2026-08):
 *   { task: { id, status: "succeeded"|"failed"|"processing"|"queued", content: { url }, ... } }
 *
 * 旧版响应结构:
 *   { status, file_url | content: [{ url }] }
 */

const MINIMAX_H3_MODEL = 'MiniMax-H3';

function normalizeEndpoint(endpoint: string): { origin: string; base: string; createPath: string } {
  let ep = endpoint.trim();
  if (!ep.startsWith('http://') && !ep.startsWith('https://')) {
    ep = 'https://' + ep;
  }
  const u = new URL(ep);
  const origin = u.origin;
  // 提取 API base: 如果 endpoint 包含 /vN/... 路径，则取版本号之前的部分作为 base
  // 例如 https://api.minimaxi.com/v2/video_generation → base = https://api.minimaxi.com
  // 例如 https://custom.com/api/ark/v2/video_generation → base = https://custom.com/api/ark
  const m = u.pathname.match(/^(.+?)\/v\d+\/video_generation/);
  const base = m && m[1] && m[1] !== '/' ? origin + m[1] : origin;
  const createPath = u.pathname.length > 1
    ? u.pathname.replace(/\/$/, '')
    : '/v2/video_generation';
  return { origin, base, createPath };
}

function normalizeDuration(d: number): number {
  const n = Math.round(Number(d) || 5);
  if (n < 4) return 4;
  if (n > 15) return 15;
  return n;
}

export interface MiniMaxCreateResult {
  taskId: string;
}

export async function minimaxCreate(
  config: VendorConfig,
  prompt: string,
  params: GenerateParams,
): Promise<MiniMaxCreateResult> {
  const { origin, base, createPath } = normalizeEndpoint(config.endpoint);
  const apiKey = config.apiKey.trim();
  const model = config.model.trim() || MINIMAX_H3_MODEL;

  const createUrl = `${origin}${createPath}`;

  const body: any = {
    model,
    content: [{ type: 'text', text: prompt }],
    resolution: params.resolution,
    duration: normalizeDuration(params.duration),
    ratio: params.ratio || '16:9',
  };

  try {
    console.log(`[MiniMax create] POST ${createUrl}, model=${model}, prompt="${prompt.slice(0, 50)}"`);
    const resp = await axios.post(createUrl, body, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });
    const d = resp.data as any;
    const taskId = d.task_id ?? d.data?.task_id ?? d.task?.id ?? d.id;
    if (!taskId) {
      throw new Error(
        `MiniMax 创建任务返回缺少 task_id: body=${JSON.stringify(d).slice(0, 500)}`,
      );
    }
    return { taskId: String(taskId) };
  } catch (err) {
    const e = err as AxiosError | Error;
    if ('isAxiosError' in e && e.isAxiosError) {
      const status = e.response?.status;
      const body = JSON.stringify(e.response?.data ?? '').slice(0, 800);
      const msg = `MiniMax 创建任务失败: HTTP=${status}, body=${body}`;
      const wrapped: any = new Error(msg);
      wrapped.upstreamStatus = status;
      wrapped.upstreamBody = e.response?.data ?? null;
      throw wrapped;
    }
    throw err;
  }
}

export async function minimaxPoll(
  config: VendorConfig,
  taskId: string,
): Promise<VendorPollResponse> {
  const apiKey = config.apiKey.trim();
  const { base } = normalizeEndpoint(config.endpoint);

  const candidates = [
    `${base}/v2/query/video_generation/${encodeURIComponent(taskId)}`,
    `${base}/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`,
    `${base}/v2/video_generation/${encodeURIComponent(taskId)}`,
    `${base}/v1/video_generation/query?task_id=${encodeURIComponent(taskId)}`,
  ];

  let lastErr: any = null;
  for (const url of candidates) {
    try {
      console.log(`[MiniMax poll] taskId=${taskId}, trying: ${url}`);
      const resp = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 15_000,
      });
      const d = resp.data as any;
      console.log(`[MiniMax poll] taskId=${taskId}, response:`, JSON.stringify(d).slice(0, 500));

      // H3 v2 新结构: { task: { status, content: { url }, ... } }
      // 旧结构: { status, file_url | content: [{ url }] }
      const task = d.task ?? d.data?.task ?? d;
      const rawStatus: string = task.status ?? d.status ?? '';
      const progress: number | undefined =
        typeof task.progress === 'number'
          ? task.progress
          : typeof d.progress === 'number'
            ? d.progress
            : undefined;

      let status: VendorPollResponse['status'];
      if (/success/i.test(rawStatus)) status = 'succeeded';
      else if (/fail|error/i.test(rawStatus)) status = 'failed';
      else status = 'running';

      let videoUrl: string | undefined;
      // 1) H3 新结构: task.content.url
      if (task.content && typeof task.content.url === 'string') {
        videoUrl = task.content.url;
      }
      // 2) 旧结构: file_url
      else if (typeof task.file_url === 'string') {
        videoUrl = task.file_url;
      } else if (typeof d.file_url === 'string') {
        videoUrl = d.file_url;
      }
      // 3) 旧结构: content 数组
      else if (Array.isArray(task.content) && task.content.length) {
        const first = task.content[0];
        if (typeof first?.url === 'string') videoUrl = first.url;
        else if (typeof first === 'string') videoUrl = first;
      } else if (Array.isArray(d.content) && d.content.length) {
        const first = d.content[0];
        if (typeof first?.url === 'string') videoUrl = first.url;
      }

      let error: string | undefined;
      if (status === 'failed') {
        error =
          (typeof task.error === 'string' ? task.error : undefined) ||
          (typeof task.error?.message === 'string' ? task.error.message : undefined) ||
          (typeof d.error === 'string' ? d.error : undefined) ||
          (typeof d.error?.message === 'string' ? d.error.message : undefined) ||
          (typeof task.message === 'string' ? task.message : undefined) ||
          (typeof d.message === 'string' ? d.message : undefined) ||
          `MiniMax 任务失败: status=${rawStatus}`;
      }

      return { status, progress, videoUrl, error };
    } catch (err) {
      lastErr = err;
      const e = err as AxiosError;
      if (!('isAxiosError' in e) || !e.isAxiosError) break;
      const status = e.response?.status;
      if (status !== 404 && status !== 400) {
        const body = JSON.stringify(e.response?.data ?? '').slice(0, 800);
        const wrapped: any = new Error(
          `MiniMax 查询任务失败: HTTP=${status}, body=${body}`,
        );
        wrapped.upstreamStatus = status;
        wrapped.upstreamBody = e.response?.data ?? null;
        throw wrapped;
      }
    }
  }
  if (lastErr) {
    const e = lastErr as AxiosError;
    const status = e.response?.status;
    const body = JSON.stringify(e.response?.data ?? '').slice(0, 800);
    const wrapped: any = new Error(
      `MiniMax 查询任务失败: v1/v2 接口均返回 HTTP=${status}, body=${body}`,
    );
    wrapped.upstreamStatus = status;
    wrapped.upstreamBody = e.response?.data ?? null;
    throw wrapped;
  }
  throw new Error('MiniMax 查询任务失败: 未知错误');
}