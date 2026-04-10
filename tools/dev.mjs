import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const binExtension = process.platform === 'win32' ? '.cmd' : '';
const rendererPort = Number(process.env.DOWNLOADIO_RENDERER_PORT ?? '4200');
const rendererUrl = `http://127.0.0.1:${rendererPort}`;
const childEnv = { ...process.env };

delete childEnv.ELECTRON_RUN_AS_NODE;

const ngBin = path.join(rootDir, 'node_modules', '.bin', `ng${binExtension}`);
const electronBin = path.join(rootDir, 'node_modules', '.bin', `electron${binExtension}`);

async function ensureExecutable(filePath) {
  await access(filePath);
  return filePath;
}

async function waitForRenderer(url, maxAttempts = 80) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'text/html' }
      });

      if (response.ok) {
        return;
      }
    } catch {
      // The dev server is still starting. Retry below.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Renderer did not become reachable at ${url}.`);
}

await ensureExecutable(ngBin);
await ensureExecutable(electronBin);

const renderer = spawn(
  ngBin,
  ['serve', '--host', '127.0.0.1', '--port', String(rendererPort)],
  {
    cwd: rootDir,
    stdio: 'inherit',
    env: childEnv
  }
);

let desktop = null;

const terminateChildren = () => {
  if (!renderer.killed) {
    renderer.kill('SIGTERM');
  }

  if (desktop && !desktop.killed) {
    desktop.kill('SIGTERM');
  }
};

process.on('SIGINT', terminateChildren);
process.on('SIGTERM', terminateChildren);
process.on('exit', terminateChildren);

renderer.on('exit', (code) => {
  if (code && code !== 0) {
    process.exit(code);
  }
});

await waitForRenderer(rendererUrl);

desktop = spawn(electronBin, ['.'], {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...childEnv,
    DOWNLOADIO_RENDERER_URL: rendererUrl
  }
});

desktop.on('exit', (code) => {
  terminateChildren();
  process.exit(code ?? 0);
});
