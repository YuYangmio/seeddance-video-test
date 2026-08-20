# Seedance 视频生成厂商接入 - The Implementation Plan (Decomposed and Prioritized Task List)

## [x] Task 1: 新增 Seedance 适配模块 (backend/src/vendors/seedance.ts)
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 参照 `vendors/minimax.ts` 的结构，新建 `vendors/seedance.ts`，导出 `seedanceCreate(config, prompt, params): Promise<{ taskId: string }>` 与 `seedancePoll(config, taskId): Promise<VendorPollResponse>`。
  - 实现 `normalizeEndpoint`：当 endpoint 仅为 host 时自动补全默认 create / query 路径；当 endpoint 含 `/vN/...` 路径时解析 `{ origin, base, createPath }`（逻辑对齐 minimax，但默认路径按 Seedance 官方文档）。
  - 实现 `normalizeResolution` / `normalizeDuration`：在 Seedance 允许范围内做归一化与裁剪（超出范围时回退安全默认值，与 minimax 风格一致）。
  - Create：POST body 按 Seedance 文档拼装 `model / prompt 文本内容 / resolution / duration / ratio` 等字段；`Authorization: Bearer ${apiKey}`；超时 30s；日志前缀 `[Seedance create]`；从响应体的多个候选字段（`task_id / data.task_id / task.id / id` 等）提取 `taskId`，缺失抛错并带响应体片段。
  - Poll：使用 base 拼接 query 候选 URL（官方主路径 + 兼容路径，形式参考 minimax 的 candidates 数组）；逐个尝试，遇到 404/400 继续下一个；日志前缀 `[Seedance poll]`；解析 status / progress / videoUrl / error 并做兼容映射（字段命名按 Seedance 文档，且在缺失时退化到通用字段位置）。
  - AxiosError 包装：统一 `wrapped.upstreamStatus` + `wrapped.upstreamBody`，方便路由层按状态码分流。
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, NFR-2, NFR-3
- **Test Requirements**:
  - `programmatic` TR-1.1: `seedanceCreate` 在模拟上游返回包含 `task_id` 的 JSON 时，返回的 `taskId` 非空且类型为 string。
  - `programmatic` TR-1.2: `seedanceCreate` 在模拟上游返回 401 无权限时，抛出的错误对象包含 `upstreamStatus === 401` 且 message 带上游响应体摘要。
  - `programmatic` TR-1.3: `seedancePoll` 当上游返回 `status=succeeded` + `videoUrl=https://...` 时，结果为 `{ status: 'succeeded', videoUrl: 'https://...' }`。
  - `programmatic` TR-1.4: `seedancePoll` 当上游返回失败状态时，结果为 `{ status: 'failed', error: '<可读文本>' }`，error 非空。
  - `programmatic` TR-1.5: `normalizeEndpoint('https://api.seedance.example.com')` 能返回默认 createPath（非空），而传入完整 URL 时 `createPath` 等于 pathname。
  - `human-judgement` TR-1.6: 代码风格、日志前缀、错误包装方式与 `minimax.ts` 明显一致（imports、函数拆分、字段容错写法等由 reviewer 肉眼比对）。
- **Notes**: Seedance 官方端点路径/字段以实际 API 文档为准；若存在多种版本，在适配层写清楚注释并提供兼容解析（但避免过度猜测）。

## [x] Task 2: 路由层分发接入 Seedance (backend/src/routes/vendor.ts)
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 在 `vendor.ts` 顶部新增 import：`import { seedanceCreate, seedancePoll } from '../vendors/seedance';`。
  - `/generate` 路由：将 `if (body.vendor === 'seedance' || body.vendor === 'custom')` 的 NOT_IMPLEMENTED 分支拆成三段：
    - `seedance` → 调用 `seedanceCreate(body.config, body.prompt, body.params)` 并返回 `{ taskId }`；
    - `minimax` → 保持现有逻辑；
    - `custom` → 仍返回 NOT_IMPLEMENTED。
  - `/poll` 路由：将 `if (body.vendor !== 'minimax')` 的 NOT_IMPLEMENTED 分支改为：
    - `minimax` → `minimaxPoll`；
    - `seedance` → `seedancePoll`；
    - 其他 → NOT_IMPLEMENTED。
  - 两段路由中的错误处理（401/402/429 透传 message 与 code、其他错误走 VENDOR_CREATE_FAILED / VENDOR_POLL_FAILED）保持不变，直接复用现有 catch 分支（因为 Task 1 已经按同样结构包装了 upstreamStatus/upstreamBody）。
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-6
- **Test Requirements**:
  - `programmatic` TR-2.1: 调用 `POST /vendor/generate` 且 `vendor=seedance`，上游成功时返回 200 `{ taskId }`，不再出现 `VENDOR_NOT_IMPLEMENTED`。
  - `programmatic` TR-2.2: 调用 `POST /vendor/poll` 且 `vendor=seedance`，上游 running 时返回 200 `{ status: 'running' }`。
  - `programmatic` TR-2.3: 模拟 seedance 上游返回 429，路由返回 502 且 `error.code === 'VENDOR_HTTP_429'`，message 为上游原始错误信息截断版。
  - `programmatic` TR-2.4: `vendor=custom` 仍返回 `VENDOR_NOT_IMPLEMENTED`，message 中明确仅支持 minimax 和 seedance。
  - `programmatic` TR-2.5: minimax 原有调用行为不变（同 TR-2.1/TR-2.2 的 minimax 版本，通过现有测试或手工 curl 校验不回归）。
- **Notes**: 避免改动 Zod schema（已包含 seedance）；不需要新增或调整参数校验。

## [x] Task 3: 前端启用 Seedance 下拉并提供默认配置 (frontend/src/pages/Verify.tsx) (frontend/src/pages/Verify.tsx)
- **Priority**: high
- **Depends On**: None（与 Task 1/2 并行，但端到端验证需等 Task 2）
- **Description**:
  - Verify 页面的 vendor `<select>`：把 `<option value="seedance" disabled>Seedance (待接入)</option>` 改为可选项，文案改为 `Seedance (已支持)`。
  - 新增 Seedance 默认常量：`SEEDANCE_DEFAULT_ENDPOINT`（Seedance 官方 create 接口 URL）与 `SEEDANCE_DEFAULT_MODEL`（默认模型名）。
  - 在 vendor 切换 `onChange` 回调中（或写一个 `useEffect` 监听 vendor 变化 + 首次初始化）：当 vendor 从非 seedance 切换到 seedance 且当前 endpoint / model 仍为 minimax 默认值时，自动替换为 seedance 默认值；若用户已显式修改 endpoint/model，则保留用户自定义值不覆盖（即「仅在值还是另一厂商默认值时自动切换」）。
  - 当用户保存了 `savedVendor?.vendor === 'seedance'` 且 endpoint 已存到 sessionStorage，直接还原保存值（现有逻辑已经会按 savedVendor 的 config 还原，无需改逻辑，但需要确保 seedance 默认值分支也能正确被「记住」）。
- **Acceptance Criteria Addressed**: AC-4, AC-5, NFR-1
- **Test Requirements**:
  - `human-judgement` TR-3.1: 打开页面 → 切换 vendor 到 Seedance → endpoint/model 输入框立即显示 Seedance 默认值（不再是 minimax 的默认值）。
  - `human-judgement` TR-3.2: 手动把 Seedance 的 endpoint/model 改成自定义值 → 切回 minimax → 再切回 Seedance，自定义值不被覆盖（仍保留用户修改）。
  - `human-judgement` TR-3.3: 勾选「临时保存到浏览器」→ 选 Seedance 并填好 config → 刷新页面 → vendor 与 config 自动恢复为 Seedance。
  - `human-judgement` TR-3.4: Prompt / 分辨率 / 时长 / 比例 下拉项与 MiniMax 场景完全一致（不增不减），无 UI 差异。
- **Notes**: 前端不做任何 vendor 特定的轮询或 API 封装（`api.ts` 已经通用），只改 UI 默认值和下拉可用性。

## [x] Task 4: 端到端走查与回归验证
- **Priority**: high
- **Depends On**: Task 1, Task 2, Task 3
- **Description**:
  - 启动后端（`backend` 目录，配置好 `.env` 中的方舟凭证 + Admin Token）与前端（`frontend` 目录，Vite 启动）。
  - 场景 1：选 Seedance → 填有效 API Key + 官方 endpoint/model → 写合理 Prompt → 点击开始验证 → 观察进度条直到「result」步骤 → 确认视频播放正常 + 方舟结果卡片展示字段完整。
  - 场景 2：故意填错 Seedance API Key → 点击开始验证 → 应在 submitted 阶段失败并展示 `VENDOR_HTTP_401` 的 code + message。
  - 场景 3：选 MiniMax，走一次原流程，确认不回归（进度、视频预览、方舟结果与改前一致）。
  - 场景 4：切换到 custom 下拉（若能通过其他方式选中，实际 UI 中仍 disabled——需通过改 HTML 临时 enable 或直接 curl `/vendor/generate` 验证 custom 返回 NOT_IMPLEMENTED）。
  - 查看后端日志：确认 `[Seedance create]` / `[Seedance poll]` 前缀存在，日志中 URL、taskId、响应摘要打印正常；且 minimax 日志前缀未被破坏。
- **Acceptance Criteria Addressed**: AC-5, AC-6, NFR-1, NFR-2
- **Test Requirements**:
  - `programmatic` TR-4.1: `curl -X POST http://localhost:<port>/vendor/generate -H 'X-Admin-Token: ...' -H 'Content-Type: application/json' -d '{ "vendor":"seedance", "config":{...}, "prompt":"...", "params":{...} }'` → 响应状态码与字段符合预期。
  - `programmatic` TR-4.2: 同上 `/vendor/poll` → 三态结果解析正确；错误 case 的 code/message 符合 AC-3。
  - `human-judgement` TR-4.3: 前端 E2E 场景 1~3 分别手动走完，视觉上流程一致，错误信息可读，视频可播放，方舟结果展示与现有文档一致。
  - `human-judgement` TR-4.4: 后端日志输出包含 Seedance 前缀，且可用于排障定位（不是空日志也不是乱打印）。
- **Notes**: 若 Seedance 官方 API 字段或路径与假设不一致，先在 Task 1 的 seedance.ts 内做适配层修订，不要扩散到路由层或前端层。
