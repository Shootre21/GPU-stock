#!/usr/bin/env node
const fs = require('fs');
const net = require('net');
const tls = require('tls');
const path = require('path');

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.openclaw', 'smtp-config.json'), 'utf8'));

function b64(s) { return Buffer.from(s, 'utf8').toString('base64'); }
function readStdin() {
  return new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => data += c);
    process.stdin.on('end', () => resolve(data));
  });
}
function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      out[a.slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}
async function main() {
  const args = parseArgs(process.argv);
  const to = args.to;
  const subject = args.subject || '';
  if (!to) throw new Error('Missing --to');
  const body = await readStdin();

  let socket = net.createConnection({ host: cfg.host, port: cfg.port });
  socket.setEncoding('utf8');

  let buffer = '';
  const waitFor = (pred) => new Promise((resolve, reject) => {
    const onData = (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (pred(last, buffer)) {
        socket.off('data', onData);
        resolve(buffer);
        buffer = '';
      }
    };
    socket.on('data', onData);
    socket.on('error', reject);
  });
  const send = (line) => socket.write(line + '\r\n');

  await waitFor((last) => /^220\b/.test(last));
  send('EHLO localhost');
  await waitFor((last) => /^250\s/.test(last));
  send('STARTTLS');
  await waitFor((last) => /^220\b/.test(last));

  socket = tls.connect({ socket, servername: cfg.host });
  socket.setEncoding('utf8');
  buffer = '';

  send('EHLO localhost');
  await waitFor((last) => /^250\s/.test(last));
  send('AUTH LOGIN');
  await waitFor((last) => /^334\b/.test(last));
  send(b64(cfg.auth.user));
  await waitFor((last) => /^334\b/.test(last));
  send(b64(cfg.auth.pass));
  await waitFor((last) => /^235\b/.test(last));

  send(`MAIL FROM:<${cfg.from}>`);
  await waitFor((last) => /^250\b/.test(last));
  send(`RCPT TO:<${to}>`);
  await waitFor((last) => /^(250|251)\b/.test(last));
  send('DATA');
  await waitFor((last) => /^354\b/.test(last));

  const msg = [
    `From: ${cfg.from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body.replace(/\n\.\n/g, '\n..\n'),
    '.'
  ].join('\r\n');
  socket.write(msg + '\r\n');
  await waitFor((last) => /^250\b/.test(last));
  send('QUIT');
  await waitFor((last) => /^221\b/.test(last));
  console.log('Email sent.');
}
main().catch(err => {
  console.error(err.message || String(err));
  process.exit(1);
});
