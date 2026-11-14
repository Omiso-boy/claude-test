// 線画アイコン（SVG文字列）。中身は固定の文字列だけなので innerHTML で使ってよい。
// 線は currentColor、強調部分は .hl クラス（CSSでアクセント色に塗る）。

const svg = (body, vb = '0 0 48 48') =>
  `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

// 上半身（正面）の輪郭
const TORSO = '<path d="M20 7c0 4-1 6-5 7-5 1-7 4-7 9v17"/><path d="M28 7c0 4 1 6 5 7 5 1 7 4 7 9v17"/><path d="M14 27v15M34 27v15"/>';

export const PART_ICONS = {
  chest: svg(`${TORSO}<ellipse class="hl" cx="19" cy="21" rx="4.5" ry="3.5"/><ellipse class="hl" cx="29" cy="21" rx="4.5" ry="3.5"/>`),
  back: svg(`${TORSO}<path class="hl" d="M16 17h16l-4 20h-8z"/><path d="M24 15v24"/>`),
  shoulders: svg(`${TORSO}<ellipse class="hl" cx="11.5" cy="18.5" rx="3.5" ry="4"/><ellipse class="hl" cx="36.5" cy="18.5" rx="3.5" ry="4"/>`),
  arms: svg(`${TORSO}<rect class="hl" x="8.5" y="24" width="4" height="13" rx="2"/><rect class="hl" x="35.5" y="24" width="4" height="13" rx="2"/>`),
  legs: svg('<path d="M14 6h20M14 6l-1 36M34 6l1 36M24 14v28"/><rect class="hl" x="15" y="10" width="7" height="17" rx="3"/><rect class="hl" x="26" y="10" width="7" height="17" rx="3"/><rect class="hl" x="15.5" y="31" width="5" height="9" rx="2.5"/><rect class="hl" x="27.5" y="31" width="5" height="9" rx="2.5"/>'),
  abs: svg(`${TORSO}<rect class="hl" x="19.5" y="25" width="4" height="4" rx="1"/><rect class="hl" x="24.5" y="25" width="4" height="4" rx="1"/><rect class="hl" x="19.5" y="30" width="4" height="4" rx="1"/><rect class="hl" x="24.5" y="30" width="4" height="4" rx="1"/><rect class="hl" x="19.5" y="35" width="4" height="4" rx="1"/><rect class="hl" x="24.5" y="35" width="4" height="4" rx="1"/>`),
  neck: svg(`${TORSO}<rect class="hl" x="20" y="4" width="8" height="10" rx="3"/>`),
  other: svg('<path d="M10 24h28"/><rect class="hl" x="6" y="16" width="5" height="16" rx="1.5"/><rect class="hl" x="37" y="16" width="5" height="16" rx="1.5"/><path d="M3 24h3M42 24h3"/>'),
};

export const EQUIPMENT_ICONS = {
  barbell: svg('<path d="M4 24h40"/><rect class="hl" x="8" y="14" width="4" height="20" rx="1"/><rect class="hl" x="36" y="14" width="4" height="20" rx="1"/><rect x="13" y="18" width="3" height="12" rx="1"/><rect x="32" y="18" width="3" height="12" rx="1"/>'),
  dumbbell: svg('<path d="M17 24h14"/><rect class="hl" x="10" y="16" width="7" height="16" rx="2"/><rect class="hl" x="31" y="16" width="7" height="16" rx="2"/>'),
  machine: svg('<path d="M10 42V7h28v35M7 42h34"/><path d="M24 7v10"/><rect class="hl" x="19" y="17" width="10" height="5" rx="1"/><rect x="19" y="24" width="10" height="5" rx="1"/><rect x="19" y="31" width="10" height="5" rx="1"/>'),
  bodyweight: svg('<circle class="hl" cx="38" cy="18" r="4"/><path d="M34 22L12 30M12 30l-6 2M26 25l2 9M31 23l3 10"/>'),
};

export const UI_ICONS = {
  logo: svg('<path d="M14 24h20"/><rect x="6" y="15" width="6" height="18" rx="2"/><rect x="36" y="15" width="6" height="18" rx="2"/><path d="M2 24h4M42 24h4"/>'),
  record: svg('<path d="M14 24h20"/><rect x="6" y="15" width="6" height="18" rx="2"/><rect x="36" y="15" width="6" height="18" rx="2"/><path d="M2 24h4M42 24h4"/>'),
  history: svg('<path d="M10 40V26M20 40V14M30 40V22M40 40V8"/>'),
  backup: svg('<path d="M15 36h-3a9 9 0 0 1-1-18 12 12 0 0 1 23-2 9 9 0 0 1 3 20h-4"/><path d="M24 40V24M18 30l6-6 6 6"/>'),
  timer: svg('<circle cx="24" cy="27" r="15"/><path d="M24 27v-7M20 6h8M24 6v6"/>'),
  clipboard: svg('<rect x="10" y="9" width="28" height="33" rx="3"/><path d="M18 9V6h12v3M17 20h14M17 28h14M17 36h8"/>'),
  check: svg('<circle cx="24" cy="24" r="17"/><path d="M16 24l6 6 10-12"/>'),
  hourglass: svg('<path d="M14 6h20M14 42h20M16 6c0 10 16 12 16 18S16 32 16 42M32 6c0 10-16 12-16 18s16 8 16 18"/>'),
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l12 7-12 7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
  reset: svg('<path d="M10 14a16 16 0 1 1-3 10"/><path d="M8 6v9h9"/>'),
  chevronLeft: svg('<path d="M30 10L16 24l14 14"/>'),
  chevronRight: svg('<path d="M18 10l14 14-14 14"/>'),
  calendar: svg('<rect x="7" y="10" width="34" height="31" rx="3"/><path d="M7 19h34M16 6v8M32 6v8"/>'),
};

// ---------- 筋肉の全身図（前・後ろ） ----------
// 左半分だけ描き、左右反転して右半分を作る。part が記録した部位なら .on（アクセント色）になる。
// [部位, SVGの図形] の配列。座標は viewBox 0 0 100 150、体の中心は x=50。
const FRONT_HALF = [
  ['neck', '<path d="M38 27L45 22v6z"/>'],
  ['shoulders', '<path d="M37 29c-7 0-11 5-11 13h7c0-5 2-9 6-11z"/>'],
  ['chest', '<path d="M49 31H40c-5 2-7 8-5 14 5 3 10 3 14 1z"/>'],
  ['arms', '<path d="M26 44c-2 6-2 12 0 17h6c1-5 1-11 0-17z"/>'],
  ['arms', '<path d="M26 63c-3 6-4 13-3 19h5c2-6 3-13 4-19z"/>'],
  ['abs', '<rect x="43.5" y="48" width="5.5" height="6" rx="1.5"/><rect x="43.5" y="55.5" width="5.5" height="6" rx="1.5"/><rect x="43.5" y="63" width="5.5" height="7" rx="1.5"/>'],
  ['abs', '<path d="M42 48h-5c-1 8 0 16 3 22h2z"/>'],
  ['legs', '<path d="M48.5 76H38c-3 12-3 24 0 34h8c2-10 3-22 2.5-34z"/>'],
  ['legs', '<path d="M39 115c-3 8-2 18 0 27h5c2-8 2-18 1-27z"/>'],
];
const BACK_HALF = [
  ['back', '<path d="M49.5 22L38 29l11.5 15z"/>'],
  ['shoulders', '<path d="M37 29c-7 0-11 5-11 13h7c0-5 2-9 6-11z"/>'],
  ['back', '<path d="M48.5 46L37 33c-4 6-3 17 3 27l8.5 2z"/>'],
  ['arms', '<path d="M26 44c-2 6-2 12 0 17h6c1-5 1-11 0-17z"/>'],
  ['arms', '<path d="M26 63c-3 6-4 13-3 19h5c2-6 3-13 4-19z"/>'],
  ['back', '<path d="M49 63h-7v9h7z"/>'],
  ['legs', '<path d="M49 74H39c-3 5-2 10 1 14h9z"/>'],
  ['legs', '<path d="M48.5 90H38c-2 8-1 14 1 20h7c2-7 2.5-13 2.5-20z"/>'],
  ['legs', '<path d="M39 115c-3 8-2 18 0 27h5c2-8 2-18 1-27z"/>'],
];
const HEAD = '<circle class="head" cx="50" cy="11" r="8"/><path class="head" d="M45 19h10v6H45z"/>';

function figure(half, active, label) {
  const shapes = half.map(([part, d]) => `<g class="m${active.has(part) ? ' on' : ''}">${d}</g>`).join('');
  return `<svg viewBox="0 0 100 150" role="img" aria-label="${label}">${HEAD}${shapes}<g transform="translate(100 0) scale(-1 1)">${shapes}</g></svg>`;
}

/** 前・後ろの全身図。activeParts に含まれる部位の筋肉を強調する */
export function muscleFigures(activeParts = []) {
  const active = new Set(activeParts);
  return `<span class="fig">${figure(FRONT_HALF, active, '全身の筋肉（前）')}</span><span class="fig">${figure(BACK_HALF, active, '全身の筋肉（後ろ）')}</span>`;
}
