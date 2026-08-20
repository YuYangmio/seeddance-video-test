// 全局类型定义

export type Vendor = 'minimax' | 'seedance' | 'custom';

export interface VendorConfig {
  apiKey: string;
  endpoint: string;
  model: string;
}

export type Resolution = string;
export type Duration = 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export interface GenerateParams {
  resolution: Resolution;
  duration: Duration;
  ratio?: string;
}

// ---- /vendor/generate ----
export interface VendorGenerateRequest {
  vendor: Vendor;
  config: VendorConfig;
  prompt: string;
  params: GenerateParams;
}

export interface VendorGenerateResponse {
  taskId: string;
}

// ---- /vendor/poll ----
export interface VendorPollRequest {
  vendor: string;
  config: VendorConfig;
  taskId: string;
}

export type VendorPollStatus = 'running' | 'succeeded' | 'failed';

export interface VendorPollResponse {
  status: VendorPollStatus;
  progress?: number;
  videoUrl?: string;
  error?: string;
}

// ---- /verify/submit ----
export interface VerifySubmitRequest {
  videoUrl: string;
}

export interface VerifySubmitResponse {
  arkQueryId: string;
}

// ---- /verify/poll ----
export type ArkIsOfficial = 'True' | 'False' | 'Null';
export type ArkResourceType = 'video' | 'image';
export type ArkPollStatus = 'running' | 'succeeded' | 'failed';

export interface VerifyPollRequest {
  arkQueryId: string;
}

export interface VerifyPollResponse {
  status: ArkPollStatus;
  isOfficial?: ArkIsOfficial;
  modelName?: string;
  resourceType?: ArkResourceType;
  resolution?: string;
  message?: string;
  error?: string;
}

// ---- 通用错误 ----
export interface ApiError {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiError;
}

// ---- 方舟内部类型 ----
export interface ArkCreateQueryResponse {
  ResponseMetadata: {
    RequestId: string;
    Action: string;
    Version: string;
    Service: string;
    Region: string;
    Error?: { Code: string; Message: string };
  };
  Result?: {
    QueryID: string;
  };
}

export interface ArkGetResultResponse {
  ResponseMetadata: {
    RequestId: string;
    Action: string;
    Version: string;
    Service: string;
    Region: string;
    Error?: { Code: string; Message: string };
  };
  Result?: {
    Status: 'running' | 'succeeded' | 'failed';
    IsOfficial?: string;
    ModelName?: string;
    Resolution?: string;
    ResourceType?: string;
    Message?: string;
  };
}
