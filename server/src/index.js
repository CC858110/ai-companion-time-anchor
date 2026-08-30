import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  buildAnchor,
  crossedLocalDate,
  elapsedHuman,
  isoLocal,
  sessionKey,
  containsExplicitTime,
  ambientContext,
  attentionCue,
  TEMPORAL_CORTEX_CUE,
} from './timeAnchor.js';

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (req.path === '/mcp') return next();
  express.json()(req, res, next);
});

const sessions = new Map();
const CORTEX = 'cortex';

const anchorSchema = z.object({
  session_id: z.string().min(1).max(256),
  user_prompt: z.string().max(20000).optional().default(''),
  user_prompt_local: z.string().optional(),
  previous_local: z.string().optional(),
});

function anchor(sessionId, prompt, userPromptLocal, previousLocalOverride) {
  const prev = previousLocalOverride ?? sessions.get(sessionKey(sessionId))?.last ?? null;
  const now = isoLocal();
  const payload = buildAnchor(prev, now);
  const explicit = containsExplicitTime(prompt);
  const significant = payload.significant_gap || payload.crossed_local_date;
  const snapshot = {
    last: now,
    explicit,
    significant,
  };
  sessions.set(sessionKey(sessionId), snapshot);
  return { payload, explicit, significant };
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: isoLocal(), timezone: 'Asia/Shanghai', utc_offset: '+08:00' });
});

app.get('/now', (_req, res) => {
  res.json({
    now_local: isoLocal(),
    timezone: 'Asia/Shanghai',
    utc_offset: '+08:00',
  });
});

app.post('/api/check', (req, res) => {
  const parsed = anchorSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_request', issues: parsed.error.flatten() });
  }
  const { session_id, user_prompt, user_prompt_local, previous_local } = parsed.data;
  const { payload, explicit } = anchor(session_id, user_prompt, user_prompt_local, previous_local);
  const elapsed =
    payload.elapsed_seconds == null
      ? null
      : { seconds: payload.elapsed_seconds, human: payload.elapsed_human };
  res.json({
    session_id,
    session_hash: sessionKey(session_id),
    time: {
      now_local: payload.now_local,
      timezone: payload.timezone,
      utc_offset: payload.utc_offset,
    },
    interval: {
      previous_local: payload.previous_local,
      elapsed_seconds: elapsed?.seconds ?? null,
      elapsed_human: elapsed?.human ?? null,
      crossed_local_date: payload.crossed_local_date,
    },
    attention: {
      explicit_time_in_prompt: explicit,
      attention_cue: explicit ? attentionCue() : null,
    },
    temporal_cortex: TEMPORAL_CORTEX_CUE,
    source: 'active read of this conversation\'s time anchor (server-side, in-memory)',
  });
});

app.post('/api/ambient', (req, res) => {
  const parsed = anchorSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_request', issues: parsed.error.flatten() });
  }
  const { session_id, user_prompt, previous_local } = parsed.data;
  const now = isoLocal();
  const prev = previous_local ?? sessions.get(sessionKey(session_id))?.last ?? null;
  const payload = buildAnchor(prev, now);
  const explicit = containsExplicitTime(user_prompt);
  const significant = payload.significant_gap || payload.crossed_local_date;
  sessions.set(sessionKey(session_id), { last: now, explicit, significant });
  const context = explicit ? attentionCue() : ambientContext(payload);
  res.json({
    session_id,
    explicit_time_in_prompt: explicit,
    significant_transition: significant,
    context,
    temporal_cortex: TEMPORAL_CORTEX_CUE,
  });
});

app.post('/api/interval', (req, res) => {
  const parsed = z
    .object({
      session_id: z.string().min(1).max(256).optional(),
      previous_local: z.string().min(1),
      now_local: z.string().min(1).optional(),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_request', issues: parsed.error.flatten() });
  }
  const { previous_local, now_local, session_id } = parsed.data;
  const now = now_local ?? isoLocal();
  const delta = (Date.parse(now) - Date.parse(previous_local)) / 1000;
  const seconds = Number.isFinite(delta) ? Math.max(0, Math.round(delta * 1000) / 1000) : null;
  res.json({
    previous_local,
    now_local: now,
    elapsed_seconds: seconds,
    elapsed_human: seconds == null ? null : elapsedHuman(seconds),
    crossed_local_date: crossedLocalDate(previous_local, now),
    session_hash: session_id ? sessionKey(session_id) : null,
  });
});

// ===== 修复：根路径使用正确的 req 参数 =====
app.get('/', (req, res) => {
  const host = req.get('host') || 'localhost';
  res.type('text/plain').send(
    [
      'Time Anchor online service',
      '',
      'Endpoints:',
      '  GET  /health              status + current time',
      '  GET  /now                 current time (Asia/Shanghai, UTC+08:00)',
      '  POST /api/check           active time check with interval + temporal cortex',
      '  POST /api/ambient         ambient hook-style context for a user turn',
      '  POST /api/interval        compute elapsed/crossed-date between two timestamps',
      '  POST /mcp                 MCP Streamable HTTP (JSON-RPC)',
      '',
      'Try: curl -X POST ' + host + '/api/check -H "Content-Type: application/json" -d \'{"session_id":"demo","user_prompt":"我回来了"}\'',
    ].join('\n')
  );
});

// --- MCP over Streamable HTTP (single transport, no session auth) ---

const transports = new Map();

function createMcpServer() {
  return new McpServer({
    name: 'time-anchor',
    version: '1.0.0',
  });
}

function registerTools(server) {
  server.tool(
    'time_anchor_check',
    'Active time check: current Asia/Shanghai time, previous user-turn time, elapsed interval, crossed local date, and the temporal cortex cue. Call when real elapsed time may change how you understand the user or the moment.',
    {
      session_id: z.string().min(1).max(256).describe('Stable conversation/session id'),
      user_prompt: z.string().max(20000).optional().describe('Current user message'),
      previous_local: z
        .string()
        .optional()
        .describe('ISO local timestamp of the previous user turn (auto-remembered if omitted)'),
    },
    async (args) => {
      const { payload, explicit } = anchor(
        args.session_id,
        args.user_prompt ?? '',
        undefined,
        args.previous_local
      );
      const content =
        `Current local time: ${payload.now_local} (${payload.timezone}, UTC${payload.utc_offset}).\n` +
        (payload.previous_local
          ? `Previous user-turn time: ${payload.previous_local}; elapsed: ${payload.elapsed_human}; crossed local date: ${payload.crossed_local_date}.`
          : 'No previous user-turn timestamp recorded yet in this conversation.') +
        `\n${TEMPORAL_CORTEX_CUE}`;
      return {
        content: [{ type: 'text', text: content }],
        structuredContent: { payload, explicit_time_in_prompt: explicit },
      };
    }
  );

  server.tool(
    'time_anchor_now',
    'Get the current time as Asia/Shanghai (UTC+08:00) without recording an anchor.',
    {},
    async () => {
      const now = isoLocal();
      return {
        content: [{ type: 'text', text: `Current time: ${now} (Asia/Shanghai, UTC+08:00).` }],
        structuredContent: { now_local: now, timezone: 'Asia/Shanghai', utc_offset: '+08:00' },
      };
    }
  );
}

const mcpServerBySession = new Map();

app.post('/mcp', async (req, res) => {
  const sessionId = req.header('Mcp-Session-Id');
  if (sessionId) {
    const existing = mcpServerBySession.get(sessionId);
    if (!existing) {
      return res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Unknown session', data: { sessionId } },
        id: null,
      });
    }
    existing.transport.handleRequest(req, res);
    return;
  }
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (id) => {
      const entry = { transport, server: createMcpServer() };
      mcpServerBySession.set(id, entry);
      registerTools(entry.server);
      entry.server.connect(transport);
    },
  });
  await transport.handleRequest(req, res);
});

app.delete('/mcp', (req, res) => {
  const sessionId = req.header('Mcp-Session-Id');
  if (!sessionId) return res.status(400).send('Missing Mcp-Session-Id header');
  const entry = mcpServerBySession.get(sessionId);
  if (!entry) return res.status(404).send('Unknown session');
  mcpServerBySession.delete(sessionId);
  entry.transport.close();
  res.status(204).end();
});

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`time-anchor listening on :${PORT} (TZ=${process.env.TZ || 'unset'})`);
});
