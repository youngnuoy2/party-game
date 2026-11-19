// 데굴데굴: 폰을 기울여 공을 굴리는 게임. 코스는 서버가 생성해 모두에게 동일하게 제공.
// 물리 시뮬레이션은 각자 휴대폰에서 하고, 서버는 진행률 증가 속도와 최소 도착 시간으로 조작을 차단.
import { BALL_R, GOAL_R, HOLE_R, MAX_SPEED, ROLL_W, START, type Course, type Rect } from '../../shared/rollCourse';
import { clamp, rand } from '../util';
import type { GameModule } from './types';

const DURATION = 40_000;
const WALL_T = 4;
const GAP = 22;

interface Data {
  course: Course;
  minFinishMs: number;
}
interface PState {
  progress: number; // 최고 진행률
  lastAt: number; // 마지막 보고 시각 (단계 기준 ms)
  finishMs: number | null;
  falls: number;
}

function makeCourse(): Course {
  const rows = [124, 94, 64, 34];
  const walls: Rect[] = [];
  const holes: { x: number; y: number }[] = [];
  let side = Math.random() < 0.5 ? 0 : 1;
  rows.forEach((y, i) => {
    // 통로 위치: 왼쪽/오른쪽 번갈아 (가끔 가운데) → 지그재그 코스
    const gx = i === 1 && Math.random() < 0.3 ? rand(35, 43) : side === 0 ? rand(6, 14) : rand(64, 72);
    side = 1 - side;
    walls.push({ x: 0, y, w: gx, h: WALL_T });
    walls.push({ x: gx + GAP, y, w: ROLL_W - gx - GAP, h: WALL_T });
    // 각 구간마다 구멍 1~2개 (통로 바로 아래는 피함)
    const bandTop = y + WALL_T;
    const bandBottom = i === 0 ? 142 : rows[i - 1];
    const n = rand(1, 2);
    for (let k = 0; k < n; k++) {
      let hx = rand(12, 88);
      let guard = 0;
      while ((Math.abs(hx - (gx + GAP / 2)) < 16 || holes.some((h) => Math.abs(h.x - hx) < 18 && Math.abs(h.y - (bandTop + bandBottom) / 2) < 12)) && guard++ < 30) hx = rand(12, 88);
      holes.push({ x: hx, y: Math.round((bandTop + bandBottom) / 2 + rand(-3, 3)) });
    }
  });
  const lastGap = walls[walls.length - 2].w + GAP / 2;
  return { walls, holes, goal: { x: clamp(100 - lastGap, 15, 85), y: 14 } };
}

/** 이론상 가장 빠른 도착 시간: 지그재그 경로 길이 ÷ 최고 속도 (여유 30%) */
function minFinish(c: Course) {
  let len = 0;
  let px = START.x;
  let py = START.y;
  for (let i = 0; i < c.walls.length; i += 2) {
    const gx = c.walls[i].w + GAP / 2;
    const gy = c.walls[i].y + WALL_T / 2;
    len += Math.hypot(gx - px, gy - py);
    px = gx;
    py = gy;
  }
  len += Math.hypot(c.goal.x - px, c.goal.y - py) - GOAL_R - BALL_R;
  return Math.round((len / MAX_SPEED) * 1000 * 0.7);
}

export const rollGame: GameModule<Data, PState> = {
  id: 'roll',
  pausable: false,
  scoring: 'absolute',
  create() {
    const course = makeCourse();
    return { data: { course, minFinishMs: minFinish(course) }, steps: [{ kind: 'play', durationMs: DURATION }] };
  },
  initPlayer() {
    return { progress: 0, lastAt: 0, finishMs: null, falls: 0 };
  },
  publicPayload(round) {
    return { course: round.data.course, holeR: HOLE_R, goalR: GOAL_R };
  },
  playerView(round, pid) {
    const p = round.players[pid];
    return p ? { progress: p.progress, finishMs: p.finishMs, falls: p.falls } : null;
  },
  onAction(round, pid, action, env) {
    const p = round.players[pid];
    if (!p) return { ok: false, error: '이번 라운드 참가자가 아닙니다' };
    if (!env.active) return { ok: false, error: '시간 종료' };
    if (p.finishMs !== null) return { ok: false, error: '이미 도착했어요' };
    const t = env.now - round.stepStartedAt;
    if (action?.type === 'progress') {
      // 진행률은 최고 속도 이상으로 늘어날 수 없음 (세로 140 단위 기준)
      const maxGain = ((t - p.lastAt) / 1000) * (MAX_SPEED / 140) * 1.5 + 0.03;
      const v = clamp(Number(action.p) || 0, 0, 1);
      if (v > p.progress) p.progress = Math.min(v, p.progress + maxGain);
      if (action.fell) p.falls += 1;
      p.lastAt = t;
      return { ok: true, data: rollGame.playerView(round, pid, env.now) };
    }
    if (action?.type === 'finish') {
      let claim = Math.round(Number(action.t));
      if (!Number.isFinite(claim) || claim > t + 100 || claim < t - 1500) claim = t;
      if (claim < round.data.minFinishMs) return { ok: false, error: '기록이 너무 빨라요' };
      if (p.progress < 0.8) return { ok: false, error: '아직 도착점이 멀어요' };
      p.finishMs = claim;
      p.progress = 1;
      return { ok: true, data: rollGame.playerView(round, pid, env.now) };
    }
    return { ok: false, error: 'bad action' };
  },
  isDone(round, pid) {
    return round.players[pid]?.finishMs != null;
  },
  submittedCount(round) {
    return Object.values(round.players).filter((p) => p.finishMs !== null).length;
  },
  liveBoard(round, nick) {
    return Object.entries(round.players)
      .filter(([, p]) => p.progress > 0)
      .sort((a, b) => (a[1].finishMs ?? 1e9) - (b[1].finishMs ?? 1e9) || b[1].progress - a[1].progress)
      .slice(0, 5)
      .map(([id, p]) => ({ nickname: nick(id), value: p.finishMs != null ? `🏁 ${(p.finishMs / 1000).toFixed(1)}초` : `${Math.round(p.progress * 100)}%` }));
  },
  finalize(round) {
    const times = round.participants.map((pid) => round.players[pid]?.finishMs).filter((x): x is number => x != null);
    const best = times.length ? Math.min(...times) : 0;
    const out: Record<string, { score: number; metric: string }> = {};
    for (const pid of round.participants) {
      const p = round.players[pid];
      if (!p) continue;
      if (p.finishMs != null) out[pid] = { score: Math.round(600 + (400 * best) / p.finishMs), metric: `🏁 ${(p.finishMs / 1000).toFixed(2)}초 · 구멍 ${p.falls}번` };
      else out[pid] = { score: Math.round(500 * p.progress), metric: p.progress > 0 ? `진행 ${Math.round(p.progress * 100)}% · 구멍 ${p.falls}번` : '미참여' };
    }
    return out;
  },
};
