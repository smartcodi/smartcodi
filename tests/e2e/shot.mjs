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

const SHOTS = [   // [파일 이름, 탭 묶음 버튼 id, 도우미 창 열기]
  ['board', 'tabBoard'], ['todo', 'tabTodo'], ['proj', 'tabProj'], ['org', 'tabOrg'],
  ['eq', 'tabEq'], ['report', 'tabReport'], ['assist', 'tabBoard', true],
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
  for (const [name, tab, assist] of SHOTS){
    await page.evaluate(([tab, assist]) => { goTab(tab); assistToggle(!!assist); }, [tab, !!assist]);   // 보드 전역 함수 — 휴대폰에서 «더보기» 안의 탭도 연다
    await page.waitForTimeout(250);
    const file = path.join(outDir, dev + '-' + name + '.png');
    await page.screenshot({ path:file });
    saved.push(file);
  }
  await ctx.close();
}
await browser.close(); server.close();
console.log(saved.length + '장 저장:\n' + saved.join('\n'));
