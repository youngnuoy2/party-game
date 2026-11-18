// 스택 타워: 블록이 좌우로 왕복. 터치한 순간의 위치를 서버가 계산해 겹친 부분만 남김.
// 터치 시각은 클라이언트(서버 시계 보정 값)로 받고, 서버 수신 시각과 크게 다르면 서버 값 사용.
import { clamp } from '../util';
import type { GameModule } from './types';

const DURATION = 20_000;
const WIDTH = 100;
const BASE: [number, number] = [20, 80];
const PERFECT = 1.5; // 이 이내로 맞으면 잘리지 않고 그대로 (보너스)

interface Mover {
  t0: number; // 단계 시작 기준 ms
  v: number; // 초당 이동 거리
  w: number; // 블록 너비
  p0: number; // 시작 위치(왕복 경로상 위치) - 매번 무작위라 같은 타이밍 반복으로 맞힐 수 없음
}
interface PState {
  blocks: [number, number][]; // 쌓인 블록 (아래 → 위)
  mover: Mover | null;
  floors: number;
  precisionSum: number;
  perfects: number;
  over: boolean;
}

export function moverX(m: Mover, t: number) {
  const span = WIDTH - m.w;
  if (span <= 0) return 0;
  const d = m.p0 + (Math.max(0, t - m.t0) / 1000) * m.v;
  const r = d % (2 * span);
  return r <= span ? r : 2 * span - r;
}

const newMover = (p: PState, t: number): Mover => {
  const top = p.blocks[p.blocks.length - 1];
  const w = top[1] - top[0];
  return { t0: t + 250, v: 45 + p.floors * 5, w, p0: Math.random() * 2 * Math.max(1, WIDTH - w) };
};

const view = (p: PState) => ({ blocks: p.blocks.slice(-8), mover: p.mover, floors: p.floors, perfects: p.perfects, over: p.over });

export const stackGame: GameModule<{}, PState> = {
  id: 'stack',
  pausable: false,
  scoring: 'relative',
  create() {
    return { data: {}, steps: [{ kind: 'play', durationMs: DURATION }] };
  },
  initPlayer() {
    const p: PState = { blocks: [BASE], mover: null, floors: 0, precisionSum: 0, perfects: 0, over: false };
    p.mover = newMover(p, 0);
    return p;
  },
  publicPayload() {
    return { width: WIDTH };
  },
  playerView(round, pid) {
    const p = round.players[pid];
    return p ? view(p) : null;
  },
  onAction(round, pid, action, env) {
    const p = round.players[pid];
    if (!p) return { ok: false, error: '이번 라운드 참가자가 아닙니다' };
    if (!env.active) return { ok: false, error: '시간 종료' };
    if (p.over || !p.mover) return { ok: false, error: '이미 끝났어요' };
    if (action?.type !== 'drop') return { ok: false, error: 'bad action' };
    const serverT = env.now - round.stepStartedAt;
    let t = Math.round(Number(action.t));
    if (!Number.isFinite(t) || t > serverT + 100 || t < serverT - 1500) t = serverT;
    if (t < p.mover.t0) return { ok: false, error: '블록 준비 중' };
    const m = p.mover;
    const x = moverX(m, t);
    const [L, R] = p.blocks[p.blocks.length - 1];
    let left = Math.max(x, L);
    let right = Math.min(x + m.w, R);
    let result: 'perfect' | 'cut' | 'miss';
    if (Math.abs(x - L) <= PERFECT) {
      left = L;
      right = R;
      result = 'perfect';
      p.perfects += 1;
    } else result = right - left >= 1 ? 'cut' : 'miss';
    if (result === 'miss') {
      p.over = true;
      p.mover = null;
    } else {
      p.blocks.push([left, right]);
      p.floors += 1;
      p.precisionSum += clamp((right - left) / m.w, 0, 1);
      p.mover = newMover(p, t);
    }
    return { ok: true, data: { ...view(p), result, dropX: x } };
  },
  isDone(round, pid) {
    return !!round.players[pid]?.over;
  },
  submittedCount(round) {
    return Object.values(round.players).filter((p) => p.floors > 0 || p.over).length;
  },
  liveBoard(round, nick) {
    return Object.entries(round.players)
      .filter(([, p]) => p.floors > 0)
      .sort((a, b) => b[1].floors - a[1].floors)
      .slice(0, 5)
      .map(([id, p]) => ({ nickname: nick(id), value: `${p.floors}층` }));
  },
  finalize(round) {
    const out: Record<string, { perf: number; metric: string }> = {};
    for (const pid of round.participants) {
      const p = round.players[pid];
      if (!p) continue;
      if (!p.floors) {
        out[pid] = { perf: 0, metric: p.over ? '0층 (첫 블록 실패)' : '미참여' };
        continue;
      }
      const prec = p.precisionSum / p.floors;
      out[pid] = { perf: p.floors + 0.99 * prec, metric: `${p.floors}층 (정밀도 ${Math.round(prec * 100)}%)` };
    }
    return out;
  },
};
