// 문제 데이터 검증: 개수, 보기 중복, 초성 모호성, 사칙연산 생성기(정수 나눗셈) 검사
import { CHOSUNG } from '../src/data/chosung';
import { NONSENSE } from '../src/data/nonsense';
import { OX } from '../src/data/ox';
import { toChosung, normalizeAnswer } from '../src/shared/hangul';
import { genMath } from '../src/server/games/streamGames';

let errors = 0;
const fail = (m: string) => {
  errors++;
  console.error('❌', m);
};

const ids = new Set<string>();
for (const q of [...NONSENSE, ...CHOSUNG, ...OX]) {
  if (ids.has(q.id)) fail(`중복 ID ${q.id}`);
  ids.add(q.id);
}

if (NONSENSE.length < 30) fail(`넌센스 ${NONSENSE.length}개 (<30)`);
if (CHOSUNG.length < 30) fail(`초성 ${CHOSUNG.length}개 (<30)`);
if (OX.length < 30) fail(`OX ${OX.length}개 (<30)`);

for (const q of NONSENSE) {
  if (new Set(q.choices.map(normalizeAnswer)).size !== 4) fail(`넌센스 ${q.id} 보기 중복`);
  if (!q.explain) fail(`넌센스 ${q.id} 해설 없음`);
}

const cho = new Map<string, string>();
for (const c of CHOSUNG) {
  const k = toChosung(c.answer);
  if (cho.has(k)) fail(`초성 모호: ${k} = ${cho.get(k)} / ${c.answer}`);
  cho.set(k, c.answer);
  if (!/^[가-힣]+$/.test(c.answer)) fail(`초성 ${c.id} 정답에 한글 외 문자`);
  if (k.length < 2) fail(`초성 ${c.id} 너무 짧음`);
}

for (const o of OX) if (!o.explain) fail(`OX ${o.id} 해설 없음`);
const oCount = OX.filter((o) => o.answer === 'O').length;
console.log(`OX 정답 비율: O ${oCount} / X ${OX.length - oCount}`);

for (const d of ['easy', 'normal', 'hard'] as const) {
  for (let i = 0; i < 5000; i++) {
    const m = genMath(d);
    const [a, op, b] = m.text.split(' ');
    const A = Number(a);
    const B = Number(b);
    const real = op === '+' ? A + B : op === '−' ? A - B : op === '×' ? A * B : A / B;
    if (!Number.isInteger(real) || real !== m.answer || real < 0) {
      fail(`사칙연산 오류 ${m.text} = ${m.answer}`);
      break;
    }
  }
}

console.log(`넌센스 ${NONSENSE.length} · 초성 ${CHOSUNG.length} · OX ${OX.length}`);
console.log(errors ? `\n❌ 오류 ${errors}건` : '\n✅ 문제 데이터 검증 통과');
process.exit(errors ? 1 : 0);
