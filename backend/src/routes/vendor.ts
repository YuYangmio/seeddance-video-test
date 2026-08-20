import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { minimaxCreate, minimaxPoll } from '../vendors/minimax';
import type {
  VendorGenerateResponse,
  VendorPollResponse,
} from '../types';

const vendorRouter = new Hono();

// ---- Request Schemas ----

const vendorSchema = z.enum(['minimax', 'seedance', 'custom']);

const vendorConfigSchema = z.object({
  apiKey: z.string().min(1, 'apiKey 不能为空'),
  endpoint: z.string().min(1, 'endpoint 不能为空'),
  model: z.string().min(1, 'model 不能为空'),
});

const generateParamsSchema = z.object({
  resolution: z.enum(['768P', '2K', '1080P', '720P']),
  duration: z.coerce
    .number()
    .pipe(
      z.union([
        z.literal(4),
        z.literal(5),
        z.literal(6),
        z.literal(7),
        z.literal(8),
        z.literal(9),
        z.literal(10),
        z.literal(11),
        z.literal(12),
        z.literal(13),
        z.literal(14),
        z.literal(15),
      ]),
    ),
  ratio: z.string().optional(),
});

const generateReqSchema = z.object({
  vendor: vendorSchema,
  config: vendorConfigSchema,
  prompt: z.string().min(1, 'prompt 不能为空').max(2000),
  params: generateParamsSchema,
});

const pollReqSchema = z.object({
  vendor: z.string().min(1),
  config: vendorConfigSchema,
  taskId: z.string().min(1),
});

// ---- POST /vendor/generate ----
vendorRouter.post(
  '/generate',
  zValidator('json', generateReqSchema, (result, c) => {
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
    const body = c.req.valid('json');
    try {
      if (body.vendor === 'seedance' || body.vendor === 'custom') {
        return c.json(
          {
            error: {
              code: 'VENDOR_NOT_IMPLEMENTED',
              message: `vendor ${body.vendor} 暂未实现，目前仅支持 minimax`,
            },
          },
          400,
        );
      }

      const res = await minimaxCreate(body.config, body.prompt, body.params);
      const resp: VendorGenerateResponse = { taskId: res.taskId };
      return c.json(resp, 200);
    } catch (err) {
      const e = err as any;
      const upstreamStatus = e.upstreamStatus ?? null;
      const upstreamBody = e.upstreamBody ?? null;

      // 401/402/429 原样透传 message
      if (upstreamStatus === 401 || upstreamStatus === 402 || upstreamStatus === 429) {
        const msg =
          (upstreamBody && typeof upstreamBody === 'object'
            ? (upstreamBody as any).message ||
              (upstreamBody as any).error_msg ||
              JSON.stringify(upstreamBody)
            : String(e.message)) ?? '上游厂商错误';
        return c.json(
          {
            error: {
              code: `VENDOR_HTTP_${upstreamStatus}`,
              message: String(msg).slice(0, 800),
            },
          },
          502,
        );
      }

      // 其他错误
      return c.json(
        {
          error: {
            code: 'VENDOR_CREATE_FAILED',
            message: e?.message?.slice(0, 800) ?? '厂商生成任务创建失败',
          },
        },
        502,
      );
    }
  },
);

// ---- POST /vendor/poll ----
vendorRouter.post(
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
    const body = c.req.valid('json');
    try {
      if (body.vendor !== 'minimax') {
        return c.json(
          {
            error: {
              code: 'VENDOR_NOT_IMPLEMENTED',
              message: `vendor ${body.vendor} 暂未实现，目前仅支持 minimax`,
            },
          },
          400,
        );
      }

      const res: VendorPollResponse = await minimaxPoll(body.config, body.taskId);
      return c.json(res, 200);
    } catch (err) {
      const e = err as any;
      const upstreamStatus = e.upstreamStatus ?? null;
      const upstreamBody = e.upstreamBody ?? null;

      if (upstreamStatus === 401 || upstreamStatus === 402 || upstreamStatus === 429) {
        const msg =
          (upstreamBody && typeof upstreamBody === 'object'
            ? (upstreamBody as any).message ||
              (upstreamBody as any).error_msg ||
              JSON.stringify(upstreamBody)
            : String(e.message)) ?? '上游厂商错误';
        return c.json(
          {
            error: {
              code: `VENDOR_HTTP_${upstreamStatus}`,
              message: String(msg).slice(0, 800),
            },
          },
          502,
        );
      }

      return c.json(
        {
          error: {
            code: 'VENDOR_POLL_FAILED',
            message: e?.message?.slice(0, 800) ?? '厂商任务状态查询失败',
          },
        },
        502,
      );
    }
  },
);

export { vendorRouter };
