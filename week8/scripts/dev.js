const path = require('node:path');
const { spawn } = require('node:child_process');
const children = ['api', 'web'].map((folder) => spawn(process.execPath, ['server.js'], {
  cwd: path.resolve(__dirname, '..', folder), stdio: 'inherit'
}));
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill());
  process.exitCode = code;
}
children.forEach((child) => {
  child.on('error', () => stop(1));
  child.on('exit', (code) => stop(code || 0));
});
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
