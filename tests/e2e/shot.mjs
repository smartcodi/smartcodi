// 화면 스크린샷: 주요 탭과 도우미 창을 데스크톱(1400×900)·휴대폰(390×844)으로 찍는다.
//   node shot.mjs <출력 폴더> [--data <백업.json>]
//   --data = 보드 «전체 백업 (JSON)» 파일({projects, accounts, …} = {id: 문서}). 없으면 빈 보드.
//   Windows에서 출력 폴더는 슬래시 경로로(`cygpath -m`) — 백슬래시면 엉뚱한 폴더가 생긴다.
// 테스트는 «요소가 있고 값이 맞는지»만 본다. 잘림·겹침·좁은 창 붕괴는 이 이미지를 직접 봐야 잡힌다.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { start } from './server.mjs';

const args = process.argv.slice(2);
const di = args.indexOf('--data');
const dataFile = di >= 0 ? args.splice(di, 2)[1] : null;
const outDir = args[0];
if (!outDir){ console.error('사용법: node shot.mjs <출력 폴더> [--data <백업.json>]'); process.exit(2); }
fs.mkdirSync(outDir, { recursive:true });
const data = dataFile ? JSON.parse(fs.readFileSync(dataFile, 'utf8')) : null;
const COLS = ['projects', 'accounts', 'contacts', 'products', 'assets', 'programs', 'checklists'];

const SHOTS = [   // [파일 이름, 화면 key(state.tab), 도우미 창 열기, 과제 선택('first' = 첫 과제 | 'none' = 선택 없음)]
  ['todo', 'today'], ['work', 'work', false, 'first'], ['work-assist', 'work', true, 'first'], ['work-list', 'work', false, 'none'],
  ['kanban', 'board'], ['proj', 'proj'], ['org', 'acc'], ['eq', 'prod'], ['report', 'report'], ['assist', 'today', true],
];

const { server, url } = await start();
const browser = await chromium.launch({ channel:'chrome' });
const saved = [];
for (const [w, h, dev] of [[1400, 900, 'desk'], [390, 844, 'phone']]){
  const ctx = await browser.newContext({ timezoneId:'Asia/Seoul', locale:'ko-KR', viewport:{ width:w, height:h } });
  const page = await ctx.newPage();
  await page.goto(url); await page.evaluate(() => window.__mock.reset()); await page.reload(); await page.waitForTimeout(500);
  if (data){
    await page.evaluate(async ({ data, cols }) => {
      const db = await window.claude.use('db');
      for (const c of cols) for (const [id, d] of Object.entries(data[c] || {})) await db.doc(c + '/' + id).set(d);
    }, { data, cols:COLS });
    await page.waitForTimeout(300);
  }
  for (const [name, key, assist, pick] of SHOTS){
    await page.evaluate(([key, assist, pick]) => {   // 보드 전역 함수·상태 — 휴대폰에서 «더보기» 안의 탭도 연다
      state.tab = key; state.rec = null;
      if (pick === 'first') state.openId = [...state.projects.keys()].sort()[0] || null;
      if (pick === 'none') state.openId = null;
      assistToggle(!!assist); render();
    }, [key, !!assist, pick || '']);
    await page.waitForTimeout(250);
    const file = path.join(outDir, dev + '-' + name + '.png');
    await page.screenshot({ path:file });
    saved.push(file);
  }
  await ctx.close();
}
await browser.close(); server.close();
console.log(saved.length + '장 저장:\n' + saved.join('\n'));
