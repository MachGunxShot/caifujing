import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseImageMatch, parseQueueBackup } from '../src/utils/importValidation';
import { createQueueWriter, QUEUE_STORAGE_KEY } from '../src/utils/queuePersistence';
import { generateActuarialRuleReport, compareEarlyVsLateConfidence } from '../src/utils/actuaryEngine';
import { PRESET_CASES } from '../src/utils/presetCases';
import type { BatchMatchItem } from '../src/types/fortuneActuary';

const data = PRESET_CASES[0].data;
const report = generateActuarialRuleReport(data);
const entry: BatchMatchItem = { id: 'game-1', timestamp: 1, status: 'done', data, report };

test('the actual screenshot prompt example and older flat output both produce a usable report', () => {
  const code = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const section = code.split('第一步：先输出')[1].split('第二步：')[0];
  const example = JSON.parse(section.match(/^\{[\s\S]+?^\}/m)![0]);
  const canonical = parseImageMatch(example);
  assert.ok(generateActuarialRuleReport(canonical).decision);
  const { matchInfo, ...markets } = example;
  assert.deepEqual(parseImageMatch({ ...matchInfo, ...markets }).matchInfo, matchInfo);
});

test('unrecognized screenshots and incomplete markets cannot produce a replacement match', () => {
  assert.throws(() => parseImageMatch(null));
  assert.throws(() => parseImageMatch({ ...data, matchInfo: { ...data.matchInfo, homeTeam: ' ' } }), /homeTeam/);
  assert.throws(() => parseImageMatch({ ...data, euroOdds: {} }), /earlyWin/);
  const cleaned = parseImageMatch({
    ...data,
    unexpectedTopLevel: 'strip-me',
    matchInfo: { ...data.matchInfo, unexpectedNested: 123 },
  });
  assert.equal('unexpectedTopLevel' in cleaned, false);
  assert.equal('unexpectedNested' in cleaned.matchInfo, false);
});

test('queue exports round-trip with their original locked report and early snapshot', () => {
  const item = { ...entry, isLocked: true, earlyReportSnapshot: report, earlyDataSnapshot: data,
    confidenceShift: compareEarlyVsLateConfidence(data, report, report, data) };
  const raw = JSON.stringify([item]);
  assert.deepEqual(parseQueueBackup(raw), JSON.parse(raw));
});

test('one invalid item, malformed snapshot, or duplicate ID rejects the entire import', () => {
  assert.throws(() => parseQueueBackup(JSON.stringify([entry, {}])), /第 2 场.id/);
  assert.throws(() => parseQueueBackup(JSON.stringify([{ ...entry, earlyDataSnapshot: {} }])), /earlyDataSnapshot.matchInfo/);
  assert.throws(() => parseQueueBackup(JSON.stringify([{ ...entry, report: {} }])), /report.firstImpression/);
  assert.throws(() => parseQueueBackup(JSON.stringify([entry, entry])), /id 重复/);
});

test('a clean old tab and a dirty stale tab both preserve a newer saved queue', () => {
  const first: BatchMatchItem[] = [];
  const old = createQueueWriter(first, null);
  const current = createQueueWriter(first, null);
  const values = new Map<string, string>();
  const storage = { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => {values.set(k, v);} };
  const edited = [entry];
  current.save(storage, edited);
  assert.equal(old.save(storage, first), null);
  assert.throws(() => old.save(storage, [{ ...entry, id: 'other' }]), /最新版本/);
  assert.equal(values.get(QUEUE_STORAGE_KEY), JSON.stringify(edited));
  assert.equal(current.save(storage, edited), null);
  current.save(storage, []);
  assert.equal(values.get(QUEUE_STORAGE_KEY), '[]');
});
