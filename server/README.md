# Time Anchor · 在线服务（Web + MCP）

把 Time Anchor 的**时间计算逻辑**从本地 Hook 搬到云端，让手机端 / 云端 AI 也能有一只表。

- 时区固定为 **Asia/Shanghai（UTC+08:00）**，全年无夏令时
- 会话时间戳由服务端按 `session_id` 记忆（内存态，重启即清空）
- 同一套语义：`now_local` / `elapsed_human` / `crossed_local_date` / Temporal Cortex 提示

## 两种使用方式

### 1. REST API（手机 AI 直接调用）

| 端点 | 说明 |
|------|------|
| `GET /health` | 健康检查 + 当前时间 |
| `GET /now` | 当前时间（Asia/Shanghai） |
| `POST /api/check` | 主动看表：当前时间 + 上次时间 + 间隔 + 跨日 + 时间皮层 |
| `POST /api/ambient` | 环境余光：返回一段可直接放进上下文的文本 |
| `POST /api/interval` | 纯计算：两个时间戳之间的间隔与跨日 |

`/api/check` 请求示例：

```bash
curl -X POST https://<你的域名>/api/check \
  -H "Content-Type: application/json" \
  -d '{"session_id":"conversation-1","user_prompt":"我回来了"}'
```

响应中的 `interval.previous_local` 是服务端记住的该会话上一次时间戳；第二次调用起会给出真实间隔。

### 2. MCP（Streamable HTTP）

支持 MCP 的客户端（Claude Desktop / Cursor / Claude Code 等）把服务注册为远程 MCP：

- **URL**: `https://<你的域名>/mcp`
- **协议**: Streamable HTTP（SDK 1.12+）
- 工具：
  - `time_anchor_now` — 获取当前 Asia/Shanghai 时间
  - `time_anchor_check` — 主动看表，含间隔 / 跨日 / 时间皮层

## 本地运行

```bash
cd server
npm install
TZ=Asia/Shanghai PORT=3000 npm start
```

## 部署（Zeabur / 任意容器平台）

- 使用 `server/Dockerfile`（Node 20 alpine，`TZ=Asia/Shanghai` 已内置）
- 环境变量：`PORT=3000`（Zeabur 自动注入）、`TZ=Asia/Shanghai`
