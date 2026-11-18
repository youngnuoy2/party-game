// 경마: 선택(8초) → 경주(서버가 정한 경주 기록을 모든 화면이 동시 재생) → 결과 공개
// 경주 기록은 선택이 마감된 뒤(경주 단계)에만 공개되므로 미리 알 수 없음.
import { rand, shuffle } from '../util';
import type { GameModule, Round } from './types';

const HORSES = 5;
const PICK_MS = 8_000;
const RACE_MS = 9_500;
const REVEAL_MS = 4_500;
const CHECKPOINTS = 10;
const PLACE_SCORE = [1000, 500, 250];

interface Data {
  finish: number[]; // 말별 결승 시각 (경주 단계 시작 기준 ms)
  curves: number[][]; // 말별 체크포인트 누적 진행률 (0~1), 시간은 finish 를 10등분
  order: number[]; // 도착 순서 (말 번호 0~4)
}
interface PState {
  pick: number | null;
}

function makeRace(): Data {
  // 결승 시각을 서로 150ms 이상 차이 나게 → 동착 없음
  const base = shuffle([0, 1, 2, 3, 4]);
  const finish = Array<number>(HORSES);
  base.forEach((h, rank) => (finish[h] = 7600 + rank * rand(150, 350)));
  const curves = finish.map(() => {
    const w = Array.from({ length: CHECKPOINTS }, () => 0.5 + Math.random());
    const sum = w.reduce((a, b) => a + b, 0);
    let acc = 0;
    return w.map((x) => (acc += x / sum));
  });
  const order = [0, 1, 2, 3, 4].sort((a, b) => finish[a] - finish[b]);
  return { finish, curves, order };
}

const stepKind = (round: Round<Data, PState>) => round.steps[round.stepIndex]?.kind;

export const horseGame: GameModule<Data, PState> = {
  id: 'horse',
  pausable: false,
  scoring: 'absolute',
  create() {
    return {
      data: makeRace(),
      steps: [
        { kind: 'pick', durationMs: PICK_MS },
        { kind: 'race', durationMs: RACE_MS },
        { kind: 'reveal', durationMs: REVEAL_MS },
      ],
    };
  },
  initPlayer() {
    return { pick: null };
  },
  publicPayload(round) {
    const k = stepKind(round);
    const counts = Array.from({ length: HORSES }, () => 0);
    for (const pid of round.participants) {
      const n = round.players[pid]?.pick;
      if (n != null) counts[n]++;
    }
    if (k === 'pick') return { horses: HORSES };
    // 경주 시작 후: 경주 기록 + 말별 응원 인원
    return { horses: HORSES, finish: round.data.finish, curves: round.data.curves, counts, order: k === 'reveal' ? round.data.order : null };
  },
  playerView(round, pid) {
    const p = round.players[pid];
    if (!p) return null;
    const k = stepKind(round);
    const place = k === 'reveal' || round.stepIndex >= round.steps.length ? (p.pick == null ? null : round.data.order.indexOf(p.pick) + 1) : null;
    return { pick: p.pick, place };
  },
  onAction(round, pid, action, env) {
    const p = round.players[pid];
    if (!p) return { ok: false, error: '이번 라운드 참가자가 아닙니다' };
    if (!env.active || stepKind(round) !== 'pick') return { ok: false, error: '선택 시간이 끝났어요' };
    if (action?.type !== 'pick') return { ok: false, error: 'bad action' };
    if (p.pick !== null) return { ok: false, error: '이미 선택했어요' };
    const n = Number(action.horse);
    if (!Number.isInteger(n) || n < 0 || n >= HORSES) return { ok: false, error: '잘못된 선택' };
    p.pick = n;
    return { ok: true, data: { pick: n, place: null } };
  },
  isDone(round, pid) {
    return stepKind(round) === 'pick' && round.players[pid]?.pick != null;
  },
  submittedCount(round) {
    return Object.values(round.players).filter((p) => p.pick !== null).length;
  },
  liveBoard() {
    return [];
  },
  finalize(round) {
    const out: Record<string, { score: number; metric: string }> = {};
    for (const pid of round.participants) {
      const p = round.players[pid];
      if (!p) continue;
      if (p.pick == null) {
        out[pid] = { score: 0, metric: '미선택' };
        continue;
      }
      const place = round.data.order.indexOf(p.pick) + 1;
      out[pid] = { score: PLACE_SCORE[place - 1] ?? 0, metric: `${p.pick + 1}번 말 · ${place}등` };
    }
    return out;
  },
};
