// 소수파 생존게임: A/B 중 선택, 적은 쪽을 고른 사람이 생존. 3문제.
// 문제 단계에서는 누가 무엇을 골랐는지 공개하지 않고, 공개 단계에서만 집계 공개.
import { shuffle } from '../util';
import type { GameModule, Round, StepDef } from './types';

const QUESTION_MS = 10_000;
const REVEAL_MS = 4_500;
const COUNT = 3;

export const MINORITY_PAIRS: [string, string][] = [
  ['짜장면', '짬뽕'],
  ['부먹', '찍먹'],
  ['여름', '겨울'],
  ['산', '바다'],
  ['강아지', '고양이'],
  ['치킨', '피자'],
  ['콜라', '사이다'],
  ['팥붕어빵', '슈크림붕어빵'],
  ['물냉면', '비빔냉면'],
  ['아침형 인간', '저녁형 인간'],
  ['엘리베이터', '계단'],
  ['회식 1차만', '끝까지 달린다'],
  ['연차 몰아 쓰기', '조금씩 나눠 쓰기'],
  ['카톡', '전화'],
  ['민트초코 좋아요', '민트초코 싫어요'],
  ['떡볶이 밀떡', '떡볶이 쌀떡'],
];

interface Data {
  pairs: [string, string][];
  per: number;
}
interface PState {
  picks: Record<number, 0 | 1>;
}

const cur = (round: Round<Data, PState>) => {
  const step = round.steps[round.stepIndex];
  return step ? { step, idx: step.index ?? 0 } : null;
};

function tally(round: Round<Data, PState>, idx: number) {
  let a = 0;
  let b = 0;
  for (const pid of round.participants) {
    const v = round.players[pid]?.picks[idx];
    if (v === 0) a++;
    else if (v === 1) b++;
  }
  // 소수파: 인원이 적은 쪽 (0명인 쪽은 소수파가 아님 → 전원 같은 선택이면 생존자 없음)
  const winner: 0 | 1 | 'tie' | null = a === b ? (a === 0 ? null : 'tie') : a === 0 || b === 0 ? null : a < b ? 0 : 1;
  return { a, b, winner };
}

const pointsFor = (pick: 0 | 1 | undefined, winner: 0 | 1 | 'tie' | null, per: number) =>
  pick === undefined || winner === null ? 0 : winner === 'tie' ? Math.round(per / 2) : pick === winner ? per : 0;

export const minorityGame: GameModule<Data, PState> = {
  id: 'minority',
  pausable: true,
  scoring: 'absolute',
  create() {
    const pairs = shuffle(MINORITY_PAIRS)
      .slice(0, COUNT)
      .map((p) => shuffle([...p]) as [string, string]);
    const steps: StepDef[] = [];
    pairs.forEach((_, i) => {
      steps.push({ kind: 'question', durationMs: QUESTION_MS, index: i });
      steps.push({ kind: 'reveal', durationMs: REVEAL_MS, index: i });
    });
    return { data: { pairs, per: Math.floor(1000 / COUNT) }, steps };
  },
  initPlayer() {
    return { picks: {} };
  },
  publicPayload(round) {
    const c = cur(round);
    if (!c) return null;
    const base = { index: c.idx, total: round.data.pairs.length, options: round.data.pairs[c.idx] };
    if (c.step.kind !== 'reveal') return base;
    return { ...base, reveal: tally(round, c.idx) };
  },
  playerView(round, pid) {
    const p = round.players[pid];
    const c = cur(round);
    if (!p || !c) return null;
    const pick = p.picks[c.idx];
    if (c.step.kind !== 'reveal') return { index: c.idx, pick: pick ?? null, result: null };
    const t = tally(round, c.idx);
    return { index: c.idx, pick: pick ?? null, result: { points: pointsFor(pick, t.winner, round.data.per), winner: t.winner } };
  },
  onAction(round, pid, action, env) {
    const p = round.players[pid];
    const c = cur(round);
    if (!p) return { ok: false, error: '이번 라운드 참가자가 아닙니다' };
    if (!c || c.step.kind !== 'question' || !env.active) return { ok: false, error: '선택 시간이 아닙니다' };
    if (action?.type !== 'pick' || action.index !== c.idx) return { ok: false, error: '이미 지난 문제입니다' };
    if (p.picks[c.idx] !== undefined) return { ok: false, error: '이미 선택했어요' };
    if (action.choice !== 0 && action.choice !== 1) return { ok: false, error: '잘못된 선택' };
    p.picks[c.idx] = action.choice;
    return { ok: true, data: { index: c.idx, pick: action.choice, result: null } };
  },
  isDone(round, pid) {
    const c = cur(round);
    return !!c && c.step.kind === 'question' && round.players[pid]?.picks[c.idx] !== undefined;
  },
  submittedCount(round) {
    const c = cur(round);
    return c ? Object.values(round.players).filter((p) => p.picks[c.idx] !== undefined).length : 0;
  },
  liveBoard() {
    return [];
  },
  finalize(round) {
    const tallies = round.data.pairs.map((_, i) => tally(round, i));
    const out: Record<string, { score: number; metric: string }> = {};
    for (const pid of round.participants) {
      const p = round.players[pid];
      if (!p) continue;
      let score = 0;
      let alive = 0;
      tallies.forEach((t, i) => {
        const pts = pointsFor(p.picks[i], t.winner, round.data.per);
        score += pts;
        if (pts > 0) alive++;
      });
      const answered = Object.keys(p.picks).length;
      out[pid] = { score: Math.min(1000, Math.round((score * 1000) / (round.data.per * tallies.length))), metric: answered ? `${tallies.length}문제 중 ${alive}번 생존` : '미선택' };
    }
    return out;
  },
};
