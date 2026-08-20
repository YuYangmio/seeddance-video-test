import { createHmac, createHash } from 'node:crypto';
import axios, { AxiosError } from 'axios';
import { loadEnv } from '../env';
import type {
  ArkCreateQueryResponse,
  ArkGetResultResponse,
} from '../types';

/**
 * 方舟 OpenAPI 客户端
 * 基于火山 SigV4 (HMAC-SHA256) 标准签名
 *
 * 签名规范（参考火山公共参数）：
 * - Host: open.volcengineapi.com
 * - Service: ark
 * - Version: 2024-01-01
 * - SignedHeaders: host;x-content-sha256;x-date
 */

const ARK_SERVICE = 'ark';
const ARK_VERSION = '2024-01-01';
const ARK_HOST = 'ark.cn-beijing.volcengineapi.com';

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function getDateStrings(date: Date): { xDate: string; scopeDate: string } {
  const y = date.getUTCFullYear();
  const m = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  const hh = pad2(date.getUTCHours());
  const mm = pad2(date.getUTCMinutes());
  const ss = pad2(date.getUTCSeconds());
  return {
    xDate: `${y}${m}${d}T${hh}${mm}${ss}Z`,
    scopeDate: `${y}${m}${d}`,
  };
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function deriveSigningKey(
  sk: string,
  date: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmacSha256(Buffer.from(sk), date);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'request');
  return kSigning;
}

export interface SignedRequest {
  url: string;
  method: 'POST' | 'GET';
  headers: Record<string, string>;
  body?: string;
}

export interface SignOptions {
  action: string;
  queryExtra?: Record<string, string>;
  body?: string;
  method?: 'POST' | 'GET';
}

/**
 * 构建带 SigV4 签名的请求（统一单入口，避免签名字段不一致）
 */
export function buildSignedRequest(opts: SignOptions): SignedRequest {
  const env = loadEnv();
  const ak = env.VOLCENGINE_ACCESS_KEY.trim();
  const sk = env.VOLCENGINE_SECRET_KEY.trim();
  const region = env.ARK_REGION.trim() || 'cn-beijing';
  const method = (opts.method ?? 'POST').toUpperCase() as 'POST' | 'GET';
  const body = opts.body ?? '';

  const now = new Date();
  const { xDate, scopeDate } = getDateStrings(now);
  const payloadHash = sha256Hex(body);

  // 1) CanonicalQueryString — Action + Version 在前，其他按字母序
  const queryMap: Record<string, string> = {
    Action: opts.action,
    Version: ARK_VERSION,
    ...(opts.queryExtra ?? {}),
  };
  const canonicalQueryString = Object.keys(queryMap)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryMap[k])}`)
    .join('&');

  // 2) CanonicalHeaders — host / x-content-sha256 / x-date 顺序
  const canonicalHeaders =
    `host:${ARK_HOST}\n` +
    `x-content-sha256:${payloadHash}\n` +
    `x-date:${xDate}\n`;
  const signedHeaders = 'host;x-content-sha256;x-date';

  // 3) CanonicalRequest
  const canonicalUri = '/';
  const canonicalRequest =
    `${method}\n` +
    `${canonicalUri}\n` +
    `${canonicalQueryString}\n` +
    `${canonicalHeaders}\n` +
    `${signedHeaders}\n` +
    `${payloadHash}`;

  // 4) StringToSign
  const credentialScope = `${scopeDate}/${region}/${ARK_SERVICE}/request`;
  const hashedCanonicalRequest = sha256Hex(canonicalRequest);
  const stringToSign =
    `HMAC-SHA256\n` + `${xDate}\n` + `${credentialScope}\n` + `${hashedCanonicalRequest}`;

  // 5) Signature
  const signingKey = deriveSigningKey(sk, scopeDate, region, ARK_SERVICE);
  const signature = hmacSha256(signingKey, stringToSign).toString('hex');

  // 6) Authorization header
  const authorization =
    `HMAC-SHA256 ` +
    `Credential=${ak}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, ` +
    `Signature=${signature}`;

  const headers: Record<string, string> = {
    Host: ARK_HOST,
    'X-Date': xDate,
    'X-Content-Sha256': payloadHash,
    Authorization: authorization,
    'Content-Type': 'application/json',
  };

  // 临时凭证需要携带 X-Security-Token
  if (env.VOLCENGINE_SESSION_TOKEN) {
    headers['X-Security-Token'] = env.VOLCENGINE_SESSION_TOKEN;
  }

  const url = `https://${ARK_HOST}?${canonicalQueryString}`;

  return { url, method, headers, body };
}

/**
 * 调用 Ark CreateArkOfficialResultQuery
 * @param contentUrl 公网可访问的视频 URL
 * @returns QueryID
 */
export async function createOfficialResultQuery(
  contentUrl: string,
): Promise<string> {
  const body = JSON.stringify({
    ContentUrl: contentUrl,
    ResourceType: 'video',
  });

  const req = buildSignedRequest({
    action: 'CreateArkOfficialResultQuery',
    body,
    method: 'POST',
  });

  try {
    const resp = await axios.request<ArkCreateQueryResponse>({
      url: req.url,
      method: req.method,
      headers: req.headers,
      data: req.body,
      timeout: 15_000,
    });

    const data = resp.data;
    const meta = data.ResponseMetadata;

    // 必须显式检查 ResponseMetadata.Error，禁止把 InvalidCredential 等当成功
    if (meta.Error) {
      const maskedAk = loadEnv().VOLCENGINE_ACCESS_KEY.slice(0, 4) + '****';
      throw new Error(
        `方舟 CreateQuery 业务错误: [${meta.Error.Code}] ${meta.Error.Message} ` +
          `(RequestId=${meta.RequestId}, AK=${maskedAk})`,
      );
    }

    const queryId = data.Result?.QueryID;
    if (!queryId) {
      throw new Error(
        `方舟 CreateQuery 返回异常: 缺少 QueryID (RequestId=${meta.RequestId})`,
      );
    }
    return queryId;
  } catch (err) {
    const e = err as AxiosError | Error;
    if ('isAxiosError' in e && e.isAxiosError) {
      const status = e.response?.status;
      const upstreamBody = JSON.stringify(e.response?.data ?? {});
      const reqId =
        (e.response?.data as ArkCreateQueryResponse | undefined)?.ResponseMetadata
          ?.RequestId ?? 'unknown';
      throw new Error(
        `方舟 CreateQuery HTTP 错误: status=${status}, request_id=${reqId}, body=${upstreamBody.slice(0, 500)}`,
      );
    }
    throw e;
  }
}

/**
 * 调用 Ark GetArkOfficialResult
 */
export async function getOfficialResult(
  queryId: string,
): Promise<{
  Status: 'running' | 'succeeded' | 'failed';
  IsOfficial?: string;
  ModelName?: string;
  Resolution?: string;
  ResourceType?: string;
  Message?: string;
}> {
  const body = JSON.stringify({
    QueryID: queryId,
  });

  const req = buildSignedRequest({
    action: 'GetArkOfficialResult',
    body,
    method: 'POST',
  });

  try {
    const resp = await axios.request<ArkGetResultResponse>({
      url: req.url,
      method: req.method,
      headers: req.headers,
      data: req.body,
      timeout: 15_000,
    });

    const data = resp.data;
    const meta = data.ResponseMetadata;

    if (meta.Error) {
      throw new Error(
        `方舟 GetResult 业务错误: [${meta.Error.Code}] ${meta.Error.Message} ` +
          `(RequestId=${meta.RequestId})`,
      );
    }

    const result = data.Result;
    if (!result) {
      throw new Error(
        `方舟 GetResult 返回异常: 缺少 Result (RequestId=${meta.RequestId})`,
      );
    }

    return {
      Status: result.Status,
      IsOfficial: result.IsOfficial,
      ModelName: result.ModelName,
      Resolution: result.Resolution,
      ResourceType: result.ResourceType,
      Message: result.Message,
    };
  } catch (err) {
    const e = err as AxiosError | Error;
    if ('isAxiosError' in e && e.isAxiosError) {
      const status = e.response?.status;
      const upstreamBody = JSON.stringify(e.response?.data ?? {});
      const reqId =
        (e.response?.data as ArkGetResultResponse | undefined)?.ResponseMetadata
          ?.RequestId ?? 'unknown';
      throw new Error(
        `方舟 GetResult HTTP 错误: status=${status}, request_id=${reqId}, body=${upstreamBody.slice(0, 500)}`,
      );
    }
    throw e;
  }
}
