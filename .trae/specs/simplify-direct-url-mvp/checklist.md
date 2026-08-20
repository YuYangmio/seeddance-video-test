# Checklist

- [x] `POST /verify/submit` 请求体只包含 `videoUrl`。
- [x] BFF 将收到的厂商 URL 原样传给方舟 `ContentUrl`。
- [x] BFF 不下载视频，不执行 HEAD/GET，不上传 TOS。
- [x] 成功响应只返回 `arkQueryId`。
- [x] 非 HTTP/HTTPS URL 返回 `400 INVALID_REQUEST`。
- [x] 后端启动不要求任何 `OBJECT_STORAGE_*` 环境变量。
- [x] 后端活动代码和依赖中不存在 TOS/ULID 路径。
- [x] 前端视频预览直接使用厂商 `videoUrl`。
- [x] 前端时间线、状态和文案不再出现 TOS 上传。
- [x] MiniMax 生成与轮询行为保持不变。
- [x] 方舟每 2 秒轮询、最长 90 秒的行为保持不变。
- [x] 方舟成功结果完整展示 `IsOfficial`、`ModelName`、`Resolution`、`Message`。
- [x] 厂商 API Key 仍只单次透传，未新增持久化。
- [x] 前后端构建通过。
- [ ] 真实凭据端到端冒烟验证通过；若方舟无法抓取厂商 URL，错误被完整展示且不自动回退 TOS。
