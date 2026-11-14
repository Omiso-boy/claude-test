// 筋トレ記録：画面の処理
import {
  validateSet, groupByDate, previousSession, exerciseNames, formatWeight,
  toDateKey, toCsv, fromCsv, mergeSets, roundWeight,
  startTimer, pauseTimer, resumeTimer, resetTimer, remainingMs, isFinished, normalizeTimer, formatClock,
} from './lib.js';

const KEY_SETS = 'kintore.v1.sets';
const KEY_BACKUP = 'kintore.v1.lastBackupAt';
const BACKUP_REMIND_DAYS = 7;
const WEIGHT_STEP = 2.5;

// ---------- 保存 ----------
function loadSets() {
  try {
    const raw = localStorage.getItem(KEY_SETS);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveSets(next) {
  try {
    localStorage.setItem(KEY_SETS, JSON.stringify(next));
    sets = next;
    return true;
  } catch {
    toast('保存できませんでした。空き容量を確認してください', true);
    return false;
  }
}

function getLastBackup() {
  try { return localStorage.getItem(KEY_BACKUP); } catch { return null; }
}
function setLastBackup() {
  try { localStorage.setItem(KEY_BACKUP, new Date().toISOString()); } catch { /* 表示用なので無視 */ }
}

let sets = loadSets();
navigator.storage?.persist?.().catch(() => {});

// ---------- 小物 ----------
const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) n.append(c);
  return n;
}

let toastTimer;
function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function formatDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  const w = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
  const today = toDateKey();
  const label = `${m}/${d}（${w}）`;
  return key === today ? `今日 ${label}` : (y === Number(today.slice(0, 4)) ? label : `${y}/${label}`);
}

function setLine(s, i, onDelete) {
  return el('li', { class: 'set' },
    el('span', { class: 'set-no' }, `${i + 1}`),
    el('span', { class: 'set-main' }, `${formatWeight(s.weight)}kg × ${s.reps}回`),
    s.note ? el('span', { class: 'set-note' }, s.note) : null,
    onDelete ? el('button', { class: 'icon-btn', 'aria-label': '削除', onclick: () => onDelete(s) }, '×') : null,
  );
}

function deleteSet(s) {
  if (!confirm(`${formatDate(s.date)} ${s.exercise}\n${formatWeight(s.weight)}kg × ${s.reps}回\nを削除しますか？`)) return;
  if (saveSets(sets.filter((x) => x.id !== s.id))) { toast('削除しました'); render(); }
}

// ---------- 記録タブ ----------
const form = $('#record-form');
const fDate = $('#f-date');
const fExercise = $('#f-exercise');
const fWeight = $('#f-weight');
const fReps = $('#f-reps');
const fNote = $('#f-note');

fDate.value = toDateKey();

// アプリを開いたまま日付が変わったら「今日」に追従する（過去日を選んでいた場合はそのまま）
let shownToday = toDateKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const today = toDateKey();
  if (today === shownToday) return;
  if (fDate.value === shownToday) fDate.value = today;
  shownToday = today;
  render();
});

function step(input, delta, isInt) {
  const cur = Number(input.value) || 0;
  const next = Math.max(isInt ? 1 : 0, cur + delta);
  input.value = isInt ? String(Math.round(next)) : formatWeight(roundWeight(next));
}
$('#w-minus').onclick = () => step(fWeight, -WEIGHT_STEP, false);
$('#w-plus').onclick = () => step(fWeight, WEIGHT_STEP, false);
$('#r-minus').onclick = () => step(fReps, -1, true);
$('#r-plus').onclick = () => step(fReps, 1, true);

/** 種目を選んだら、前回の最後のセットを入力欄の初期値にする */
function prefillFromHistory() {
  const name = fExercise.value.trim();
  if (!name) return;
  const sameDay = sets.filter((s) => s.exercise === name && s.date === fDate.value);
  const prev = previousSession(sets, name, fDate.value);
  const base = sameDay.length ? sameDay[sameDay.length - 1] : prev?.sets[prev.sets.length - 1];
  if (base) { fWeight.value = formatWeight(base.weight); fReps.value = String(base.reps); }
}

fExercise.addEventListener('change', () => { prefillFromHistory(); renderPrevious(); });
fExercise.addEventListener('input', renderPrevious);
fDate.addEventListener('change', render);

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const res = validateSet({ date: fDate.value, exercise: fExercise.value, weight: fWeight.value, reps: fReps.value, note: fNote.value });
  if (!res.ok) { toast(res.error, true); return; }
  if (saveSets([...sets, res.value])) {
    fNote.value = '';
    toast('記録しました');
    render();
    if (timerAuto) timerStart(timer.durationSec);
  }
});

function renderChips() {
  const box = $('#chips');
  box.replaceChildren(...exerciseNames(sets).slice(0, 8).map((name) =>
    el('button', { type: 'button', class: 'chip', onclick: () => { fExercise.value = name; prefillFromHistory(); renderPrevious(); } }, name)));
  $('#exercise-list').replaceChildren(...exerciseNames(sets).map((name) => el('option', { value: name })));
}

function renderPrevious() {
  const box = $('#previous');
  const name = fExercise.value.trim();
  const prev = name ? previousSession(sets, name, fDate.value) : null;
  if (!prev) { box.hidden = true; return; }
  box.hidden = false;
  box.replaceChildren(
    el('div', { class: 'prev-title' }, `前回 ${formatDate(prev.date)}`),
    el('div', { class: 'prev-sets' }, prev.sets.map((s) => `${formatWeight(s.weight)}×${s.reps}`).join(' / ')),
  );
}

function renderDay() {
  const day = groupByDate(sets.filter((s) => s.date === fDate.value))[0];
  $('#day-title').textContent = `${formatDate(fDate.value)}の記録`;
  const box = $('#day-list');
  if (!day) { box.replaceChildren(el('p', { class: 'empty' }, 'まだ記録がありません')); return; }
  box.replaceChildren(...day.exercises.map((ex) =>
    el('div', { class: 'card' }, el('h3', {}, ex.name), el('ol', { class: 'sets' }, ex.sets.map((s, i) => setLine(s, i, deleteSet))))));
}

function renderReminder() {
  // 一度もバックアップしていない場合は、いちばん古い記録の登録日から数える
  const since = getLastBackup() ?? sets.reduce((min, s) => (s.createdAt < min ? s.createdAt : min), new Date().toISOString());
  const days = (Date.now() - Date.parse(since)) / 86400000;
  $('#reminder').hidden = !(sets.length > 0 && days >= BACKUP_REMIND_DAYS);
}

// ---------- 休憩タイマー ----------
const KEY_TIMER = 'kintore.v1.timer';
const KEY_TIMER_AUTO = 'kintore.v1.timerAuto';

function loadJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* タイマーは保存できなくても動作は続ける */ }
}

let timer = normalizeTimer(loadJson(KEY_TIMER));
let timerAuto = loadJson(KEY_TIMER_AUTO) ?? true;
let timerTick = null;
let finishNotified = isFinished(timer, Date.now()); // 再起動時、終了済みなら音を鳴らさない
let audioCtx = null;

function setTimer(next) {
  timer = next;
  saveJson(KEY_TIMER, timer);
  finishNotified = isFinished(timer, Date.now());
  renderTimer();
}

/** iPhoneでは、ユーザー操作の中で一度鳴らす準備をしないと後から音を出せない */
function unlockAudio() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { audioCtx = null; }
}

function beep() {
  if (!audioCtx) return;
  try {
    const t0 = audioCtx.currentTime;
    [0, 0.25, 0.5].forEach((d) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.3, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + d);
      o.stop(t0 + d + 0.2);
    });
  } catch { /* 音が出せなくても画面表示で知らせる */ }
  navigator.vibrate?.([200, 100, 200]);
}

function timerStart(sec) {
  unlockAudio();
  setTimer(startTimer(sec, Date.now()));
}

function renderTimer() {
  const now = Date.now();
  const finished = isFinished(timer, now);
  const box = $('#timer');
  box.classList.toggle('running', timer.status === 'running' && !finished);
  box.classList.toggle('finished', finished);
  $('#timer-clock').textContent = formatClock(timer.status === 'idle' ? timer.durationSec * 1000 : remainingMs(timer, now));
  $('#timer-status').textContent = finished ? '休憩終了！' : timer.status === 'paused' ? '一時停止中' : timer.status === 'running' ? '休憩中…' : '';
  $('#timer-toggle').textContent = timer.status === 'running' && !finished ? '一時停止' : timer.status === 'paused' ? '再開' : 'スタート';
  document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.sec) === timer.durationSec)));
  $('#timer-auto').checked = timerAuto;

  if (finished && !finishNotified) { finishNotified = true; beep(); }

  const shouldTick = timer.status === 'running' && !finished;
  if (shouldTick && !timerTick) timerTick = setInterval(renderTimer, 250);
  if (!shouldTick && timerTick) { clearInterval(timerTick); timerTick = null; }
}

document.querySelectorAll('.preset').forEach((b) => b.addEventListener('click', () => timerStart(Number(b.dataset.sec))));
$('#timer-toggle').addEventListener('click', () => {
  const now = Date.now();
  unlockAudio();
  if (timer.status === 'running' && !isFinished(timer, now)) setTimer(pauseTimer(timer, now));
  else if (timer.status === 'paused') setTimer(resumeTimer(timer, now));
  else timerStart(timer.durationSec);
});
$('#timer-reset').addEventListener('click', () => setTimer(resetTimer(timer)));
$('#timer-auto').addEventListener('change', (e) => { timerAuto = e.target.checked; saveJson(KEY_TIMER_AUTO, timerAuto); });
form.addEventListener('submit', unlockAudio, { capture: true });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderTimer(); });

// ---------- 履歴タブ ----------
function renderHistory() {
  const box = $('#history-list');
  const days = groupByDate(sets);
  if (days.length === 0) { box.replaceChildren(el('p', { class: 'empty' }, 'まだ記録がありません')); return; }
  box.replaceChildren(...days.map((d) =>
    el('details', { class: 'card' },
      el('summary', {}, el('span', { class: 'h-date' }, formatDate(d.date)), el('span', { class: 'h-sum' }, d.exercises.map((x) => x.name).join('・'))),
      d.exercises.map((ex) => el('div', { class: 'h-ex' }, el('h3', {}, ex.name), el('ol', { class: 'sets' }, ex.sets.map((s, i) => setLine(s, i, deleteSet))))),
    )));
}

// ---------- バックアップタブ ----------
async function exportCsv() {
  if (sets.length === 0) { toast('記録がまだありません', true); return; }
  const name = `kintore-${toDateKey().replace(/-/g, '')}.csv`;
  const file = new File([toCsv(sets)], name, { type: 'text/csv' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
    } else {
      const url = URL.createObjectURL(file);
      el('a', { href: url, download: name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    setLastBackup();
    toast('バックアップしました');
    render();
  } catch (err) {
    if (err?.name !== 'AbortError') toast('バックアップできませんでした', true);
  }
}

async function importCsv(file) {
  let text;
  try { text = await file.text(); } catch { toast('ファイルを読めませんでした', true); return; }
  const { sets: incoming, errors } = fromCsv(text);
  if (incoming.length === 0) { alert(errors.slice(0, 5).join('\n') || '読み込める記録がありませんでした'); return; }
  const preview = mergeSets(sets, incoming);
  let msg = `新しい記録 ${preview.added}件を追加します。`;
  if (preview.skipped) msg += `\n（すでにある ${preview.skipped}件は追加しません）`;
  if (errors.length) msg += `\n\n読み込めない行が${errors.length}件あります：\n${errors.slice(0, 5).join('\n')}`;
  if (preview.added === 0) { alert(msg); return; }
  if (!confirm(msg)) return;
  if (saveSets(preview.sets)) { toast(`${preview.added}件を追加しました`); render(); }
}

$('#export-btn').onclick = exportCsv;
$('#reminder-btn').onclick = exportCsv;
$('#import-input').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (f) importCsv(f);
});

function renderBackup() {
  const last = getLastBackup();
  $('#backup-info').textContent = `記録 ${sets.length}件 ／ 最終バックアップ：${last ? new Date(last).toLocaleString('ja-JP') : 'まだありません'}`;
}

// ---------- タブ ----------
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== btn.dataset.view; });
    window.scrollTo(0, 0);
  });
});

function render() {
  renderChips();
  renderPrevious();
  renderDay();
  renderReminder();
  renderHistory();
  renderBackup();
}

render();
renderTimer();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
