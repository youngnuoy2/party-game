'use client';
import { GAME_META } from '@/shared/gameMeta';
import type { RankingEntry, RoundResult } from '@/shared/types';

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const esc = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 최종 결과 CSV (엑셀 한글 깨짐 방지 BOM 포함) */
export function downloadCsv(title: string, ranking: RankingEntry[], history: RoundResult[]) {
  const header = ['순위', '닉네임', '누적점수', '라운드1위횟수', ...history.map((h) => `R${h.roundNo} ${GAME_META[h.gameId].name}`)];
  const rows = ranking.map((e) => [
    e.rank,
    e.nickname,
    e.total,
    e.wins,
    ...history.map((h) => {
      const x = h.entries.find((en) => en.playerId === e.playerId);
      return x ? `${x.score}` : '-';
    }),
  ]);
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
  const date = new Date().toISOString().slice(0, 10);
  download(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), `${title}_결과_${date}.csv`);
}

/** 최종 순위 이미지(PNG) - 캔버스에 직접 그려서 생성 */
export function downloadImage(title: string, ranking: RankingEntry[]) {
  const rows = ranking.slice(0, 20);
  const W = 1080;
  const H = 380 + rows.length * 72 + 80;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0a0a1f');
  bg.addColorStop(0.5, '#1c1240');
  bg.addColorStop(1, '#05050f');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const font = (w: number, s: number) => `${w} ${s}px Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
  g.textAlign = 'center';
  g.fillStyle = '#fbbf24';
  g.font = font(900, 64);
  g.fillText('🏆 최종 결과', W / 2, 120);
  g.fillStyle = '#e2e8f0';
  g.font = font(700, 40);
  g.fillText(title, W / 2, 185);
  g.fillStyle = 'rgba(255,255,255,.5)';
  g.font = font(400, 26);
  g.fillText(new Date().toLocaleString('ko-KR'), W / 2, 235);
  let y = 320;
  for (const e of rows) {
    const top = e.rank <= 3;
    g.fillStyle = top ? 'rgba(251,191,36,.15)' : 'rgba(255,255,255,.05)';
    g.beginPath();
    g.roundRect(60, y - 48, W - 120, 62, 16);
    g.fill();
    g.textAlign = 'left';
    g.fillStyle = top ? '#fbbf24' : '#94a3b8';
    g.font = font(900, 36);
    g.fillText(e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : `${e.rank}`, 90, y);
    g.fillStyle = '#ffffff';
    g.font = font(700, 34);
    g.fillText(e.nickname, 200, y);
    g.textAlign = 'right';
    g.fillStyle = top ? '#fde68a' : '#cbd5e1';
    g.fillText(`${e.total.toLocaleString()}점`, W - 90, y);
    y += 72;
  }
  g.textAlign = 'center';
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.font = font(400, 22);
  g.fillText('송년회 랜덤 미니게임 배틀', W / 2, H - 36);
  c.toBlob((b) => b && download(b, `${title}_최종순위.png`), 'image/png');
}
