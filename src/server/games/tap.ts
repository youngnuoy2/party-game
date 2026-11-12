// 연타왕: 클라이언트는 누적 터치 수를 주기적으로 전송, 서버는 물리적으로 가능한 최대 속도로 제한
import type { GameModule } from './types';

const DURATION = 10_000;
const MAX_TAPS_PER_SEC = 20; // 사람이 낼 수 있는 상한(여러 손가락 포함) - 이를 넘는 값은 잘라냄
const MAX_TOTAL = Math.ceil((DURATION / 1000) * MAX_TAPS_PER_SEC);

interface PState {
  count: number;
  clipped: number; // 상한 초과로 잘린 횟수 (부정행위 의심 지표)
}

export const tapGame: GameModule<{}, PState> = {
  id: 'tap',
  pausable: false,
  scoring: 'relative',
  create() {
    return { data: {}, steps: [{ kind: 'play', durationMs: DURATION }] };
  },
  initPlayer() {
    return { count: 0, clipped: 0 };
  },
  publicPayload() {
    return { maxTotal: MAX_TOTAL };
  },
  playerView(round, pid) {
    const p = round.players[pid];
    return p ? { count: p.count } : null;
  },
  onAction(round, pid, action, env) {
    const p = round.players[pid];
    if (!p) return { ok: false, error: '이번 라운드 참가자가 아닙니다' };
    if (!env.active) return { ok: false, error: '시간 종료' };
    if (action?.type !== 'tap') return { ok: false, error: 'bad action' };
    const reported = Math.floor(Number(action.count));
    if (!Number.isFinite(reported) || reported < p.count) return { ok: true, data: { count: p.count } };
    const elapsed = Math.min(env.now, round.stepEndsAt) - round.stepStartedAt;
    const cap = Math.min(MAX_TOTAL, Math.floor((Math.max(0, elapsed) / 1000) * MAX_TAPS_PER_SEC) + 5);
    if (reported > cap) p.clipped += reported - cap;
    p.count = Math.min(reported, cap);
    return { ok: true, data: { count: p.count } };
  },
  submittedCount(round) {
    return Object.values(round.players).filter((p) => p.count > 0).length;
  },
  liveBoard(round, nick) {
    return Object.entries(round.players)
      .filter(([, p]) => p.count > 0)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([id, p]) => ({ nickname: nick(id), value: `${p.count}회` }));
  },
  finalize(round) {
    const out: Record<string, { perf: number; metric: string }> = {};
    for (const pid of round.participants) {
      const p = round.players[pid];
      if (p) out[pid] = { perf: p.count, metric: p.count ? `${p.count}회` : '미참여' };
    }
    return out;
  },
};
