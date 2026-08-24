const text = (value, max = 1000) => String(value || '').trim().slice(0, max);

export const SMART_MATCH_SCOPE_MESSAGE = '智能配對僅提供性格互補與事業夥伴篩選，其他問題不在此功能的回應範圍。';

export function isSupportedMatchingQuery(value = '') {
  const query = text(value, 300);
  if (query.length < 2) return false;
  const personalityIntent = /(性格|個性|人格|互補|合拍|契合|默契|相處|溝通風格|工作風格)/;
  const businessIntent = /(事業|商務|商業|合作|合夥|夥伴|伙伴|人脈|創業|團隊|引薦|供應商|廠商|通路|經銷|顧問|教練|行銷|業務|設計|法律|律師|會計|攝影|影片|工程|技術|人才|專業服務)/;
  return personalityIntent.test(query) || businessIntent.test(query);
}

const MATCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['matches'],
  properties: {
    matches: {
      type: 'array',
      minItems: 0,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'score', 'reason'],
        properties: {
          index: { type: 'integer', minimum: 0, maximum: 49 },
          score: { type: 'integer', minimum: 0, maximum: 100 },
          reason: { type: 'string', minLength: 8, maxLength: 80 },
        },
      },
    },
  },
};

export function buildMatchingCandidates(contacts = []) {
  return contacts.slice(0, 50).map((card, index) => {
    const insightCards = card?.aiInsights?.cards && typeof card.aiInsights.cards === 'object'
      ? card.aiInsights.cards
      : {};
    return {
      index,
      name: text(card.displayName, 120),
      company: text(card.companyName, 180),
      title: text(card.jobTitle, 120),
      department: text(card.department, 120),
      service: text(card.serviceDescription, 500),
      tags: Object.values(insightCards).map((value) => text(value, 220)).filter(Boolean).join('｜').slice(0, 900),
    };
  });
}

function outputText(result = {}) {
  return result.output_text || result.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text || '';
}

async function callAiResponses(provider, body) {
  if (!provider) throw new Error('MLM AI 服務尚未連線');
  const internal = typeof provider !== 'string';
  const response = internal
    ? await provider.fetch('https://mlm.internal/api/internal/ai/responses', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: body }),
    })
    : await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { authorization: `Bearer ${provider}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message || result?.error || 'MLM AI 服務暫時無法使用');
  return result;
}

export function resolveMatchingResults(contacts = [], parsed = {}) {
  const seen = new Set();
  return (Array.isArray(parsed.matches) ? parsed.matches : []).flatMap((match) => {
    const index = Number(match?.index);
    const card = Number.isInteger(index) ? contacts[index] : null;
    if (!card || seen.has(card.id)) return [];
    seen.add(card.id);
    return [{ card, score: Math.max(0, Math.min(100, Math.round(Number(match.score) || 0))), reason: text(match.reason, 120) }];
  }).slice(0, 3);
}

export async function matchContacts({ contacts = [], member = {}, query = '', apiKey = '', model = '' } = {}) {
  const request = text(query, 300);
  if (request.length < 2) throw new Error('請輸入至少 2 個字的配對需求');
  if (!isSupportedMatchingQuery(request)) throw new Error(SMART_MATCH_SCOPE_MESSAGE);
  if (!apiKey) throw new Error('MLM AI 服務尚未連線');
  if (!contacts.length) throw new Error('名片收藏尚無資料，請先拍照或上傳名片');

  const candidates = buildMatchingCandidates(contacts);
  const result = await callAiResponses(apiKey, {
      model: model || 'gpt-5.6-terra',
      reasoning: { effort: 'low' },
      max_output_tokens: 900,
      input: [{
        role: 'user',
        content: `你是繁體中文智能配對顧問。本功能只能處理性格互補與事業夥伴篩選，請從候選名片中找出最符合需求的 0 至 3 人。\n\n尋求者：${text(member.displayName, 120) || '會員'}\n配對需求：${request}\n候選名片：${JSON.stringify(candidates)}\n\n規則：\n1. 只能選候選清單內的人，index 必須完全對應候選 index。\n2. 只依候選人的公司、職稱、部門、服務內容與五大標籤判斷。\n3. 不得依健康、疾病、財務、宗教或其他敏感內容評分。\n4. score 為 0 至 100 的整數；reason 以 15 至 40 個繁體中文字說明具體合作理由。\n5. 資料不足時保守評分，不得捏造經歷、客戶、證照、財力或健康狀況。\n6. 僅能評估性格互補或事業夥伴適配，不回答天氣、新聞、運勢、生活問答或其他無關問題。\n7. 若沒有合理人選，回傳空陣列。只回傳指定 JSON。`,
      }],
      text: { format: { type: 'json_schema', name: 'smart_contact_matches', strict: true, schema: MATCH_SCHEMA } },
  });
  const raw = outputText(result);
  if (!raw) throw new Error('AI 未回傳配對結果');
  return resolveMatchingResults(contacts, JSON.parse(raw));
}
