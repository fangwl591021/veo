const clean = (value, max = 500) => String(value || '').trim().slice(0, max);

export async function ensureSmartMatchHistoryTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS smart_matching_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      request_key TEXT NOT NULL,
      query_text TEXT NOT NULL,
      number_science_used INTEGER NOT NULL DEFAULT 0,
      number_science_reports_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, request_key)
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS smart_matching_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      contact_card_id TEXT NOT NULL,
      rank_order INTEGER NOT NULL,
      score INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(run_id, contact_card_id)
    )
  `).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_smart_matching_results_card ON smart_matching_results(user_id, contact_card_id, created_at DESC)').run();
}

function resultId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

export async function findCachedSmartMatch(db, userId, requestKey, contacts = []) {
  await ensureSmartMatchHistoryTables(db);
  const run = await db.prepare(`
    SELECT id, query_text, number_science_used, number_science_reports_json, created_at
    FROM smart_matching_runs WHERE user_id = ? AND request_key = ? LIMIT 1
  `).bind(userId, requestKey).first();
  if (!run) return null;
  const rows = await db.prepare(`
    SELECT contact_card_id, rank_order, score, reason
    FROM smart_matching_results WHERE run_id = ? ORDER BY rank_order ASC
  `).bind(run.id).all();
  const byId = new Map(contacts.map((card) => [card.id, card]));
  const matches = (rows.results || []).flatMap((row) => {
    const card = byId.get(row.contact_card_id);
    return card ? [{ card, score:Number(row.score || 0), reason:clean(row.reason, 120) }] : [];
  });
  let reports = [];
  try { reports = JSON.parse(run.number_science_reports_json || '[]'); } catch { reports = []; }
  return {
    matches,
    numberScienceUsed:Boolean(run.number_science_used),
    numberScienceReports:Array.isArray(reports) ? reports : [],
    createdAt:run.created_at,
  };
}

export async function saveSmartMatch(db, { userId, requestKey, query, matches = [], numberScienceUsed = false, numberScienceReports = [] }) {
  await ensureSmartMatchHistoryTables(db);
  const runId = resultId('matchrun');
  await db.prepare(`
    INSERT INTO smart_matching_runs (id, user_id, request_key, query_text, number_science_used, number_science_reports_json)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, request_key) DO NOTHING
  `).bind(runId, userId, requestKey, clean(query, 300), numberScienceUsed ? 1 : 0, JSON.stringify(numberScienceReports || [])).run();
  const actualRun = await db.prepare('SELECT id FROM smart_matching_runs WHERE user_id = ? AND request_key = ? LIMIT 1').bind(userId, requestKey).first();
  if (!actualRun || actualRun.id !== runId) return;
  const statements = [];
  for (const [index, match] of matches.slice(0, 3).entries()) {
    statements.push(db.prepare(`
      INSERT OR IGNORE INTO smart_matching_results (id, run_id, user_id, contact_card_id, rank_order, score, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(resultId('match'), actualRun.id, userId, match.card.id, index + 1, Math.max(0, Math.min(100, Number(match.score || 0))), clean(match.reason, 120)));
  }
  if (statements.length) await db.batch(statements);
}

export async function listContactSmartMatchHistory(db, userId, cardId) {
  await ensureSmartMatchHistoryTables(db);
  const card = await db.prepare("SELECT id FROM contact_cards WHERE id = ? AND scanner_user_id = ? AND status = 'active' LIMIT 1").bind(cardId, userId).first();
  if (!card) throw new Error('找不到收藏名片');
  const rows = await db.prepare(`
    SELECT r.id, r.query_text, r.number_science_used, r.number_science_reports_json, r.created_at,
           m.rank_order, m.score, m.reason
    FROM smart_matching_results m
    JOIN smart_matching_runs r ON r.id = m.run_id
    WHERE m.user_id = ? AND m.contact_card_id = ?
    ORDER BY m.created_at DESC
    LIMIT 20
  `).bind(userId, cardId).all();
  return (rows.results || []).map((row) => {
    let reports = [];
    try { reports = JSON.parse(row.number_science_reports_json || '[]'); } catch { reports = []; }
    return {
      id:row.id,
      query:clean(row.query_text, 300),
      rank:Number(row.rank_order || 0),
      score:Number(row.score || 0),
      reason:clean(row.reason, 120),
      numberScienceUsed:Boolean(row.number_science_used),
      numberScienceReports:Array.isArray(reports) ? reports : [],
      createdAt:row.created_at,
    };
  });
}
