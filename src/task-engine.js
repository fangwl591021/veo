import { newId } from "./member-repository.js";
import {
  decryptTelegramBotToken,
  encryptTelegramBotToken,
  isValidTelegramBotToken,
  normalizeTelegramBotToken,
} from "./telegram-token-crypto.js";

const TASK_STATUSES = new Set(["pending", "completed", "postponed", "cancelled"]);
const TASK_PRIORITIES = new Set(["low", "normal", "high"]);
const ACTIONS = new Set(["complete", "postpone", "cancel", "note"]);
const text = (value, max = 1000) => String(value ?? "").trim().slice(0, max);

function iso(value, fallback = "") {
  const parsed = new Date(value || fallback);
  if (!Number.isFinite(parsed.getTime())) throw new Error("請輸入有效的任務時間");
  return parsed.toISOString();
}

function parseJson(value, fallback) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

function taskRow(row) {
  return {
    id: row.id,
    contactCardId: row.contact_card_id || "",
    contactName: row.contact_name || "",
    parentTaskId: row.parent_task_id || "",
    nextTaskId: row.next_task_id || "",
    title: row.title,
    description: row.description || "",
    dueAt: row.due_at,
    priority: row.priority,
    status: row.status,
    source: row.source,
    aiStatus: row.ai_status,
    aiReason: row.ai_reason || "",
    completedAt: row.completed_at || "",
    cancelledAt: row.cancelled_at || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function eventRow(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    type: row.event_type,
    note: row.note || "",
    metadata: parseJson(row.metadata_json, {}),
    createdAt: row.created_at,
  };
}

export function validateTaskInput(body = {}, now = new Date()) {
  const title = text(body.title, 120);
  if (!title) throw new Error("請輸入任務名稱");
  const dueAt = iso(body.dueAt, new Date(now.getTime() + 86_400_000).toISOString());
  const priority = TASK_PRIORITIES.has(body.priority) ? body.priority : "normal";
  return {
    title,
    description: text(body.description, 2000),
    dueAt,
    priority,
    contactCardId: text(body.contactCardId, 100),
  };
}

async function ownedContact(db, userId, contactCardId) {
  if (!contactCardId) return null;
  const contact = await db.prepare(
    "SELECT id,display_name,company_name,job_title FROM contact_cards WHERE id=? AND scanner_user_id=? AND status='active'",
  ).bind(contactCardId, userId).first();
  if (!contact) throw new Error("找不到這張收藏名片");
  return contact;
}

async function ownedTask(db, userId, taskId) {
  const task = await db.prepare("SELECT * FROM ai_tasks WHERE id=? AND platform_user_id=?")
    .bind(taskId, userId).first();
  if (!task) throw new Error("找不到這筆任務");
  return task;
}

async function addEvent(db, userId, taskId, type, note = "", metadata = {}) {
  await db.prepare(`INSERT INTO ai_task_events
    (id,task_id,platform_user_id,event_type,note,metadata_json)
    VALUES (?,?,?,?,?,?)`)
    .bind(newId("task_event"), taskId, userId, type, text(note, 2000), JSON.stringify(metadata || {})).run();
}

export async function createTask(db, userId, body = {}, options = {}) {
  const input = validateTaskInput(body);
  await ownedContact(db, userId, input.contactCardId);
  const id = newId("task");
  const source = ["manual", "ai", "card_crm"].includes(options.source) ? options.source : "manual";
  const parentTaskId = text(options.parentTaskId, 100);
  await db.batch([
    db.prepare(`INSERT INTO ai_tasks
      (id,platform_user_id,contact_card_id,parent_task_id,title,description,due_at,priority,status,source,ai_status,ai_reason)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, userId, input.contactCardId || null, parentTaskId || null, input.title, input.description, input.dueAt, input.priority, "pending", source, "idle", text(options.aiReason, 1000)),
    db.prepare(`INSERT INTO ai_task_events
      (id,task_id,platform_user_id,event_type,note,metadata_json)
      VALUES (?,?,?,?,?,?)`)
      .bind(newId("task_event"), id, userId, "created", input.description, JSON.stringify({ source, parentTaskId })),
  ]);
  return taskRow(await db.prepare(`SELECT t.*,cc.display_name AS contact_name,
    (SELECT id FROM ai_tasks child WHERE child.parent_task_id=t.id ORDER BY child.created_at DESC LIMIT 1) AS next_task_id
    FROM ai_tasks t LEFT JOIN contact_cards cc ON cc.id=t.contact_card_id
    WHERE t.id=? AND t.platform_user_id=?`).bind(id, userId).first());
}

export async function listTasks(db, userId, { status = "", limit = 100 } = {}) {
  const safeStatus = TASK_STATUSES.has(status) ? status : "";
  const rows = await db.prepare(`SELECT t.*,cc.display_name AS contact_name,
    (SELECT id FROM ai_tasks child WHERE child.parent_task_id=t.id ORDER BY child.created_at DESC LIMIT 1) AS next_task_id
    FROM ai_tasks t
    LEFT JOIN contact_cards cc ON cc.id=t.contact_card_id AND cc.scanner_user_id=t.platform_user_id
    WHERE t.platform_user_id=? AND (?='' OR t.status=?)
    ORDER BY CASE t.status WHEN 'pending' THEN 0 WHEN 'postponed' THEN 1 ELSE 2 END,
      datetime(t.due_at) ASC, datetime(t.created_at) DESC LIMIT ?`)
    .bind(userId, safeStatus, safeStatus, Math.max(1, Math.min(200, Number(limit) || 100))).all();
  const events = await db.prepare(`SELECT e.* FROM ai_task_events e
    WHERE e.platform_user_id=? ORDER BY datetime(e.created_at) DESC LIMIT 300`).bind(userId).all();
  const deliveries = await db.prepare(`SELECT task_id,channel,status,error_message,attempted_at
    FROM ai_task_deliveries WHERE platform_user_id=? ORDER BY datetime(attempted_at) DESC LIMIT 300`).bind(userId).all();
  const contacts = await db.prepare(`SELECT id,display_name,company_name,job_title
    FROM contact_cards WHERE scanner_user_id=? AND status='active' ORDER BY display_name LIMIT 200`).bind(userId).all();
  const channel = await getTaskChannels(db, userId);
  return {
    tasks: (rows.results || []).map(taskRow),
    events: (events.results || []).map(eventRow),
    deliveries: deliveries.results || [],
    contacts: (contacts.results || []).map((row) => ({
      id: row.id,
      displayName: row.display_name || "未命名聯絡人",
      companyName: row.company_name || "",
      jobTitle: row.job_title || "",
    })),
    channel,
  };
}

export async function actOnTask(db, userId, taskId, body = {}) {
  const action = text(body.action, 30);
  if (!ACTIONS.has(action)) throw new Error("不支援的任務操作");
  const current = await ownedTask(db, userId, taskId);
  if (["completed", "cancelled"].includes(current.status) && action !== "note") throw new Error("這筆任務已結案");
  const note = text(body.note, 2000);
  const statements = [];
  let eventType = "";
  if (action === "complete") {
    eventType = "completed";
    statements.push(db.prepare(`UPDATE ai_tasks SET status='completed',completed_at=CURRENT_TIMESTAMP,
      ai_status='queued',updated_at=CURRENT_TIMESTAMP WHERE id=? AND platform_user_id=?`).bind(taskId, userId));
  } else if (action === "cancel") {
    eventType = "cancelled";
    statements.push(db.prepare(`UPDATE ai_tasks SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP,
      ai_status='queued',updated_at=CURRENT_TIMESTAMP WHERE id=? AND platform_user_id=?`).bind(taskId, userId));
  } else if (action === "postpone") {
    eventType = "postponed";
    const dueAt = iso(body.dueAt, new Date(Date.parse(current.due_at) + 86_400_000).toISOString());
    statements.push(db.prepare(`UPDATE ai_tasks SET status='postponed',due_at=?,
      updated_at=CURRENT_TIMESTAMP WHERE id=? AND platform_user_id=?`).bind(dueAt, taskId, userId));
  } else {
    if (!note) throw new Error("請輸入紀錄內容");
    eventType = "note_added";
    statements.push(db.prepare(`UPDATE ai_tasks SET ai_status='queued',
      updated_at=CURRENT_TIMESTAMP WHERE id=? AND platform_user_id=?`).bind(taskId, userId));
  }
  statements.push(db.prepare(`INSERT INTO ai_task_events
    (id,task_id,platform_user_id,event_type,note,metadata_json) VALUES (?,?,?,?,?,?)`)
    .bind(newId("task_event"), taskId, userId, eventType, note, JSON.stringify({
      previousStatus: current.status,
      dueAt: body.dueAt || "",
    })));
  await db.batch(statements);
  return {
    task: taskRow(await db.prepare(`SELECT t.*,cc.display_name AS contact_name,'' AS next_task_id
      FROM ai_tasks t LEFT JOIN contact_cards cc ON cc.id=t.contact_card_id
      WHERE t.id=? AND t.platform_user_id=?`).bind(taskId, userId).first()),
    needsAiNext: ["complete", "cancel", "note"].includes(action),
    action,
  };
}

export async function getTaskChannels(db, userId) {
  const row = await db.prepare(`SELECT c.*,
    EXISTS(SELECT 1 FROM external_identities e
      WHERE (e.platform_user_id=? OR e.platform_user_id IN (
        SELECT alias_user_id FROM member_account_aliases WHERE canonical_user_id=?
      )) AND e.provider='line_login' AND e.verification_status='verified') AS has_line
    FROM member_task_channels c WHERE c.platform_user_id=?`).bind(userId, userId, userId).first();
  if (row) return {
    lineLinked: Boolean(row.has_line),
    lineEnabled: Boolean(row.line_enabled),
    telegramEnabled: Boolean(row.telegram_enabled),
    telegramChatId: row.telegram_chat_id || "",
    telegramBotConfigured: Boolean(row.telegram_bot_token_encrypted),
    telegramBotTokenLast4: row.telegram_bot_token_last4 || "",
  };
  const identity = await db.prepare(`SELECT 1 AS ok FROM external_identities
    WHERE (platform_user_id=? OR platform_user_id IN (
      SELECT alias_user_id FROM member_account_aliases WHERE canonical_user_id=?
    )) AND provider='line_login' AND verification_status='verified' LIMIT 1`).bind(userId, userId).first();
  return { lineLinked:Boolean(identity), lineEnabled:false, telegramEnabled:false, telegramChatId:"", telegramBotConfigured:false, telegramBotTokenLast4:"" };
}

export async function saveTaskChannels(db, userId, body = {}, encryptionSecret = "") {
  const telegramChatId = text(body.telegramChatId, 100);
  const telegramBotToken = normalizeTelegramBotToken(body.telegramBotToken);
  const lineEnabled = body.lineEnabled === true ? 1 : 0;
  const current = await db.prepare(`SELECT telegram_bot_token_encrypted,telegram_bot_token_last4
    FROM member_task_channels WHERE platform_user_id=?`).bind(userId).first();
  if (telegramBotToken && !isValidTelegramBotToken(telegramBotToken)) throw new Error("Telegram Bot Token 格式錯誤");
  const telegramBotTokenEncrypted = telegramBotToken
    ? await encryptTelegramBotToken(telegramBotToken, encryptionSecret)
    : current?.telegram_bot_token_encrypted || "";
  const telegramBotTokenLast4 = telegramBotToken
    ? telegramBotToken.slice(-4)
    : current?.telegram_bot_token_last4 || "";
  if (body.telegramEnabled === true && !telegramChatId) throw new Error("啟用 Telegram 推播前請填寫 Chat ID");
  if (body.telegramEnabled === true && !telegramBotTokenEncrypted) throw new Error("啟用 Telegram 推播前請填寫 Bot Token");
  const telegramEnabled = body.telegramEnabled === true ? 1 : 0;
  await db.prepare(`INSERT INTO member_task_channels
    (platform_user_id,telegram_chat_id,line_enabled,telegram_enabled,
      telegram_bot_token_encrypted,telegram_bot_token_last4,updated_at)
    VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(platform_user_id) DO UPDATE SET telegram_chat_id=excluded.telegram_chat_id,
      line_enabled=excluded.line_enabled,telegram_enabled=excluded.telegram_enabled,
      telegram_bot_token_encrypted=excluded.telegram_bot_token_encrypted,
      telegram_bot_token_last4=excluded.telegram_bot_token_last4,
      updated_at=CURRENT_TIMESTAMP`)
    .bind(userId, telegramChatId, lineEnabled, telegramEnabled,
      telegramBotTokenEncrypted, telegramBotTokenLast4).run();
  return getTaskChannels(db, userId);
}

export async function getTaskTelegramBotToken(db, userId, encryptionSecret, fallbackToken = "") {
  const row = await db.prepare(`SELECT telegram_bot_token_encrypted
    FROM member_task_channels WHERE platform_user_id=?`).bind(userId).first();
  if (row?.telegram_bot_token_encrypted) {
    return decryptTelegramBotToken(row.telegram_bot_token_encrypted, encryptionSecret);
  }
  return normalizeTelegramBotToken(fallbackToken);
}

function outputText(result = {}) {
  return result.output_text
    || result.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text
    || "";
}

const NEXT_TASK_SCHEMA = {
  type:"object",
  additionalProperties:false,
  required:["createNextTask","title","description","dueInDays","priority","reason"],
  properties:{
    createNextTask:{type:"boolean"},
    title:{type:"string"},
    description:{type:"string"},
    dueInDays:{type:"integer",minimum:1,maximum:30},
    priority:{type:"string",enum:["low","normal","high"]},
    reason:{type:"string"},
  },
};

export async function generateNextTask(db, provider, userId, taskId) {
  const task = await ownedTask(db, userId, taskId);
  const existing = await db.prepare("SELECT id FROM ai_tasks WHERE parent_task_id=? AND platform_user_id=? LIMIT 1")
    .bind(taskId, userId).first();
  if (existing) {
    await db.prepare("UPDATE ai_tasks SET ai_status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(taskId).run();
    return { created:false, taskId:existing.id, reason:"already_created" };
  }
  if (!provider || typeof provider.fetch !== "function") {
    await db.batch([
      db.prepare("UPDATE ai_tasks SET ai_status='failed',ai_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND platform_user_id=?")
        .bind("AI 服務尚未連線", taskId, userId),
      db.prepare(`INSERT INTO ai_task_events (id,task_id,platform_user_id,event_type,note,metadata_json)
        VALUES (?,?,?,?,?,?)`).bind(newId("task_event"), taskId, userId, "ai_failed", "AI 服務尚未連線", "{}"),
    ]);
    return { created:false, reason:"provider_unavailable" };
  }
  const events = await db.prepare(`SELECT event_type,note,created_at FROM ai_task_events
    WHERE task_id=? AND platform_user_id=? ORDER BY datetime(created_at) ASC`).bind(taskId, userId).all();
  const contact = task.contact_card_id
    ? await db.prepare(`SELECT display_name,company_name,job_title,service_description,note
        FROM contact_cards WHERE id=? AND scanner_user_id=?`).bind(task.contact_card_id, userId).first()
    : null;
  const prompt = `你是繁體中文 AI 商務導航助理。根據任務與 CRM 回報，判斷是否建立下一個可執行任務。
任務：${JSON.stringify({title:task.title,description:task.description,status:task.status,dueAt:task.due_at})}
聯絡人：${JSON.stringify(contact || {})}
回報歷程：${JSON.stringify(events.results || [])}
規則：下一任務要具體、可完成，不重複原任務；取消不代表一定要續追。無合理下一步時 createNextTask=false，其餘欄位仍回傳空字串或預設值。只回傳 JSON。`;
  try {
    const response = await provider.fetch("https://mlm.internal/api/internal/ai/responses", {
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({request:{
        model:"gpt-5-mini",
        reasoning:{effort:"low"},
        max_output_tokens:600,
        input:[{role:"user",content:prompt}],
        text:{format:{type:"json_schema",name:"task_engine_next_step",strict:true,schema:NEXT_TASK_SCHEMA}},
      }}),
    });
    const result = await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(text(result?.error?.message || result.error, 180) || "AI 下一任務分析失敗");
    const parsed = JSON.parse(outputText(result));
    if (!parsed.createNextTask) {
      const reason = text(parsed.reason, 1000);
      await db.batch([
        db.prepare("UPDATE ai_tasks SET ai_status='completed',ai_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND platform_user_id=?")
          .bind(reason, taskId, userId),
        db.prepare(`INSERT INTO ai_task_events (id,task_id,platform_user_id,event_type,note,metadata_json)
          VALUES (?,?,?,?,?,?)`).bind(newId("task_event"), taskId, userId, "ai_next_skipped", reason, "{}"),
      ]);
      return { created:false, reason };
    }
    const dueAt = new Date(Date.now() + Math.max(1, Math.min(30, Number(parsed.dueInDays) || 3)) * 86_400_000).toISOString();
    const next = await createTask(db, userId, {
      title:parsed.title,
      description:parsed.description,
      dueAt,
      priority:parsed.priority,
      contactCardId:task.contact_card_id || "",
    }, { source:"ai", parentTaskId:taskId, aiReason:parsed.reason });
    await db.batch([
      db.prepare("UPDATE ai_tasks SET ai_status='completed',ai_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND platform_user_id=?")
        .bind(text(parsed.reason, 1000), taskId, userId),
      db.prepare(`INSERT INTO ai_task_events (id,task_id,platform_user_id,event_type,note,metadata_json)
        VALUES (?,?,?,?,?,?)`).bind(newId("task_event"), taskId, userId, "ai_next_created", text(parsed.reason, 1000), JSON.stringify({ nextTaskId:next.id })),
    ]);
    return { created:true, task:next };
  } catch (error) {
    await db.batch([
      db.prepare("UPDATE ai_tasks SET ai_status='failed',ai_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND platform_user_id=?")
        .bind(text(error.message, 1000), taskId, userId),
      db.prepare(`INSERT INTO ai_task_events (id,task_id,platform_user_id,event_type,note,metadata_json)
        VALUES (?,?,?,?,?,?)`).bind(newId("task_event"), taskId, userId, "ai_failed", text(error.message, 1000), "{}"),
    ]);
    throw error;
  }
}

function taskCenterUrl(env, taskId = "") {
  const liffId = text(env.LIFF_ID, 200);
  const base = liffId
    ? `https://liff.line.me/${encodeURIComponent(liffId)}`
    : text(env.PUBLIC_APP_URL, 300) || "https://akaffit-team.fangwl591021.workers.dev/";
  const url = new URL(base);
  url.searchParams.set("tab", "tasks");
  if (taskId) url.searchParams.set("task", taskId);
  return url.toString();
}

async function recordDelivery(db, task, channel, status, idempotencyKey, error = "", externalMessageId = "") {
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO ai_task_deliveries
      (id,task_id,platform_user_id,channel,status,external_message_id,error_message,idempotency_key)
      VALUES (?,?,?,?,?,?,?,?)`)
      .bind(newId("task_delivery"), task.id, task.platform_user_id, channel, status, externalMessageId, text(error, 500), idempotencyKey),
    db.prepare(`INSERT INTO ai_task_events
      (id,task_id,platform_user_id,event_type,note,metadata_json) VALUES (?,?,?,?,?,?)`)
      .bind(newId("task_event"), task.id, task.platform_user_id, `push_${status}`, text(error, 500), JSON.stringify({ channel })),
  ]);
}

async function pushLine(db, env, task, lineToken) {
  const key = `task:${task.id}:line:${task.due_at}`;
  const sent = await db.prepare("SELECT id FROM ai_task_deliveries WHERE idempotency_key=?").bind(key).first();
  if (sent) return { channel:"line", status:"duplicate" };
  const identity = await db.prepare(`SELECT provider_subject FROM external_identities
    WHERE (platform_user_id=? OR platform_user_id IN (
      SELECT alias_user_id FROM member_account_aliases WHERE canonical_user_id=?
    )) AND provider='line_login' AND verification_status='verified'
    ORDER BY last_verified_at DESC LIMIT 1`).bind(task.platform_user_id, task.platform_user_id).first();
  if (!identity || !lineToken) {
    const reason = !identity ? "尚未綁定 LINE Login" : "LINE 推播憑證尚未設定";
    await recordDelivery(db, task, "line", "skipped", key, reason);
    return { channel:"line", status:"skipped", error:reason };
  }
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method:"POST",
    headers:{authorization:`Bearer ${lineToken}`,"content-type":"application/json"},
    body:JSON.stringify({
      to:identity.provider_subject,
      messages:[{type:"text",text:`AI 任務提醒\n${task.title}\n期限：${new Date(task.due_at).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})}\n\n開啟後可選擇：已完成、延期、取消或新增紀錄\n${taskCenterUrl(env, task.id)}`}],
    }),
  });
  if (!response.ok) {
    const reason = `LINE Push HTTP ${response.status}`;
    await recordDelivery(db, task, "line", "failed", key, reason);
    return { channel:"line", status:"failed", error:reason };
  }
  await recordDelivery(db, task, "line", "sent", key);
  return { channel:"line", status:"sent" };
}

async function pushTelegram(db, env, task, channel) {
  const key = `task:${task.id}:telegram:${task.due_at}`;
  const sent = await db.prepare("SELECT id FROM ai_task_deliveries WHERE idempotency_key=?").bind(key).first();
  if (sent) return { channel:"telegram", status:"duplicate" };
  const telegramBotToken = await getTaskTelegramBotToken(
    db,
    task.platform_user_id,
    env.SESSION_SIGNING_SECRET,
    env.TELEGRAM_BOT_TOKEN,
  );
  if (!channel.telegramEnabled || !channel.telegramChatId || !telegramBotToken) {
    const reason = !channel.telegramEnabled || !channel.telegramChatId ? "Telegram 尚未啟用" : "Telegram Bot 憑證尚未設定";
    await recordDelivery(db, task, "telegram", "skipped", key, reason);
    return { channel:"telegram", status:"skipped", error:reason };
  }
  const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      chat_id:channel.telegramChatId,
      text:`AI 任務提醒\n${task.title}\n期限：${new Date(task.due_at).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})}`,
      reply_markup:{inline_keyboard:[[{text:"開啟任務中心",url:taskCenterUrl(env, task.id)}]]},
    }),
  });
  const result = await response.json().catch(()=>({}));
  if (!response.ok || !result.ok) {
    const reason = text(result.description, 300) || `Telegram Push HTTP ${response.status}`;
    await recordDelivery(db, task, "telegram", "failed", key, reason);
    return { channel:"telegram", status:"failed", error:reason };
  }
  await recordDelivery(db, task, "telegram", "sent", key, "", String(result.result?.message_id || ""));
  return { channel:"telegram", status:"sent" };
}

export async function dispatchTaskPush(db, env, taskId, lineToken = "") {
  const task = await db.prepare("SELECT * FROM ai_tasks WHERE id=?").bind(taskId).first();
  if (!task) throw new Error("找不到這筆任務");
  const channel = await getTaskChannels(db, task.platform_user_id);
  const results = [];
  if (channel.lineEnabled) results.push(await pushLine(db, env, task, lineToken));
  if (channel.telegramEnabled) results.push(await pushTelegram(db, env, task, channel));
  return results;
}

export async function dispatchDueTaskPushes(db, env, lineToken = "", now = new Date()) {
  const from = new Date(now.getTime() - 10 * 60_000).toISOString();
  const to = new Date(now.getTime() + 20 * 60_000).toISOString();
  const rows = await db.prepare(`SELECT id FROM ai_tasks
    WHERE status IN ('pending','postponed') AND datetime(due_at)>=datetime(?) AND datetime(due_at)<datetime(?)
    ORDER BY datetime(due_at) LIMIT 50`).bind(from, to).all();
  const results = [];
  for (const row of rows.results || []) results.push({ taskId:row.id, deliveries:await dispatchTaskPush(db, env, row.id, lineToken) });
  return results;
}
