import { saveCalendarSession } from './courses.js';

const DEFAULT_SOURCE_URL = 'https://mlm.fangwl591021.workers.dev/api/public/klink-courses';
const SYNC_PREFIX = 'mlm_';

function text(value) {
  return String(value ?? '').trim();
}

function iso(value, fallback = 0) {
  const number = Number(value) || fallback;
  const date = new Date(number);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function sourceId(value) {
  return text(value).replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 80);
}

function firstUrl(...values) {
  const match = values.join('\n').match(/https?:\/\/[^\s<>()\]，。]+/i);
  return match ? match[0].replace(/[.,;:!?]+$/, '') : '';
}

export function normalizeMlmCourseEvent(event) {
  const id = sourceId(event?.id);
  const title = text(event?.title);
  const startsMs = Number(event?.startsAt) || 0;
  if (!id || !title || !startsMs) return null;

  const description = text(event?.description);
  const location = text(event?.location);
  const meetingUrl = firstUrl(location, description);
  const onlineWords = `${title} ${location}`;
  const mode = meetingUrl || /(線上|online|zoom|meet|teams|直播|webex)/i.test(onlineWords)
    ? 'online'
    : 'physical';
  const endsMs = Number(event?.endsAt) > startsMs
    ? Number(event.endsAt)
    : startsMs + 60 * 60 * 1000;
  const opensMs = Number(event?.checkinStartsAt) || startsMs - 30 * 60 * 1000;
  const requestedClose = Number(event?.checkinEndsAt) || endsMs;
  const closesMs = requestedClose > opensMs ? requestedClose : endsMs;

  return {
    id: `${SYNC_PREFIX}${id}`,
    title,
    description,
    mode,
    startsAt: iso(startsMs),
    endsAt: iso(endsMs),
    venueName: mode === 'physical' ? location : '',
    venueAddress: mode === 'physical' ? location : '',
    meetingUrl: mode === 'online' ? meetingUrl : '',
    checkinOpensAt: iso(opensMs),
    checkinClosesAt: iso(closesMs),
    coverUrl: text(event?.coverUrl),
    status: 'scheduled',
  };
}

export async function syncMlmCourses(env, fetchImpl = fetch) {
  if (!env?.DB) throw new Error('DB is not configured');
  const endpoint = text(env.MLM_COURSES_URL) || DEFAULT_SOURCE_URL;
  const hasServiceBinding = env.MLM_WORKER && typeof env.MLM_WORKER.fetch === 'function';
  const response = hasServiceBinding
    ? await env.MLM_WORKER.fetch('https://mlm.internal/api/public/klink-courses', {
        headers: { accept: 'application/json' },
      })
    : await fetchImpl(endpoint, {
        headers: { accept: 'application/json' },
        cf: { cacheTtl: 60, cacheEverything: true },
      });
  if (!response.ok) throw new Error(`MLM course feed returned ${response.status}`);
  const payload = await response.json();
  if (payload?.status !== 'success' || !Array.isArray(payload.courses)) {
    throw new Error('Invalid MLM course feed');
  }

  const sessions = payload.courses.map(normalizeMlmCourseEvent).filter(Boolean);
  const activeIds = new Set();
  for (const session of sessions) {
    const result = await saveCalendarSession(env.DB, session);
    if (!result.ok) throw new Error(`Unable to sync ${session.id}: ${result.reason}`);
    activeIds.add(session.id);
  }

  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const existing = await env.DB.prepare(`
    SELECT id FROM course_sessions
    WHERE id LIKE 'mlm_%' AND starts_at >= ? AND status = 'scheduled'
  `).bind(cutoff).all();
  let cancelled = 0;
  for (const row of existing.results || []) {
    if (activeIds.has(row.id)) continue;
    const result = await env.DB.prepare(`
      UPDATE course_sessions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'scheduled'
    `).bind(row.id).run();
    cancelled += Number(result.meta?.changes || 0);
  }

  return { synced: sessions.length, cancelled };
}
