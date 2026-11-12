// 헤드리스 통합 테스트: 실제 Socket.IO 서버 + 봇 30명이 모든 게임을 1라운드씩 플레이
// 실행: npm run sim   (Next.js 없이 게임 서버만 띄워 검증)
import fs from 'fs';
import { createServer } from 'http';
import os from 'os';
import path from 'path';
import { Server } from 'socket.io';
import { io as ioc, type Socket } from 'socket.io-client';
import { ALL_GAME_IDS } from '../src/shared/gameMeta';
import type { Ack, MeState, PublicState } from '../src/shared/types';

const BOTS = Number(process.env.BOTS || 30);
// SIM_GAMES=nonsense,chosung,ox 처럼 일부 게임만 테스트 가능
const GAME_IDS = (process.env.SIM_GAMES ? process.env.SIM_GAMES.split(',') : ALL_GAME_IDS) as typeof ALL_GAME_IDS;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'party-sim-'));
process.env.DATA_DIR = tmp;
process.env.ADMIN_PASSWORD = 'test-pw';

let failures = 0;
const assert = (cond: unknown, msg: string) => {
  if (!cond) {
    failures++;
    console.error('  ❌', msg);
  } else console.log('  ✅', msg);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const emit = <T = any>(s: Socket, ev: string, data?: unknown) =>
  new Promise<Ack<T>>((res) => s.emit(ev, data, (r: Ack<T>) => res(r)));

async function main() {
  const { RoomManager } = await import('../src/server/room');
  const { registerSocket } = await import('../src/server/socket');
  const http = createServer();
  const io = new Server(http);
  const rooms = new RoomManager(tmp);
  rooms.attach(io);
  registerSocket(io, rooms);
  await new Promise<void>((r) => http.listen(0, r));
  const port = (http.address() as any).port;
  const url = `http://127.0.0.1:${port}`;
  const connect = () => ioc(url, { transports: ['websocket'], forceNew: true });

  console.log('▶ 관리자 인증 / 방 생성');
  const admin = connect();
  const bad = await emit(admin, 'admin:createRoom', { password: 'wrong' });
  assert(!bad.ok, '잘못된 비밀번호 거부');
  const created = await emit<{ code: string; hostToken: string }>(admin, 'admin:createRoom', { password: 'test-pw', title: '테스트 송년회' });
  assert(created.ok, '방 생성');
  const { code, hostToken } = created.data!;
  const badHost = await emit(connect(), 'host:attach', { code, hostToken: 'nope' });
  assert(!badHost.ok, '잘못된 hostToken 거부');
  const hostAttach = await emit(admin, 'host:attach', { code, hostToken });
  assert(hostAttach.ok, '관리자 연결');
  const cmd = (c: string, extra: object = {}) => emit(admin, 'host:cmd', { cmd: c, ...extra });

  console.log('▶ 참가자 입장');
  type Bot = { s: Socket; id: string; token: string; nick: string; me: MeState | null; state: PublicState | null; skill: number };
  const bots: Bot[] = [];
  for (let i = 0; i < BOTS; i++) {
    const s = connect();
    const nick = `봇${i + 1}`;
    const r = await emit<{ playerId: string; token: string }>(s, 'player:join', { code, nickname: nick });
    if (!r.ok) throw new Error('join failed ' + r.error);
    const bot: Bot = { s, id: r.data!.playerId, token: r.data!.token, nick, me: null, state: null, skill: Math.random() };
    s.on('me', (m) => (bot.me = m));
    s.on('state', (st) => (bot.state = st));
    bots.push(bot);
  }
  const dup = await emit(connect(), 'player:join', { code, nickname: ' 봇1 ' });
  assert(!dup.ok, '닉네임 중복 거부');
  const screen = connect();
  let screenState: PublicState | null = null;
  screen.on('state', (s) => (screenState = s));
  await emit(screen, 'screen:watch', { code });
  await sleep(200);
  assert(screenState!.playerCount === BOTS, `대기실 인원 ${BOTS}명 동기화`);

  // 재접속 테스트: 소켓을 끊고 새 소켓으로 resume
  const b0 = bots[0];
  b0.s.disconnect();
  const s2 = connect();
  s2.on('me', (m) => (b0.me = m));
  s2.on('state', (st) => (b0.state = st));
  const resumed = await emit(s2, 'player:resume', { code, playerId: b0.id, token: b0.token });
  assert(resumed.ok, '새로고침 후 재접속(resume) 성공');
  const forged = await emit(connect(), 'player:resume', { code, playerId: b0.id, token: 'forged' });
  assert(!forged.ok, '위조 토큰 재접속 거부');
  b0.s = s2;

  const notHost = await emit(bots[1].s, 'host:cmd', { cmd: 'nextGame' });
  assert(!notHost.ok, '참가자의 관리자 명령 거부');

  await cmd('settings', { settings: { totalRounds: GAME_IDS.length, enabledGames: GAME_IDS } });

  // ───── 봇 플레이 로직 ─────
  const act = (b: Bot, a: object) => emit(b.s, 'game:action', a);
  const play = async (gameId: string) => {
    const tasks = bots.map(async (b, bi) => {
      const st = () => b.state!;
      const isOn = () => st().phase === 'PLAYING';
      if (gameId === 'tap') {
        let c = 0;
        while (isOn()) {
          c += Math.floor(3 + b.skill * 4);
          await act(b, { type: 'tap', count: c });
          await sleep(300);
        }
      } else if (['math', 'color', 'compare', 'sense', 'order', 'typing'].includes(gameId)) {
        while (isOn()) {
          const v = b.me?.view;
          if (v?.q) {
            const n = v.q.choices.length;
            const choice =
              gameId === 'typing'
                ? Math.random() < b.skill ? ` ${v.q.text}  ` : '오타'
                : gameId === 'order'
                  ? [0, 1, 2, 3].sort(() => Math.random() - 0.5).join('')
                  : Math.floor(Math.random() * n);
            const r = await act(b, { type: 'answer', qid: v.q.id, choice });
            if (r.ok) b.me = { ...b.me!, view: r.data };
          }
          await sleep(250 + (1 - b.skill) * 600);
        }
      } else if (['nonsense', 'chosung', 'ox'].includes(gameId)) {
        let lastIdx = -1;
        while (isOn()) {
          const g = st().game;
          if (g && g.stepKind === 'question' && g.payload.index !== lastIdx) {
            lastIdx = g.payload.index;
            await sleep(300 + Math.random() * 1500);
            const r = g.payload.choices
              ? await act(b, { type: 'answer', index: lastIdx, choice: Math.floor(Math.random() * g.payload.choices.length) })
              : await act(b, { type: 'answer', index: lastIdx, choice: null, text: Math.random() < 0.5 ? '모름' : '아이 스크림' });
            if (bi === 0) {
              const again = await act(b, { type: 'answer', index: lastIdx, choice: 0 });
              assert(!again.ok, `[${gameId}] 중복 제출 차단`);
            }
            if (!r.ok && bi < 3) console.log('   answer err', r.error);
          }
          await sleep(100);
        }
      } else if (gameId === 'reaction') {
        for (let attempt = 0; attempt < 3 && isOn(); attempt++) {
          const go = new Promise<void>((res) => b.s.once('game:push', () => res()));
          await act(b, { type: 'ready', attempt });
          if (bi === 1 && attempt === 0) {
            const r = await act(b, { type: 'hit', attempt, ms: 5 }); // 신호 전 hit → 반칙
            assert(r.ok && (r.data as any).result === 'foul', '[reaction] 신호 전 터치 반칙 처리');
            continue;
          }
          await go;
          const ms = 180 + Math.floor((1 - b.skill) * 200);
          await sleep(ms);
          await act(b, { type: 'hit', attempt, ms: bi === 2 ? 1 : ms }); // 봇3: 1ms 조작 시도
          await sleep(300);
        }
      } else if (gameId === 'target') {
        while (isOn()) {
          const t = b.me?.view?.t;
          if (t) {
            await sleep(200 + (1 - b.skill) * 500);
            const r = await act(b, Math.random() < 0.15 ? { type: 'miss' } : { type: 'hit', id: t.id });
            if (r.ok) b.me = { ...b.me!, view: r.data };
          } else await sleep(100);
          if (bi === 0 && t) {
            const fast = await act(b, { type: 'hit', id: (b.me?.view as any)?.t?.id }); // 등장 즉시 명중 시도
            assert(!fast.ok, '[target] 등장 직후(150ms 미만) 명중 차단');
            break;
          }
        }
      } else if (gameId === 'shape') {
        while (isOn()) {
          const v = b.me?.view;
          if (v?.q) {
            const r = await act(b, { type: 'answer', qid: v.q.id, choice: Math.floor(Math.random() * 4) });
            if (r.ok) b.me = { ...b.me!, view: r.data };
          }
          await sleep(400 + (1 - b.skill) * 600);
        }
      } else if (gameId === 'cups') {
        let lastIdx = -1;
        while (isOn()) {
          const g = st().game;
          if (g && g.stepKind === 'question' && g.payload.index !== lastIdx) {
            lastIdx = g.payload.index;
            await sleep(200 + Math.random() * 1500);
            await act(b, { type: 'answer', index: lastIdx, choice: Math.floor(Math.random() * g.payload.n) });
          }
          await sleep(100);
        }
      } else if (gameId === 'stop10') {
        const g = st().game!;
        const wait = 10_000 + (Math.random() - 0.5) * 3000 * (1 - b.skill) - (Date.now() - g.stepStartedAt);
        await sleep(Math.max(0, wait));
        const r = await act(b, { type: 'stop', elapsed: Date.now() - g.stepStartedAt });
        if (bi === 0) {
          const again = await act(b, { type: 'stop', elapsed: 10000 });
          assert(r.ok && !again.ok, '[stop10] 두 번 누르기 차단');
        }
        if (bi === 1) void 0;
      } else if (gameId === 'rhythm') {
        const g = st().game!;
        const beats: number[] = g.payload.beats;
        let i = 0;
        while (isOn() && i < beats.length) {
          const el = Date.now() - g.stepStartedAt;
          const due: number[] = [];
          while (i < beats.length && beats[i] <= el) {
            due.push(beats[i] + Math.round((Math.random() - 0.5) * 2 * (40 + (1 - b.skill) * 160)));
            i++;
          }
          const times = bi === 2 ? [el + 5000] : due.sort((x, y) => x - y); // 봇3: 미래 시각 조작
          if (times.length) await act(b, { type: 'taps', times });
          await sleep(300);
        }
      } else if (gameId === 'memory') {
        while (isOn()) {
          const r = await act(b, { type: 'next' });
          if (!r.ok) break;
          const digits = (r.data as any).digits as string;
          await sleep(3000);
          const fail = Math.random() > 0.6 + b.skill * 0.35;
          const res = await act(b, { type: 'answer', value: fail ? '0' : digits });
          if (!res.ok || (res.data as any).done) break;
        }
      }
    });
    await Promise.all(tasks);
  };

  const waitPhase = async (phase: string, timeout = 120_000) => {
    const t0 = Date.now();
    while (screenState!.phase !== phase) {
      if (Date.now() - t0 > timeout) throw new Error(`timeout waiting ${phase} (now ${screenState!.phase})`);
      await sleep(50);
    }
  };

  const played: string[] = [];
  for (let round = 1; round <= GAME_IDS.length; round++) {
    const r = await cmd('nextGame');
    assert(r.ok, `라운드 ${round}: 랜덤 게임 선택`);
    await waitPhase('GAME_INTRO');
    const gid = screenState!.gameId!;
    assert(!played.includes(gid), `라운드 ${round}: ${gid} (한 사이클 내 중복 없음)`);
    played.push(gid);
    await cmd('startCountdown');
    await waitPhase('PLAYING');
    // 화면/참가자에 정답 정보 누출 여부 검사
    const leak = JSON.stringify(screenState!.game);
    assert(!/correctIndex|"answer"|accepted/.test(leak), `[${gid}] 공개 상태에 정답 정보 없음`);
    const t0 = Date.now();
    await play(gid);
    await waitPhase('CALCULATING');
    if (gid === 'stop10') {
      const took = Date.now() - t0;
      assert(took < 14_000, `[stop10] 전원 STOP 시 조기 종료 (${Math.round(took / 1000)}초)`);
    }
    if (['nonsense', 'chosung', 'ox'].includes(gid)) {
      const full = { nonsense: 3 * 14, chosung: 3 * 19, ox: 5 * 9.5 }[gid as 'ox']! * 1000;
      const took = Date.now() - t0;
      assert(took < full * 0.75, `[${gid}] 전원 제출 시 조기 진행 (${Math.round(took / 1000)}초 / 최대 ${full / 1000}초)`);
    }
    // 종료 후 제출 차단
    const late = await act(bots[5], { type: 'answer', qid: 1, choice: 0, index: 0 });
    assert(!late.ok, `[${gid}] 종료 후 제출 차단`);
    await cmd('revealResult');
    await waitPhase('ROUND_RESULT');
    const rr = screenState!.roundResult!;
    assert(rr.entries.length === BOTS, `[${gid}] 결과 ${rr.entries.length}명`);
    assert(rr.entries.every((e) => e.score >= 0 && e.score <= 1000), `[${gid}] 점수 0~1000 범위`);
    assert(rr.entries[0].rank === 1, `[${gid}] 1위 존재 (${rr.entries[0].nickname} ${rr.entries[0].score}점, ${rr.entries[0].metric})`);
    const sorted = rr.entries.every((e, i, a) => i === 0 || a[i - 1].score >= e.score);
    assert(sorted, `[${gid}] 점수 내림차순 정렬`);
    if (gid === 'rhythm') {
      const cheat = rr.entries.find((e) => e.nickname === '봇3')!;
      assert(cheat.score === 0, `[rhythm] 미래 시각 터치 조작 무효 (${cheat.metric})`);
    }
    if (gid === 'reaction') {
      const cheat = rr.entries.find((e) => e.nickname === '봇3')!;
      assert(!cheat.metric.includes(' 1ms'), `[reaction] 1ms 조작 차단 (${cheat.metric})`);
    }
    const again = await cmd('revealResult');
    assert(!again.ok, `[${gid}] 결과 중복 반영 차단`);
    await cmd('showRanking');
    await waitPhase('TOTAL_RANKING');
  }

  const ranking = screenState!.ranking;
  assert(ranking.length === BOTS, '누적 랭킹 인원');
  assert(ranking.every((e, i, a) => i === 0 || a[i - 1].total >= e.total), '누적 랭킹 정렬');
  const over = await cmd('nextGame');
  assert(!over.ok, '설정한 라운드 수 초과 시 다음 게임 차단');

  // 복구 테스트: 저장 파일로 새 RoomManager 를 만들어 동일 점수 확인
  rooms.flushAll();
  const restored = JSON.parse(fs.readFileSync(path.join(tmp, 'rooms', `${code}.json`), 'utf8'));
  const totalsMatch = ranking.every((e) => restored.players[e.playerId]?.total === e.total);
  assert(totalsMatch, '디스크 저장 상태와 누적 점수 일치 (재시작 복구 가능)');

  await cmd('finish');
  await waitPhase('FINISHED');
  console.log('\n🏆 최종 TOP 3');
  for (const e of screenState!.ranking.slice(0, 3)) console.log(`   ${e.rank}위 ${e.nickname} ${e.total}점 (라운드 1위 ${e.wins}회)`);

  io.close();
  http.close();
  rooms.shutdown();
  console.log(failures ? `\n❌ 실패 ${failures}건` : '\n✅ 모든 시뮬레이션 검증 통과');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
