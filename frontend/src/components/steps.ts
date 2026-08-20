import type { StepKey } from '@/types';

export interface StepDef {
  key: StepKey;
  label: string;
  description: string;
}

// 只展示实际有进度意义的步骤（不展示 idle / failed）
export const STEPS: StepDef[] = [
  { key: 'submitted', label: '提交生成请求', description: '已将 Prompt 发往厂商 API' },
  { key: 'vendor_processing', label: '厂商生成中', description: '第三方视频生成服务正在处理' },
  { key: 'video_ready', label: '视频准备完成', description: '厂商返回视频 URL' },
  { key: 'verify_submitted', label: '提交方舟验证', description: '厂商 URL 已提交方舟' },
  { key: 'ark_processing', label: '方舟分析中', description: '方舟官方正在分析视频特征' },
  { key: 'result', label: '验证完成', description: '展示是否命中 Seedance 技术' },
];

/**
 * 计算 STEPS 中当前步骤的索引
 * - idle: -1 (尚未开始)
 * - failed: 当前进行中步骤保持之前的 activeIndex，失败单独处理
 */
export function getStepIndex(step: StepKey): number {
  const idx = STEPS.findIndex((s) => s.key === step);
  if (idx >= 0) return idx;
  // submitted 之前（如 idle）返回 -1
  if (step === 'idle') return -1;
  return -1;
}

export type StepState = 'done' | 'active' | 'pending';

export function getStepState(index: number, activeIndex: number, failed: boolean): StepState {
  if (failed) {
    if (index < activeIndex) return 'done';
    if (index === activeIndex) return 'active'; // 当前步骤"挂红"
    return 'pending';
  }
  if (activeIndex === -1) return 'pending';
  if (index < activeIndex) return 'done';
  if (index === activeIndex) return 'active';
  return 'pending';
}
