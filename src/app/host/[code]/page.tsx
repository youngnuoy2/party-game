'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { ConnDot, cx, GameBadge, RankChange, SecondsLeft, useToast, Toast } from '@/components/ui';
import { downloadCsv, downloadImage } from '@/lib/export';
import { emitAck } from '@/lib/socket';
import { useJoinUrl } from '@/lib/useJoinUrl';
import { useServerNow } from '@/lib/useNow';
import { useOnConnect, useRoomStreams } from '@/lib/useRoom';
import { ALL_GAME_IDS, GAME_META, TIE_RULE } from '@/shared/gameMeta';
import type { GameId, PublicState, RankingEntry, RoomSettings, RoundResult } from '@/shared/types';

const PHASE_LABEL: Record<string, string> = {
  LOBBY: '🟢 대기실 (입장 중)',
  GAME_INTRO: '📢 게임 소개',
  COUNTDOWN: '⏱ 카운트다운',
  PLAYING: '🎮 게임 진행 중',
  CALCULATING: '🧮 집계 완료 (공개 대기)',
  ROUND_RESULT: '🏁 라운드 결과 공개',
  TOTAL_RANKING: '📊 누적 순위 공개',
  FINISHED: '🏆 대회 종료',
};

export default function HostConsole({ params }: { params: Promise<{ code: string }> }) {
  const code = use(params).code.toUpperCase();
  const { state, host, connected } = useRoomStreams();
  const [auth, setAuth] = useState<'pending' | 'ok' | 'fail'>('pending');
  const { msg, show } = useToast();
  const join = useJoinUrl(code);

  useOnConnect(() => {
    const hostToken = localStorage.getItem(`party:host:${code}`);
    if (!hostToken) return setAuth('fail');
    emitAck('host:attach', { code, hostToken }).then((r) => setAuth(r.ok ? 'ok' : 'fail'));
  }, [code]);

  const cmd = async (c: string, extra: Record<string, unknown> = {}, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    const r = await emitAck('host:cmd', { cmd: c, ...extra });
    if (!r.ok) show(`⚠️ ${r.error}`);
    return r;
  };

  if (auth === 'fail')
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <div>관리자 인증 정보가 없습니다.</div>
        <Link href="/host" className="btn-primary">
          사회자 로그인
        </Link>
      </main>
    );
  if (!state) return <main className="flex min-h-dvh items-center justify-center text-white/60">불러오는 중...</main>;

  const doExport = async (kind: 'csv' | 'png') => {
    const r = await cmd('export');
    if (!r?.ok) return;
    const d = r.data as { title: string; ranking: RankingEntry[]; history: RoundResult[] };
    if (kind === 'csv') downloadCsv(d.title, d.ranking, d.history);
    else downloadImage(d.title, d.ranking);
  };

  return (
    <div className="mx-auto grid min-h-dvh max-w-[1600px] gap-4 p-4 lg:grid-cols-[340px_1fr_380px]">
      {/* ── 왼쪽: QR / 참가자 ── */}
      <aside className="space-y-4">
        <div className="card space-y-3 p-4">
          <div className="flex items-center gap-2">
            <ConnDot connected={connected} />
            <span className="font-display text-2xl tracking-widest text-neon-cyan">{code}</span>
            <Link href="/host" className="ml-auto text-xs text-white/40 underline">
              방 목록
            </Link>
          </div>
          {join.qr && <img src={join.qr} alt="입장 QR" className="w-full rounded-2xl bg-white p-2" />}
          <div className="break-all rounded-xl bg-white/5 p-2 text-center text-sm">{join.url}</div>
          {join.isLocal && (
            <div className="space-y-2 rounded-xl border border-amber-300/30 bg-amber-300/10 p-2 text-xs text-amber-100">
              ⚠️ localhost 주소는 휴대폰에서 접속할 수 없습니다. 아래 주소 중 하나를 선택하거나 배포 주소를 입력하세요.
              <div className="flex flex-wrap gap-1">
                {join.lan.map((l) => (
                  <button key={l} className="chip text-xs" onClick={() => join.changeBase(l)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
          <BaseUrlEditor base={join.base} onChange={join.changeBase} />
          <a href={`/screen/${code}`} target="_blank" className="btn-gold w-full">
            📺 대형 스크린 열기 (새 창)
          </a>
        </div>
        <PlayerPanel state={state} host={host} cmd={cmd} />
      </aside>

      {/* ── 가운데: 진행 컨트롤 ── */}
      <main className="space-y-4">
        <div className="card p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl">{state.settings.title}</h1>
            <span className="chip">{PHASE_LABEL[state.phase]}</span>
            <span className="chip">
              라운드 {state.roundNo} / {state.settings.totalRounds}
            </span>
            {state.paused && <span className="chip border-amber-300/50 text-amber-200">⏸ 일시정지</span>}
          </div>
          <PhaseControls state={state} cmd={cmd} />
        </div>
        <LiveStatus state={state} />
        <SettingsPanel state={state} cmd={cmd} />
        <div className="card flex flex-wrap gap-2 p-4">
          <span className="mr-2 self-center font-bold">결과 다운로드</span>
          <button className="btn-ghost" onClick={() => doExport('csv')}>
            📄 CSV (엑셀)
          </button>
          <button className="btn-ghost" onClick={() => doExport('png')}>
            🖼️ 순위 이미지
          </button>
          <div className="ml-auto flex gap-2">
            <button className="btn-danger" onClick={() => cmd('reset', { keepPlayers: true }, '점수와 라운드 기록을 모두 초기화할까요? (참가자는 유지)')}>
              점수 초기화
            </button>
            <button className="btn-danger" onClick={() => cmd('reset', { keepPlayers: false }, '참가자까지 모두 내보내고 전체 초기화할까요?')}>
              전체 초기화
            </button>
          </div>
        </div>
      </main>

      {/* ── 오른쪽: 순위 ── */}
      <aside className="space-y-4">
        <div className="card p-4">
          <h2 className="mb-2 font-bold">📊 누적 순위</h2>
          <div className="max-h-[70vh] space-y-1 overflow-y-auto scrollbar-thin">
            {state.ranking.map((e) => (
              <div key={e.playerId} className={cx('flex items-center gap-2 rounded-lg px-2 py-1 text-sm', e.rank <= 3 && 'bg-amber-300/10')}>
                <span className="w-7 text-right font-bold">{e.rank}</span>
                <span className="flex-1 truncate">{e.nickname}</span>
                <RankChange prev={e.prevRank} now={e.rank} className="text-xs" />
                <span className="w-16 text-right tabular-nums">{e.total}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-white/40">{TIE_RULE}</p>
        </div>
      </aside>
      <Toast msg={msg} />
    </div>
  );
}

function BaseUrlEditor({ base, onChange }: { base: string; onChange: (b: string) => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(base);
  useEffect(() => setV(base), [base]);
  if (!open)
    return (
      <button className="text-xs text-white/40 underline" onClick={() => setOpen(true)}>
        QR 주소 직접 변경
      </button>
    );
  return (
    <div className="flex gap-1">
      <input className="input py-1 text-sm" value={v} onChange={(e) => setV(e.target.value)} />
      <button
        className="btn-ghost px-3 py-1 text-sm"
        onClick={() => {
          onChange(v.trim());
          setOpen(false);
        }}
      >
        적용
      </button>
    </div>
  );
}

type Cmd = (c: string, extra?: Record<string, unknown>, confirmMsg?: string) => Promise<any>;

function PhaseControls({ state, cmd }: { state: PublicState; cmd: Cmd }) {
  const [manual, setManual] = useState<GameId | ''>('');
  const done = state.roundNo >= state.settings.totalRounds && ['ROUND_RESULT', 'TOTAL_RANKING'].includes(state.phase);
  const canNext = ['LOBBY', 'ROUND_RESULT', 'TOTAL_RANKING'].includes(state.phase) && !done;
  const playing = state.phase === 'PLAYING';
  const pausable = state.phase === 'COUNTDOWN' || (playing && state.game?.pausable);

  return (
    <div className="mt-4 space-y-4">
      {/* 주 진행 버튼 */}
      <div className="flex flex-wrap gap-3">
        {canNext && (
          <button className="btn-gold px-8 py-5 text-2xl" onClick={() => cmd('nextGame', manual ? { gameId: manual } : {})}>
            🎲 {state.phase === 'LOBBY' ? '게임 시작' : '다음 게임'} {manual ? `(${GAME_META[manual].name})` : '(랜덤)'}
          </button>
        )}
        {done && (
          <button className="btn-gold px-8 py-5 text-2xl" onClick={() => cmd('finish', {}, '최종 결과를 발표할까요?')}>
            🏆 최종 결과 발표
          </button>
        )}
        {state.phase === 'GAME_INTRO' && (
          <>
            <button className="btn-gold px-8 py-5 text-2xl" onClick={() => cmd('startCountdown')}>
              ▶ 3초 카운트다운 시작
            </button>
            <button className="btn-ghost" onClick={() => cmd('nextGame')}>
              🔀 다른 게임으로 바꾸기
            </button>
          </>
        )}
        {state.phase === 'CALCULATING' && (
          <button className="btn-gold px-8 py-5 text-2xl" onClick={() => cmd('revealResult')}>
            🥁 라운드 결과 공개
          </button>
        )}
        {state.phase === 'ROUND_RESULT' && (
          <button className="btn-primary px-8 py-5 text-2xl" onClick={() => cmd('showRanking')}>
            📊 누적 순위 공개
          </button>
        )}
        {pausable && !state.paused && (
          <button className="btn-ghost" onClick={() => cmd('pause')}>
            ⏸ 일시정지
          </button>
        )}
        {state.paused && (
          <button className="btn-primary" onClick={() => cmd('resume')}>
            ▶ 재개
          </button>
        )}
        {playing && (
          <button className="btn-danger" onClick={() => cmd('forceEnd', {}, '지금까지의 기록으로 게임을 종료하고 집계할까요?')}>
            ⏹ 강제 종료(집계)
          </button>
        )}
        {['GAME_INTRO', 'COUNTDOWN', 'PLAYING'].includes(state.phase) && (
          <button className="btn-danger" onClick={() => cmd('cancelRound', {}, '이번 라운드를 취소할까요? (점수 미반영)')}>
            ✖ 라운드 취소
          </button>
        )}
        {state.phase !== 'FINISHED' && !done && state.phase !== 'LOBBY' && (
          <button className="btn-danger ml-auto" onClick={() => cmd('finish', {}, '남은 라운드를 건너뛰고 대회를 종료할까요?')}>
            🏁 대회 종료
          </button>
        )}
      </div>

      {/* 다음 게임 직접 선택 */}
      {(canNext || state.phase === 'GAME_INTRO') && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-white/60">다음 게임:</span>
          <button className={cx('chip', !manual && 'border-neon-blue bg-neon-blue/20')} onClick={() => setManual('')}>
            🎲 랜덤
          </button>
          {state.settings.enabledGames.map((g) => (
            <button
              key={g}
              className={cx('chip', manual === g && 'border-neon-blue bg-neon-blue/20')}
              onClick={() => {
                setManual(g);
                if (state.phase === 'GAME_INTRO') cmd('nextGame', { gameId: g });
              }}
            >
              {GAME_META[g].emoji} {GAME_META[g].name}
              {state.playedGames.includes(g) && <span className="text-white/40">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LiveStatus({ state }: { state: PublicState }) {
  const now = useServerNow(250);
  const g = state.game;
  return (
    <div className="card grid gap-4 p-5 md:grid-cols-2">
      <div className="space-y-3">
        {state.gameId ? <GameBadge gameId={state.gameId} size="lg" /> : <div className="text-white/50">아직 선택된 게임이 없습니다</div>}
        {state.phase === 'PLAYING' && g && (
          <div className="space-y-1 text-lg">
            <div>
              단계: {g.stepIndex + 1}/{g.stepCount} ({g.stepKind === 'reveal' ? '정답 공개' : g.stepKind === 'question' ? '문제 풀이' : '플레이'})
            </div>
            <div>
              남은 시간: <SecondsLeft endsAt={g.stepEndsAt} paused={state.paused} pausedRemain={state.pausedRemainMs} className="font-bold" />
              {state.phaseEndsAt && <span className="text-sm text-white/50"> (전체 약 {Math.max(0, Math.ceil((state.phaseEndsAt - now) / 1000))}초)</span>}
            </div>
            <div>
              제출/진행: <b>{state.submitted}</b> / {state.participantCount}명
            </div>
          </div>
        )}
        {state.phase === 'GAME_INTRO' && state.gameId && (
          <ul className="space-y-1 text-white/80">
            {GAME_META[state.gameId].howTo.map((h) => (
              <li key={h}>• {h}</li>
            ))}
            <li className="text-sm text-white/50">점수: {GAME_META[state.gameId].scoring}</li>
          </ul>
        )}
      </div>
      <div>
        {state.phase === 'PLAYING' && state.liveBoard.length > 0 && (
          <>
            <h3 className="mb-2 font-bold">실시간 TOP 5</h3>
            {state.liveBoard.map((r, i) => (
              <div key={r.nickname + i} className="flex justify-between border-b border-white/5 py-1">
                <span>
                  {i + 1}. {r.nickname}
                </span>
                <span className="tabular-nums">{r.value}</span>
              </div>
            ))}
          </>
        )}
        {state.roundResult && ['ROUND_RESULT', 'TOTAL_RANKING'].includes(state.phase) && (
          <>
            <h3 className="mb-2 font-bold">라운드 {state.roundResult.roundNo} TOP 5</h3>
            {state.roundResult.entries.slice(0, 5).map((e) => (
              <div key={e.playerId} className="flex justify-between border-b border-white/5 py-1">
                <span>
                  {e.rank}. {e.nickname} <span className="text-xs text-white/40">{e.metric}</span>
                </span>
                <span className="tabular-nums">+{e.score}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function SettingsPanel({ state, cmd }: { state: PublicState; cmd: Cmd }) {
  const s = state.settings;
  const save = (patch: Partial<RoomSettings>) => cmd('settings', { settings: patch });
  const [title, setTitle] = useState(s.title);
  useEffect(() => setTitle(s.title), [s.title]);
  const toggleGame = (g: GameId) => {
    const list = s.enabledGames.includes(g) ? s.enabledGames.filter((x) => x !== g) : [...s.enabledGames, g];
    save({ enabledGames: list });
  };
  return (
    <details className="card p-5" open={state.phase === 'LOBBY'}>
      <summary className="cursor-pointer text-lg font-bold">⚙️ 대회 설정</summary>
      <div className="mt-4 space-y-4">
        <div className="flex gap-2">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} />
          <button className="btn-ghost shrink-0" onClick={() => save({ title })}>
            타이틀 저장
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-28 text-white/70">전체 라운드</span>
          {[3, 5, 8, 10, 15].map((n) => (
            <button key={n} className={cx('chip', s.totalRounds === n && 'border-neon-blue bg-neon-blue/20')} onClick={() => save({ totalRounds: n })}>
              {n}라운드
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={30}
            className="input w-24 py-1"
            value={s.totalRounds}
            onChange={(e) => save({ totalRounds: Number(e.target.value) })}
          />
        </div>
        <div>
          <div className="mb-2 text-white/70">사용할 게임 (랜덤 선택 대상)</div>
          <div className="flex flex-wrap gap-2">
            {ALL_GAME_IDS.map((g) => (
              <button key={g} className={cx('chip', s.enabledGames.includes(g) ? 'border-emerald-400/60 bg-emerald-400/15' : 'opacity-40')} onClick={() => toggleGame(g)}>
                {s.enabledGames.includes(g) ? '✅' : '⬜'} {GAME_META[g].emoji} {GAME_META[g].name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-28 text-white/70">사칙연산 난이도</span>
          {(['easy', 'normal', 'hard'] as const).map((d) => (
            <button key={d} className={cx('chip', s.mathDifficulty === d && 'border-neon-blue bg-neon-blue/20')} onClick={() => save({ mathDifficulty: d })}>
              {{ easy: '쉬움', normal: '보통', hard: '어려움' }[d]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={s.allowLateJoin} onChange={(e) => save({ allowLateJoin: e.target.checked })} className="h-5 w-5" />
          <span>게임 중간 참가 허용</span>
        </label>
      </div>
    </details>
  );
}

function PlayerPanel({ state, host, cmd }: { state: PublicState; host: ReturnType<typeof useRoomStreams>['host']; cmd: Cmd }) {
  const players = host?.players ?? state.players;
  const [q, setQ] = useState('');
  const list = players.filter((p) => p.nickname.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center">
        <h2 className="font-bold">
          👥 참가자 {state.playerCount}명 <span className="text-sm text-emerald-300">(접속 {state.connectedCount})</span>
        </h2>
      </div>
      <input className="input mb-2 py-2 text-sm" placeholder="닉네임 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-[45vh] space-y-1 overflow-y-auto scrollbar-thin">
        {list.map((p) => (
          <div key={p.id} className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/5">
            <ConnDot connected={p.connected} />
            <span className="flex-1 truncate text-sm">{p.nickname}</span>
            <button
              className="text-xs text-white/40 hover:text-white"
              onClick={() => {
                const n = prompt('새 닉네임', p.nickname);
                if (n && n !== p.nickname) cmd('rename', { playerId: p.id, nickname: n });
              }}
            >
              수정
            </button>
            <button className="text-xs text-rose-300/70 hover:text-rose-300" onClick={() => cmd('kick', { playerId: p.id }, `${p.nickname} 님을 강퇴할까요?`)}>
              강퇴
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
