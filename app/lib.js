// 筋トレ記録：画面に依存しない純粋なロジック（テスト対象）

export const CSV_HEADER = ['date', 'part', 'exercise', 'weight', 'reps', 'note', 'id', 'createdAt'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_WEIGHT = 1000; // kg。入力ミス防止の上限
const MAX_REPS = 1000;
const MAX_TEXT = 100;

/** ローカル時刻での YYYY-MM-DD */
export function toDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 重量は 0.01kg 単位に丸める（浮動小数点の誤差対策） */
export function roundWeight(w) {
  return Math.round(w * 100) / 100;
}

/**
 * 1セット分の記録を検証する。
 * @returns {{ok: true, value: object} | {ok: false, error: string}}
 */
export function validateSet(input) {
  const date = String(input.date ?? '').trim();
  const exercise = String(input.exercise ?? '').trim();
  const note = String(input.note ?? '').trim();
  const weightStr = String(input.weight ?? '').trim();
  const repsStr = String(input.reps ?? '').trim();

  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) return { ok: false, error: '日付が正しくありません' };
  if (!exercise) return { ok: false, error: '種目を入力してください' };
  if (exercise.length > MAX_TEXT) return { ok: false, error: `種目は${MAX_TEXT}文字以内にしてください` };
  if (note.length > MAX_TEXT) return { ok: false, error: `メモは${MAX_TEXT}文字以内にしてください` };

  if (weightStr === '') return { ok: false, error: '重量を入力してください（自重は0）' };
  const weight = Number(weightStr);
  if (!Number.isFinite(weight) || weight < 0 || weight > MAX_WEIGHT) return { ok: false, error: `重量は0〜${MAX_WEIGHT}kgで入力してください` };

  if (repsStr === '') return { ok: false, error: '回数を入力してください' };
  const reps = Number(repsStr);
  if (!Number.isInteger(reps) || reps < 1 || reps > MAX_REPS) return { ok: false, error: `回数は1〜${MAX_REPS}の整数で入力してください` };

  return {
    ok: true,
    value: {
      id: input.id ? String(input.id) : newId(),
      date,
      exercise,
      weight: roundWeight(weight),
      reps,
      note,
      createdAt: input.createdAt ? String(input.createdAt) : new Date().toISOString(),
    },
  };
}

/** 記録を並べる：日付の新しい順、同じ日の中は登録順 */
export function sortSets(sets) {
  return [...sets].sort((a, b) => (a.date === b.date ? a.createdAt.localeCompare(b.createdAt) : b.date.localeCompare(a.date)));
}

/** 日付 → 種目 → セット のまとまりに分ける（日付は新しい順、種目は最初に行った順） */
export function groupByDate(sets) {
  const days = new Map();
  for (const s of sortSets(sets)) {
    if (!days.has(s.date)) days.set(s.date, new Map());
    const ex = days.get(s.date);
    if (!ex.has(s.exercise)) ex.set(s.exercise, []);
    ex.get(s.exercise).push(s);
  }
  return [...days].map(([date, ex]) => ({ date, exercises: [...ex].map(([name, items]) => ({ name, sets: items })) }));
}

/** 指定日より前で、その種目を最後に行った日の記録 */
export function previousSession(sets, exercise, beforeDate) {
  const name = exercise.trim();
  const past = sets.filter((s) => s.exercise === name && s.date < beforeDate);
  if (past.length === 0) return null;
  const lastDate = past.reduce((max, s) => (s.date > max ? s.date : max), '');
  return { date: lastDate, sets: sortSets(past.filter((s) => s.date === lastDate)) };
}

/** 種目の候補：最近使った順 */
export function exerciseNames(sets) {
  const last = new Map();
  for (const s of sets) {
    const key = `${s.date}|${s.createdAt}`;
    if (!last.has(s.exercise) || key > last.get(s.exercise)) last.set(s.exercise, key);
  }
  return [...last].sort((a, b) => b[1].localeCompare(a[1])).map(([name]) => name);
}

export function formatWeight(w) {
  return Number.isInteger(w) ? String(w) : String(roundWeight(w));
}

// ---------- CSV ----------

/** 表計算ソフトで数式として実行されないよう、先頭が = + - @ タブ CR の文字列には ' を付ける */
function guardFormula(s) {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function unguardFormula(s) {
  return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;
}

function csvCell(v) {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(sets, custom = []) {
  const lines = [CSV_HEADER.join(',')];
  for (const s of sortSets(sets)) {
    lines.push(
      [s.date, partOf(s.exercise, custom), guardFormula(s.exercise), formatWeight(s.weight), s.reps, guardFormula(s.note ?? ''), s.id, s.createdAt]
        .map(csvCell)
        .join(','),
    );
  }
  // 先頭のBOMはExcelで文字化けさせないため
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** RFC 4180 形式のCSVを行×列の配列にする */
export function parseCsvRows(text) {
  const src = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/**
 * バックアップCSVを読み込む。不正な行は捨てずにエラーとして返す。
 * parts: 種目名 → 部位（part列がある場合。旧形式のCSVには無い）
 * @returns {{sets: object[], parts: Map<string,string>, errors: string[]}}
 */
export function fromCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return { sets: [], parts: new Map(), errors: ['ファイルが空です'] };
  const header = rows[0].map((h) => h.trim());
  const idx = Object.fromEntries(CSV_HEADER.map((h) => [h, header.indexOf(h)]));
  const missing = ['date', 'exercise', 'weight', 'reps'].filter((h) => idx[h] < 0);
  if (missing.length) return { sets: [], parts: new Map(), errors: [`この記録アプリのバックアップではないようです（列がありません：${missing.join(', ')}）`] };

  const sets = [];
  const parts = new Map();
  const errors = [];
  rows.slice(1).forEach((r, i) => {
    const get = (h) => (idx[h] >= 0 ? r[idx[h]] ?? '' : '');
    const res = validateSet({
      date: get('date'),
      exercise: unguardFormula(get('exercise')),
      weight: get('weight'),
      reps: get('reps'),
      note: unguardFormula(get('note')),
      id: get('id') || undefined,
      createdAt: get('createdAt') || undefined,
    });
    if (res.ok) {
      sets.push(res.value);
      const part = get('part').trim();
      if (isPart(part)) parts.set(res.value.exercise, part);
    } else errors.push(`${i + 2}行目：${res.error}`);
  });
  return { sets, parts, errors };
}

/** 既存の記録に取り込む。同じIDは重複として追加しない */
export function mergeSets(existing, incoming) {
  const ids = new Set(existing.map((s) => s.id));
  const added = [];
  let skipped = 0;
  for (const s of incoming) {
    if (ids.has(s.id)) skipped++;
    else { ids.add(s.id); added.push(s); }
  }
  return { sets: [...existing, ...added], added: added.length, skipped };
}

// ---------- 休憩タイマー ----------
// 残り時間は「終了予定の絶対時刻」から計算する。setInterval の回数に頼らないので、
// 画面ロックやアプリの再起動をはさんでもずれない。
// state: { status: 'idle'|'running'|'paused', endAt: ms|null, pausedRemainingMs: ms|null, durationSec }

export const TIMER_IDLE = Object.freeze({ status: 'idle', endAt: null, pausedRemainingMs: null, durationSec: 90 });

export function startTimer(durationSec, now) {
  return { status: 'running', endAt: now + durationSec * 1000, pausedRemainingMs: null, durationSec };
}

export function remainingMs(state, now) {
  if (state.status === 'running') return Math.max(0, state.endAt - now);
  if (state.status === 'paused') return state.pausedRemainingMs;
  return 0;
}

export function isFinished(state, now) {
  return state.status === 'running' && now >= state.endAt;
}

export function pauseTimer(state, now) {
  if (state.status !== 'running' || isFinished(state, now)) return state;
  return { ...state, status: 'paused', endAt: null, pausedRemainingMs: remainingMs(state, now) };
}

export function resumeTimer(state, now) {
  if (state.status !== 'paused') return state;
  return { ...state, status: 'running', endAt: now + state.pausedRemainingMs, pausedRemainingMs: null };
}

export function resetTimer(state) {
  return { ...TIMER_IDLE, durationSec: state.durationSec };
}

/** 保存データが壊れていても安全な状態に戻す */
export function normalizeTimer(raw) {
  const d = Number(raw?.durationSec);
  const durationSec = Number.isInteger(d) && d > 0 && d <= 3600 ? d : TIMER_IDLE.durationSec;
  if (raw?.status === 'running' && Number.isFinite(raw.endAt)) return { status: 'running', endAt: raw.endAt, pausedRemainingMs: null, durationSec };
  if (raw?.status === 'paused' && Number.isFinite(raw.pausedRemainingMs) && raw.pausedRemainingMs >= 0) {
    return { status: 'paused', endAt: null, pausedRemainingMs: raw.pausedRemainingMs, durationSec };
  }
  return { ...TIMER_IDLE, durationSec };
}

/** ミリ秒 → m:ss（端数は切り上げ。残り0.2秒なら 0:01） */
export function formatClock(ms) {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// ---------- 部位と種目 ----------
export const PARTS = [
  { key: 'chest', label: '胸' },
  { key: 'back', label: '背中' },
  { key: 'shoulders', label: '肩' },
  { key: 'arms', label: '腕' },
  { key: 'legs', label: '脚' },
  { key: 'abs', label: '腹' },
  { key: 'neck', label: '首' },
  { key: 'other', label: 'その他' },
];
const PART_KEYS = new Set(PARTS.map((p) => p.key));

export const PRESET_EXERCISES = {
  chest: ['ベンチプレス', 'インクラインベンチプレス', 'ダンベルプレス', 'ダンベルフライ', 'バタフライ', 'プッシュアップ', 'ディップス', 'ケーブルクロスオーバー'],
  back: ['デッドリフト', 'ラットプルダウン', '懸垂', 'ベントオーバーロウ', 'シーテッドロー', 'ワンハンドロウ', 'バックエクステンション'],
  shoulders: ['ショルダープレス', 'ダンベルショルダープレス', 'サイドレイズ', 'フロントレイズ', 'リアレイズ', 'アップライトロウ', 'シュラッグ'],
  arms: ['バーベルカール', 'ダンベルカール', 'ハンマーカール', 'トライセプスエクステンション', 'トライセプスプッシュダウン', 'ナローベンチプレス'],
  legs: ['スクワット', 'レッグプレス', 'レッグエクステンション', 'レッグカール', 'ランジ', 'ブルガリアンスクワット', 'カーフレイズ'],
  abs: ['クランチ', 'レッグレイズ', 'アブローラー', 'シットアップ'],
  neck: ['ネックフレクション', 'ネックエクステンション', 'ネックサイドフレクション'],
  other: [],
};

export function isPart(key) {
  return PART_KEYS.has(key);
}

/** 種目名 → 部位。追加種目 → 用意済み種目 → その他 の順に探す */
export function partOf(name, custom = []) {
  const c = custom.find((x) => x.name === name);
  if (c) return c.part;
  for (const [part, names] of Object.entries(PRESET_EXERCISES)) if (names.includes(name)) return part;
  return 'other';
}

/** 追加種目の検証。既にある名前は追加しない */
export function validateCustomExercise(nameInput, part, custom = []) {
  const name = String(nameInput ?? '').trim();
  if (!name) return { ok: false, error: '種目名を入力してください' };
  if (name.length > MAX_TEXT) return { ok: false, error: `種目名は${MAX_TEXT}文字以内にしてください` };
  if (!isPart(part)) return { ok: false, error: '部位を選んでください' };
  const exists = custom.some((x) => x.name === name) || Object.values(PRESET_EXERCISES).some((l) => l.includes(name));
  if (exists) return { ok: false, error: 'その種目はすでにあります' };
  return { ok: true, value: { name, part, createdAt: new Date().toISOString() } };
}

/**
 * 部位の種目一覧。記録がある種目を最近使った順に先頭へ、残りは用意済み→追加の順。
 * 記録にだけ存在する種目（部位不明）は「その他」に入る。
 */
export function exercisesForPart(part, custom, sets) {
  const names = [...(PRESET_EXERCISES[part] ?? []), ...custom.filter((c) => c.part === part).map((c) => c.name)];
  for (const s of sets) if (!names.includes(s.exercise) && partOf(s.exercise, custom) === part) names.push(s.exercise);
  const recent = exerciseNames(sets);
  const used = recent.filter((n) => names.includes(n));
  return [...used, ...names.filter((n) => !used.includes(n))];
}

/**
 * 種目画面に並べる未記録の行。前回のセット数ぶん、前回の値を入れて用意する。
 * done: 今日（選択日）に記録済みのセット、prev: 前回の記録
 */
export function planRows(prevSets, done) {
  const prev = prevSets ?? [];
  const count = Math.max(1, prev.length - done.length);
  const rows = [];
  for (let i = 0; i < count; i++) {
    const src = prev[done.length + i] ?? rows[rows.length - 1] ?? done[done.length - 1] ?? prev[prev.length - 1];
    rows.push({ weight: src ? formatWeight(src.weight) : '', reps: src ? String(src.reps) : '', note: '' });
  }
  return rows;
}
