# Seedance 视频生成厂商接入 - Product Requirement Document

## Overview
- **Summary**: 在现有的「Seedance 产物溯源验证工具」中，新增对 `seedance` 厂商（与 MiniMax 并列的第二个视频生成厂商）的 API 调用支持。整体沿用现有「提交创建任务 → 轮询任务状态 → 获取视频 URL → 提交方舟验证」的完整闭环流程，接口契约、参数结构、状态机、UI 交互与现有 MiniMax 实现保持一致，仅新增一套独立的 Seedance 请求适配层。
- **Purpose**: 让验证工具不仅能对比 MiniMax 生成的视频，也能直接调用 Seedance 自身的视频生成 API 产出视频并送入方舟进行技术特征比对，从而形成「自证」闭环（用 Seedance 的 API 生成的视频，应该被方舟识别为命中 Seedance 技术特征）。
- **Target Users**: 管理员 / 内部产品与技术同学（使用 Admin Token 登录后在 Verify 页面选择厂商下拉）。

## Goals
- 在后端新增 `seedance` vendor 的适配模块：`seedanceCreate` + `seedancePoll`，请求体映射、错误包装与 MiniMax 保持一致的结构和日志风格。
- 在 `/vendor/generate` 与 `/vendor/poll` 路由中接入 `seedance` 分支，去掉现有的 `VENDOR_NOT_IMPLEMENTED` 返回。
- 前端厂商下拉启用 Seedance 选项（取消 `disabled`），并在切换到 Seedance 时自动填充默认的 Endpoint / Model 占位值，同时记住用户的自定义配置。
- 完整跑通「选 Seedance → 填 Key → 写 Prompt → 生成视频 → 轮询 → 视频预览 → 提交方舟 → 出验证结果」的整条路径，错误分支（401/402/429/超时/失败）处理与 MiniMax 完全相同。

## Non-Goals (Out of Scope)
- 不改变现有类型定义中的 `Vendor` 联合（已包含 `seedance`）。
- 不修改方舟验证 `/verify/*` 路由及相关逻辑。
- 不新增历史记录、数据库、API Key 落盘或对象存储。
- 不做 Seedance API 文档以外的「额外兼容分支」（例如不实现旧版 v1 路径猜测，仅按当前 Seedance 标准接口实现）。
- 不修改 `custom` vendor（继续保持 NOT_IMPLEMENTED）。

## Background & Context
- 当前代码结构：后端 BFF 使用 Hono（Node.js），`backend/src/vendors/minimax.ts` 为厂商适配层模板；`backend/src/routes/vendor.ts` 通过 `vendor` 字段分发；类型定义与前端下拉枚举中已包含 `seedance`，但路由统一返回 `VENDOR_NOT_IMPLEMENTED`，前端 `<option>` 为 `disabled`。
- 现有参数：`GenerateParams` 统一为 `{ resolution, duration, ratio? }`，校验规则在 Zod schema 中固定（分辨率枚举 768P/2K/1080P/720P，时长 4~15 秒整数）。
- 约束：Seedance API 与 MiniMax 同属「异步任务 + 轮询」模型；鉴权使用 Bearer Token，创建与查询为两个独立端点。具体 URL 路径与响应字段通过 Seedance 官方文档对齐（若响应结构不唯一，则参照 minimax 做兼容解析）。
- 之前的 `simplify-direct-url-mvp` 已将厂商 `videoUrl` 直接透传方舟（不再下载视频 / 走 TOS），本次接入直接复用该链路。

## Functional Requirements
- **FR-1**: 新增 Seedance 视频生成任务创建适配 `seedanceCreate(config, prompt, params)`：
  - 规范化 `endpoint`，当用户仅填 host 时自动补全默认的 create 路径；
  - 按 Seedance API 契约拼装 body（prompt / resolution / duration / ratio / model 等字段，字段命名按 Seedance 文档映射）；
  - Bearer 鉴权、30s 超时、日志打印（前 50 字符 prompt）；
  - 从响应中提取 `taskId`（兼容多种字段位置），缺失时抛出含响应体片段的可读错误；
  - 对 AxiosError 按 401/402/429 做 `upstreamStatus/upstreamBody` 包装，与 MiniMax 保持一致。
- **FR-2**: 新增 Seedance 任务状态轮询适配 `seedancePoll(config, taskId)`：
  - 使用 Seedance 的 query 端点（默认路径按官方文档，若 endpoint 中已包含版本号则按其解析）；
  - 兼容多种状态字段命名，将原始状态归一化为 `running | succeeded | failed`；
  - 兼容多种视频 URL 字段位置（嵌套对象 / 数组 / 直接字段），成功时填充 `videoUrl`；
  - 失败时尝试从 `error / error.message / message` 等字段提取可读错误；
  - 支持可选的 `progress` 字段（0-100 数字）；
  - 非致命网络错误继续轮询，致命错误透传。
- **FR-3**: 路由层分发：
  - `POST /vendor/generate` 当 `vendor === 'seedance'` 时调用 `seedanceCreate`，不再返回 NOT_IMPLEMENTED；
  - `POST /vendor/poll` 当 `vendor === 'seedance'` 时调用 `seedancePoll`；
  - 错误处理（401/402/429 透传 message，其他走 VENDOR_CREATE_FAILED / VENDOR_POLL_FAILED）与 minimax 共用同一套分支逻辑；
  - `custom` 仍保持 NOT_IMPLEMENTED。
- **FR-4**: 前端厂商选择交互：
  - Verify 页面「厂商 / Vendor」下拉中 Seedance 选项取消 `disabled`，文案改为 `Seedance (已支持)`；
  - 用户切换到 `seedance` 时，自动填充默认 `endpoint` 与 `model`（与 MiniMax 的 DEFAULT_ENDPOINT 类似，提供 Seedance 官方默认值，且允许用户覆盖）；
  - 当「临时保存到浏览器」勾选时，Seedance 的 config 也会按现有机制存到 `sessionStorage`，并在下次进入页面时恢复；
  - 其他 Prompt / 分辨率 / 时长 / 比例 表单与轮询超时逻辑完全复用。

## Non-Functional Requirements
- **NFR-1 (一致性)**: 不管选择 MiniMax 还是 Seedance，用户在 Verify 页面看到的流程、按钮、状态机、错误展示完全一致；不会因厂商不同出现 UI 分叉。
- **NFR-2 (可观测性)**: `seedanceCreate` / `seedancePoll` 每次调用都打印日志（前缀 `[Seedance create]` / `[Seedance poll]`），包含 URL、taskId、响应体摘要，便于排障；日志风格与 minimax 对齐。
- **NFR-3 (健壮性)**: 字段解析一律做防御式判空，不假设上游字段存在；`taskId` / `videoUrl` 缺失时给出包含原始响应体片段的错误信息（上限 500~800 字符）。
- **NFR-4 (安全)**: Seedance API Key 与现有 MiniMax Key 处理方式完全一致——只单次透传，不落库，不写入 localStorage，仅在用户主动勾选时临时写入 `sessionStorage`。
- **NFR-5 (性能/超时)**: 创建请求超时 30s；单次 poll 请求超时 15s；前端厂商最长轮询 10 分钟的现有上限不变。

## Constraints
- **Technical**: 必须复用现有 Hono + Zod + Axios 技术栈，不得引入新的 HTTP 客户端；前端必须复用现有 React + Tailwind UI，不得引入新依赖。
- **Business**: 不对外暴露 Admin Token 与厂商 API Key；所有 Key 仅通过 HTTPS 从浏览器 → BFF → 厂商链路传递。
- **Dependencies**: 依赖 Seedance 官方视频生成 API 的 Create + Query 端点契约（具体路径与字段在实现时以官方文档为准，若存在多种版本可在适配层做兼容解析）。

## Assumptions
- Seedance 视频生成 API 采用与 MiniMax 类似的「异步创建 taskId + 轮询 query」模式，并使用 Bearer `apiKey` 鉴权。
- Seedance 的参数维度与现有 `GenerateParams` 对齐：至少支持分辨率（如 720P/1080P/768P/2K）、时长（秒）、画面比例；若存在缺省值差异，在适配层做归一化。
- Seedance 的成功响应中最终可拿到一个可公网访问的 `videoUrl`，方舟可以直接访问该 URL 做特征分析（否则走现有的 direct-url 策略失败分支，由用户自行排查）。
- `endpoint` 输入允许两种用法：用户仅填 host（此时适配层自动补全默认 create/query 路径），或用户填完整 URL（含 `/vN/.../video_generation`，则按 minimax 同样的方式解析出 base + createPath）。

## Acceptance Criteria

### AC-1: 后端 Seedance 创建任务返回 taskId
- **Given**: BFF 已启动且鉴权通过；请求体 `vendor=seedance` 并带有合法的 config/apiKey/endpoint/model 与 prompt/params
- **When**: 调用 `POST /vendor/generate`
- **Then**: 当 Seedance 上游成功时，返回 HTTP 200 且 body 形如 `{ taskId: string }`（非空）
- **Verification**: `programmatic`
- **Notes**: 可用 curl 或前端实际点击验证；控制台日志能看到 `[Seedance create]` 前缀的打印。

### AC-2: 后端 Seedance 轮询支持 running/succeeded/failed 三态
- **Given**: 已通过 AC-1 拿到 taskId；相同 config
- **When**: 多次调用 `POST /vendor/poll`（vendor=seedance, taskId=xxx）
- **Then**:
  - 未完成时持续返回 `{ status: 'running', progress?: number }`
  - 成功时返回 `{ status: 'succeeded', videoUrl: 'https://...' }` 且 videoUrl 可直接播放
  - 失败时返回 `{ status: 'failed', error: '...' }` 且 message 为可读文本
- **Verification**: `programmatic`

### AC-3: 路由错误透传 401/402/429 与其他错误分支
- **Given**: 使用故意错误的 API Key（或额度不足 / 限流）请求 Seedance
- **When**: `POST /vendor/generate` 或 `POST /vendor/poll`
- **Then**:
  - 401/402/429 → 返回 HTTP 502，`error.code = VENDOR_HTTP_<status>`，message 使用上游原始 message（截断 800 字）
  - 其他错误 → 返回 HTTP 502，`error.code = VENDOR_CREATE_FAILED` 或 `VENDOR_POLL_FAILED`，message 为适配层抛出的可读错误
- **Verification**: `programmatic`

### AC-4: 前端下拉启用 Seedance 并给出合理默认值
- **Given**: 进入 Verify 页面且尚未选择 Seedance
- **When**: 在「厂商 / Vendor」下拉切换到 Seedance
- **Then**:
  - Seedance 选项不再是 disabled
  - Endpoint 输入框自动填入 Seedance 官方默认 endpoint（例如实际使用的 create 接口 URL，允许用户覆盖）
  - Model 自动填入 Seedance 默认模型名占位（允许用户覆盖）
  - 其他表单字段（Prompt / 分辨率 / 时长 / 比例）与 MiniMax 一致且可编辑
- **Verification**: `human-judgment`

### AC-5: 端到端闭环：Seedance 生成 → 方舟验证出结果
- **Given**: 顶部已配置有效 Admin Token；Seedance config 完整且有额度；填写合理 Prompt
- **When**: 点击「开始验证」并等待流程完成
- **Then**:
  - 进度时间线从 submitted → vendor_processing → video_ready → verify_submitted → ark_processing → result 逐步推进
  - 「视频预览」卡片能以 `<video>` 正常播放 Seedance 返回的视频 URL
  - 「方舟验证结果」卡片最终展示 `IsOfficial / ModelName / Resolution / Message`（或失败时的错误信息）
  - 中途若 Seedance 返回失败 → 进入 failed 步骤并展示可读错误 code + message，可「重置流程」后重新开始
- **Verification**: `human-judgment`

### AC-6: 现有 MiniMax 行为不回退
- **Given**: 与当前实现一致的 MiniMax 配置
- **When**: 走一遍 MiniMax 的完整流程（创建 → 轮询 → 方舟验证）
- **Then**: 所有步骤、字段、错误处理与当前一致，不因为 Seedance 接入引入回归。
- **Verification**: `programmatic` + `human-judgment`

## Open Questions
- [ ] Seedance 官方视频生成 API 的 create / query 端点实际 URL 路径与 body 字段名？若与 MiniMax 字段差异较大，需要在适配层提供明确的映射表（实现时按官方文档对齐并写注释说明）。
- [ ] Seedance 是否需要额外字段（例如 `prompt_en` / `negative_prompt` / `seed` / `watermark` 等）？当前仅复用 `resolution / duration / ratio + prompt` 四元组；如必填更多字段，需要在 Zod schema 与前端表单中增量加项（本 PRD 标记为可扩展点，不默认新增，以免与现有 MiniMax 交互不一致）。
- [ ] Seedance 默认的分辨率 / 时长可选范围？现有 Zod `generateParamsSchema` 统一为 `resolution ∈ {768P,2K,1080P,720P}` 与 `duration ∈ 4..15 整数`；若 Seedance 范围不同，需要在适配层做「归一化裁剪或默认值回退」并在错误信息中明确提示。
