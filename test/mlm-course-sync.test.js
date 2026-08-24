import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMlmCourseEvent } from '../src/mlm-course-sync.js';

test('normalizes a physical MLM calendar event', () => {
  const session = normalizeMlmCourseEvent({
    id: 'cal:101',
    title: '康立產品課程',
    description: '產品與制度說明',
    startsAt: Date.parse('2026-08-01T06:00:00.000Z'),
    endsAt: Date.parse('2026-08-01T08:00:00.000Z'),
    checkinStartsAt: Date.parse('2026-08-01T05:30:00.000Z'),
    checkinEndsAt: Date.parse('2026-08-01T06:30:00.000Z'),
    location: '台北總公司',
  });
  assert.equal(session.id, 'mlm_cal:101');
  assert.equal(session.mode, 'physical');
  assert.equal(session.venueName, '台北總公司');
  assert.equal(session.description, '產品與制度說明');
});

test('detects online courses and extracts their meeting URL', () => {
  const session = normalizeMlmCourseEvent({
    id: 'zoom-1',
    title: '線上教育訓練',
    description: '請由 https://meet.example.com/abc 進入',
    startsAt: Date.parse('2026-08-02T06:00:00.000Z'),
    endsAt: Date.parse('2026-08-02T07:00:00.000Z'),
  });
  assert.equal(session.mode, 'online');
  assert.equal(session.meetingUrl, 'https://meet.example.com/abc');
  assert.equal(session.venueName, '');
});

test('rejects malformed events and supplies safe default windows', () => {
  assert.equal(normalizeMlmCourseEvent({ title: '缺少 ID' }), null);
  const start = Date.parse('2026-08-03T06:00:00.000Z');
  const session = normalizeMlmCourseEvent({ id: 'default', title: '一般課程', startsAt: start });
  assert.equal(session.endsAt, new Date(start + 60 * 60 * 1000).toISOString());
  assert.equal(session.checkinOpensAt, new Date(start - 30 * 60 * 1000).toISOString());
});
