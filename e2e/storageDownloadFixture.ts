import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { connect, type Socket, type AddressInfo } from 'node:net';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** An offline CONNECT proxy serves the exact signed-storage origin. Nothing
 * is sent to Google: every other proxy destination is refused. The browser
 * ignores only this local fixture's self-signed certificate. */
export async function storageDownloadFixture(bytes: Buffer) {
  const directory = mkdtempSync(join(tmpdir(), 'viewer-storage-fixture-'));
  const key = join(directory, 'key.pem'), cert = join(directory, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=storage.googleapis.com', '-keyout', key, '-out', cert], { stdio: 'ignore' });
  const sockets = new Set<Socket>();
  const track = (socket: Socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); };
  const requests: string[] = [];
  const storage = createHttpsServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    requests.push(req.url ?? '');
    res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="signed-fixture.xlsx"' });
    res.end(bytes);
  });
  storage.on('connection', track);
  await new Promise<void>(resolve => storage.listen(0, '127.0.0.1', resolve));
  const port = (storage.address() as AddressInfo).port;
  const proxy = createHttpServer((_req, res) => { res.writeHead(502); res.end(); });
  proxy.on('connection', track);
  proxy.on('connect', (req, client, head) => {
    if (req.url !== 'storage.googleapis.com:443') { client.destroy(); return; }
    const target = connect(port, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) target.write(head);
      target.pipe(client); client.pipe(target);
    });
    track(target);
    target.on('error', () => client.destroy());
    client.on('error', () => target.destroy());
  });
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
  return {
    proxy: { server: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`, bypass: 'localhost,127.0.0.1' },
    requests,
    async close() {
      for (const socket of sockets) socket.destroy();
      await Promise.all([new Promise<void>(resolve => proxy.close(() => resolve())),
        new Promise<void>(resolve => storage.close(() => resolve()))]);
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
