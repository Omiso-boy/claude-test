import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSet, groupByDate, previousSession, exerciseNames,
  toCsv, fromCsv, parseCsvRows, mergeSets, formatWeight, roundWeight,
} from '../app/lib.js';

const mk = (o) => {
  const r = validateSet({ date: '2026-11-14', exercise: 'ベンチプレス', weight: '60', reps: '10', ...o });
  assert.ok(r.ok, r.error);
  return r.value;
};

test('validateSet: 正常値', () => {
  const v = mk({ weight: '62.5', reps: '8', note: ' 調子良い ' });
  assert.equal(v.weight, 62.5);
  assert.equal(v.reps, 8);
  assert.equal(v.note, '調子良い');
  assert.ok(v.id && v.createdAt);
});

test('validateSet: 境界値と異常値', () => {
  assert.ok(validateSet({ date: '2026-11-14', exercise: '懸垂', weight: '0', reps: '1' }).ok, '自重0kgは可');
  assert.ok(validateSet({ date: '2026-11-14', exercise: 'x', weight: '1000', reps: '1000' }).ok);
  const bad = [
    { weight: '' }, { weight: '-1' }, { weight: '1000.5' }, { weight: 'abc' },
    { reps: '' }, { reps: '0' }, { reps: '1.5' }, { reps: '1001' },
    { exercise: '  ' }, { exercise: 'a'.repeat(101) }, { note: 'a'.repeat(101) },
    { date: '2026/11/14' }, { date: '' },
  ];
  for (const b of bad) {
    const r = validateSet({ date: '2026-11-14', exercise: 'x', weight: '10', reps: '5', ...b });
    assert.equal(r.ok, false, JSON.stringify(b));
  }
});

test('roundWeight / formatWeight: 浮動小数点の誤差を出さない', () => {
  assert.equal(roundWeight(0.1 + 0.2), 0.3);
  assert.equal(formatWeight(roundWeight(57.5 + 2.5)), '60');
  assert.equal(formatWeight(42.5), '42.5');
});

test('groupByDate: 日付は新しい順、同日は登録順、種目ごとにまとめる', () => {
  const s = [
    mk({ date: '2026-11-10', createdAt: '2026-11-10T10:00:00Z', exercise: 'スクワット' }),
    mk({ date: '2026-11-14', createdAt: '2026-11-14T10:02:00Z', exercise: 'ベンチプレス', reps: '8' }),
    mk({ date: '2026-11-14', createdAt: '2026-11-14T10:00:00Z', exercise: 'ベンチプレス', reps: '10' }),
    mk({ date: '2026-11-14', createdAt: '2026-11-14T10:05:00Z', exercise: 'ダンベルフライ' }),
  ];
  const g = groupByDate(s);
  assert.deepEqual(g.map((d) => d.date), ['2026-11-14', '2026-11-10']);
  assert.deepEqual(g[0].exercises.map((e) => e.name), ['ベンチプレス', 'ダンベルフライ']);
  assert.deepEqual(g[0].exercises[0].sets.map((x) => x.reps), [10, 8]);
});

test('previousSession: 指定日より前の直近の日だけ返す', () => {
  const s = [
    mk({ date: '2026-11-01', weight: '50' }),
    mk({ date: '2026-11-07', weight: '55', createdAt: '2026-11-07T10:00:00Z' }),
    mk({ date: '2026-11-07', weight: '57.5', createdAt: '2026-11-07T10:05:00Z' }),
    mk({ date: '2026-11-14', weight: '60' }),
    mk({ date: '2026-11-08', exercise: 'スクワット' }),
  ];
  const p = previousSession(s, 'ベンチプレス', '2026-11-14');
  assert.equal(p.date, '2026-11-07');
  assert.deepEqual(p.sets.map((x) => x.weight), [55, 57.5]);
  assert.equal(previousSession(s, 'ベンチプレス', '2026-11-01'), null);
  assert.equal(previousSession(s, 'デッドリフト', '2026-11-14'), null);
});

test('exerciseNames: 最近使った順で重複なし', () => {
  const s = [
    mk({ date: '2026-11-01', exercise: 'A' }),
    mk({ date: '2026-11-10', exercise: 'B' }),
    mk({ date: '2026-11-05', exercise: 'A' }),
  ];
  assert.deepEqual(exerciseNames(s), ['B', 'A']);
});

test('CSV: 書き出し→読み込みで元に戻る（カンマ・改行・引用符・数式文字を含む）', () => {
  const s = [
    mk({ exercise: 'ベンチ,プレス', note: '1行目\n2行目 "強め"' }),
    mk({ exercise: '=HYPERLINK("x")', note: '-5kgで再挑戦', weight: '42.5' }),
    mk({ exercise: '懸垂', weight: '0', note: '' }),
  ];
  const csv = toCsv(s);
  assert.ok(csv.startsWith('﻿'), 'BOM付き');
  assert.ok(csv.includes("'=HYPERLINK"), '数式インジェクション対策');
  const { sets, errors } = fromCsv(csv);
  assert.deepEqual(errors, []);
  const norm = (a) => [...a].sort((x, y) => x.id.localeCompare(y.id));
  assert.deepEqual(norm(sets), norm(s));
});

test('CSV: 不正な行はエラーとして報告し、正常な行は読み込む', () => {
  const csv = 'date,exercise,weight,reps\n2026-11-14,スクワット,100,5\n2026-11-14,スクワット,abc,5\n';
  const { sets, errors } = fromCsv(csv);
  assert.equal(sets.length, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /3行目/);
});

test('CSV: 別形式のファイルは拒否する', () => {
  const { sets, errors } = fromCsv('name,age\nfoo,1\n');
  assert.equal(sets.length, 0);
  assert.match(errors[0], /バックアップではない/);
  assert.equal(fromCsv('').errors.length, 1);
});

test('parseCsvRows: CRLF と末尾改行なし', () => {
  assert.deepEqual(parseCsvRows('a,b\r\n"x,y",z'), [['a', 'b'], ['x,y', 'z']]);
});

test('mergeSets: 同じIDは追加しない', () => {
  const a = mk({});
  const b = mk({ reps: '5' });
  const r = mergeSets([a], [a, b]);
  assert.equal(r.added, 1);
  assert.equal(r.skipped, 1);
  assert.equal(r.sets.length, 2);
});

import { startTimer, remainingMs, isFinished, pauseTimer, resumeTimer, resetTimer, normalizeTimer, formatClock, TIMER_IDLE } from '../app/lib.js';

test('タイマー: 絶対時刻で残りを計算し、0未満にならない', () => {
  const t = startTimer(90, 1000);
  assert.equal(remainingMs(t, 1000), 90000);
  assert.equal(remainingMs(t, 61000), 30000);
  assert.equal(isFinished(t, 90999), false);
  assert.equal(isFinished(t, 91000), true);
  assert.equal(remainingMs(t, 999999), 0);
});

test('タイマー: 一時停止中は減らず、再開後に続きから減る', () => {
  let t = startTimer(60, 0);
  t = pauseTimer(t, 20000);
  assert.equal(t.status, 'paused');
  assert.equal(remainingMs(t, 500000), 40000);
  t = resumeTimer(t, 500000);
  assert.equal(remainingMs(t, 510000), 30000);
  assert.equal(pauseTimer(startTimer(10, 0), 10000).status, 'running', '終了後は一時停止しない');
});

test('タイマー: リセットは秒数設定を保つ', () => {
  const t = resetTimer(startTimer(120, 0));
  assert.equal(t.status, 'idle');
  assert.equal(t.durationSec, 120);
});

test('タイマー: 壊れた保存データは待機状態に戻す', () => {
  assert.deepEqual(normalizeTimer(null), TIMER_IDLE);
  assert.deepEqual(normalizeTimer({ status: 'running', endAt: 'x' }), TIMER_IDLE);
  assert.equal(normalizeTimer({ status: 'idle', durationSec: 60 }).durationSec, 60);
  assert.equal(normalizeTimer({ status: 'idle', durationSec: -5 }).durationSec, 90);
  assert.equal(normalizeTimer({ status: 'paused', pausedRemainingMs: 5000, durationSec: 60 }).status, 'paused');
});

test('formatClock: 切り上げ表示', () => {
  assert.equal(formatClock(90000), '1:30');
  assert.equal(formatClock(200), '0:01');
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(600000), '10:00');
});
