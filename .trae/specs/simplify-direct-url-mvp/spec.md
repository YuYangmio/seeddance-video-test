# Seedance 轻量直传验证版 Spec

## Why
当前实现将厂商视频下载后再上传 TOS，增加了对象存储配置、带宽、失败点和调试成本。首版目标是先验证核心链路，因此直接把厂商返回的公网视频 URL 提交给方舟，不下载视频、不依赖 TOS。

## What Changes
- MiniMax 生成成功后，浏览器继续直接使用厂商 `videoUrl` 预览视频。
- `POST /verify/submit` 仅接收厂商 `videoUrl`，并将该 URL 原样作为方舟 `ContentUrl`。
- 删除首版运行链路中的视频下载、文件大小/格式校验和 TOS 上传。
- 删除首版对 TOS 环境变量和 `ulid` 依赖的要求。
- 前端时间线、提示文案和结果详情不再出现“上传 TOS”。
- 首版只支持 MiniMax，不增加 Seedance/custom 厂商适配。
- 保留现有管理员鉴权、厂商 API Key 单次透传、无历史持久化和方舟轮询。
- **BREAKING**：`/verify/submit` 不再接受 `enableTosUpload` 或 `useDirectUrl`。
- **BREAKING**：`/verify/submit` 成功响应收敛为 `{ arkQueryId: string }`，不再返回 `tosUrl`、`submittedUrl` 或 `usedTos`。
- **BREAKING**：`OBJECT_STORAGE_*` 与 `OBJECT_STORAGE_PUBLIC_BUCKET` 不再是启动必填环境变量。

## Impact
- Affected specs: 厂商视频生成、方舟官方结果查询、前端验证状态机、服务端环境配置。
- Affected code: `backend/src/routes/verify.ts`、`backend/src/types.ts`、`backend/src/env.ts`、`backend/src/clients/tosClient.ts`、`backend/.env.example`、`backend/package.json`、`frontend/src/api.ts`、`frontend/src/types.ts`、`frontend/src/pages/Verify.tsx`、进度步骤文案。

## Decision
采用“直接透传厂商 URL”的最小方案。未采用“TOS 默认中转”或“前端提供 TOS 开关”，因为二者都会让首版继续承担对象存储配置和双路径维护成本。若实测方舟无法访问某些厂商 URL，再单独立项增加中转策略。

## ADDED Requirements
### Requirement: 厂商 URL 直接提交方舟
系统 SHALL 在厂商任务成功并获得公网 `videoUrl` 后，将同一 URL 直接传给 `createOfficialResultQuery(videoUrl)`。

#### Scenario: 直接提交成功
- **WHEN** MiniMax 轮询返回 `status=succeeded` 和合法 HTTPS 视频 URL
- **THEN** 前端调用 `POST /verify/submit`，请求体仅包含 `videoUrl`
- **THEN** BFF 不下载视频、不调用对象存储
- **THEN** BFF 使用该 URL 创建方舟查询并返回 `arkQueryId`

#### Scenario: 视频预览
- **WHEN** MiniMax 返回 `videoUrl`
- **THEN** 浏览器 `<video>` 直接以该 URL 播放
- **THEN** 预览不依赖 BFF 下载或方舟查询完成

### Requirement: URL 输入限制
系统 SHALL 仅接受 `http://` 或 `https://` 视频 URL，不主动请求该 URL 做文件校验。

#### Scenario: 非 HTTP URL
- **WHEN** `/verify/submit` 收到非 HTTP/HTTPS URL
- **THEN** 返回 `400 INVALID_REQUEST`
- **THEN** 不调用方舟接口

### Requirement: 方舟查询闭环
系统 SHALL 保留创建查询、每 2 秒轮询、最长 90 秒、展示 `IsOfficial`、`ModelName`、`Resolution` 和 `Message` 的行为。

#### Scenario: 方舟分析成功
- **WHEN** 方舟查询状态变为 `succeeded`
- **THEN** 页面展示完整验证结果

#### Scenario: 方舟无法抓取厂商 URL
- **WHEN** 方舟返回 URL 不可访问或内容抓取失败
- **THEN** 页面展示方舟原始错误信息
- **THEN** 系统不自动回退 TOS

## MODIFIED Requirements
### Requirement: 验证提交端点
`POST /verify/submit` 的完整契约修改为：

```typescript
Body: { videoUrl: string }
200: { arkQueryId: string }
400: { error: { code: 'INVALID_REQUEST'; message: string } }
502: { error: { code: 'VERIFY_SUBMIT_FAILED'; message: string } }
```

BFF SHALL 将 `videoUrl` 原样传给方舟，不产生新的视频 URL。

### Requirement: 环境变量
轻量版启动仅要求方舟服务凭据和现有鉴权配置。对象存储相关变量 SHALL NOT 参与环境校验。

必需：
- `ARK_ACCESS_KEY`
- `ARK_SECRET_KEY`
- `VERIFY_ADMIN_TOKEN`（仅 `AUTH_MODE=simple`）

可选：
- `ARK_REGION`，默认 `cn-beijing`
- `PORT`
- `CORS_ORIGINS`

### Requirement: 前端状态机
页面状态流修改为：

```text
idle → submitted → vendor_processing → video_ready → verify_submitted → ark_processing → result
                                                       ↘ failed
```

`verify_submitted` 表示“厂商 URL 已提交方舟”，不表示下载或上传。

## REMOVED Requirements
### Requirement: TOS 中转
**Reason**：首版只验证厂商 URL 到方舟的核心链路，TOS 会增加不必要的依赖与失败点。

**Migration**：删除活动路由中的 TOS 调用、对象存储环境变量校验、TOS UI 文案及响应字段。现有部署可移除 `OBJECT_STORAGE_*` 配置。

### Requirement: BFF 视频下载与文件校验
**Reason**：BFF 不再获取视频二进制，因此无需校验 `Content-Length`、MIME、扩展名或文件头。

**Migration**：删除 `VIDEO_FETCH_FAILED`、`VIDEO_TOO_LARGE`、`VIDEO_FORMAT_UNSUPPORTED` 在该端点中的处理分支。

## Non-Goals
- 不自动处理厂商 URL 过期、防盗链或方舟网络不可达。
- 不增加 TOS 备用开关或自动回退。
- 不扩展其他视频厂商。
- 不新增历史记录、数据库或 API Key 持久化。
