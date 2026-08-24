import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normaliseCrmProfile } from '../src/card-collection.js';

test('private FORMHD profile keeps only supported bounded fields', () => {
  const profile=normaliseCrmProfile({birthday:'1990-05-06',gender:'invalid',family:'家庭線索',occupation:'工作線索',recreation:'休閒線索',money:'財務線索',health:'健康線索',dream:'夢想線索',unexpected:'不可保存'});
  assert.equal(profile.birthday,'1990-05-06');
  assert.equal(profile.gender,'');
  assert.equal(profile.family,'家庭線索');
  assert.equal('unexpected' in profile,false);
});

test('collection editor exposes the three accordion sections and FORMHD fields', () => {
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
  for(const label of ['業務暖身線索','F・家庭 Family','O・事業 Occupation','R・休閒 Recreation','M・收入／財務 Money','H・健康 Health','D・夢想 Dream'])assert.match(app,new RegExp(label));
  for(const label of ['行業分類','聯絡資料','業務暖身線索'])assert.match(app,new RegExp(`collectionEditSection\\("${label}`));
  assert.match(app,/crmProfile:readCollectionCrmProfile/);
  assert.match(app,/>五大標籤<\/button>/);
  assert.match(css,/\.collection-edit-section/);
  assert.match(css,/\.collection-crm-profile/);
});