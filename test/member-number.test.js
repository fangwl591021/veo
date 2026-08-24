import test from 'node:test';
import assert from 'node:assert/strict';

import { formatMemberNumber } from '../src/member-repository.js';

test('system member numbers never contain digit 4', () => {
  for (let sequence = 1; sequence <= 100000; sequence += 1) {
    const memberNumber = formatMemberNumber(sequence);
    assert.match(memberNumber, /^MB-[0-356789]{8}$/);
    assert.equal(memberNumber.includes('4'), false);
  }
});

test('system member number sequence skips every value containing digit 4', () => {
  assert.equal(formatMemberNumber(1), 'MB-00000001');
  assert.equal(formatMemberNumber(3), 'MB-00000003');
  assert.equal(formatMemberNumber(4), 'MB-00000005');
  assert.equal(formatMemberNumber(8), 'MB-00000009');
  assert.equal(formatMemberNumber(9), 'MB-00000010');
  assert.equal(formatMemberNumber(39), 'MB-00000053');
});
