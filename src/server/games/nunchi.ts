// 눈치게임: 1~100 중 하나 선택(1회). 겹치지 않은 숫자 중 가장 큰 숫자가 1등.
// 선택 결과는 마감 후 공개 단계(reveal)에서만 공개.
import type { GameModule, Round } from './types';

const PLAY_MS = 15_000;
const REVEAL_MS = 6_000;
const MAX = 100;

interface PState {
  pick: number | null;
}

/** 숫자별 선택 인원 */
function tally(round: Round<{}, PState>) {
  const counts = new Map<number, number>();
  for (const pid of round.participants) {
    const n = round.players[pid]?.pick;
    if (n != null) counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const uniques = [...counts.entries()].filter(([, c]) => c === 1).map(([n]) => n).sort((a, b) => b - a);
  return { counts, uniques, winner: uniques[0] ?? null };
}

export const nunchiGame: GameModule<{}, PState> = {
  id: 'nunchi',
  pausable: false,
  scoring: 'absolute',
  create() {
    return { data: {}, steps: [{ kind: 'play', durationMs: PLAY_MS }, { kind: 'reveal', durationMs: REVEAL_MS }] };
  },
  initPlayer() {
    return { pick: null };
  },
  publicPayload(round) {
    const step = round.steps[round.stepIndex];
    if (step?.kind !== 'reveal') return { max: MAX };
    const t = tally(round);
    return { max: MAX, reveal: { counts: Object.fromEntries(t.counts), winner: t.winner, uniqueCount: t.uniques.length } };
  },
  playerView(round, pid) {
    const p = round.players[pid];
    if (!p) return null;
    const step = round.steps[round.stepIndex];
    if (step?.kind !== 'reveal' && round.stepIndex < round.steps.length) return { pick: p.pick, result: null };
    const t = tally(round);
    const unique = p.pick != null && t.counts.get(p.pick) === 1;
    const place = unique ? t.uniques.indexOf(p.pick!) + 1 : null;
    return { pick: p.pick, result: { unique, place, sameCount: p.pick != null ? t.counts.get(p.pick) ?? 0 : 0, winner: t.winner } };
  },
  onAction(round, pid, action, env) {
    const p = round.players[pid];
    if (!p) return { ok: false, error: '이번 라운드 참가자가 아닙니다' };
    if (!env.active || round.steps[round.stepIndex]?.kind !== 'play') return { ok: false, error: '선택 시간이 끝났어요' };
    if (action?.type !== 'pick') return { ok: false, error: 'bad action' };
    if (p.pick !== null) return { ok: false, error: '이미 선택했어요' };
    const n = Number(action.n);
    if (!Number.isInteger(n) || n < 1 || n > MAX) return { ok: false, error: '1~100 사이 숫자를 고르세요' };
    p.pick = n;
    return { ok: true, data: { pick: n, result: null } };
  },
  isDone(round, pid) {
    return round.steps[round.stepIndex]?.kind === 'play' && round.players[pid]?.pick != null;
  },
  submittedCount(round) {
    return Object.values(round.players).filter((p) => p.pick !== null).length;
  },
  liveBoard() {
    return []; // 결과 공개 전까지 비밀
  },
  finalize(round) {
    const t = tally(round);
    const m = t.uniques.length;
    const out: Record<string, { score: number; metric: string }> = {};
    for (const pid of round.participants) {
      const p = round.players[pid];
      if (!p) continue;
      if (p.pick == null) {
        out[pid] = { score: 0, metric: '미선택' };
        continue;
      }
      const c = t.counts.get(p.pick) ?? 0;
      if (c > 1) {
        out[pid] = { score: 0, metric: `${p.pick} (${c}명 겹침)` };
        continue;
      }
      const idx = t.uniques.indexOf(p.pick);
      out[pid] = { score: Math.round((1000 * (m - idx)) / m), metric: `${p.pick} (안 겹침 ${idx + 1}번째로 큼)` };
    }
    return out;
  },
};
