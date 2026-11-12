import { POLYOMINOES, rotate, sameShape } from '../../shared/shapes';
import { TYPING_PHRASES } from '../../data/typing';
import type { MathDifficulty } from '../../shared/types';
import { pick, rand, shuffle } from '../util';
import { makeStreamGame, type StreamQuestion } from './streamGame';

// ───────────────────────── 사칙연산 ─────────────────────────
type Op = '+' | '−' | '×' | '÷';

export function genMath(diff: MathDifficulty): { text: string; answer: number } {
  const op = pick<Op>(['+', '−', '×', '÷']);
  let a: number, b: number, ans: number;
  const R = {
    easy: { add: [1, 20], mul: [2, 5], mul2: [2, 9], div: [2, 5], divq: [2, 9] },
    normal: { add: [10, 99], mul: [2, 9], mul2: [3, 12], div: [2, 9], divq: [2, 12] },
    hard: { add: [100, 999], mul: [6, 19], mul2: [3, 19], div: [3, 19], divq: [3, 19] },
  }[diff];
  switch (op) {
    case '+':
      a = rand(R.add[0], R.add[1]);
      b = rand(R.add[0], R.add[1]);
      ans = a + b;
      break;
    case '−':
      a = rand(R.add[0], R.add[1]);
      b = rand(R.add[0], R.add[1]);
      if (b > a) [a, b] = [b, a];
      ans = a - b;
      break;
    case '×':
      a = rand(R.mul[0], R.mul[1]);
      b = rand(R.mul2[0], R.mul2[1]);
      ans = a * b;
      break;
    default: {
      // 나눗셈: 몫을 먼저 정해 항상 정수 답이 되도록 생성
      b = rand(R.div[0], R.div[1]);
      ans = rand(R.divq[0], R.divq[1]);
      a = b * ans;
    }
  }
  return { text: `${a} ${op} ${b}`, answer: ans };
}

function numberChoices(ans: number): { choices: number[]; answer: number } {
  const set = new Set<number>([ans]);
  const deltas = shuffle([1, 2, 3, 10, -1, -2, -3, -10, 5, -5, 11, -11]);
  for (const d of deltas) {
    if (set.size >= 4) break;
    const v = ans + d;
    if (v >= 0) set.add(v);
  }
  let k = 4;
  while (set.size < 4) set.add(ans + k++);
  const choices = shuffle([...set]);
  return { choices, answer: choices.indexOf(ans) };
}

export const mathGame = makeStreamGame({
  id: 'math',
  durationMs: 30_000,
  wrongLockMs: 1000,
  gen(settings): StreamQuestion {
    const m = genMath(settings.mathDifficulty);
    const c = numberChoices(m.answer);
    return { pub: { text: `${m.text} = ?`, choices: c.choices.map(String) }, answer: c.answer };
  },
});

// ───────────────────────── 색깔 함정 ─────────────────────────
export const COLORS = [
  { name: '빨강', hex: '#ef4444' },
  { name: '파랑', hex: '#3b82f6' },
  { name: '초록', hex: '#22c55e' },
  { name: '노랑', hex: '#facc15' },
  { name: '보라', hex: '#a855f7' },
  { name: '흰색', hex: '#f8fafc' },
];

export const colorGame = makeStreamGame({
  id: 'color',
  durationMs: 20_000,
  wrongLockMs: 800,
  gen(): StreamQuestion {
    const ink = pick(COLORS);
    // 75% 확률로 글자와 색이 다른 "함정" 문제
    const word = Math.random() < 0.75 ? pick(COLORS.filter((c) => c !== ink)) : ink;
    const others = shuffle(COLORS.filter((c) => c !== ink && c !== word));
    const opts = shuffle([ink, ...(word !== ink ? [word] : []), ...others].slice(0, 4));
    // 정답(ink)이 반드시 포함되도록 보정
    if (!opts.includes(ink)) opts[0] = ink;
    const choices = shuffle(opts);
    return {
      pub: { word: word.name, ink: ink.hex, choices: choices.map((c) => c.name) },
      answer: choices.indexOf(ink),
    };
  },
});

// ───────────────────────── 숫자 크기 비교 (확장 게임 예시) ─────────────────────────
function compareSide(diff: string): { text: string; value: number } {
  const big = diff === 'hard' ? 99 : diff === 'normal' ? 50 : 20;
  const kind = rand(0, 2);
  if (kind === 0) {
    const v = rand(2, big * 4);
    return { text: String(v), value: v };
  }
  if (kind === 1) {
    const a = rand(2, big);
    const b = rand(2, big);
    return { text: `${a} + ${b}`, value: a + b };
  }
  const a = rand(2, diff === 'easy' ? 9 : 15);
  const b = rand(2, 9);
  return { text: `${a} × ${b}`, value: a * b };
}

export const compareGame = makeStreamGame({
  id: 'compare',
  durationMs: 20_000,
  wrongLockMs: 800,
  gen(settings): StreamQuestion {
    let l = compareSide(settings.mathDifficulty);
    let r = compareSide(settings.mathDifficulty);
    let guard = 0;
    // 같은 값은 나오지 않게, 차이가 너무 크지 않게(재미 요소)
    while ((l.value === r.value || Math.abs(l.value - r.value) > Math.max(l.value, r.value) * 0.5) && guard++ < 50) {
      l = compareSide(settings.mathDifficulty);
      r = compareSide(settings.mathDifficulty);
    }
    if (l.value === r.value) r = { text: String(r.value + 1), value: r.value + 1 };
    return { pub: { choices: [l.text, r.text] }, answer: l.value > r.value ? 0 : 1 };
  },
});

// ───────────────────────── 순서 맞추기 (확장 게임) ─────────────────────────
// 4개의 수(식)를 작은 순서대로 터치. choice 는 "2013" 같은 인덱스 순서 문자열
export const orderGame = makeStreamGame({
  id: 'order',
  durationMs: 25_000,
  wrongLockMs: 800,
  bonusSec: 8,
  gen(settings): StreamQuestion {
    const items: { text: string; value: number }[] = [];
    let guard = 0;
    while (items.length < 4 && guard++ < 200) {
      const it = compareSide(settings.mathDifficulty);
      if (!items.some((x) => x.value === it.value)) items.push(it);
    }
    const order = items
      .map((x, i) => ({ i, v: x.value }))
      .sort((a, b) => a.v - b.v)
      .map((x) => x.i)
      .join('');
    return { pub: { choices: items.map((x) => x.text) }, answer: order };
  },
  check: (answer, raw) => typeof raw === 'string' && raw === answer,
});

// ───────────────────────── 빠른 타자 (확장 게임) ─────────────────────────

const typingNorm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim().replace(/\s/g, '');
export const typingGame = makeStreamGame({
  id: 'typing',
  durationMs: 30_000,
  wrongLockMs: 600,
  bonusSec: 12,
  gen(): StreamQuestion {
    const t = pick(TYPING_PHRASES);
    return { pub: { text: t, choices: [] }, answer: t };
  },
  check: (answer, raw) => typeof raw === 'string' && raw.length <= 60 && typingNorm(raw) === typingNorm(String(answer)),
});

// ───────────────────────── 숫자 감각 (확장 게임) ─────────────────────────
// 어림셈: 정답과 가장 가까운 보기 고르기 (보기 간격을 넓게 해 애매함 제거)
export const senseGame = makeStreamGame({
  id: 'sense',
  durationMs: 20_000,
  wrongLockMs: 800,
  gen(settings): StreamQuestion {
    const hard = settings.mathDifficulty === 'hard';
    const kind = rand(0, 2);
    let text: string;
    let value: number;
    if (kind === 0) {
      const a = rand(hard ? 1000 : 100, hard ? 9999 : 999);
      const b = rand(hard ? 1000 : 100, hard ? 9999 : 999);
      text = `${a} + ${b}`;
      value = a + b;
    } else if (kind === 1) {
      const a = rand(11, hard ? 99 : 49);
      const b = rand(11, hard ? 99 : 49);
      text = `${a} × ${b}`;
      value = a * b;
    } else {
      const a = rand(hard ? 5000 : 500, hard ? 9999 : 999);
      const b = rand(hard ? 1000 : 100, a - 1);
      text = `${a} − ${b}`;
      value = a - b;
    }
    // 보기: 정답 근처 반올림값 1개 + 정답과 30% 이상 떨어진 오답 3개
    const mag = Math.pow(10, Math.max(1, Math.floor(Math.log10(Math.max(10, value))) - 1));
    const near = Math.round(value / mag) * mag;
    const opts = new Set<number>([near]);
    for (const f of shuffle([0.5, 0.6, 1.5, 1.7, 2, 0.4])) {
      if (opts.size >= 4) break;
      const v = Math.round((value * f) / mag) * mag;
      if (v > 0 && Math.abs(v - value) >= value * 0.3) opts.add(v);
    }
    const choices = shuffle([...opts]);
    return { pub: { text: `${text} ≈ ?`, choices: choices.map((c) => c.toLocaleString('ko-KR')) }, answer: choices.indexOf(near) };
  },
});

// ───────────────────────── 도형 퍼즐 ─────────────────────────
// 조각을 k번(90°) 돌려 빈칸과 같아지면 정답. 대칭 도형은 여러 k 가 정답일 수 있음.

export const shapeGame = makeStreamGame({
  id: 'shape',
  durationMs: 25_000,
  wrongLockMs: 800,
  bonusSec: 8,
  gen(settings): StreamQuestion {
    const pool = POLYOMINOES.filter((p) => (settings.mathDifficulty === 'easy' ? !p.hard : settings.mathDifficulty === 'hard' ? p.hard : true));
    const shape = pick(pool);
    const holeRot = rand(0, 3);
    const hole = rotate(shape.cells, holeRot);
    let piece = hole;
    let guard = 0;
    while (sameShape(piece, hole) && guard++ < 20) piece = rotate(shape.cells, rand(0, 3));
    const valid = [0, 1, 2, 3].filter((k) => sameShape(rotate(piece, k), hole)).join('');
    return { pub: { hole, piece, choices: [] }, answer: valid };
  },
  check: (answer, raw) => Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) <= 3 && String(answer).includes(String(raw)),
});
