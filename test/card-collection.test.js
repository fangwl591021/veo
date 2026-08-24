import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INDUSTRY_OPTIONS,
  normaliseIndustryClassification,
  normalizeEmail,
  normalizeNameCompany,
  normalizePhone,
} from '../src/card-collection.js';

test('phone normalization treats Taiwan international and local formats as the same contact', () => {
  assert.equal(normalizePhone('+886 912-345-678'), '0912345678');
  assert.equal(normalizePhone('0912 345 678'), '0912345678');
});

test('email and name-company keys are stable for duplicate detection', () => {
  assert.equal(normalizeEmail(' Mira@Example.COM '), 'mira@example.com');
  assert.equal(normalizeNameCompany('王 小美', '康立（股份）公司'), normalizeNameCompany('王小美', '康立股份公司'));
});

test('industry classification keeps one primary and at most two distinct secondary industries', () => {
  const result=normaliseIndustryClassification({
    primary:'科技資訊',
    secondary:['科技資訊','行銷設計媒體','教育培訓','金融保險'],
    confidence:0.92,
    source:'ai',
  });
  assert.equal(result.primary,'科技資訊');
  assert.deepEqual(result.secondary,['行銷設計媒體','教育培訓']);
  assert.equal(result.source,'ai');
  assert.equal(INDUSTRY_OPTIONS.length,15);
});

test('low-confidence AI classification stays pending but manual classification is locked', () => {
  assert.deepEqual(
    normaliseIndustryClassification({primary:'健康醫療',secondary:['美容美業'],confidence:0.4,source:'ai'}),
    {primary:'待分類',secondary:[],source:'pending',confidence:0.4,classifiedAt:'',manualLocked:false},
  );
  const manual=normaliseIndustryClassification({primary:'健康醫療',secondary:['美容美業'],source:'manual'});
  assert.equal(manual.primary,'健康醫療');
  assert.deepEqual(manual.secondary,['美容美業']);
  assert.equal(manual.manualLocked,true);
});

test('manual secondary selection repairs a pending primary industry', () => {
  const manual=normaliseIndustryClassification({
    primary:'待分類',
    secondary:['科技資訊','行銷設計媒體'],
    source:'manual',
  });
  assert.equal(manual.primary,'科技資訊');
  assert.deepEqual(manual.secondary,['行銷設計媒體']);
  assert.equal(manual.manualLocked,true);
});
