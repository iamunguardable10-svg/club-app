// Temporary: forwards localhost:5555 to RELAY_TARGET through the agent proxy. Delete after use.
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import fs from 'node:fs';

const target = new URL(process.env.RELAY_TARGET);
const proxy = new URL(process.env.HTTPS_PROXY);
const ca = fs.readFileSync('/root/.ccr/ca-bundle.crt');

function tunnel(cb) {
  const req = http.request({ host: proxy.hostname, port: proxy.port, method: 'CONNECT', path: `${target.hostname}:443`, headers: proxy.username ? { 'Proxy-Authorization': 'Basic ' + Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64') } : {} });
  req.on('connect', (res, socket) => {
    if (res.statusCode !== 200) return cb(new Error('proxy ' + res.statusCode));
    cb(null, tls.connect({ socket, servername: target.hostname, ca }));
  });
  req.on('error', cb);
  req.end();
}

class TunnelAgent extends https.Agent {
  createConnection(_opts, cb) { tunnel(cb); }
}
const agent = new TunnelAgent({ keepAlive: false });

http.createServer((req, res) => {
  const headers = { ...req.headers, host: target.hostname };
  delete headers['accept-encoding'];
  const up = https.request({ host: target.hostname, path: req.url, method: req.method, headers, agent }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', (e) => { res.writeHead(502); res.end(String(e)); });
  req.pipe(up);
}).listen(5555, () => console.log('relay on 5555 →', target.hostname));
