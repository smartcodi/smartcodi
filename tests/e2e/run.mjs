// CASE 1~6 E2E 실행 → results/<회차>.json → 엑셀(doc/테스트/E2E_시나리오_CASE1-6.xlsx)에 회차 기록
//   node run.mjs            전체
//   node run.mjs 2 3        일부 CASE만 (앞 CASE가 만든 데이터에 의존하지 않도록 각 CASE가 스스로 준비)
//   node run.mjs 2 --no-xlsx  엑셀에 회차를 쓰지 않음(개발 중 확인용 — 엑셀 기록은 board-tester 에이전트만)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from './server.mjs';
import { Run, copyState } from './helpers.mjs';
import * as C from './cases.mjs';
import { CASES } from './scenarios.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const XLSX = path.join(root, 'doc', '테스트', 'E2E_시나리오_CASE1-6.xlsx');
const noXlsx = process.argv.includes('--no-xlsx');
const only = process.argv.slice(2).map(Number).filter(Boolean);
const which = only.length ? only : [1, 2, 3, 4, 5, 6];

const { server, url } = await start();
const browser = await chromium.launch({ channel:'chrome' });
const ctxOpts = { timezoneId:'Asia/Seoul', locale:'ko-KR' };
// 데스크톱은 위치 권한 허용 + 시험용 좌표(서울시청) — 출발지 자동(현재 위치) 확인용. 휴대폰 컨텍스트는 권한 없음
const ctx = await browser.newContext({ ...ctxOpts, viewport:{ width:1400, height:900 }, permissions:['geolocation'], geolocation:{ latitude:37.5665, longitude:126.978 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
await page.goto(url);
await page.evaluate(() => window.__mock.reset());
await page.reload(); await page.waitForTimeout(500);
// 연도별 사업 규칙: 실제 아티팩트에 ArtifactData로 넣은 programs/2026과 같은 값
const PROGRAM_2026 = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'program-2026.json'), 'utf8'));
await page.evaluate(async fx => { const db = await window.claude.use('db'); await db.doc('programs/2026').set(fx); }, PROGRAM_2026);
// 사업계획서 체크리스트: 실제 아티팩트에 ArtifactData로 넣은 checklists/plan과 같은 값
const CHECKLIST = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'checklist-plan.json'), 'utf8'));
await page.evaluate(async fx => { const db = await window.claude.use('db'); await db.doc('checklists/plan').set(fx); }, CHECKLIST);
await page.waitForTimeout(200);

let mobile = null;
async function mobilePage(){
  mobile = mobile || await browser.newContext({ ...ctxOpts, viewport:{ width:390, height:844 }, isMobile:true, hasTouch:true, deviceScaleFactor:3 });
  const mp = await mobile.newPage();
  mp.on('pageerror', e => pageErrors.push('[휴대폰] ' + e.message));
  await mp.goto(url);
  await copyState(page, mp);
  return mp;
}

const started = new Date();
const out = { startedAt:started.toISOString(), boardSha:crypto.createHash('sha1').update(fs.readFileSync(path.join(root, 'smartcodi-board.html'))).digest('hex').slice(0, 10), cases:{} };
for (const n of which){
  const key = 'CASE' + n;
  console.log('▶', key, CASES[key].title);
  const run = new Run(page, key);
  const errBefore = pageErrors.length;
  try { await C['case' + n](run, { mobilePage }); }
  catch (e){ run.results.push({ id:key + '-중단', result:'차단', memo:String(e.message || e).slice(0, 300) }); }
  // 시나리오에 있는데 실행되지 않은 단계 = 차단
  for (const [id] of CASES[key].rows) if (!run.results.find(r => r.id === id)) run.results.push({ id, result:'차단', memo:'실행되지 않음' });
  const errs = pageErrors.slice(errBefore);
  out.cases[key] = { results:run.results, pageErrors:errs };
  const c = t => run.results.filter(r => r.result === t).length;
  console.log(`  통과 ${c('통과')} / 실패 ${c('실패')} / 차단 ${c('차단')}` + (errs.length ? ` / 페이지 오류 ${errs.length}: ${errs[0]}` : ''));
}
out.finishedAt = new Date().toISOString();
await browser.close(); server.close();

fs.mkdirSync(path.join(here, 'results'), { recursive:true });
const stamp = new Date(started.getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, '');
const json = path.join(here, 'results', stamp + '.json');
fs.writeFileSync(json, JSON.stringify(out, null, 2));
if (noXlsx) console.log('엑셀 기록 건너뜀(--no-xlsx). 결과: ' + json);
else try {
  const r = execFileSync('python', [path.join(here, 'write_xlsx.py'), 'record', XLSX, json], { encoding:'utf8', env:{ ...process.env, PYTHONIOENCODING:'utf-8' } });
  console.log(r.trim());
} catch (e){
  console.log('엑셀 기록 실패(파일이 열려 있으면 닫고 `python write_xlsx.py record <xlsx> ' + json + '` 로 다시 기록):', String(e.stderr || e.message).trim().split('\n').pop());
}
// 회차 JSON(YYYYMMDDHHMM.json)은 최근 10개만 남긴다 — 결과는 엑셀에 누적되므로. 다른 파일은 건드리지 않는다
const runs = fs.readdirSync(path.join(here, 'results')).filter(f => /^\d{12}\.json$/.test(f)).sort();
for (const f of runs.slice(0, -10)) fs.unlinkSync(path.join(here, 'results', f));
const all = Object.values(out.cases).flatMap(c => c.results);
const failed = all.filter(r => r.result !== '통과');
console.log(failed.length ? `결과: ${failed.length}건 통과 못 함` : '결과: 전부 통과');
process.exit(failed.length ? 1 : 0);
