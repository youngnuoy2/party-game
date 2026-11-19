'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { emitAck, getSocket } from '@/lib/socket';
import QuestionManager from './QuestionManager';

interface RoomRow {
  code: string;
  title: string;
  phase: string;
  players: number;
  createdAt: number;
  hostToken: string;
}

export default function HostHome() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [authed, setAuthed] = useState(false);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [title, setTitle] = useState('2026 송년회 미니게임 배틀');
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'rooms' | 'questions'>('rooms');

  const login = async (password: string) => {
    getSocket();
    const r = await emitAck<RoomRow[]>('admin:login', { password });
    if (!r.ok) {
      setErr(r.error ?? '로그인 실패');
      sessionStorage.removeItem('party:adminpw');
      return;
    }
    sessionStorage.setItem('party:adminpw', password);
    setAuthed(true);
    setRooms(r.data ?? []);
    for (const room of r.data ?? []) localStorage.setItem(`party:host:${room.code}`, room.hostToken);
  };

  useEffect(() => {
    const saved = sessionStorage.getItem('party:adminpw');
    if (saved) {
      setPw(saved);
      login(saved);
    }
  }, []);

  const create = async () => {
    const r = await emitAck<{ code: string; hostToken: string }>('admin:createRoom', { password: pw, title });
    if (!r.ok) return setErr(r.error ?? '생성 실패');
    localStorage.setItem(`party:host:${r.data!.code}`, r.data!.hostToken);
    router.push(`/host/${r.data!.code}`);
  };

  const remove = async (code: string) => {
    if (!confirm(`방 ${code} 를 삭제할까요? 모든 기록이 사라집니다.`)) return;
    await emitAck('admin:deleteRoom', { password: pw, code });
    login(pw);
  };

  if (!authed)
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-5">
        <h1 className="text-center font-display text-3xl neon-text">🎤 사회자 로그인</h1>
        <form
          className="card space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            login(pw);
          }}
        >
          <input className="input" type="password" placeholder="관리자 비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          {err && <div className="text-sm text-rose-300">{err}</div>}
          <button className="btn-primary w-full">로그인</button>
        </form>
        <p className="text-center text-xs text-white/40">비밀번호는 서버의 ADMIN_PASSWORD 환경변수로 설정합니다.</p>
      </main>
    );

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-5 py-8">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-3xl neon-text">🎤 사회자 페이지</h1>
        <div className="ml-auto flex gap-2">
          <button className={tab === 'rooms' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('rooms')}>
            게임방
          </button>
          <button className={tab === 'questions' ? 'btn-primary' : 'btn-ghost'} onClick={() => setTab('questions')}>
            문제 관리
          </button>
        </div>
      </div>

      {tab === 'rooms' ? (
        <>
          <section className="card space-y-3 p-5">
            <h2 className="text-xl font-bold">새 게임방 만들기</h2>
            <div className="flex gap-2">
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} placeholder="행사 타이틀" />
              <button className="btn-gold shrink-0" onClick={create}>
                + 방 생성
              </button>
            </div>
          </section>
          <section className="space-y-2">
            <h2 className="text-xl font-bold">게임방 목록</h2>
            {rooms.length === 0 && <div className="text-white/50">아직 만든 방이 없습니다.</div>}
            {rooms.map((r) => (
              <div key={r.code} className="card flex items-center gap-4 p-4">
                <span className="font-display text-3xl tracking-widest text-neon-cyan">{r.code}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{r.title}</div>
                  <div className="text-sm text-white/50">
                    {r.phase} · {r.players}명 · {new Date(r.createdAt).toLocaleString('ko-KR')}
                  </div>
                </div>
                <Link className="btn-primary" href={`/host/${r.code}`}>
                  관리
                </Link>
                <button className="btn-danger" onClick={() => remove(r.code)}>
                  삭제
                </button>
              </div>
            ))}
          </section>
        </>
      ) : (
        <QuestionManager password={pw} />
      )}
    </main>
  );
}
