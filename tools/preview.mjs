import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const binExtension = process.platform === 'win32' ? '.cmd' : '';
const electronBin = path.join(rootDir, 'node_modules', '.bin', `electron${binExtension}`);
const childEnv = { ...process.env };

delete childEnv.ELECTRON_RUN_AS_NODE;

const desktop = spawn(electronBin, ['.'], {
  cwd: rootDir,
  stdio: 'inherit',
  env: childEnv
});

desktop.on('exit', (code) => {
  process.exit(code ?? 0);
});
