'use client';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/** 참가자 입장 URL + QR 이미지(data URL) */
export function useJoinUrl(code: string, baseOverride?: string | null) {
  const [base, setBase] = useState<string>('');
  const [lan, setLan] = useState<string[]>([]);
  const [qr, setQr] = useState<string>('');

  useEffect(() => {
    const envBase = process.env.NEXT_PUBLIC_BASE_URL;
    let b = envBase || window.location.origin;
    try {
      const saved = localStorage.getItem('party:baseUrl');
      if (saved) b = saved;
    } catch {}
    setBase(b);
    fetch('/api/server-info')
      .then((r) => r.json())
      .then((d) => setLan(d.lan ?? []))
      .catch(() => {});
  }, []);

  const effective = baseOverride || base;
  const url = effective ? `${effective.replace(/\/$/, '')}/join/${code}` : '';

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: 640, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#05050f', light: '#ffffff' } }).then(setQr);
  }, [url]);

  const changeBase = (b: string) => {
    setBase(b);
    try {
      localStorage.setItem('party:baseUrl', b);
    } catch {}
  };

  const isLocal = /localhost|127\.0\.0\.1/.test(effective);
  return { url, qr, base: effective, lan, changeBase, isLocal };
}
