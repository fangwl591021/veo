import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMatchingCandidates, isSupportedMatchingQuery, matchContacts, resolveMatchingResults, SMART_MATCH_SCOPE_MESSAGE } from '../src/smart-matching.js';

const contacts = [{
  id: 'c1', displayName: '王小明', companyName: '示範公司', jobTitle: '顧問', department: '業務',
  mobile: '0912345678', email: 'private@example.com', address: '私人地址', serviceDescription: '企業顧問服務',
  aiInsights: { cards: { personality: '重視數據與長期合作', career: '適合策略規劃' } },
}, { id: 'c2', displayName: '陳小美', companyName: '設計工作室', jobTitle: '設計師' }];

test('matching candidates expose business context without private contact fields', () => {
  const candidates = buildMatchingCandidates(contacts);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].name, '王小明');
  assert.match(candidates[0].tags, /重視數據/);
  assert.equal('mobile' in candidates[0], false);
  assert.equal('email' in candidates[0], false);
  assert.equal('address' in candidates[0], false);
});

test('matching results reject invalid and duplicate indexes', () => {
  const results = resolveMatchingResults(contacts, { matches: [
    { index: 1, score: 91.4, reason: '設計能力符合需求' },
    { index: 1, score: 80, reason: '重複資料' },
    { index: 99, score: 100, reason: '不存在' },
  ] });
  assert.deepEqual(results.map((item) => item.card.id), ['c2']);
  assert.equal(results[0].score, 91);
});

test('smart matching uses the MLM service binding without exposing an API key', async () => {
  let requestUrl = '';
  const provider = {
    async fetch(url, init) {
      requestUrl = url;
      const payload = JSON.parse(init.body);
      assert.equal(payload.request.input[0].role, 'user');
      assert.equal(init.headers.authorization, undefined);
      return Response.json({ output_text: JSON.stringify({ matches:[{ index:0, score:88, reason:'企業顧問服務符合目前合作需求' }] }) });
    },
  };
  const result = await matchContacts({ contacts, member:{displayName:'測試會員'}, query:'尋找企業顧問', apiKey:provider });
  assert.equal(requestUrl, 'https://mlm.internal/api/internal/ai/responses');
  assert.equal(result[0].card.id, 'c1');
});


test('smart matching only accepts personality complement or business partner requests', () => {
  assert.equal(isSupportedMatchingQuery('尋找性格互補的合作對象'), true);
  assert.equal(isSupportedMatchingQuery('需要適合拓展市場的事業夥伴'), true);
  assert.equal(isSupportedMatchingQuery('今天天氣如何'), false);
});

test('out-of-scope requests are rejected before calling the AI provider', async () => {
  let called = false;
  const provider = { async fetch() { called = true; return Response.json({}); } };
  await assert.rejects(
    () => matchContacts({ contacts, member:{displayName:'測試會員'}, query:'今天天氣如何', apiKey:provider }),
    new RegExp(SMART_MATCH_SCOPE_MESSAGE),
  );
  assert.equal(called, false);
});
