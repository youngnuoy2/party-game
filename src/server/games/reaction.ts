// 반응속도: 서버가 참가자별로 무작위 지연 후 "GO" 신호를 보냄 (클라이언트는 신호 시점을 미리 알 수 없음)
// 측정은 클라이언트 performance.now() (네트워크 지연 제외)로 하되,
// 서버가 "GO 전송 → 결과 수신" 경과시간으로 상한을 검증하여 조작을 차단
import { rand } from '../util';
import type { GameModule } from './types';

const TRIALS = 3;
const DURATION = 25_000;
const PENALTY_MS = 1000; // 반칙/미응답 시 기록
const MIN_HUMAN_MS = 100; // 이보다 빠르면 예측 터치로 간주 → 반칙
const MISS_AFTER_MS = 2500;

type Trial = { ms: number } | { foul: true } | { miss: true };

interface PState {
  results: Trial[];
  waiting: { attempt: number; goAt: number | null; token: number } | null;
}

const fmt = (t: Trial) => ('ms' in t ? `${t.ms}ms` : 'foul' in t ? '반칙' : '미응답');
const val = (t: Trial) => ('ms' in t ? t.ms : PENALTY_MS);

export const reactionGame: GameModule<{ trials: number }, PState> = {
  id: 'reaction',
  pausable: false,
  scoring: 'relative',
  create() {
    return { data: { trials: TRIALS }, steps: [{ kind: 'play', durationMs: DURATION }] };
  },
  initPlayer() {
    return { results: [], waiting: null };
  },
  publicPayload() {
    return { trials: TRIALS };
  },
  playerView(round, pid) {
    const p = round.players[pid];
    if (!p) return null;
    return {
      trials: TRIALS,
      results: p.results.map(fmt),
      attempt: p.results.length,
      waiting: p.waiting ? { attempt: p.waiting.attempt, go: p.waiting.goAt !== null } : null,
      done: p.results.length >= TRIALS,
    };
  },
  onAction(round, pid, action, env) {
    const p = round.players[pid];
    if (!p) return { ok: false, error: '이번 라운드 참가자가 아닙니다' };
    if (!env.active) return { ok: false, error: '시간 종료' };
    const attempt = Number(action?.attempt);
    if (attempt !== p.results.length || attempt >= TRIALS) return { ok: false, error: '잘못된 시도 번호' };

    if (action.type === 'ready') {
      // 재접속/서버 재시작으로 대기 상태가 남아 있으면 새로 시작 (이전 타이머는 token 불일치로 무효화)
      const tokenId = Math.floor(Math.random() * 1e9);
      const delay = rand(1500, 4000);
      p.waiting = { attempt, goAt: null, token: tokenId };
      env.schedule(delay, () => {
        if (!p.waiting || p.waiting.token !== tokenId) return;
        p.waiting.goAt = Date.now();
        env.emitTo(pid, { type: 'go', attempt });
        env.schedule(MISS_AFTER_MS + 500, () => {
          if (!p.waiting || p.waiting.token !== tokenId) return;
          p.results.push({ miss: true });
          p.waiting = null;
          env.touch(pid);
        });
      });
      return { ok: true, data: { pending: true } };
    }

    if (!p.waiting) return { ok: false, error: '준비 신호가 없습니다' };

    if (action.type === 'foul') {
      // GO 신호 전에 터치
      p.results.push({ foul: true });
      p.waiting = null;
      return { ok: true, data: { result: 'foul' } };
    }

    if (action.type === 'hit') {
      if (p.waiting.goAt === null) {
        // 서버가 아직 신호를 보내지 않았는데 hit → 조작 또는 예측 → 반칙
        p.results.push({ foul: true });
        p.waiting = null;
        return { ok: true, data: { result: 'foul' } };
      }
      const serverElapsed = env.now - p.waiting.goAt;
      let ms = Math.round(Number(action.ms));
      if (!Number.isFinite(ms) || ms < 0) ms = serverElapsed;
      // 클라이언트 측정값은 서버 경과시간(신호 왕복 포함)보다 클 수 없음
      ms = Math.min(ms, serverElapsed + 30);
      let t: Trial;
      if (ms < MIN_HUMAN_MS) t = { foul: true };
      else if (ms > MISS_AFTER_MS) t = { miss: true };
      else t = { ms };
      p.results.push(t);
      p.waiting = null;
      return { ok: true, data: { result: fmt(t) } };
    }
    return { ok: false, error: 'bad action' };
  },
  submittedCount(round) {
    return Object.values(round.players).filter((p) => p.results.length >= TRIALS).length;
  },
  liveBoard(round, nick) {
    return Object.entries(round.players)
      .map(([id, p]) => ({ id, best: Math.min(...p.results.map(val), Infinity) }))
      .filter((x) => x.best < PENALTY_MS)
      .sort((a, b) => a.best - b.best)
      .slice(0, 5)
      .map((x) => ({ nickname: nick(x.id), value: `최고 ${x.best}ms` }));
  },
  finalize(round) {
    const out: Record<string, { perf: number; metric: string }> = {};
    for (const pid of round.participants) {
      const p = round.players[pid];
      if (!p) continue;
      if (p.results.length === 0) {
        out[pid] = { perf: 0, metric: '미참여' };
        continue;
      }
      const vals = Array.from({ length: TRIALS }, (_, i) => (p.results[i] ? val(p.results[i]) : PENALTY_MS));
      const avg = Math.round(vals.reduce((a, b) => a + b, 0) / TRIALS);
      const allBad = vals.every((v) => v >= PENALTY_MS);
      out[pid] = { perf: allBad ? 0 : 1_000_000 / avg, metric: allBad ? '기록 없음' : `평균 ${avg}ms` };
    }
    return out;
  },
};
