import test from 'node:test';
import assert from 'node:assert/strict';
import {
  memberMatchFromVersions,
  normaliseBusinessPartnerScore,
} from '../src/member-match-ranking.js';

test('business partner score is constrained to a percentage', () => {
  assert.deepEqual(normaliseBusinessPartnerScore({score:108.7,reason:'具有通路與行銷資源互補機會'}),{
    score:100,
    reason:'具有通路與行銷資源互補機會',
  });
});

test('member match metadata defaults to pending and safely reads ready rankings', () => {
  assert.equal(memberMatchFromVersions('{}').status,'pending');
  assert.deepEqual(memberMatchFromVersions(JSON.stringify({_memberMatch:{
    status:'ready',score:86,rank:2,reason:'服務專長互補，工作節奏相近',
    analysisVersion:'business-partner-v1',memberInsightsUpdatedAt:'2026-07-26',updatedAt:'2026-07-26',
  }})),{
    status:'ready',score:86,rank:2,reason:'服務專長互補，工作節奏相近',
    analysisVersion:'business-partner-v1',memberInsightsUpdatedAt:'2026-07-26',updatedAt:'2026-07-26',
  });
});
