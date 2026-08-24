import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMemberCrmInsights, memberCrmInsightFromRow } from '../src/member-crm-insights.js';

test('member CRM insights use the existing MLM Worker service binding', async () => {
  const db={prepare(){return {bind(){return {first:async()=>({display_name:'測試會員',phone:'0912345678',birthday:'1990-01-01',company_name:'測試公司',job_title:'顧問'})}}}}};
  const cards={Personality:'重視結構與溝通節奏，適合先提供清楚資料再討論合作方向。',Hobbies:'樂於接觸新資訊與交流，可用實際案例建立共同話題與信任。',Wealth:'決策重視效益與風險平衡，建議提供明確成本及長期價值比較。',Health:'偏好穩定可持續的安排，溝通時宜保留評估時間並避免過度催促。',Career:'適合以具體目標和分工推進合作，先確認責任範圍更容易形成共識。'};
  let requestedUrl='';
  const provider={fetch:async(url,init)=>{requestedUrl=url;const body=JSON.parse(init.body);assert.equal(body.request.text.format.name,'member_crm_five_insights');return Response.json({output_text:JSON.stringify(cards)});}};
  const result=await generateMemberCrmInsights(db,'member-1',provider,'gpt-test');
  assert.equal(requestedUrl,'https://mlm.internal/api/internal/ai/responses');
  assert.equal(result.personality,cards.Personality);
  assert.equal(result.career,cards.Career);
});


test('missing member insight row returns an empty state', () => {
  const result = memberCrmInsightFromRow(null);
  assert.equal(result.status, '');
  assert.deepEqual(result.cards, { personality:'', interests:'', wealth:'', health:'', career:'' });
});
