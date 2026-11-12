// 커스텀 서버: Next.js(화면) + Socket.IO(실시간 게임 서버)를 하나의 프로세스에서 실행
import { createServer } from 'http';
import os from 'os';
import next from 'next';
import { Server } from 'socket.io';
import { RoomManager } from './src/server/room';
import { registerSocket } from './src/server/socket';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT || 3000);
// HOST 미지정 시 IPv4(127.0.0.1, 192.168.x.x)와 IPv6(::1) 모두에서 접속을 받음
// (윈도우에서 cloudflared 가 localhost 를 ::1 로 접속하는 경우 대비)
const host = process.env.HOST;

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i!.address}:${port}`);
}

async function main() {
  const app = next({ dev, hostname: host || 'localhost', port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const rooms = new RoomManager(process.env.DATA_DIR || './data');

  const httpServer = createServer((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, rooms: rooms.rooms.size, time: Date.now() }));
      return;
    }
    if (req.url === '/api/server-info') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ lan: lanAddresses(), baseUrl: process.env.NEXT_PUBLIC_BASE_URL || null }));
      return;
    }
    handle(req, res);
  });

  const io = new Server(httpServer, {
    pingInterval: 10_000,
    pingTimeout: 8_000,
    cors: { origin: false },
  });
  rooms.attach(io);
  registerSocket(io, rooms);

  const shutdown = () => {
    console.log('\n상태 저장 후 종료합니다...');
    rooms.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const onListen = () => {
    console.log(`\n🎉 송년회 미니게임 배틀 서버 실행 중 (${dev ? '개발' : '운영'} 모드)`);
    console.log(`   로컬:   http://localhost:${port}`);
    for (const a of lanAddresses()) console.log(`   같은 Wi-Fi: ${a}`);
    console.log(`   관리자: http://localhost:${port}/host\n`);
  };
  if (host) httpServer.listen(port, host, onListen);
  else httpServer.listen(port, onListen); // 듀얼 스택 (:: + 0.0.0.0)
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
