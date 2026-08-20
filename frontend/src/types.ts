// 与后端类型对齐
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

export interface VendorGenerateResponse {
  taskId: string;
}

export type VendorPollStatus = 'running' | 'succeeded' | 'failed';
export interface VendorPollResponse {
  status: VendorPollStatus;
  progress?: number;
  videoUrl?: string;
  error?: string;
}

export interface VerifySubmitResponse {
  arkQueryId: string;
}

export type ArkIsOfficial = 'True' | 'False' | 'Null';
export type ArkResourceType = 'video' | 'image';
export type ArkPollStatus = 'running' | 'succeeded' | 'failed';

export interface VerifyPollResponse {
  status: ArkPollStatus;
  isOfficial?: ArkIsOfficial;
  modelName?: string;
  resourceType?: ArkResourceType;
  resolution?: string;
  message?: string;
  error?: string;
}

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiError;
}

// 前端状态机步骤
export type StepKey =
  | 'idle'
  | 'submitted'
  | 'vendor_processing'
  | 'video_ready'
  | 'verify_submitted'
  | 'ark_processing'
  | 'result'
  | 'failed';

export interface VerifyState {
  step: StepKey;
  error?: string;
  errorCode?: string;

  // 厂商生成阶段
  vendorTaskId?: string;
  vendorProgress?: number;
  videoUrl?: string;

  // 方舟验证阶段
  arkQueryId?: string;
  isOfficial?: ArkIsOfficial;
  modelName?: string;
  resolution?: string;
  message?: string;
}
