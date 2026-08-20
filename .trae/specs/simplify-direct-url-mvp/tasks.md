# Tasks

- [x] Task 1: 收敛后端验证提交契约为厂商 URL 直传方舟。
  - [x] 删除 `/verify/submit` 对 TOS 客户端的导入和调用。
  - [x] 请求体仅保留 `videoUrl`，并限制为 HTTP/HTTPS URL。
  - [x] 调用 `createOfficialResultQuery(videoUrl)`，成功响应仅返回 `arkQueryId`。
  - [x] 删除视频下载、大小和格式错误映射。

- [x] Task 2: 移除轻量版的对象存储运行依赖。
  - [x] 从环境变量校验和示例配置中删除 `OBJECT_STORAGE_*` 与公网桶配置。
  - [x] 删除未再使用的 TOS 客户端文件。
  - [x] 从后端依赖中删除仅由 TOS 路径使用的 `ulid`。
  - [x] 确认后端仅配置方舟 AK/SK 即可启动。

- [x] Task 3: 对齐前端契约和轻量流程文案。
  - [x] 将 `VerifySubmitResponse` 收敛为 `{ arkQueryId: string }`。
  - [x] 保持浏览器直接用厂商 `videoUrl` 预览。
  - [x] 删除 `tosUrl` 状态、展示和所有 TOS 文案。
  - [x] 将时间线和处理中提示改为“提交厂商 URL 到方舟”。

- [ ] Task 4: 验证轻量版构建与关键行为。
  - [x] 后端 TypeScript 构建通过，且不存在 TOS 客户端引用。
  - [x] 前端 TypeScript/Vite 构建通过，且不存在 TOS UI 文案或状态字段。
  - [x] 使用合法 URL 调用提交端点时，确认方舟客户端收到原始 URL。
  - [x] 使用非 HTTP/HTTPS URL 时，确认返回 `400 INVALID_REQUEST`。
  - [ ] 使用可用方舟凭据完成一次生成、预览、提交、轮询和结果展示的端到端冒烟验证。

- [x] Task 5: 修复阻塞轻量版构建的 TypeScript 类型错误。
  - [x] 后端 duration schema 推断收窄为 Duration。
  - [x] 前端 getAdminToken 保证仅返回 string。
  - [x] 删除未使用的 setAdminTokenState。
  - [x] 将厂商轮询 catch 回退值显式标注为 VendorPollResponse，消除联合类型错误。

- [ ] Task 6: 配置真实 ARK/MiniMax 凭据后执行 E2E 冒烟。
  - [ ] 使用真实凭据完成生成、预览、提交、轮询和结果展示。
  - [ ] 验证方舟无法抓取厂商 URL 时完整展示错误，且不自动回退 TOS。
  - 当前环境及项目未发现可用 ARK/MiniMax 凭据；这是唯一外部阻塞。

- [x] Task 7: 修复管理员 Token 应用后的前端状态同步。
  - [x] 点击“应用”后立即更新当前页面的 `adminToken` 状态，使“开始验证”无需刷新即可启用。
  - [x] 修复后执行管理员 Token 交互冒烟并复核完整 E2E 启动路径。

- [x] Task 8: 补充轻量版可直接启动的配置修复。
  - [x] 添加 `dotenv` 后端运行依赖。
  - [x] 后端入口最先加载 `dotenv/config`，确保 `loadEnv()` 执行前读取项目 `backend/.env`。
  - [x] 完成后端构建，并使用临时 `backend/.env` 启动服务和执行 `/health` 冒烟，确认无需 shell 注入即可读取配置。

- [x] Task 9: 保证后端构建产物可由 Node 直接启动。
  - [x] 修正 build 重写，使 `dist` 内相对导入带 `.js` 扩展名。
  - [x] 完成后端 build。
  - [x] 使用临时 `backend/.env` 执行 `npm start`，并完成 `/health` 冒烟。

# Task Dependencies
- Task 2 depends on Task 1 完成后端 TOS 调用移除。
- Task 3 可与 Task 1 并行，但最终契约必须一致。
- Task 4 depends on Task 1、Task 2、Task 3。
- Task 6 depends on 可用的真实 ARK/MiniMax 凭据。
- Task 7 完成后需复核 Task 4 的真实凭据端到端冒烟。
