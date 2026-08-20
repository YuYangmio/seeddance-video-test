import axios, { AxiosError } from 'axios';
import type {
  GenerateParams,
  VendorConfig,
  VendorPollResponse,
} from '../types';

/**
 * Seedance (火山方舟) 视频生成适配
 *
 * API 文档:
 *   Create: POST {base}/api/v3/contents/generations/tasks
 *   Poll:   GET  {base}/api/v3/contents/generations/tasks/{taskId}
 *
 * 默认 base: https://ark.cn-beijing.volces.com
 * 默认 model: doubao-seedance-2-0-260128
 *
 * 请求体 (文生视频):
 *   {
 *     model: "...",
 *     content: [{ type: "text", text: "..." }],
 *     resolution: "720p" | "1080p",
 *     ratio: "16:9" | ...,
 *     duration: 5
 *   }
 *
 * 响应:
 *   Create: { id: "cgt-xxx" }
 *   Poll:   { id, status: queued|running|succeeded|failed, content: { video_url }, resolution, ratio, duration, error }
 */

const DEFAULT_BASE = 'https://ark.cn-beijing.volces.com';
const CREATE_PATH = '/api/v3/contents/generations/tasks';

function parseEndpoint(endpoint: string): { baseUrl: string; createUrl: string } {
  let ep = endpoint.trim();
  if (!ep.startsWith('http://') && !ep.startsWith('https://')) {
    ep = 'https://' + ep;
  }
  const u = new URL(ep);
  if (u.pathname === '/' || u.pathname === '') {
    return { baseUrl: u.origin, createUrl: u.origin + CREATE_PATH };
  }
  return { baseUrl: u.origin, createUrl: u.origin + u.pathname.replace(/\/$/, '') };
}

function normalizeDuration(d: number): number {
  const n = Math.round(Number(d) || 5);
  if (n < 4) return 4;
  if (n > 15) return 15;
  return n;
}

function normalizeRatio(r: string): string {
  const ratio = (r || '16:9').trim();
  return ratio || '16:9';
}

export interface SeedanceCreateResult {
  taskId: string;
}

export async function seedanceCreate(
  config: VendorConfig,
  prompt: string,
  params: GenerateParams,
): Promise<SeedanceCreateResult> {
  const { createUrl } = parseEndpoint(config.endpoint);
  const apiKey = config.apiKey.trim();
  const model = config.model.trim();

  const body: Record<string, unknown> = {
    model,
    content: [
      { type: 'text', text: prompt },
    ],
    resolution: params.resolution,
    ratio: normalizeRatio(params.ratio || '16:9'),
    duration: normalizeDuration(params.duration),
  };

  try {
    console.log(`[Seedance create] POST ${createUrl}, model=${model}, prompt="${prompt.slice(0, 50)}"`);
    const resp = await axios.post(createUrl, body, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });
    const d = resp.data as any;
    const taskId = d.id ?? d.task_id ?? d.data?.id;
    if (!taskId) {
      throw new Error(
        `Seedance 创建任务返回缺少 id: body=${JSON.stringify(d).slice(0, 500)}`,
      );
    }
    console.log(`[Seedance create] taskId=${taskId}`);
    return { taskId: String(taskId) };
  } catch (err) {
    const e = err as AxiosError | Error;
    if ('isAxiosError' in e && e.isAxiosError) {
      const status = e.response?.status;
      const body = JSON.stringify(e.response?.data ?? '').slice(0, 800);
      console.log(`[Seedance create] HTTP=${status}, body=${body}`);
      const wrapped: any = new Error(`Seedance 创建任务失败: HTTP=${status}, body=${body}`);
      wrapped.upstreamStatus = status;
      wrapped.upstreamBody = e.response?.data ?? null;
      throw wrapped;
    }
    throw err;
  }
}

export async function seedancePoll(
  config: VendorConfig,
  taskId: string,
): Promise<VendorPollResponse> {
  const apiKey = config.apiKey.trim();
  const { baseUrl } = parseEndpoint(config.endpoint);
  const pollUrl = `${baseUrl}/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`;

  try {
    console.log(`[Seedance poll] taskId=${taskId}, GET ${pollUrl}`);
    const resp = await axios.get(pollUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 15_000,
    });
    const d = resp.data as any;
    console.log(`[Seedance poll] taskId=${taskId}, status=${d.status}, keys=${Object.keys(d).join(',')}`);

    const rawStatus: string = String(d.status ?? '');

    let status: VendorPollResponse['status'];
    if (/succe/i.test(rawStatus)) status = 'succeeded';
    else if (/fail|error/i.test(rawStatus)) status = 'failed';
    else if (/cancel/i.test(rawStatus)) status = 'failed';
    else status = 'running';

    let videoUrl: string | undefined;
    if (d.content && typeof d.content.video_url === 'string') {
      videoUrl = d.content.video_url;
    } else if (typeof d.video_url === 'string') {
      videoUrl = d.video_url;
    } else if (d.content && typeof d.content.url === 'string') {
      videoUrl = d.content.url;
    }

    if (videoUrl) {
      try { videoUrl = decodeURIComponent(videoUrl); } catch { /* keep */ }
    }

    let error: string | undefined;
    if (status === 'failed') {
      const errObj = d.error;
      if (errObj && typeof errObj.message === 'string') {
        error = errObj.message;
      } else if (typeof d.message === 'string') {
        error = d.message;
      } else {
        error = `Seedance 任务失败: status=${rawStatus}`;
      }
    }

    return { status, videoUrl, error };
  } catch (err) {
    const e = err as AxiosError | Error;
    if ('isAxiosError' in e && e.isAxiosError) {
      const status = e.response?.status;
      const body = JSON.stringify(e.response?.data ?? '').slice(0, 800);
      console.log(`[Seedance poll] HTTP=${status}, body=${body}`);
      const wrapped: any = new Error(`Seedance 查询任务失败: HTTP=${status}, body=${body}`);
      wrapped.upstreamStatus = status;
      wrapped.upstreamBody = e.response?.data ?? null;
      throw wrapped;
    }
    throw err;
  }
}
