// 게임방 상태 머신 + 점수/순위 계산 + 영속화
// 모든 상태 변경은 이 모듈(서버)에서만 발생합니다. 클라이언트는 "요청"만 보낼 수 있습니다.
import fs from 'fs';
import path from 'path';
import type { Server } from 'socket.io';
import { ALL_GAME_IDS } from '../shared/gameMeta';
import type {
  Ack,
  GameId,
  GamePublic,
  HostState,
  MeState,
  Phase,
  PublicState,
  RankingEntry,
  RoomSettings,
  RoundEntry,
  RoundResult,
} from '../shared/types';
import { GAMES } from './games/registry';
import { GRACE_MS, type ActionEnv, type Round } from './games/types';
import { clamp, newId, roomCode, safeEqual, shuffle, token } from './util';

export const COUNTDOWN_MS = 3000;
const COUNTDOWN_LEAD_MS = 400; // 메시지 전파 여유 (모든 기기가 같은 시각에 3-2-1 시작)
const MAX_PLAYERS = 150;
const EARLY_ADVANCE_MS = 800; // 전원 제출 후 정답 공개까지 잠깐 뜸 들이기

export interface Player {
  id: string;
  token: string;
  nickname: string;
  joinedAt: number;
  lastSeen: number;
  total: number;
  wins: number;
  lastScore: number;
}

interface PendingScore {
  playerId: string;
  score: number;
  metric: string;
}

export interface Room {
  code: string;
  hostToken: string;
  createdAt: number;
  updatedAt: number;
  settings: RoomSettings;
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  paused: boolean;
  pausedAt: number | null;
  timerAt: number | null;
  timerAction: 'countdownEnd' | 'stepEnd' | null;
  currentGame: GameId | null;
  round: Round | null;
  pending: PendingScore[] | null; // 집계 완료, 공개 전 점수
  players: Record<string, Player>;
  kicked: string[];
  history: RoundResult[];
  ranking: RankingEntry[];
  playedGames: GameId[];
  bag: GameId[];
  usedQuestions: Record<string, string[]>;
}

const DEFAULT_SETTINGS: RoomSettings = {
  title: '2026 송년회 미니게임 배틀',
  totalRounds: 8,
  enabledGames: [...ALL_GAME_IDS],
  allowLateJoin: true,
  mathDifficulty: 'normal',
  chosungMode: 'input',
};

const NICK_RE = /^[^\u0000-\u001f<>]{1,12}$/;

export class RoomManager {
  rooms = new Map<string, Room>();
  private io!: Server;
  private dataDir: string;
  private phaseTimers = new Map<string, NodeJS.Timeout>();
  private roundTimers = new Map<string, Set<NodeJS.Timeout>>();
  private saveTimers = new Map<string, NodeJS.Timeout>();
  private bcastTimers = new Map<string, NodeJS.Timeout>();
  private liveTimer: NodeJS.Timeout | null = null;
  private online = new Map<string, number>(); // playerId → 연결된 소켓 수

  constructor(dataDir: string) {
    this.dataDir = path.join(dataDir, 'rooms');
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  attach(io: Server) {
    this.io = io;
    this.restore();
    // 진행 중 라이브 보드(대형 화면) 1초 간격 갱신
    this.liveTimer = setInterval(() => this.pushLive(), 1000);
  }

  // ─────────────── 영속화 / 복구 ───────────────
  private restore() {
    for (const f of fs.readdirSync(this.dataDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const room = JSON.parse(fs.readFileSync(path.join(this.dataDir, f), 'utf8')) as Room;
        this.rooms.set(room.code, room);
        // 비정상 종료 복구: 타이머 재설정 (일시정지 상태면 그대로 유지)
        if (room.timerAt && !room.paused) this.armTimer(room, room.timerAt);
        console.log(`[restore] 방 ${room.code} 복구 (phase=${room.phase}, 참가자 ${Object.keys(room.players).length}명)`);
      } catch (e) {
        console.error('[restore] 실패', f, e);
      }
    }
  }

  private save(room: Room) {
    room.updatedAt = Date.now();
    if (this.saveTimers.has(room.code)) return;
    this.saveTimers.set(
      room.code,
      setTimeout(() => {
        this.saveTimers.delete(room.code);
        this.saveNow(room);
      }, 150),
    );
  }

  private saveNow(room: Room) {
    if (!this.rooms.has(room.code)) return;
    const file = path.join(this.dataDir, `${room.code}.json`);
    const tmp = file + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(room));
      fs.renameSync(tmp, file); // 원자적 교체
    } catch (e) {
      console.error('[save] 실패', room.code, e);
    }
  }

  flushAll() {
    for (const room of this.rooms.values()) this.saveNow(room);
  }

  /** 변경 반영: 저장 + 브로드캐스트 */
  private commit(room: Room) {
    this.save(room);
    this.broadcast(room);
  }

  // ─────────────── 방 생성 / 조회 ───────────────
  createRoom(title?: string) {
    let code = roomCode();
    while (this.rooms.has(code)) code = roomCode();
    const now = Date.now();
    const room: Room = {
      code,
      hostToken: token(),
      createdAt: now,
      updatedAt: now,
      settings: { ...DEFAULT_SETTINGS, enabledGames: [...DEFAULT_SETTINGS.enabledGames], title: (title || DEFAULT_SETTINGS.title).slice(0, 40) },
      phase: 'LOBBY',
      phaseStartedAt: now,
      phaseEndsAt: null,
      paused: false,
      pausedAt: null,
      timerAt: null,
      timerAction: null,
      currentGame: null,
      round: null,
      pending: null,
      players: {},
      kicked: [],
      history: [],
      ranking: [],
      playedGames: [],
      bag: [],
      usedQuestions: {},
    };
    this.rooms.set(code, room);
    this.saveNow(room);
    return room;
  }

  deleteRoom(code: string) {
    const room = this.rooms.get(code);
    if (!room) return;
    this.clearTimers(room);
    this.io.to(`room:${code}`).emit('kicked', { reason: '게임방이 삭제되었습니다' });
    this.rooms.delete(code);
    try {
      fs.unlinkSync(path.join(this.dataDir, `${code}.json`));
    } catch {}
  }

  get(code: string) {
    return this.rooms.get(String(code || '').toUpperCase());
  }

  checkHost(room: Room | undefined, hostToken: string) {
    return !!room && typeof hostToken === 'string' && safeEqual(room.hostToken, hostToken);
  }

  // ─────────────── 참가자 ───────────────
  validateNickname(room: Room, raw: unknown, exceptId?: string): string | { error: string } {
    const nickname = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!nickname) return { error: '닉네임을 입력해 주세요' };
    if (!NICK_RE.test(nickname)) return { error: '닉네임은 1~12자로 입력해 주세요' };
    const key = nickname.toLowerCase().replace(/\s/g, '');
    const dup = Object.values(room.players).some((p) => p.id !== exceptId && p.nickname.toLowerCase().replace(/\s/g, '') === key);
    if (dup) return { error: '이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해 주세요' };
    return nickname;
  }

  join(room: Room, rawNick: unknown): Ack<{ playerId: string; token: string }> {
    if (room.phase === 'FINISHED') return { ok: false, error: '대회가 이미 종료되었습니다' };
    if (room.phase !== 'LOBBY' && !room.settings.allowLateJoin) return { ok: false, error: '게임이 진행 중이라 지금은 입장할 수 없어요' };
    if (Object.keys(room.players).length >= MAX_PLAYERS) return { ok: false, error: '정원이 가득 찼습니다' };
    const nick = this.validateNickname(room, rawNick);
    if (typeof nick !== 'string') return { ok: false, error: nick.error };
    const now = Date.now();
    const p: Player = { id: newId('p'), token: token(), nickname: nick, joinedAt: now, lastSeen: now, total: 0, wins: 0, lastScore: 0 };
    room.players[p.id] = p;
    this.recomputeRanking(room, false);
    this.commit(room);
    return { ok: true, data: { playerId: p.id, token: p.token } };
  }

  resume(room: Room, playerId: string, tok: string): Ack {
    if (room.kicked.includes(playerId)) return { ok: false, error: '퇴장 처리된 참가자입니다' };
    const p = room.players[playerId];
    if (!p || !safeEqual(p.token, tok)) return { ok: false, error: '참가 정보가 없습니다. 다시 입장해 주세요' };
    return { ok: true };
  }

  setOnline(room: Room, playerId: string, delta: 1 | -1) {
    const n = Math.max(0, (this.online.get(playerId) ?? 0) + delta);
    this.online.set(playerId, n);
    const p = room.players[playerId];
    if (p) p.lastSeen = Date.now();
    if (delta === -1) this.checkAllDone(room); // 미제출자가 나가면 남은 전원이 제출했는지 다시 확인
    this.broadcast(room);
  }

  isOnline(playerId: string) {
    return (this.online.get(playerId) ?? 0) > 0;
  }

  kick(room: Room, playerId: string): Ack {
    const p = room.players[playerId];
    if (!p) return { ok: false, error: '참가자가 없습니다' };
    delete room.players[playerId];
    room.kicked.push(playerId);
    if (room.round) {
      room.round.participants = room.round.participants.filter((x) => x !== playerId);
      delete room.round.players[playerId];
    }
    if (room.pending) room.pending = room.pending.filter((x) => x.playerId !== playerId);
    this.io.to(`p:${playerId}`).emit('kicked', { reason: '사회자에 의해 퇴장되었습니다' });
    this.io.in(`p:${playerId}`).socketsLeave([`room:${room.code}`, `p:${playerId}`]);
    this.recomputeRanking(room, false);
    this.commit(room);
    return { ok: true };
  }

  rename(room: Room, playerId: string, nickname: unknown): Ack {
    const p = room.players[playerId];
    if (!p) return { ok: false, error: '참가자가 없습니다' };
    const nick = this.validateNickname(room, nickname, playerId);
    if (typeof nick !== 'string') return { ok: false, error: nick.error };
    p.nickname = nick;
    for (const r of room.ranking) if (r.playerId === playerId) r.nickname = nick;
    this.commit(room);
    return { ok: true };
  }

  // ─────────────── 설정 ───────────────
  updateSettings(room: Room, s: Partial<RoomSettings>): Ack {
    const next = { ...room.settings };
    if (typeof s.title === 'string') next.title = s.title.trim().slice(0, 40) || next.title;
    if (s.totalRounds !== undefined) {
      const n = Math.floor(Number(s.totalRounds));
      if (!Number.isFinite(n) || n < 1 || n > 30) return { ok: false, error: '라운드 수는 1~30 사이' };
      if (n < room.history.length) return { ok: false, error: `이미 ${room.history.length}라운드를 진행했습니다` };
      next.totalRounds = n;
    }
    if (Array.isArray(s.enabledGames)) {
      const list = s.enabledGames.filter((g): g is GameId => ALL_GAME_IDS.includes(g as GameId));
      if (!list.length) return { ok: false, error: '최소 1개 게임은 활성화해야 합니다' };
      next.enabledGames = [...new Set(list)];
    }
    if (typeof s.allowLateJoin === 'boolean') next.allowLateJoin = s.allowLateJoin;
    if (s.mathDifficulty && ['easy', 'normal', 'hard'].includes(s.mathDifficulty)) next.mathDifficulty = s.mathDifficulty;
    if (s.chosungMode && ['choice', 'input'].includes(s.chosungMode)) next.chosungMode = s.chosungMode;
    room.settings = next;
    this.commit(room);
    return { ok: true };
  }

  // ─────────────── 게임 선택 ───────────────
  private pickGame(room: Room, exclude: GameId[]): GameId {
    const enabled = room.settings.enabledGames;
    const last = room.playedGames[room.playedGames.length - 1];
    let bag = room.bag.filter((g) => enabled.includes(g));
    if (!bag.length) bag = shuffle(enabled); // 모든 게임을 한 번씩 진행하면 다시 채움
    const avoid = new Set<GameId>([...exclude, ...(last ? [last] : [])]);
    let choice = bag.find((g) => !avoid.has(g));
    if (!choice) {
      // 가방에 남은 게임이 모두 회피 대상 → 가방 밖에서라도 연속 방지
      choice = shuffle(enabled).find((g) => !avoid.has(g)) ?? bag[0] ?? enabled[0];
    }
    room.bag = bag.filter((g) => g !== choice);
    return choice;
  }

  // ─────────────── 상태 전이 ───────────────
  private setPhase(room: Room, phase: Phase, endsAt: number | null = null, startedAt = Date.now()) {
    room.phase = phase;
    room.phaseStartedAt = startedAt;
    room.phaseEndsAt = endsAt;
  }

  /** 다음 게임 소개 (랜덤 or 지정). GAME_INTRO 상태에서 다시 호출하면 게임 변경 */
  nextGame(room: Room, gameId?: GameId): Ack {
    const restPhases: Phase[] = ['LOBBY', 'ROUND_RESULT', 'TOTAL_RANKING', 'GAME_INTRO'];
    if (!restPhases.includes(room.phase)) return { ok: false, error: '지금은 다음 게임을 시작할 수 없습니다' };
    if (room.phase !== 'GAME_INTRO' && room.history.length >= room.settings.totalRounds)
      return { ok: false, error: '모든 라운드를 마쳤습니다. 최종 결과를 발표하세요' };
    if (!Object.keys(room.players).length) return { ok: false, error: '참가자가 없습니다' };
    if (gameId && !GAMES[gameId]) return { ok: false, error: '알 수 없는 게임' };
    if (room.phase === 'GAME_INTRO' && room.currentGame && !room.bag.includes(room.currentGame)) {
      // 바꾸기: 원래 뽑았던 게임은 가방에 되돌림
      room.bag.push(room.currentGame);
    }
    const exclude = room.phase === 'GAME_INTRO' && room.currentGame && !gameId ? [room.currentGame] : [];
    const chosen = gameId ?? this.pickGame(room, exclude);
    if (gameId) room.bag = room.bag.filter((g) => g !== gameId);
    room.currentGame = chosen;
    room.round = null;
    this.setPhase(room, 'GAME_INTRO');
    this.commit(room);
    return { ok: true };
  }

  startCountdown(room: Room): Ack {
    if (room.phase !== 'GAME_INTRO' || !room.currentGame) return { ok: false, error: '게임 소개 단계가 아닙니다' };
    const mod = GAMES[room.currentGame];
    const participants = Object.keys(room.players);
    if (!participants.length) return { ok: false, error: '참가자가 없습니다' };
    const { data, steps } = mod.create({
      settings: room.settings,
      participants,
      takeQuestions: (bank, pool, n) => this.takeQuestions(room, bank, pool, n),
    });
    const round: Round = {
      no: room.history.length + 1,
      gameId: room.currentGame,
      data,
      players: {},
      participants,
      steps,
      stepIndex: -1,
      stepStartedAt: 0,
      stepEndsAt: 0,
    };
    for (const pid of participants) round.players[pid] = mod.initPlayer(round, pid);
    room.round = round;
    const start = Date.now() + COUNTDOWN_LEAD_MS;
    this.setPhase(room, 'COUNTDOWN', start + COUNTDOWN_MS, start);
    this.setTimer(room, start + COUNTDOWN_MS, 'countdownEnd');
    this.commit(room);
    return { ok: true };
  }

  private takeQuestions<T extends { id: string }>(room: Room, bank: string, pool: T[], n: number): T[] {
    const used = new Set(room.usedQuestions[bank] ?? []);
    let fresh = shuffle(pool.filter((q) => !used.has(q.id)));
    if (fresh.length < n) {
      // 모두 소진 → 사용 기록 초기화 (중복 최소화)
      room.usedQuestions[bank] = [];
      fresh = [...fresh, ...shuffle(pool.filter((q) => used.has(q.id)))];
    }
    const out = fresh.slice(0, n);
    room.usedQuestions[bank] = [...(room.usedQuestions[bank] ?? []), ...out.map((q) => q.id)];
    return out;
  }

  private setTimer(room: Room, at: number, action: Room['timerAction']) {
    room.timerAt = at;
    room.timerAction = action;
    this.armTimer(room, at);
  }

  private armTimer(room: Room, at: number) {
    const old = this.phaseTimers.get(room.code);
    if (old) clearTimeout(old);
    this.phaseTimers.set(
      room.code,
      setTimeout(() => this.onTimer(room.code), Math.max(0, at - Date.now())),
    );
  }

  private clearPhaseTimer(room: Room) {
    const old = this.phaseTimers.get(room.code);
    if (old) clearTimeout(old);
    this.phaseTimers.delete(room.code);
    room.timerAt = null;
    room.timerAction = null;
  }

  private clearRoundTimers(room: Room) {
    const set = this.roundTimers.get(room.code);
    if (set) for (const t of set) clearTimeout(t);
    this.roundTimers.delete(room.code);
  }

  private clearTimers(room: Room) {
    this.clearPhaseTimer(room);
    this.clearRoundTimers(room);
  }

  private onTimer(code: string) {
    const room = this.rooms.get(code);
    if (!room || room.paused) return;
    this.phaseTimers.delete(code);
    const action = room.timerAction;
    room.timerAt = null;
    room.timerAction = null;
    try {
      if (action === 'countdownEnd' && room.phase === 'COUNTDOWN') this.beginPlaying(room);
      else if (action === 'stepEnd' && room.phase === 'PLAYING') this.advanceStep(room);
    } catch (e) {
      console.error('[timer] 오류', e);
    }
  }

  private beginPlaying(room: Room) {
    if (!room.round) return;
    this.setPhase(room, 'PLAYING');
    this.startStep(room, 0);
  }

  private envFor(room: Room): ActionEnv {
    const now = Date.now();
    const r = room.round;
    const step = r?.steps[r.stepIndex];
    const active =
      room.phase === 'PLAYING' && !room.paused && !!r && !!step && step.kind !== 'reveal' && now >= r.stepStartedAt - 200 && now <= r.stepEndsAt + GRACE_MS;
    return {
      now,
      active,
      emitTo: (pid, payload) => this.io.to(`p:${pid}`).emit('game:push', payload),
      schedule: (ms, fn) => {
        const set = this.roundTimers.get(room.code) ?? new Set();
        const t = setTimeout(() => {
          set.delete(t);
          if (room.phase !== 'PLAYING' || room.round !== r) return;
          fn();
          this.save(room);
        }, ms);
        set.add(t);
        this.roundTimers.set(room.code, set);
      },
      touch: (pid) => this.emitMe(room, pid),
    };
  }

  private startStep(room: Room, idx: number) {
    const r = room.round!;
    const step = r.steps[idx];
    const now = Date.now();
    r.stepIndex = idx;
    r.stepStartedAt = now;
    r.stepEndsAt = now + step.durationMs;
    const remaining = r.steps.slice(idx).reduce((s, x) => s + x.durationMs, 0);
    room.phaseEndsAt = now + remaining;
    GAMES[r.gameId].onStepStart?.(r, this.envFor(room));
    const grace = step.kind === 'reveal' ? 0 : GRACE_MS;
    this.setTimer(room, r.stepEndsAt + grace, 'stepEnd');
    this.commit(room);
  }

  private advanceStep(room: Room) {
    const r = room.round!;
    if (r.stepIndex + 1 < r.steps.length) this.startStep(room, r.stepIndex + 1);
    else this.endPlaying(room);
  }

  /** 게임 종료 → 서버에서 점수 확정 (공개는 사회자 버튼으로) */
  private endPlaying(room: Room) {
    const r = room.round!;
    this.clearTimers(room);
    room.paused = false;
    room.pausedAt = null;
    r.stepIndex = r.steps.length; // 종료 표시
    this.setPhase(room, 'CALCULATING');
    room.pending = this.score(r);
    this.commit(room);
  }

  forceEnd(room: Room): Ack {
    if (room.phase !== 'PLAYING') return { ok: false, error: '게임 진행 중이 아닙니다' };
    this.endPlaying(room);
    return { ok: true };
  }

  /** 라운드 취소 (점수 미반영) */
  cancelRound(room: Room): Ack {
    if (!['GAME_INTRO', 'COUNTDOWN', 'PLAYING'].includes(room.phase)) return { ok: false, error: '취소할 라운드가 없습니다' };
    this.clearTimers(room);
    if (room.currentGame && !room.bag.includes(room.currentGame)) room.bag.unshift(room.currentGame);
    room.round = null;
    room.currentGame = null;
    room.paused = false;
    room.pausedAt = null;
    this.setPhase(room, room.history.length ? 'TOTAL_RANKING' : 'LOBBY');
    this.commit(room);
    return { ok: true };
  }

  pause(room: Room): Ack {
    if (room.paused) return { ok: false, error: '이미 일시정지 상태' };
    const pausable = room.phase === 'COUNTDOWN' || (room.phase === 'PLAYING' && room.round && GAMES[room.round.gameId].pausable);
    if (!pausable) return { ok: false, error: '이 게임은 진행 중 일시정지를 지원하지 않습니다 (퀴즈형 게임·카운트다운만 가능)' };
    const old = this.phaseTimers.get(room.code);
    if (old) clearTimeout(old);
    this.phaseTimers.delete(room.code);
    room.paused = true;
    room.pausedAt = Date.now();
    this.commit(room);
    return { ok: true };
  }

  resumeGame(room: Room): Ack {
    if (!room.paused || room.pausedAt === null) return { ok: false, error: '일시정지 상태가 아닙니다' };
    const delta = Date.now() - room.pausedAt;
    room.paused = false;
    room.pausedAt = null;
    room.phaseStartedAt += delta;
    if (room.phaseEndsAt) room.phaseEndsAt += delta;
    if (room.round && room.phase === 'PLAYING') {
      room.round.stepStartedAt += delta;
      room.round.stepEndsAt += delta;
    }
    if (room.timerAt) {
      room.timerAt += delta;
      this.armTimer(room, room.timerAt);
    }
    this.commit(room);
    return { ok: true };
  }

  // ─────────────── 점수 계산 ───────────────
  private score(r: Round): PendingScore[] {
    const mod = GAMES[r.gameId];
    const fin = mod.finalize(r);
    const maxPerf = Math.max(0, ...Object.values(fin).map((f) => f.perf ?? 0));
    return r.participants.map((pid) => {
      const f = fin[pid];
      if (!f) return { playerId: pid, score: 0, metric: '미응답' };
      let score: number;
      if (mod.scoring === 'relative') score = maxPerf > 0 ? Math.round((1000 * (f.perf ?? 0)) / maxPerf) : 0;
      else score = Math.round(f.score ?? 0);
      return { playerId: pid, score: clamp(score, 0, 1000), metric: f.metric };
    });
  }

  /** 공동 순위 (1,1,3 방식) */
  private static rankBy<T>(list: T[], key: (x: T) => number): number[] {
    return list.map((x) => 1 + list.filter((y) => key(y) > key(x)).length);
  }

  revealResult(room: Room): Ack {
    if (room.phase !== 'CALCULATING' || !room.round || !room.pending) return { ok: false, error: '집계된 결과가 없습니다' };
    const r = room.round;
    const isFirst = room.history.length === 0;
    const prevRanks = new Map(room.ranking.map((e) => [e.playerId, e.rank]));
    const pending = room.pending.filter((x) => room.players[x.playerId]);
    pending.sort((a, b) => b.score - a.score);
    const ranks = RoomManager.rankBy(pending, (x) => x.score);
    // 누적 점수 반영 (라운드당 1회만: pending 을 비워 중복 반영 방지)
    pending.forEach((x, i) => {
      const p = room.players[x.playerId];
      p.total += x.score;
      p.lastScore = x.score;
      if (ranks[i] === 1 && x.score > 0) p.wins += 1;
    });
    for (const p of Object.values(room.players)) if (!r.participants.includes(p.id)) p.lastScore = 0;
    this.recomputeRanking(room, true, prevRanks);
    const totalRank = new Map(room.ranking.map((e) => [e.playerId, e.rank]));
    const entries: RoundEntry[] = pending.map((x, i) => ({
      playerId: x.playerId,
      nickname: room.players[x.playerId].nickname,
      rank: ranks[i],
      score: x.score,
      metric: x.metric,
      total: room.players[x.playerId].total,
      totalRank: totalRank.get(x.playerId) ?? 0,
      prevTotalRank: isFirst ? null : prevRanks.get(x.playerId) ?? null,
    }));
    room.history.push({ roundNo: r.no, gameId: r.gameId, entries });
    room.playedGames.push(r.gameId);
    room.pending = null;
    this.setPhase(room, 'ROUND_RESULT');
    this.commit(room);
    return { ok: true };
  }

  private recomputeRanking(room: Room, updatePrev: boolean, prevRanks?: Map<string, number>) {
    const old = new Map(room.ranking.map((e) => [e.playerId, e]));
    const list = Object.values(room.players).sort(
      (a, b) => b.total - a.total || b.wins - a.wins || b.lastScore - a.lastScore || a.nickname.localeCompare(b.nickname, 'ko'),
    );
    const ranks = RoomManager.rankBy(list, (p) => p.total);
    room.ranking = list.map((p, i) => ({
      playerId: p.id,
      nickname: p.nickname,
      rank: ranks[i],
      total: p.total,
      prevRank: updatePrev ? prevRanks?.get(p.id) ?? null : old.get(p.id)?.prevRank ?? null,
      wins: p.wins,
      lastScore: p.lastScore,
    }));
    if (room.history.length === 0 && !updatePrev) room.ranking.forEach((e) => (e.prevRank = null));
  }

  showRanking(room: Room): Ack {
    if (room.phase !== 'ROUND_RESULT') return { ok: false, error: '라운드 결과 화면이 아닙니다' };
    this.setPhase(room, 'TOTAL_RANKING');
    this.commit(room);
    return { ok: true };
  }

  finish(room: Room): Ack {
    if (room.phase === 'FINISHED') return { ok: false, error: '이미 종료되었습니다' };
    if (room.phase === 'CALCULATING') this.revealResult(room);
    if (['GAME_INTRO', 'COUNTDOWN', 'PLAYING'].includes(room.phase)) this.cancelRound(room);
    this.clearTimers(room);
    room.round = null;
    room.currentGame = null;
    this.setPhase(room, 'FINISHED');
    this.commit(room);
    return { ok: true };
  }

  reset(room: Room, keepPlayers: boolean): Ack {
    this.clearTimers(room);
    if (!keepPlayers) {
      this.io.to(`room:${room.code}`).emit('kicked', { reason: '게임방이 초기화되었습니다. 다시 입장해 주세요' });
      room.kicked.push(...Object.keys(room.players));
      room.players = {};
    }
    for (const p of Object.values(room.players)) {
      p.total = 0;
      p.wins = 0;
      p.lastScore = 0;
    }
    Object.assign(room, {
      phase: 'LOBBY',
      phaseStartedAt: Date.now(),
      phaseEndsAt: null,
      paused: false,
      pausedAt: null,
      currentGame: null,
      round: null,
      pending: null,
      history: [],
      ranking: [],
      playedGames: [],
      bag: [],
      usedQuestions: {},
    } satisfies Partial<Room>);
    this.recomputeRanking(room, false);
    this.commit(room);
    return { ok: true };
  }

  // ─────────────── 게임 액션 ───────────────
  action(room: Room, playerId: string, action: unknown): Ack {
    const r = room.round;
    if (!r || room.phase !== 'PLAYING') return { ok: false, error: '게임 진행 중이 아닙니다' };
    if (!r.participants.includes(playerId)) return { ok: false, error: '다음 라운드부터 참여할 수 있어요' };
    if (room.paused) return { ok: false, error: '일시정지 중입니다' };
    const res = GAMES[r.gameId].onAction(r, playerId, action, this.envFor(room));
    if (res.ok) {
      this.save(room);
      this.checkAllDone(room);
    }
    return res;
  }

  /**
   * 접속 중인 참가자가 모두 답을 제출하면 남은 시간을 기다리지 않고 정답 공개로 넘어감.
   * (연결이 끊긴 참가자는 기다리지 않음. 최소 1명은 제출해야 함)
   */
  private checkAllDone(room: Room) {
    const r = room.round;
    if (!r || room.phase !== 'PLAYING' || room.paused) return;
    const mod = GAMES[r.gameId];
    const step = r.steps[r.stepIndex];
    if (!mod.isDone || !step || step.kind !== 'question') return;
    const active = r.participants.filter((pid) => room.players[pid] && this.isOnline(pid));
    if (!active.length || !active.every((pid) => mod.isDone!(r, pid))) return;
    const at = Date.now() + EARLY_ADVANCE_MS;
    if (room.timerAt !== null && room.timerAt <= at) return; // 이미 곧 넘어감
    r.stepEndsAt = Math.min(r.stepEndsAt, at);
    room.phaseEndsAt = at + r.steps.slice(r.stepIndex + 1).reduce((sum, x) => sum + x.durationMs, 0);
    this.setTimer(room, at, 'stepEnd');
    this.broadcast(room);
  }

  // ─────────────── 직렬화 / 브로드캐스트 ───────────────
  publicState(room: Room): PublicState {
    const now = Date.now();
    const r = room.round;
    let game: GamePublic | null = null;
    if (r && room.phase === 'PLAYING' && r.stepIndex >= 0 && r.stepIndex < r.steps.length) {
      const mod = GAMES[r.gameId];
      const step = r.steps[r.stepIndex];
      game = {
        gameId: r.gameId,
        stepIndex: r.stepIndex,
        stepCount: r.steps.length,
        stepKind: step.kind,
        stepStartedAt: r.stepStartedAt,
        stepEndsAt: r.stepEndsAt,
        pausable: mod.pausable,
        payload: mod.publicPayload(r),
      };
    }
    const rankMap = new Map(room.ranking.map((e) => [e.playerId, e.rank]));
    const players = Object.values(room.players)
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({ id: p.id, nickname: p.nickname, connected: this.isOnline(p.id), total: p.total, rank: rankMap.get(p.id) ?? 0 }));
    const showResult = ['ROUND_RESULT', 'TOTAL_RANKING', 'FINISHED'].includes(room.phase);
    return {
      code: room.code,
      settings: room.settings,
      phase: room.phase,
      roundNo: room.phase === 'LOBBY' ? 0 : r?.no ?? (['ROUND_RESULT', 'TOTAL_RANKING', 'FINISHED'].includes(room.phase) ? room.history.length : room.history.length + 1),
      gameId: room.currentGame ?? (showResult ? room.history[room.history.length - 1]?.gameId ?? null : null),
      phaseStartedAt: room.phaseStartedAt,
      phaseEndsAt: room.phaseEndsAt,
      paused: room.paused,
      pausedRemainMs: room.paused && room.pausedAt && room.phaseEndsAt ? room.phaseEndsAt - room.pausedAt : null,
      players,
      playerCount: players.length,
      connectedCount: players.filter((p) => p.connected).length,
      game,
      liveBoard: this.liveBoard(room),
      submitted: r && room.phase === 'PLAYING' ? GAMES[r.gameId].submittedCount(r) : 0,
      participantCount: r?.participants.length ?? players.length,
      roundResult: showResult ? room.history[room.history.length - 1] ?? null : null,
      ranking: room.ranking,
      playedGames: room.playedGames,
      serverNow: now,
    };
  }

  private liveBoard(room: Room) {
    const r = room.round;
    if (!r || room.phase !== 'PLAYING') return [];
    const mod = GAMES[r.gameId];
    return mod.liveBoard ? mod.liveBoard(r, (id) => room.players[id]?.nickname ?? '?') : [];
  }

  meState(room: Room, playerId: string): MeState | null {
    const p = room.players[playerId];
    if (!p) return null;
    const r = room.round;
    const rank = room.ranking.find((e) => e.playerId === playerId)?.rank ?? 0;
    const showResult = ['ROUND_RESULT', 'TOTAL_RANKING', 'FINISHED'].includes(room.phase);
    const last = showResult ? room.history[room.history.length - 1]?.entries.find((e) => e.playerId === playerId) ?? null : null;
    let view: unknown = null;
    if (r && (room.phase === 'PLAYING' || room.phase === 'CALCULATING') && r.players[playerId]) {
      view = GAMES[r.gameId].playerView(r, playerId, Date.now());
    }
    return {
      playerId,
      nickname: p.nickname,
      total: p.total,
      rank,
      participating: !!r && r.participants.includes(playerId),
      view,
      lastRound: last,
    };
  }

  hostState(room: Room): HostState {
    return {
      players: Object.values(room.players)
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((p) => ({
          id: p.id,
          nickname: p.nickname,
          connected: this.isOnline(p.id),
          total: p.total,
          rank: room.ranking.find((e) => e.playerId === p.id)?.rank ?? 0,
          joinedAt: p.joinedAt,
          lastSeen: p.lastSeen,
        })),
      questionUsage: Object.fromEntries(Object.entries(room.usedQuestions).map(([k, v]) => [k, v.length])),
    };
  }

  emitMe(room: Room, playerId: string) {
    const me = this.meState(room, playerId);
    if (me) this.io.to(`p:${playerId}`).emit('me', me);
  }

  /** 상태 브로드캐스트 (30ms 내 변경은 묶어서 1회 전송) */
  broadcast(room: Room) {
    if (!this.io || this.bcastTimers.has(room.code)) return;
    this.bcastTimers.set(
      room.code,
      setTimeout(() => {
        this.bcastTimers.delete(room.code);
        if (!this.rooms.has(room.code)) return;
        this.io.to(`room:${room.code}`).emit('state', this.publicState(room));
        for (const pid of Object.keys(room.players)) if (this.isOnline(pid)) this.emitMe(room, pid);
        this.io.to(`host:${room.code}`).emit('host:state', this.hostState(room));
      }, 30),
    );
  }

  private pushLive() {
    for (const room of this.rooms.values()) {
      if (room.phase !== 'PLAYING' || !room.round) continue;
      this.io.to(`room:${room.code}`).emit('live', {
        liveBoard: this.liveBoard(room),
        submitted: GAMES[room.round.gameId].submittedCount(room.round),
      });
    }
  }

  exportResults(room: Room) {
    return {
      title: room.settings.title,
      code: room.code,
      exportedAt: new Date().toISOString(),
      ranking: room.ranking,
      history: room.history,
    };
  }

  shutdown() {
    if (this.liveTimer) clearInterval(this.liveTimer);
    this.flushAll();
  }
}
