import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';

export type ServerHandle = {
  process: ChildProcess;
  port: number;
  token: string;
  dataDir: string;
};

const DEFAULT_TOKEN = process.env.MCP_TEST_TOKEN || 'devtoken';
const DEFAULT_TIMEOUT = 30000; // 30秒に延長

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('failed to acquire test port'));
        }
      });
    });
  });
}

function waitForPort(port: number, timeoutMs = DEFAULT_TIMEOUT): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tryConnect = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
        socket.end();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`server port ${port} did not open within ${timeoutMs}ms`));
          return;
        }
        setTimeout(tryConnect, 200);
      });
    };
    tryConnect();
  });
}

export async function startIntegrationServer(token = DEFAULT_TOKEN): Promise<ServerHandle> {
  const port = await getAvailablePort();
  const dataDir = path.join(process.cwd(), 'data', `integration-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(dataDir, { recursive: true });

  // 常にdistバンドルを使用して安定性を向上
  const useDistBundle = fs.existsSync(path.join(process.cwd(), 'dist', 'server.js'));
  const entry = useDistBundle
    ? ['dist/server.js']
    : ['node', 'src/server.ts']; // フォールバック

  const env = {
    ...process.env,
    PORT: String(port),
    MCP_TOKEN: token,
    DATA_DIR: dataDir,
    NODE_ENV: 'test', // テスト環境を明示
    AUTO_EXPORT_ON_EXIT: '0',
    EXPORT_DIR: path.join(dataDir, 'snapshots'),
    SHADOW_PATH: path.join(dataDir, 'shadow', 'TODO.shadow.md'),
    CAS_DIR: path.join(dataDir, 'cas'),
  };

  const child = spawn(process.execPath, entry, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal || code === 0) {
      return;
    }
    console.warn(`[integration-server] exited unexpectedly with code ${code}`);
  });

  await waitForPort(port);

  return {
    process: child,
    port,
    token,
    dataDir,
  };
}

export async function stopIntegrationServer(handle: ServerHandle | null | undefined): Promise<void> {
  if (!handle?.process) {
    return;
  }

  const proc = handle.process;
  if (proc.killed) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), 4000);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    proc.kill();
  });
}

export function cleanIntegrationData(handle: ServerHandle | null | undefined): void {
  if (!handle?.dataDir) {
    return;
  }
  try {
    fs.rmSync(handle.dataDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup failures in tests
  }
}