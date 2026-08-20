import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  createOfficialResultQuery,
  getOfficialResult,
} from '../clients/arkClient';
import type {
  VerifySubmitResponse,
  VerifyPollResponse,
  ArkPollStatus,
  ArkIsOfficial,
  ArkResourceType,
} from '../types';

const verifyRouter = new Hono();

// ---- Request Schemas ----

const submitReqSchema = z.object({
  videoUrl: z
    .string()
    .url('videoUrl 必须是合法 URL')
    .refine((url) => ['http:', 'https:'].includes(new URL(url).protocol), {
      message: 'videoUrl 仅支持 HTTP/HTTPS URL',
    }),
}).strict();

const pollReqSchema = z.object({
  arkQueryId: z.string().min(1, 'arkQueryId 不能为空'),
});

// ---- POST /verify/submit ----
verifyRouter.post(
  '/submit',
  zValidator('json', submitReqSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: result.error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; '),
          },
        },
        400,
      );
    }
  }),
  async (c) => {
    const { videoUrl } = c.req.valid('json');
    try {
      const arkQueryId = await createOfficialResultQuery(videoUrl);

      const resp: VerifySubmitResponse = {
        arkQueryId,
      };
      return c.json(resp, 200);
    } catch (err) {
      const e = err as any;
      const msg = String(e?.message ?? '').slice(0, 800);
      return c.json(
        {
          error: {
            code: 'VERIFY_SUBMIT_FAILED',
            message: msg || '验证提交失败',
          },
        },
        502,
      );
    }
  },
);

// ---- POST /verify/poll ----
verifyRouter.post(
  '/poll',
  zValidator('json', pollReqSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: result.error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; '),
          },
        },
        400,
      );
    }
  }),
  async (c) => {
    const { arkQueryId } = c.req.valid('json');
    try {
      const r = await getOfficialResult(arkQueryId);

      const status: ArkPollStatus =
        r.Status === 'succeeded'
          ? 'succeeded'
          : r.Status === 'failed'
          ? 'failed'
          : 'running';

      const resp: VerifyPollResponse = {
        status,
        isOfficial: r.IsOfficial
          ? (r.IsOfficial as ArkIsOfficial)
          : undefined,
        modelName: r.ModelName,
        resolution: r.Resolution,
        resourceType: r.ResourceType as ArkResourceType | undefined,
        message: r.Message,
        error: status === 'failed' ? r.Message || '方舟分析失败' : undefined,
      };
      return c.json(resp, 200);
    } catch (err) {
      const e = err as any;
      return c.json(
        {
          error: {
            code: 'ARK_POLL_FAILED',
            message: e?.message?.slice(0, 800) ?? '方舟结果查询失败',
          },
        },
        502,
      );
    }
  },
);

export { verifyRouter };
