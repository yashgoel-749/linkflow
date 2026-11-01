import { it } from 'node:test';
import assert from 'node:assert/strict';
import { csv, csvCell } from '../src/csv.js';

it('CSV escapes formulas, control-prefix formulas, quotes, commas and multiline cells', () => {
  for (const text of [
    '=1+1',
    '+1',
    '-1',
    '@SUM(1)',
    '  =1',
    '\t=1',
    '\r=1',
    '\n=1',
    '\u0000 =1',
    '\u001f@SUM(1)',
    '\tplain',
  ])
    assert.ok(csvCell(text).startsWith('"\''));
  assert.equal(csvCell('a,"b"\nc'), '"a,""b""\nc"');
  assert.equal(csv([['a', 2, null]]), '"a","2",""\r\n');
});
