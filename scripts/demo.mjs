// Lance la passerelle (port 3000) et la boutique de démo (port 4000) en une commande.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

if (!fs.existsSync(new URL('../web/dist/index.html', import.meta.url))) {
  console.log('⏳ Construction du front React…');
  await new Promise((ok) => spawn('npm', ['run', 'build', '--prefix', 'web'], { stdio: 'inherit', shell: true }).on('exit', ok));
}

const procs = [
  spawn('node', ['server/src/index.js'], { stdio: 'inherit' }),
  spawn('node', ['shop/server.js'], { stdio: 'inherit' }),
];
const stop = () => { procs.forEach((p) => p.kill()); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
