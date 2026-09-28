// 로컬 하네스 서버: 보드 HTML에 목 스크립트를 주입해 제공한다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const BOARD = path.join(root, 'smartcodi-board.html');
const PDF_DIR = path.join(root, 'doc', '교재', '31_합숙', '양식', '03_PDF');
const FORMS = {
  'plan.pdf': '1. 소공인 사업계획서(총괄표, 상세).pdf',
  'log.pdf': '2. 소공인 코디네이터 수행일지(양식, 예시).pdf',
  'result.pdf': '3. 소공인 코디네이터 결과보고서.pdf',
  'cases.pdf': '4. 실습 교육 제공 사례.pdf',
};
const blobs = new Map();
let seq = 1;

/** 게시 때 플랫폼이 감싸는 것처럼 문서 뼈대를 씌우고, 첫 <script> 앞에 목을 넣는다 */
export function boardHtml(){
  const src = fs.readFileSync(BOARD, 'utf8');
  const i = src.indexOf('<script>');
  const body = src.slice(0, i) + '<script src="/mock-claude.js"></script>\n' + src.slice(i);
  return '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>\n' + body + '\n</body></html>';
}

export function start(port = 0){
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/' ) { res.writeHead(200, { 'content-type':'text/html; charset=utf-8' }); return res.end(boardHtml()); }
    if (url === '/mock-claude.js') { res.writeHead(200, { 'content-type':'text/javascript' }); return res.end(fs.readFileSync(path.join(here, 'mock-claude.js'))); }
    if (url.startsWith('/forms/') && FORMS[url.slice(7)]) { res.writeHead(200, { 'content-type':'application/pdf' }); return res.end(fs.readFileSync(path.join(PDF_DIR, FORMS[url.slice(7)]))); }
    if (url === '/__blob' && req.method === 'POST'){
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => { const id = 'blob' + (seq++); blobs.set(id, { type:req.headers['content-type'], data:Buffer.concat(chunks) }); res.writeHead(200, { 'content-type':'application/json' }); res.end(JSON.stringify({ id })); });
      return;
    }
    if (url.startsWith('/__blob/') && req.method === 'DELETE'){ blobs.delete(url.slice(8)); res.writeHead(204); return res.end(); }
    if (url.startsWith('/_blob/')){ const b = blobs.get(url.slice(7)); if (!b){ res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type':b.type }); return res.end(b.data); }
    res.writeHead(404); res.end();
  });
  return new Promise(ok => server.listen(port, '127.0.0.1', () => ok({ server, url:'http://127.0.0.1:' + server.address().port + '/' })));
}
