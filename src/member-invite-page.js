import { resolveInvite } from './member-repository.js';

const THEMES = new Set(['cosmic', 'aurora', 'warm']);
const clean = (value, limit) => String(value || '').trim().slice(0, limit);

export function normalizeInvitePage(input = {}) {
  const theme = clean(input.theme, 20);
  return {
    roleTitle: clean(input.roleTitle, 80),
    headline: clean(input.headline, 90),
    tagline: clean(input.tagline, 140),
    ctaText: clean(input.ctaText, 30),
    theme: THEMES.has(theme) ? theme : 'cosmic',
  };
}

function pageFromRow(row, origin = '') {
  if (!row) return null;
  const userId = String(row.platform_user_id || row.user_id || '');
  return {
    displayName: clean(row.display_name, 120) || 'VEO 會員',
    pictureUrl: clean(row.picture_url, 2048),
    roleTitle: clean(row.role_title, 80) || 'AI 進化圈夥伴',
    headline: clean(row.headline, 90) || '你的下一個商機，可能已經在圈裡。',
    tagline: clean(row.tagline, 140) || '讓 AI 為你連結人脈、任務與機會。',
    ctaText: clean(row.cta_text, 30) || '看看我們能創造什麼',
    theme: THEMES.has(row.theme) ? row.theme : 'cosmic',
    backgroundUrl: row.background_r2_key && origin && userId
      ? `${origin}/v1/invite-page-background/${encodeURIComponent(userId)}`
      : '',
  };
}

export async function getMemberInvitePage(db, userId, origin = '') {
  const row = await db.prepare(`
    SELECT mp.platform_user_id, mp.display_name, mp.picture_url,
           ip.role_title, ip.headline, ip.tagline, ip.cta_text, ip.theme, ip.background_r2_key
    FROM member_profiles mp
    LEFT JOIN member_invite_pages ip ON ip.platform_user_id = mp.platform_user_id
    WHERE mp.platform_user_id = ?
    LIMIT 1
  `).bind(userId).first();
  return pageFromRow(row, origin);
}

export async function getPublicInvitePage(db, rawToken, origin = '') {
  const resolved = await resolveInvite(db, rawToken, 'public-invite-visitor');
  if (!resolved?.inviterUserId) return null;
  return getMemberInvitePage(db, resolved.inviterUserId, origin);
}

export async function saveMemberInvitePage(db, userId, input = {}) {
  const page = normalizeInvitePage(input);
  await db.prepare(`
    INSERT INTO member_invite_pages (platform_user_id, role_title, headline, tagline, cta_text, theme, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(platform_user_id) DO UPDATE SET
      role_title = excluded.role_title,
      headline = excluded.headline,
      tagline = excluded.tagline,
      cta_text = excluded.cta_text,
      theme = excluded.theme,
      updated_at = CURRENT_TIMESTAMP
  `).bind(userId, page.roleTitle, page.headline, page.tagline, page.ctaText, page.theme).run();
  return page;
}

