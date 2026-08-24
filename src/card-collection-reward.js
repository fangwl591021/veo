import { newId } from './member-repository.js';
import { awardPoints } from './points.js';

const CARD_COLLECTION_REWARD_POINTS = 10;

export function cardCollectionPointKeys(userId, cardId) {
  return {
    award: `card_collection_reward:${userId}:${cardId}`,
    reversal: `card_collection_reward_reversal:${userId}:${cardId}`,
  };
}

async function configuredCardCollectionRewardPoints(db) {
  await db.prepare(`INSERT OR IGNORE INTO point_rules
    (id,program_id,event_type,points,daily_limit,award_frequency,status,rule_version)
    VALUES ('pointrule_card_collection','program_main','card_collection_reward',10,NULL,'per_completion','active','v1')`).run();
  const rule=await db.prepare(`SELECT points FROM point_rules
    WHERE program_id='program_main' AND event_type='card_collection_reward' AND status='active'
    ORDER BY updated_at DESC LIMIT 1`).first();
  const points=Number(rule?.points);
  return Number.isInteger(points) && points > 0 ? points : 0;
}

async function ensureCardCollectionRewardTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS card_collection_rewards (
      user_id TEXT NOT NULL,
      contact_card_id TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 10,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id, contact_card_id)
    )
  `).run();
}

export async function queueCardCollectionReward(db, userId, cardId) {
  await ensureCardCollectionRewardTable(db);
  const points=await configuredCardCollectionRewardPoints(db);
  if(points<=0)return {queued:false,points:0};
  await db.prepare(`
    INSERT INTO card_collection_rewards (user_id, contact_card_id, points)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, contact_card_id) DO NOTHING
  `).bind(userId, cardId, points).run();
  return {queued:true,points};
}

export async function fulfillCardCollectionReward(env, userId, cardId) {
  await ensureCardCollectionRewardTable(env.DB);
  const reward = await env.DB.prepare('SELECT * FROM card_collection_rewards WHERE user_id=? AND contact_card_id=? LIMIT 1').bind(userId, cardId).first();
  if (!reward) return { status:'not_queued', points:0 };
  const card = await env.DB.prepare("SELECT id FROM contact_cards WHERE id=? AND scanner_user_id=? AND status='active' LIMIT 1").bind(cardId, userId).first();
  if (!card) {
    await env.DB.prepare("UPDATE card_collection_rewards SET status='cancelled',last_error='名片不存在',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND contact_card_id=?").bind(userId, cardId).run();
    return { status:'cancelled', points:0 };
  }
  const claim = await env.DB.prepare(`
    UPDATE card_collection_rewards SET status='processing',attempts=attempts+1,updated_at=CURRENT_TIMESTAMP
    WHERE user_id=? AND contact_card_id=?
      AND (status!='processing' OR updated_at <= datetime('now','-2 minutes'))
  `).bind(userId, cardId).run();
  if (Number(claim?.meta?.changes || 0) === 0) return { status:'processing', points:Number(reward.points || CARD_COLLECTION_REWARD_POINTS) };
  try {
    const keys = cardCollectionPointKeys(userId, cardId);
    const result = await awardPoints(env.DB, {
      userId,
      eventType:'card_collection_reward',
      eventReference:cardId,
      idempotencyKey:keys.award,
      metadata:{ source:'business_card_scan' },
    });
    await env.DB.prepare("UPDATE card_collection_rewards SET status='completed',last_error='',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND contact_card_id=?").bind(userId, cardId).run();
    return {
      status:'completed',
      points:Number(result.entry?.delta || reward.points || CARD_COLLECTION_REWARD_POINTS),
      duplicate:Boolean(result.duplicate || !result.awarded),
      balance:result.entry?.balance_after,
    };
  } catch (error) {
    await env.DB.prepare("UPDATE card_collection_rewards SET status='pending',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND contact_card_id=?")
      .bind(String(error?.message || error).slice(0, 300), userId, cardId).run().catch(() => null);
    throw error;
  }
}
export async function queueAndFulfillCardCollectionReward(env, userId, cardId) {
  const queued=await queueCardCollectionReward(env.DB, userId, cardId);
  if(!queued.queued)return {status:'disabled',points:0};
  try { return await fulfillCardCollectionReward(env, userId, cardId); }
  catch (error) { console.warn('Card collection reward queued for retry', error); return { status:'pending', points:queued.points }; }
}

export async function reconcileMemberCardCollectionRewards(env, userId, limit = 5) {
  await ensureCardCollectionRewardTable(env.DB);
  // 只補送已通過新版圖片指紋防重、且 OCR 已完成的名片；不追溯舊資料。
  const rows=await env.DB.prepare(`SELECT cc.id contact_card_id
    FROM contact_cards cc
    JOIN card_import_events cie ON cie.id=cc.source_event_id
    JOIN card_import_fingerprints cif ON cif.event_id=cie.id AND cif.user_id=cc.scanner_user_id
    LEFT JOIN card_collection_rewards reward
      ON reward.user_id=cc.scanner_user_id AND reward.contact_card_id=cc.id
    LEFT JOIN point_ledger_entries ledger
      ON ledger.idempotency_key='card_collection_reward:' || cc.scanner_user_id || ':' || cc.id
    WHERE cc.scanner_user_id=? AND cc.status='active' AND cie.status='created'
      AND cif.status='completed' AND (reward.contact_card_id IS NULL OR ledger.id IS NULL)
    ORDER BY cc.created_at DESC LIMIT ?`).bind(userId,Math.max(1,Math.min(Number(limit)||5,10))).all();
  let completed=0;
  for(const row of rows.results || []){
    const result=await queueAndFulfillCardCollectionReward(env,userId,row.contact_card_id);
    if(result.status==='completed')completed+=1;
  }
  return {scanned:(rows.results || []).length,completed};
}

export async function deleteContactAndReverseReward(env, userId, cardId) {
  await ensureCardCollectionRewardTable(env.DB);
  const card = await env.DB.prepare(`
    SELECT id,front_r2_key FROM contact_cards
    WHERE id=? AND scanner_user_id=? AND status='active'
    LIMIT 1
  `).bind(cardId,userId).first();
  if(!card)throw new Error('找不到收藏名片');

  const keys=cardCollectionPointKeys(userId,cardId);
  const award=await env.DB.prepare(`
    SELECT le.id,le.point_account_id,le.point_rule_id,le.delta,le.status,pa.balance
    FROM point_ledger_entries le
    JOIN point_accounts pa ON pa.id=le.point_account_id
    WHERE le.idempotency_key=? AND le.platform_user_id=?
    LIMIT 1
  `).bind(keys.award,userId).first();
  const existingReversal=await env.DB.prepare(
    'SELECT id,delta,balance_after FROM point_ledger_entries WHERE idempotency_key=? LIMIT 1'
  ).bind(keys.reversal).first();

  let reversedPoints=0;
  if(award && award.status==='posted' && Number(award.delta)>0 && !existingReversal){
    const points=Number(award.delta);
    const balance=Number(award.balance);
    if(balance<points)throw new Error(`點數餘額不足 ${points} 點，無法刪除這張名片`);
    const balanceAfter=balance-points;
    try{
      await env.DB.batch([
        env.DB.prepare('UPDATE point_accounts SET balance=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(balanceAfter,award.point_account_id),
        env.DB.prepare(`INSERT INTO point_ledger_entries
          (id,point_account_id,platform_user_id,program_id,point_rule_id,event_type,event_reference,idempotency_key,delta,balance_after,metadata_json)
          VALUES (?,?,?,'program_main',?,'card_collection_reward_reversal',?,?,?,?,?)`)
          .bind(newId('ledger'),award.point_account_id,userId,award.point_rule_id,cardId,keys.reversal,-points,balanceAfter,JSON.stringify({source:'card_deleted',reversesEntryId:award.id})),
        env.DB.prepare("UPDATE point_ledger_entries SET status='reversed' WHERE id=?").bind(award.id),
        env.DB.prepare("UPDATE card_collection_rewards SET status='reversed',last_error='',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND contact_card_id=?").bind(userId,cardId),
        env.DB.prepare("UPDATE contact_cards SET status='archived',front_r2_key='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND scanner_user_id=? AND status='active'").bind(cardId,userId),
      ]);
      reversedPoints=points;
    }catch(error){
      if(!String(error?.message || '').includes('UNIQUE constraint failed: point_ledger_entries.idempotency_key'))throw error;
    }
  }else{
    await env.DB.batch([
      env.DB.prepare("UPDATE card_collection_rewards SET status=CASE WHEN status='completed' THEN status ELSE 'cancelled' END,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND contact_card_id=?").bind(userId,cardId),
      env.DB.prepare("UPDATE contact_cards SET status='archived',front_r2_key='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND scanner_user_id=? AND status='active'").bind(cardId,userId),
    ]);
  }
  if(card.front_r2_key)await env.MEDIA.delete(card.front_r2_key);
  return {reversedPoints};
}
export async function retryPendingCardCollectionRewards(env, limit = 10) {
  await ensureCardCollectionRewardTable(env.DB);
  const rows = await env.DB.prepare(`
    SELECT user_id, contact_card_id FROM card_collection_rewards
    WHERE status='pending' AND attempts < 20
    ORDER BY updated_at ASC LIMIT ?
  `).bind(Math.max(1, Math.min(Number(limit) || 10, 30))).all();
  let completed = 0;
  for (const row of rows.results || []) {
    try { const result = await fulfillCardCollectionReward(env, row.user_id, row.contact_card_id); if (result.status === 'completed') completed += 1; }
    catch (error) { console.warn('Pending card collection reward retry failed', row.contact_card_id, error); }
  }
  return { scanned:(rows.results || []).length, completed };
}
