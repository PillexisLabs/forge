import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAnalyticsRange, resolveCampaignScope } from '../src/lib/analytics-data';

const campaigns = [
  { id: '1001', name: 'Launch campaign' },
  { id: '1002', name: 'Retargeting campaign' },
];

test('All campaigns is the default scope', () => {
  const scope = resolveCampaignScope(campaigns);

  assert.equal(scope.selectedCampaign, undefined);
  assert.deepEqual(scope.metaCampaignIds, ['1001', '1002']);
  assert.deepEqual(scope.gaCampaignKeys, [
    '1001', 'Launch campaign', '1002', 'Retargeting campaign',
  ]);
});

test('a campaign selection scopes both provider identities', () => {
  const scope = resolveCampaignScope(campaigns, '1002');

  assert.equal(scope.selectedCampaign?.name, 'Retargeting campaign');
  assert.deepEqual(scope.metaCampaignIds, ['1002']);
  assert.deepEqual(scope.gaCampaignKeys, ['1002', 'Retargeting campaign']);
});

test('an unknown campaign is rejected', () => {
  assert.throws(() => resolveCampaignScope(campaigns, 'missing'), /campaign is not available/);
});

test('date ranges reject reversed dates', () => {
  assert.throws(
    () => resolveAnalyticsRange('2026-07-20', '2026-07-19'),
    /from must be on or before to/,
  );
});
