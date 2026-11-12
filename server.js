import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const databaseFile = path.join(dataDirectory, 'greenfarm.json');
const port = Number(process.env.PORT || 4173);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

let appState = null;
try {
  appState = JSON.parse(await fs.readFile(databaseFile, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

function send(response, status, payload, headers = {}) {
  response.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  response.end(payload);
}

function sendJson(response, status, payload) {
  send(response, status, JSON.stringify(payload), { 'Content-Type': 'application/json; charset=utf-8' });
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw Object.assign(new Error('Corpo muito grande'), { status: 413 });
  }
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error('JSON inválido'), { status: 400 });
  }
}

async function serveStatic(urlPath, response) {
  const requestedPath = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
  const filePath = path.resolve(root, `.${requestedPath}`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    send(response, 403, 'Acesso negado');
    return;
  }
  try {
    const file = await fs.readFile(filePath);
    send(response, 200, file, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
  } catch (error) {
    send(response, error.code === 'ENOENT' ? 404 : 500, 'Arquivo não encontrado');
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/api/health' && request.method === 'GET') {
    sendJson(response, 200, { status: 'ok', storage: 'file' });
    return;
  }
  if (url.pathname === '/api/state' && request.method === 'GET') {
    sendJson(response, 200, { state: appState });
    return;
  }
  if (url.pathname === '/api/state' && request.method === 'PUT') {
    try {
      const nextState = await readJson(request);
      if (!nextState || !Array.isArray(nextState.requests) || !Array.isArray(nextState.processes)) {
        sendJson(response, 422, { error: 'Formato de dados inválido.' });
        return;
      }
      await fs.mkdir(dataDirectory, { recursive: true });
      const temporaryFile = `${databaseFile}.tmp`;
      await fs.writeFile(temporaryFile, JSON.stringify(nextState, null, 2), 'utf8');
      await fs.rename(temporaryFile, databaseFile);
      appState = nextState;
      sendJson(response, 200, { saved: true });
    } catch (error) {
      sendJson(response, error.status || 500, { error: error.status ? error.message : 'Não foi possível salvar os dados.' });
    }
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { error: 'Método não permitido.' });
    return;
  }
  await serveStatic(url.pathname, response);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`GreenFarm disponível na porta ${port}`);
  console.log('Dados da demonstração são gravados em data/greenfarm.json');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
