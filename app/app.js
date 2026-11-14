// 筋トレ記録：画面の処理
import {
  validateSet, groupByDate, previousSession, formatWeight,
  toDateKey, toCsv, fromCsv, mergeSets,
  startTimer, pauseTimer, resumeTimer, resetTimer, remainingMs, isFinished, normalizeTimer, formatClock,
  PARTS, partOf, validateCustomExercise, exercisesForPart, planRows,
  equipmentOf, daySummary, exerciseStats,
  weightLabel, addDays, weekStart, monthGrid, setCountsByDate, weeklyLoad, weeklyTrend,
} from './lib.js';
import { PART_ICONS, EQUIPMENT_ICONS, UI_ICONS, muscleFigures } from './icons.js';

const KEY_SETS = 'kintore.v1.sets';
const KEY_CUSTOM = 'kintore.v1.customExercises';
const KEY_BACKUP = 'kintore.v1.lastBackupAt';
const KEY_TIMER = 'kintore.v1.timer';
const KEY_TIMER_AUTO = 'kintore.v1.timerAuto';
const KEY_PART = 'kintore.v1.lastPart';
const BACKUP_REMIND_DAYS = 7;

// ---------- 保存 ----------
function loadJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
/** 保存に失敗したら false（容量不足・プライベートモードなど） */
function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

let sets = Array.isArray(loadJson(KEY_SETS)) ? loadJson(KEY_SETS) : [];
let custom = Array.isArray(loadJson(KEY_CUSTOM)) ? loadJson(KEY_CUSTOM) : [];

function saveSets(next) {
  if (!saveJson(KEY_SETS, next)) { toast('保存できませんでした。空き容量を確認してください', true); return false; }
  sets = next;
  return true;
}
function saveCustom(next) {
  if (!saveJson(KEY_CUSTOM, next)) { toast('保存できませんでした。空き容量を確認してください', true); return false; }
  custom = next;
  return true;
}

navigator.storage?.persist?.().catch(() => {});

// ---------- 小物 ----------
const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) n.append(c);
  return n;
}

let toastTimer;
/** action: { label, run } を渡すと、通知にボタンを付けて少し長めに表示する */
function toast(msg, isError = false, action = null) {
  const t = $('#toast');
  t.replaceChildren(el('span', {}, msg));
  if (action) {
    t.append(el('button', { type: 'button', class: 'toast-action', onclick: () => { hideToast(); action.run(); } }, action.label));
  }
  t.classList.toggle('error', isError);
  t.classList.toggle('has-action', !!action);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 5000 : 2200);
}
function hideToast() {
  clearTimeout(toastTimer);
  $('#toast').classList.remove('show', 'has-action');
}

function formatDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  const w = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
  const today = toDateKey();
  const label = `${m}/${d}（${w}）`;
  return key === today ? `今日 ${label}` : (y === Number(today.slice(0, 4)) ? label : `${y}/${label}`);
}

const partLabel = (key) => PARTS.find((p) => p.key === key)?.label ?? 'その他';

/** 固定のSVG文字列を入れたspan（アイコンの中身にユーザー入力は含まれない） */
function icon(svgText, cls = 'ic') {
  const n = el('span', { class: cls, 'aria-hidden': 'true' });
  n.innerHTML = svgText;
  return n;
}
const exerciseIcon = (name) => EQUIPMENT_ICONS[equipmentOf(name)] ?? PART_ICONS[partOf(name, custom)];

// HTMLに書いた data-icon="名前" の場所にアイコンを入れる
document.querySelectorAll('[data-icon]').forEach((n) => { n.innerHTML = UI_ICONS[n.dataset.icon] ?? ''; });

function setLine(s, i, onDelete) {
  return el('li', { class: 'set' },
    el('span', { class: 'set-no' }, `${i + 1}`),
    el('span', { class: 'set-main' }, `${weightLabel(s.weight)} × ${s.reps}回`),
    s.note ? el('span', { class: 'set-note' }, s.note) : null,
    onDelete ? el('button', { class: 'icon-btn', 'aria-label': '削除', onclick: () => onDelete(s) }, '×') : null,
  );
}

// 確認は出さずにすぐ削除し、通知の「元に戻す」で取り消せるようにする
function deleteSet(s) {
  if (!saveSets(sets.filter((x) => x.id !== s.id))) return;
  render();
  toast(`${weightLabel(s.weight)} × ${s.reps}回 を削除しました`, false, {
    label: '元に戻す',
    run: () => {
      if (sets.some((x) => x.id === s.id)) return;
      if (saveSets([...sets, s])) { toast('元に戻しました'); render(); }
    },
  });
}

// ---------- 記録タブ：日付 ----------
const fDate = $('#f-date');
fDate.value = toDateKey();

// アプリを開いたまま日付が変わったら「今日」に追従する（過去日を選んでいた場合はそのまま）
let shownToday = toDateKey();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  renderTimer();
  const today = toDateKey();
  if (today === shownToday) return;
  if (fDate.value === shownToday) fDate.value = today;
  shownToday = today;
  resetRows();
  render();
});
fDate.addEventListener('change', () => { if (!fDate.value) fDate.value = toDateKey(); resetRows(); render(); });

function shiftDate(days) {
  const [y, m, d] = fDate.value.split('-').map(Number);
  fDate.value = toDateKey(new Date(y, m - 1, d + days));
  resetRows();
  render();
}
$('#date-prev').addEventListener('click', () => shiftDate(-1));
$('#date-next').addEventListener('click', () => shiftDate(1));

function renderDate() {
  const [y, m, d] = fDate.value.split('-').map(Number);
  const w = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
  const thisYear = new Date().getFullYear();
  $('#date-text').textContent = `${y === thisYear ? '' : `${y}/`}${m}/${d}（${w}）`;
  $('#brand-sub').textContent = fDate.value === toDateKey() ? '本日のワークアウト' : `${m}/${d} のワークアウト`;
}

function renderSummary() {
  const sum = daySummary(sets, fDate.value, custom);
  // 筋肉の絵：その日に記録した部位の筋肉をオレンジにする
  $('#summary-body').innerHTML = muscleFigures(sum.parts);
  $('#stat-sets').textContent = String(sum.setCount);
  $('#stat-ex').textContent = String(sum.exerciseCount);
  $('#stat-time').textContent = sum.minutes == null ? '−' : sum.minutes >= 60 ? `${Math.floor(sum.minutes / 60)}時間${sum.minutes % 60}分` : `${sum.minutes}分`;
}

// ---------- 記録タブ：種目を選ぶ ----------
let currentPart = PARTS.some((p) => p.key === loadJson(KEY_PART)) ? loadJson(KEY_PART) : PARTS[0].key;
let currentExercise = null; // 種目画面を開いているときの種目名
let rows = [];              // 種目画面の未記録の行 [{weight, reps, note, showNote}]

function renderPartTabs() {
  $('#part-tabs').replaceChildren(...PARTS.map((p) => el('button', {
    type: 'button', class: 'part-tab', role: 'tab', 'aria-selected': String(p.key === currentPart),
    onclick: () => { currentPart = p.key; saveJson(KEY_PART, currentPart); renderPick(); },
  }, icon(PART_ICONS[p.key], 'part-ic'), el('span', {}, p.label))));
}

function renderExerciseList() {
  const names = exercisesForPart(currentPart, custom, sets);
  const list = $('#exercise-list');
  if (names.length === 0) { list.replaceChildren(el('li', { class: 'empty' }, '下の「＋ 種目を追加」から登録できます')); return; }
  const today = fDate.value;
  list.replaceChildren(...names.map((name) => {
    const st = exerciseStats(sets, name, today);
    const doneToday = st?.date === today;
    const reps = st ? (st.repsMin === st.repsMax ? `${st.repsMin}回` : `${st.repsMin}–${st.repsMax}回`) : '−回';
    return el('li', {},
      el('button', { type: 'button', class: `ex-item${doneToday ? ' done' : ''}`, onclick: () => openExercise(name),
        'aria-label': `${name}${st ? `、${doneToday ? '今日' : '前回'} ${st.sets}セット ${reps} 最大${weightLabel(st.maxWeight)}` : ''}` },
        icon(exerciseIcon(name), 'ex-ic'),
        el('span', { class: 'ex-text' },
          el('span', { class: 'ex-name' }, name),
          el('span', { class: 'ex-chips', 'aria-hidden': 'true' },
            el('span', { class: 'mini' }, st ? `${st.sets}セット` : '−セット'),
            el('span', { class: 'mini' }, reps),
            el('span', { class: 'mini' }, st ? weightLabel(st.maxWeight) : '−kg'))),
        icon(UI_ICONS.chevronRight, 'chev')));
  }));
}

function renderToday() {
  const day = groupByDate(sets.filter((s) => s.date === fDate.value))[0];
  $('#today-box').hidden = !day;
  if (!day) return;
  $('#today-date').textContent = formatDate(fDate.value).replace(/^今日 /, '');
  $('#today-list').replaceChildren(...day.exercises.map((ex) => el('li', {},
    el('button', { type: 'button', class: 'today-item', onclick: () => openExercise(ex.name) },
      icon(exerciseIcon(ex.name), 'ex-ic'),
      el('span', { class: 'ex-name' }, ex.name),
      el('span', { class: 'today-count' }, `${ex.sets.length}セット`),
      icon(UI_ICONS.chevronRight, 'chev')))));
}

function renderAddForm() {
  const sel = $('#add-part');
  if (sel.options.length === 0) sel.replaceChildren(...PARTS.map((p) => el('option', { value: p.key }, p.label)));
  if (!$('#add-exercise').open) sel.value = currentPart;
}

$('#add-exercise').addEventListener('toggle', renderAddForm);
$('#add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const res = validateCustomExercise($('#add-name').value, $('#add-part').value, custom);
  if (!res.ok) { toast(res.error, true); return; }
  if (!saveCustom([...custom, res.value])) return;
  $('#add-name').value = '';
  $('#add-exercise').open = false;
  currentPart = res.value.part;
  saveJson(KEY_PART, currentPart);
  toast(`「${res.value.name}」を追加しました`);
  openExercise(res.value.name);
});

function renderPick() {
  renderSummary();
  renderToday();
  renderPartTabs();
  // 選んでいる部位のタブが見えるようにスクロール
  $('#part-tabs [aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  renderExerciseList();
  renderAddForm();
}

// ---------- 記録タブ：種目ごとの記録 ----------
function doneSets() {
  return groupByDate(sets.filter((s) => s.exercise === currentExercise && s.date === fDate.value))[0]?.exercises[0].sets ?? [];
}

function resetRows() {
  if (!currentExercise) return;
  // 0kg（自重）の行は空欄にして「自重」と表示する
  rows = planRows(previousSession(sets, currentExercise, fDate.value)?.sets, doneSets()).map((r) => ({ ...r, weight: r.weight === '0' ? '' : r.weight, showNote: false }));
}

function openExercise(name) {
  currentExercise = name;
  resetRows();
  $('#pick-screen').hidden = true;
  $('#exercise-screen').hidden = false;
  render();
  window.scrollTo(0, 0);
}

function closeExercise() {
  currentExercise = null;
  rows = [];
  $('#exercise-screen').hidden = true;
  $('#pick-screen').hidden = false;
  render();
  window.scrollTo(0, 0);
}
$('#back-btn').addEventListener('click', closeExercise);

function renderPrevious() {
  const box = $('#previous');
  const prev = previousSession(sets, currentExercise, fDate.value);
  if (!prev) { box.hidden = true; return; }
  box.hidden = false;
  box.replaceChildren(
    el('div', { class: 'prev-title' }, `前回 ${formatDate(prev.date)}`),
    el('div', { class: 'prev-sets' }, prev.sets.map((s) => `${s.weight === 0 ? '自重' : formatWeight(s.weight)}×${s.reps}`).join('  /  ')),
  );
}

function recordRow(i) {
  const r = rows[i];
  // 重量が空欄なら自重（0kg）として記録する
  const weight = String(r.weight ?? '').trim() === '' ? '0' : r.weight;
  const res = validateSet({ date: fDate.value, exercise: currentExercise, weight, reps: r.reps, note: r.note });
  if (!res.ok) { toast(res.error, true); return; }
  if (!saveSets([...sets, res.value])) return;
  rows.splice(i, 1);
  toast(`${weightLabel(res.value.weight)} × ${res.value.reps}回 を記録しました`);
  if (timerAuto) timerStart(timer.durationSec);
  render();
}

function numberInput(value, mode, label, onInput, placeholder = '') {
  return el('input', { type: 'text', inputmode: mode, value, 'aria-label': label, placeholder, class: 'num-in', oninput: (e) => onInput(e.target.value), onfocus: (e) => e.target.select() });
}

function renderSetRows() {
  const done = doneSets();
  const items = done.map((s, i) => el('li', { class: 'set-row done' },
    el('div', { class: 'set-grid' },
      el('span', { class: 'set-no' }, String(i + 1)),
      s.weight === 0 ? el('span', { class: 'val' }, '自重') : el('span', { class: 'val' }, formatWeight(s.weight), el('small', {}, 'kg')),
      el('span', { class: 'val' }, String(s.reps), el('small', {}, '回')),
      el('button', { type: 'button', class: 'del-btn', 'aria-label': `${i + 1}セット目を削除`, onclick: () => deleteSet(s) }, '×')),
    s.note ? el('div', { class: 'row-note' }, s.note) : null));

  rows.forEach((r, i) => {
    const no = done.length + i + 1;
    items.push(el('li', { class: 'set-row' },
      el('div', { class: 'set-grid' },
        el('span', { class: 'set-no' }, String(no)),
        el('span', { class: 'in-wrap' }, numberInput(r.weight, 'decimal', `${no}セット目の重量（空欄は自重）`, (v) => { r.weight = v; }, '自重'), el('small', {}, 'kg')),
        el('span', { class: 'in-wrap' }, numberInput(r.reps, 'numeric', `${no}セット目の回数`, (v) => { r.reps = v; }), el('small', {}, '回')),
        el('button', { type: 'button', class: 'check-btn', 'aria-label': `${no}セット目を記録`, onclick: () => recordRow(i) }, '✓')),
      el('div', { class: 'row-tools' },
        r.showNote
          ? el('input', { type: 'text', class: 'note-in', maxlength: '100', placeholder: 'メモ（任意）', value: r.note, 'aria-label': `${no}セット目のメモ`, oninput: (e) => { r.note = e.target.value; } })
          : el('button', { type: 'button', class: 'link-btn', onclick: () => { r.showNote = true; renderSetRows(); } }, '＋メモ'),
        el('button', { type: 'button', class: 'link-btn', onclick: () => { rows.splice(i, 1); renderSetRows(); } }, 'この行を消す'))));
  });
  $('#set-rows').replaceChildren(...items);
}

$('#add-row').addEventListener('click', () => {
  const last = rows[rows.length - 1] ?? doneSets().slice(-1)[0];
  rows.push({ weight: last && Number(last.weight) !== 0 ? String(last.weight) : '', reps: last ? String(last.reps) : '', note: '', showNote: false });
  renderSetRows();
});

function renderExercise() {
  $('#ex-title').textContent = currentExercise;
  $('#ex-part').textContent = partLabel(partOf(currentExercise, custom));
  $('#ex-icon').innerHTML = exerciseIcon(currentExercise);
  renderPrevious();
  renderSetRows();
}

function renderReminder() {
  // 一度もバックアップしていない場合は、いちばん古い記録の登録日から数える
  const since = loadJson(KEY_BACKUP) ?? sets.reduce((min, s) => (s.createdAt < min ? s.createdAt : min), new Date().toISOString());
  const days = (Date.now() - Date.parse(since)) / 86400000;
  $('#reminder').hidden = !(sets.length > 0 && days >= BACKUP_REMIND_DAYS);
}

// ---------- 休憩タイマー ----------
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
  const running = timer.status === 'running' && !finished;
  const box = $('#timer');
  box.classList.toggle('running', running);
  box.classList.toggle('finished', finished);
  $('#timer-clock').textContent = formatClock(timer.status === 'idle' ? timer.durationSec * 1000 : remainingMs(timer, now));
  $('#timer-status').textContent = finished ? '休憩終了！' : timer.status === 'paused' ? '一時停止中' : running ? '休憩中' : '';
  const toggle = $('#timer-toggle');
  toggle.innerHTML = running ? UI_ICONS.pause : UI_ICONS.play;
  toggle.setAttribute('aria-label', running ? '一時停止' : timer.status === 'paused' ? '再開' : 'スタート');
  document.querySelectorAll('.preset').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.sec) === timer.durationSec)));
  $('#timer-auto').checked = timerAuto;

  if (finished && !finishNotified) { finishNotified = true; beep(); }

  if (running && !timerTick) timerTick = setInterval(renderTimer, 250);
  if (!running && timerTick) { clearInterval(timerTick); timerTick = null; }
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
// ✓ボタンなど、どこかをタップした時点で音を出せるようにしておく
document.addEventListener('pointerdown', unlockAudio, { capture: true });

// ---------- 履歴タブ ----------
const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}
const shortDate = (key) => { const [, m, d] = key.split('-').map(Number); return `${m}/${d}`; };

let hView = 'h-calendar';
let calYear;
let calMonth;
let calSelected = toDateKey();
{ const t = new Date(); calYear = t.getFullYear(); calMonth = t.getMonth() + 1; }
let wkStart = weekStart(toDateKey());
let metric = 'sets';
const trendPick = {}; // 部位 → タップした週（小さなグラフの見出しに出す）

document.querySelectorAll('[data-hview]').forEach((b) => b.addEventListener('click', () => {
  hView = b.dataset.hview;
  renderHistory();
}));

// --- カレンダー ---
function shiftMonth(n) {
  const d = new Date(calYear, calMonth - 1 + n, 1);
  calYear = d.getFullYear();
  calMonth = d.getMonth() + 1;
  renderCalendar();
}
$('#cal-prev').addEventListener('click', () => shiftMonth(-1));
$('#cal-next').addEventListener('click', () => shiftMonth(1));

function renderCalendar() {
  $('#cal-title').textContent = `${calYear}年${calMonth}月`;
  const counts = setCountsByDate(sets);
  const today = toDateKey();
  const cells = monthGrid(calYear, calMonth).flat().map((key) => {
    if (!key) return el('span', { class: 'cal-day blank', 'aria-hidden': 'true' });
    const n = counts.get(key) ?? 0;
    const day = Number(key.slice(8));
    // セット数で濃さを3段階に（1〜9 / 10〜19 / 20以上）
    const level = n === 0 ? 0 : n < 10 ? 1 : n < 20 ? 2 : 3;
    return el('button', {
      type: 'button',
      class: `cal-day lv${level}${key === today ? ' today' : ''}${key === calSelected ? ' selected' : ''}`,
      'aria-label': `${calMonth}月${day}日${n ? ` ${n}セット` : ' 記録なし'}`,
      'aria-pressed': String(key === calSelected),
      onclick: () => { calSelected = key; renderCalendar(); },
    }, el('span', { class: 'cal-num' }, String(day)), el('span', { class: 'cal-cnt' }, n ? String(n) : ''));
  });
  $('#cal-grid').replaceChildren(...cells);
  renderDayDetail();
}

function renderDayDetail() {
  const box = $('#day-detail');
  const day = groupByDate(sets.filter((s) => s.date === calSelected))[0];
  const title = el('div', { class: 'card-title' }, el('span', {}, formatDate(calSelected)));
  if (!day) {
    box.replaceChildren(el('section', { class: 'card' }, title,
      el('p', { class: 'empty' }, 'この日の記録はありません'),
      el('button', { type: 'button', class: 'btn', onclick: () => goRecord(calSelected) }, 'この日の記録をつける')));
    return;
  }
  const parts = [...new Set(day.exercises.map((ex) => partLabel(partOf(ex.name, custom))))];
  title.append(el('span', { class: 'card-title-sub' }, `${parts.join('・')} ／ ${day.exercises.reduce((n, ex) => n + ex.sets.length, 0)}セット`));
  box.replaceChildren(el('section', { class: 'card' }, title,
    day.exercises.map((ex) => el('div', { class: 'h-ex' },
      el('h3', {}, ex.name, el('span', { class: 'h-part' }, partLabel(partOf(ex.name, custom)))),
      el('ol', { class: 'sets' }, ex.sets.map((s, i) => setLine(s, i, deleteSet))))),
    el('button', { type: 'button', class: 'btn ghost', onclick: () => goRecord(calSelected) }, 'この日の記録を追加・編集')));
}

/** 記録タブを指定日で開く */
function goRecord(date) {
  fDate.value = date;
  currentExercise = null;
  rows = [];
  $('#exercise-screen').hidden = true;
  $('#pick-screen').hidden = false;
  document.querySelector('.tab[data-view="view-record"]').click();
  render();
}

// --- 週間負荷 ---
$('#wk-prev').addEventListener('click', () => { wkStart = addDays(wkStart, -7); renderLoad(); });
$('#wk-next').addEventListener('click', () => { wkStart = addDays(wkStart, 7); renderLoad(); });
document.querySelectorAll('[data-metric]').forEach((b) => b.addEventListener('click', () => { metric = b.dataset.metric; renderLoad(); }));

const formatMetric = (v) => (metric === 'sets' ? `${v}セット` : `${Math.round(v).toLocaleString('ja-JP')}kg`);

function renderLoad() {
  const thisWeek = weekStart(toDateKey());
  $('#wk-title').textContent = `${shortDate(wkStart)}〜${shortDate(addDays(wkStart, 6))}${wkStart === thisWeek ? '（今週）' : ''}`;
  $('#wk-next').disabled = wkStart >= thisWeek;
  document.querySelectorAll('[data-metric]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.metric === metric)));
  $('#load-title').textContent = metric === 'sets' ? '部位別のセット数' : '部位別のボリューム（重量×回数）';
  $('#load-note').textContent = metric === 'volume' ? '自重の種目（重量0kg）はボリュームに含まれません。セット数で比べてください。' : '';

  const cur = weeklyLoad(sets, custom, wkStart);
  const prev = weeklyLoad(sets, custom, addDays(wkStart, -7));
  const max = Math.max(...PARTS.map((p) => cur[p.key][metric]), 0);
  const bars = $('#load-bars');
  if (max === 0) {
    bars.replaceChildren(el('p', { class: 'empty' }, 'この週の記録はありません'));
  } else {
    bars.replaceChildren(...PARTS.map((p) => {
      const v = cur[p.key][metric];
      const pv = prev[p.key][metric];
      return el('div', { class: 'hbar', role: 'img', 'aria-label': `${p.label} ${formatMetric(v)}（先週 ${formatMetric(pv)}）` },
        el('span', { class: 'hbar-label' }, p.label),
        el('span', { class: 'hbar-track' },
          v > 0 ? el('span', { class: 'hbar-fill', style: `width:${Math.max(2, (v / max) * 100)}%` }) : null,
          el('span', { class: 'hbar-val' }, v > 0 ? formatMetric(v) : '−')),
        el('span', { class: 'hbar-prev' }, `先週 ${pv > 0 ? formatMetric(pv) : '−'}`));
    }));
  }
  renderTrend();
}

function renderTrend() {
  const N = 8;
  const trend = weeklyTrend(sets, custom, wkStart, N);
  $('#trend-title').textContent = `部位ごとの推移（直近${N}週・${metric === 'sets' ? 'セット数' : 'ボリューム'}）`;
  $('.trend-help').textContent = '棒をタップすると、その週の値が出ます。記録のない部位は省略しています。';
  // 部位どうしを比べられるよう、全グラフで同じ目盛りを使う
  const max = Math.max(1, ...trend.flatMap((t) => PARTS.map((p) => t.load[p.key][metric])));
  const W = 160; const H = 56; const slot = W / N; const barW = Math.min(14, slot - 4);
  // 8週間ずっと記録のない部位は省略する
  const shown = PARTS.filter((p) => trend.some((t) => t.load[p.key][metric] > 0 || t.load[p.key].sets > 0));
  if (shown.length === 0) { $('#trend-grid').replaceChildren(el('p', { class: 'empty' }, 'この期間の記録はありません')); return; }
  $('#trend-grid').replaceChildren(...shown.map((p) => {
    const picked = trendPick[p.key] ?? N - 1;
    const pv = trend[picked];
    const head = el('div', { class: 'trend-head' },
      el('span', { class: 'trend-part' }, p.label),
      el('span', { class: 'trend-val' }, `${shortDate(pv.week)}週 ${formatMetric(pv.load[p.key][metric])}`));
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H + 2}`, class: 'trend-svg', role: 'img',
      'aria-label': `${p.label}：${trend.map((t) => `${shortDate(t.week)}週 ${formatMetric(t.load[p.key][metric])}`).join('、')}` });
    svg.append(svgEl('line', { x1: 0, x2: W, y1: H + 1, y2: H + 1, class: 'trend-base' }));
    trend.forEach((t, i) => {
      const v = t.load[p.key][metric];
      const h = v > 0 ? Math.max(3, (v / max) * (H - 2)) : 0;
      const x = i * slot + (slot - barW) / 2;
      if (h > 0) {
        const r = Math.min(4, h, barW / 2); // 上だけ角丸（4px）、下は直角
        const y = H + 1 - h;
        svg.append(svgEl('path', {
          d: `M${x},${H + 1}V${y + r}Q${x},${y} ${x + r},${y}H${x + barW - r}Q${x + barW},${y} ${x + barW},${y + r}V${H + 1}Z`,
          class: `trend-bar${i === N - 1 ? ' cur' : ''}${i === picked && trendPick[p.key] != null ? ' picked' : ''}`,
        }));
      }
      // タップしやすいよう、棒より大きい透明の当たり判定
      const hit = svgEl('rect', { x: i * slot, y: 0, width: slot, height: H + 2, class: 'trend-hit' });
      hit.addEventListener('click', () => { trendPick[p.key] = i; renderTrend(); });
      svg.append(hit);
    });
    return el('div', { class: 'trend-card' }, head, svg);
  }));
}

function renderHistory() {
  document.querySelectorAll('[data-hview]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.hview === hView)));
  document.querySelectorAll('.hview').forEach((v) => { v.hidden = v.id !== hView; });
  if (hView === 'h-calendar') renderCalendar(); else renderLoad();
}

// ---------- バックアップタブ ----------
async function exportCsv() {
  if (sets.length === 0) { toast('記録がまだありません', true); return; }
  const name = `kintore-${toDateKey().replace(/-/g, '')}.csv`;
  const file = new File([toCsv(sets, custom)], name, { type: 'text/csv' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
    } else {
      const url = URL.createObjectURL(file);
      el('a', { href: url, download: name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    saveJson(KEY_BACKUP, new Date().toISOString());
    toast('バックアップしました');
    render();
  } catch (err) {
    if (err?.name !== 'AbortError') toast('バックアップできませんでした', true);
  }
}

async function importCsv(file) {
  let text;
  try { text = await file.text(); } catch { toast('ファイルを読めませんでした', true); return; }
  const { sets: incoming, parts, errors } = fromCsv(text);
  if (incoming.length === 0) { alert(errors.slice(0, 5).join('\n') || '読み込める記録がありませんでした'); return; }
  const preview = mergeSets(sets, incoming);
  let msg = `新しい記録 ${preview.added}件を追加します。`;
  if (preview.skipped) msg += `\n（すでにある ${preview.skipped}件は追加しません）`;
  if (errors.length) msg += `\n\n読み込めない行が${errors.length}件あります：\n${errors.slice(0, 5).join('\n')}`;
  if (preview.added === 0) { alert(msg); return; }
  if (!confirm(msg)) return;
  // バックアップにある部位情報から、未登録の種目を追加種目として登録する
  const newCustom = [...custom];
  for (const [name, part] of parts) {
    if (part !== 'other' && partOf(name, newCustom) === 'other' && validateCustomExercise(name, part, newCustom).ok) {
      newCustom.push({ name, part, createdAt: new Date().toISOString() });
    }
  }
  if (saveSets(preview.sets) && (newCustom.length === custom.length || saveCustom(newCustom))) {
    toast(`${preview.added}件を追加しました`);
    resetRows();
    render();
  }
}

$('#export-btn').onclick = exportCsv;
$('#reminder-btn').onclick = exportCsv;
$('#import-input').addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (f) importCsv(f);
});

function renderBackup() {
  const last = loadJson(KEY_BACKUP);
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
  renderDate();
  renderSummary();
  $('#summary').hidden = !!currentExercise; // 種目画面ではセット入力を優先して表示
  renderReminder();
  if (currentExercise) renderExercise(); else renderPick();
  renderHistory();
  renderBackup();
}

render();
renderTimer();

// ---------- 初回の案内 ----------
const KEY_GUIDE = 'kintore.v1.guideDone';
const KEY_TIP = 'kintore.v1.installTipClosed';
/** ホーム画面から開いているか（iPhone は navigator.standalone、その他は display-mode） */
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

let guidePages = [];
let guideIndex = 0;

function openGuide(startPage = 'welcome') {
  // ホーム画面から開いている人には「ホーム画面に追加」のページは出さない
  guidePages = ['welcome', ...(isStandalone() ? [] : ['install']), 'data'];
  guideIndex = Math.max(0, guidePages.indexOf(startPage));
  $('#guide-hero').innerHTML = muscleFigures(['chest', 'arms', 'legs']);
  $('#guide').hidden = false;
  document.body.classList.add('no-scroll');
  renderGuide();
}

function closeGuide() {
  $('#guide').hidden = true;
  document.body.classList.remove('no-scroll');
  saveJson(KEY_GUIDE, true);
  renderInstallTip();
}

function renderGuide() {
  const page = guidePages[guideIndex];
  document.querySelectorAll('.guide-page').forEach((p) => { p.hidden = p.dataset.page !== page; });
  $('#guide-dots').replaceChildren(...guidePages.map((_, i) => el('span', { class: `dot${i === guideIndex ? ' on' : ''}` })));
  $('#guide-back').hidden = guideIndex === 0;
  $('#guide-next').textContent = guideIndex === guidePages.length - 1 ? 'はじめる' : '次へ';
  $('#guide .guide-box').scrollTop = 0;
}

$('#guide-next').addEventListener('click', () => { if (guideIndex < guidePages.length - 1) { guideIndex++; renderGuide(); } else closeGuide(); });
$('#guide-back').addEventListener('click', () => { if (guideIndex > 0) { guideIndex--; renderGuide(); } });
$('#open-guide').addEventListener('click', () => openGuide());

function renderInstallTip() {
  $('#install-tip').hidden = isStandalone() || !loadJson(KEY_GUIDE) || !!loadJson(KEY_TIP);
}
$('#install-how').addEventListener('click', () => openGuide('install'));
$('#install-close').addEventListener('click', () => { saveJson(KEY_TIP, true); renderInstallTip(); });

if (!loadJson(KEY_GUIDE)) openGuide(); else renderInstallTip();

// 起動できたことを index.html の見張り役に知らせる
window.__kintoreReady = true;
try { sessionStorage.removeItem('kintore.recovering'); } catch { /* 無視 */ }

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
