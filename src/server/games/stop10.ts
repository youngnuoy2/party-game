// 10초를 잡아라: 모두 같은 서버 시각에 시작, 각자 10.00초라고 생각할 때 STOP (1회)
// 측정값은 클라이언트(서버 시계 보정)로 받되, 서버 수신 시각과 크게 다르면 서버 값 사용
import type { GameModule } from './types';

const TARGET = 10_000;
const VISIBLE_MS = 3_000;
const DURATION = 15_000;
const ZERO_AT = 3_000; // 오차가 이 이상이면 0점

interface PState {
  pressed: number | null;
}

export const stop10Game: GameModule<{}, PState> = {
  id: 'stop10',
  pausable: false,
  scoring: 'relative',
  create() {
    return { data: {}, steps: [{ kind: 'play', durationMs: DURATION }] };
  },
  initPlayer() {
    return { pressed: null };
  },
  publicPayload() {
    return { target: TARGET, visibleMs: VISIBLE_MS };
  },
  playerView(round, pid) {
    const p = round.players[pid];
    if (!p) return null;
    return { pressed: p.pressed, error: p.pressed === null ? null : Math.abs(p.pressed - TARGET) };
  },
  onAction(round, pid, action, env) {
    const p = round.players[pid];
    if (!p) return { ok: false, error: '이번 라운드 참가자가 아닙니다' };
    if (!env.active) return { ok: false, error: '시간 종료' };
    if (action?.type !== 'stop') return { ok: false, error: 'bad action' };
    if (p.pressed !== null) return { ok: false, error: '이미 눌렀어요' };
    const serverElapsed = env.now - round.stepStartedAt;
    let claim = Math.round(Number(action.elapsed));
    // 클라이언트 값은 서버 수신 시각보다 늦을 수 없고, 2초 이상 빠를 수도 없음
    if (!Number.isFinite(claim) || claim > serverElapsed + 100 || claim < serverElapsed - 2000) claim = serverElapsed;
    p.pressed = Math.max(0, claim);
    return { ok: true, data: stop10Game.playerView(round, pid, env.now) };
  },
  isDone(round, pid) {
    return round.players[pid]?.pressed != null;
  },
  submittedCount(round) {
    return Object.values(round.players).filter((p) => p.pressed !== null).length;
  },
  liveBoard() {
    return []; // 결과 공개 전까지 긴장감 유지
  },
  finalize(round) {
    const out: Record<string, { perf: number; metric: string }> = {};
    for (const pid of round.participants) {
      const p = round.players[pid];
      if (!p) continue;
      if (p.pressed === null) {
        out[pid] = { perf: 0, metric: '미응답' };
        continue;
      }
      const err = Math.abs(p.pressed - TARGET);
      out[pid] = { perf: Math.max(0, ZERO_AT - err), metric: `${(p.pressed / 1000).toFixed(2)}초 (오차 ${(err / 1000).toFixed(2)}초)` };
    }
    return out;
  },
};
