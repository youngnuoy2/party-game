// Socket.IO 이벤트 라우팅 + 권한 검사 + 간단한 레이트리밋
import type { Server, Socket } from 'socket.io';
import type { QuestionBankKind } from '../data/types';
import type { Ack } from '../shared/types';
import { addQuestion, deleteQuestion, listQuestions } from './questionBank';
import type { RoomManager } from './room';
import { safeEqual } from './util';

type Cb = (res: Ack<any>) => void;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'party2026';
if (!process.env.ADMIN_PASSWORD) {
  console.warn('⚠️  ADMIN_PASSWORD 환경변수가 없어 기본 비밀번호 "party2026" 을 사용합니다. 행사 전 반드시 변경하세요!');
}

// 비밀번호 무차별 대입 방지: IP 별 실패 횟수 제한
const failures = new Map<string, { n: number; until: number }>();
function checkPassword(socket: Socket, pw: unknown): Ack | null {
  const ip = socket.handshake.address;
  const f = failures.get(ip);
  if (f && f.until > Date.now()) return { ok: false, error: '잠시 후 다시 시도하세요' };
  if (typeof pw === 'string' && safeEqual(pw, ADMIN_PASSWORD)) {
    failures.delete(ip);
    return null;
  }
  const n = (f?.n ?? 0) + 1;
  failures.set(ip, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
  return { ok: false, error: '관리자 비밀번호가 올바르지 않습니다' };
}

const safe = (cb: unknown): Cb => (typeof cb === 'function' ? (cb as Cb) : () => {});

export function registerSocket(io: Server, rooms: RoomManager) {
  io.on('connection', (socket) => {
    // 이벤트 폭주 방지 (초당 40개)
    let bucket = 40;
    const refill = setInterval(() => (bucket = 40), 1000);
    socket.use((_, next) => {
      if (--bucket < 0) return next(new Error('rate limited'));
      next();
    });

    const ctx: { code?: string; playerId?: string; host?: boolean } = {};

    const leaveCurrent = () => {
      if (ctx.code && ctx.playerId) {
        const room = rooms.get(ctx.code);
        if (room) rooms.setOnline(room, ctx.playerId, -1);
      }
      for (const r of socket.rooms) if (r !== socket.id) socket.leave(r);
      ctx.code = ctx.playerId = undefined;
      ctx.host = false;
    };

    // 시간 동기화 (NTP 방식): 클라이언트가 RTT 를 측정해 서버 시계와의 오차를 보정
    socket.on('time:ping', (_: unknown, cb: unknown) => safe(cb)({ ok: true, data: Date.now() }));

    socket.on('room:check', (p: { code?: string }, cb: unknown) => {
      const room = rooms.get(p?.code ?? '');
      if (!room) return safe(cb)({ ok: false, error: '게임방을 찾을 수 없습니다. QR코드를 다시 확인해 주세요' });
      safe(cb)({
        ok: true,
        data: {
          title: room.settings.title,
          phase: room.phase,
          playerCount: Object.keys(room.players).length,
          canJoin: room.phase === 'LOBBY' || (room.settings.allowLateJoin && room.phase !== 'FINISHED'),
        },
      });
    });

    // ── 참가자 ──
    socket.on('player:join', (p: { code?: string; nickname?: string }, cb: unknown) => {
      const room = rooms.get(p?.code ?? '');
      if (!room) return safe(cb)({ ok: false, error: '게임방을 찾을 수 없습니다' });
      const res = rooms.join(room, p.nickname);
      if (res.ok && res.data) {
        leaveCurrent();
        attachPlayer(room.code, res.data.playerId);
      }
      safe(cb)(res);
    });

    socket.on('player:resume', (p: { code?: string; playerId?: string; token?: string }, cb: unknown) => {
      const room = rooms.get(p?.code ?? '');
      if (!room) return safe(cb)({ ok: false, error: '게임방을 찾을 수 없습니다' });
      const res = rooms.resume(room, String(p.playerId), String(p.token));
      if (res.ok) {
        leaveCurrent();
        attachPlayer(room.code, String(p.playerId));
        socket.emit('state', rooms.publicState(room));
        rooms.emitMe(room, String(p.playerId));
      }
      safe(cb)(res);
    });

    function attachPlayer(code: string, playerId: string) {
      const room = rooms.get(code)!;
      ctx.code = code;
      ctx.playerId = playerId;
      socket.join([`room:${code}`, `p:${playerId}`]);
      rooms.setOnline(room, playerId, 1);
    }

    socket.on('game:action', (action: unknown, cb: unknown) => {
      if (!ctx.code || !ctx.playerId) return safe(cb)({ ok: false, error: '입장 정보가 없습니다' });
      const room = rooms.get(ctx.code);
      if (!room) return safe(cb)({ ok: false, error: '게임방이 없습니다' });
      safe(cb)(rooms.action(room, ctx.playerId, action));
    });

    // ── 대형 스크린 (읽기 전용, 정답 정보 없는 공개 상태만 수신) ──
    socket.on('screen:watch', (p: { code?: string }, cb: unknown) => {
      const room = rooms.get(p?.code ?? '');
      if (!room) return safe(cb)({ ok: false, error: '게임방을 찾을 수 없습니다' });
      leaveCurrent();
      ctx.code = room.code;
      socket.join(`room:${room.code}`);
      socket.emit('state', rooms.publicState(room));
      safe(cb)({ ok: true });
    });

    // ── 관리자 ──
    socket.on('admin:login', (p: { password?: string }, cb: unknown) => {
      const err = checkPassword(socket, p?.password);
      if (err) return safe(cb)(err);
      safe(cb)({
        ok: true,
        data: [...rooms.rooms.values()]
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((r) => ({ code: r.code, title: r.settings.title, phase: r.phase, players: Object.keys(r.players).length, createdAt: r.createdAt, hostToken: r.hostToken })),
      });
    });

    socket.on('admin:createRoom', (p: { password?: string; title?: string }, cb: unknown) => {
      const err = checkPassword(socket, p?.password);
      if (err) return safe(cb)(err);
      const room = rooms.createRoom(p.title);
      safe(cb)({ ok: true, data: { code: room.code, hostToken: room.hostToken } });
    });

    socket.on('admin:deleteRoom', (p: { password?: string; code?: string }, cb: unknown) => {
      const err = checkPassword(socket, p?.password);
      if (err) return safe(cb)(err);
      rooms.deleteRoom(String(p.code));
      safe(cb)({ ok: true });
    });

    socket.on('admin:questions', (p: { password?: string; op?: string; kind?: QuestionBankKind; item?: unknown; id?: string }, cb: unknown) => {
      const err = checkPassword(socket, p?.password);
      if (err) return safe(cb)(err);
      if (p.op === 'add' && p.kind) return safe(cb)(addQuestion(p.kind, p.item));
      if (p.op === 'delete' && p.kind && p.id) return safe(cb)(deleteQuestion(p.kind, p.id));
      safe(cb)({ ok: true, data: listQuestions() });
    });

    socket.on('host:attach', (p: { code?: string; hostToken?: string }, cb: unknown) => {
      const room = rooms.get(p?.code ?? '');
      if (!rooms.checkHost(room, String(p?.hostToken))) return safe(cb)({ ok: false, error: '관리자 인증 실패' });
      leaveCurrent();
      ctx.code = room!.code;
      ctx.host = true;
      socket.join([`room:${room!.code}`, `host:${room!.code}`]);
      socket.emit('state', rooms.publicState(room!));
      socket.emit('host:state', rooms.hostState(room!));
      safe(cb)({ ok: true });
    });

    socket.on('host:cmd', (p: { cmd?: string; [k: string]: any }, cb: unknown) => {
      const done = safe(cb);
      if (!ctx.host || !ctx.code) return done({ ok: false, error: '관리자 인증이 필요합니다' });
      const room = rooms.get(ctx.code);
      if (!room) return done({ ok: false, error: '게임방이 없습니다' });
      try {
        switch (p?.cmd) {
          case 'settings':
            return done(rooms.updateSettings(room, p.settings ?? {}));
          case 'nextGame':
            return done(rooms.nextGame(room, p.gameId));
          case 'startCountdown':
            return done(rooms.startCountdown(room));
          case 'pause':
            return done(rooms.pause(room));
          case 'resume':
            return done(rooms.resumeGame(room));
          case 'forceEnd':
            return done(rooms.forceEnd(room));
          case 'cancelRound':
            return done(rooms.cancelRound(room));
          case 'revealResult':
            return done(rooms.revealResult(room));
          case 'showRanking':
            return done(rooms.showRanking(room));
          case 'finish':
            return done(rooms.finish(room));
          case 'reset':
            return done(rooms.reset(room, !!p.keepPlayers));
          case 'kick':
            return done(rooms.kick(room, String(p.playerId)));
          case 'rename':
            return done(rooms.rename(room, String(p.playerId), p.nickname));
          case 'export':
            return done({ ok: true, data: rooms.exportResults(room) });
          default:
            return done({ ok: false, error: 'unknown command' });
        }
      } catch (e) {
        console.error('[host:cmd]', e);
        done({ ok: false, error: '서버 오류' });
      }
    });

    socket.on('disconnect', () => {
      clearInterval(refill);
      leaveCurrent();
    });
  });
}
