import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, esc } from '../public/js/util.js';

test('normalize bỏ dấu tiếng Việt, cả chữ đ', () => {
  assert.equal(normalize('Đỗ Trung Dũng'), 'do trung dung');
  assert.ok(normalize('Nguyễn Thị Hải Hà').includes('hai ha'));
});

test('esc chặn HTML', () => {
  assert.equal(esc('<b>"x"&</b>'), '&lt;b&gt;&quot;x&quot;&amp;&lt;/b&gt;');
});
