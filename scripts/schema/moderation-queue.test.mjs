import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claimSql,
  listSql,
  operatorLiteral,
  resolveSql,
  summarySql,
} from '../moderation/review-queue.mjs';

test('moderation operator SQL keeps values encoded and exposes only bounded queue metadata', () => {
  const injected = "operator'; select secret from vault; --";
  const literal = operatorLiteral(injected);
  assert.doesNotMatch(literal, /select secret|operator'/);
  assert.match(literal, /^convert_from\(decode\('[0-9a-f]+'/);

  const claim = claimSql('00000000-0000-4000-8000-000000000081', injected);
  const resolve = resolveSql(
    '00000000-0000-4000-8000-000000000081',
    'resolved',
    injected,
    'Reviewed; no violation.'
  );
  assert.doesNotMatch(claim, /select secret|operator'/);
  assert.doesNotMatch(resolve, /Reviewed; no violation|select secret|operator'/);
  assert.match(claim, /status='reviewing'/);
  assert.match(resolve, /resolution_notes=/);
  assert.match(listSql, /limit 100/i);
  assert.doesNotMatch(listSql, /details|target_user_id|reporter_id/i);
  assert.match(summarySql, /urgentUnclaimed/);
  assert.match(summarySql, /15 minutes/);
});
