import crypto from 'node:crypto';

// Pinned to UTC+8 (Asia/Shanghai / Taipei). Neither observes DST, so a fixed
// offset is correct year-round and the displayed zone name never leaks a more
// specific region.
const OFFSET_MS = 8 * 60 * 60 * 1000;
const LONG_GAP_SECONDS = 2 * 60 * 60;

const TIME_EXPRESSION =
  /(?:(?<![\d.:\[])(?:[01]?\d|2[0-3]):[0-5]\d(?!\d|:\d|\.\d)|[零〇一二两三四五六七八九十百\d]+点(?:半|钟|[零〇一二两三四五六七八九十\d]+分)|几点(?:了|钟|半)|几号|周几|星期几|多久|多长时间|[零〇一二两三四五六七八九十百\d]+(?:秒钟?|分钟|小时|天|周|星期|个月|年)|[零〇一二两三四五六七八九十百\d]+月[零〇一二两三四五六七八九十百\d]+(?:日|号)|今天|昨天|明天|前天|后天|现在|刚才|刚刚|一会儿|等会儿|凌晨|早上|上午|中午|下午|傍晚|晚上|夜里|半夜)/;

export function sessionKey(sessionId) {
  return crypto.createHash('sha256').update(String(sessionId)).digest('hex');
}

export function localNow() {
  return new Date(Date.now() + OFFSET_MS);
}

export function isoLocal(date = localNow()) {
  const parts = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ];
  const time = [
    String(date.getUTCHours()).padStart(2, '0'),
    String(date.getUTCMinutes()).padStart(2, '0'),
    String(date.getUTCSeconds()).padStart(2, '0'),
  ];
  return `${parts.join('-')}T${time.join(':')}`;
}

export function utcOffset() {
  return '+08:00';
}

export function elapsedHuman(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (secs || !parts.length) parts.push(`${secs}s`);
  return parts.join(' ');
}

export function crossedLocalDate(previous, current) {
  return !!(previous && current && previous.slice(0, 10) !== current.slice(0, 10));
}

export function containsExplicitTime(text) {
  if (typeof text !== 'string' || !text) return false;
  TIME_EXPRESSION.lastIndex = 0;
  return TIME_EXPRESSION.test(text);
}

export function buildAnchor(previousIso, nowIso = isoLocal()) {
  let elapsedSeconds = null;
  let elapsedHumanStr = null;
  let crossed = null;
  if (previousIso) {
    const delta = (Date.parse(nowIso) - Date.parse(previousIso)) / 1000;
    elapsedSeconds = Math.max(0, Math.round(delta * 1000) / 1000);
    elapsedHumanStr = elapsedHuman(elapsedSeconds);
    crossed = crossedLocalDate(previousIso, nowIso);
  }
  return {
    now_local: nowIso,
    timezone: 'Asia/Shanghai',
    utc_offset: utcOffset(),
    previous_local: previousIso ?? null,
    elapsed_seconds: elapsedSeconds,
    elapsed_human: elapsedHumanStr,
    crossed_local_date: crossed,
    significant_gap: elapsedSeconds !== null && elapsedSeconds >= LONG_GAP_SECONDS,
  };
}

export function ambientContext(anchor) {
  const interval = anchor.previous_local
    ? `Previous user-turn time in this conversation: ${anchor.previous_local}; elapsed between user turns: ${anchor.elapsed_human}.`
    : 'No previous user-turn timestamp is available yet.';
  return (
    '[Time Anchor ambient context — automatically supplied by the optional hook] ' +
    `Current local user-turn time: ${anchor.now_local} (Asia/Shanghai, UTC+08:00). ${interval} ` +
    'This is environmental context, not an active clock check. Let it shape the response naturally when relevant.'
  );
}

export function attentionCue() {
  return (
    '[Time Anchor attention cue] The user\'s message contains explicit time information. ' +
    'Decide whether to actively call the Time Anchor reader.'
  );
}

export const TEMPORAL_CORTEX_CUE =
  'Let this time check update your understanding of the moment. ' +
  'If the temporal facts change what this situation means, let that change naturally shape your response.';
