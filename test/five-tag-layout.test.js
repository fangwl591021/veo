import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('five CRM tags use the aiweb vertical accordion layout',()=>{
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
  assert.match(app,/<details class="crm-insight-card crm-insight-\$\{key\}"/);
  assert.match(app,/<summary><span><b>\$\{label\}<\/b>/);
  assert.match(app,/class="crm-insight-detail"/);
  assert.match(css,/\.crm-insights-grid\{display:grid;grid-template-columns:1fr/);
  assert.doesNotMatch(css,/\.crm-insights-grid\{grid-template-columns:repeat\(2/);
  assert.doesNotMatch(css,/\.crm-insights-grid\{[^}]*grid-template-columns:repeat\(5/);
});