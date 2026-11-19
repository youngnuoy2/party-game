'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ALL_GAME_IDS, GAME_META } from '@/shared/gameMeta';

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState('');
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-5 py-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <div className="mb-3 text-6xl floaty">🎉</div>
        <h1 className="font-display text-4xl leading-tight neon-text">
          송년회
          <br />
          <span className="gold-text">랜덤 미니게임 배틀</span>
        </h1>
        <p className="mt-3 text-white/60">QR코드를 스캔하거나 방 코드를 입력하세요</p>
      </motion.div>

      <form
        className="card w-full space-y-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) router.push(`/join/${code.trim().toUpperCase()}`);
        }}
      >
        <input
          className="input text-center font-display text-3xl uppercase tracking-[0.4em]"
          placeholder="방 코드"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoCapitalize="characters"
        />
        <button className="btn-primary w-full py-4 text-xl" disabled={!code.trim()}>
          입장하기
        </button>
      </form>

      <div className="flex flex-wrap justify-center gap-2">
        {ALL_GAME_IDS.map((id) => (
          <span key={id} className="chip">
            {GAME_META[id].emoji} {GAME_META[id].name}
          </span>
        ))}
      </div>

      <Link href="/host" className="text-sm text-white/40 underline underline-offset-4">
        사회자(관리자) 페이지
      </Link>
    </main>
  );
}
