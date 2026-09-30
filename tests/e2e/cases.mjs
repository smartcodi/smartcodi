// CASE 1~6 자동 시나리오. 단계 ID = doc/테스트/E2E_시나리오_CASE1-6.xlsx 의 ID
import * as H from './helpers.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { T, Td, md, until, fail, hasText, lacksText, docsOf, projectId, findId, modal, tab, stepBody, PD } = H;

const COORD_ORG = '[테스트] 코디기관', COORD = '[테스트] 코디';
const MAIL = 'tester@example.com';   // 목 발송 — 실제로 나가지 않음(공개용 자리표시자)
const won = n => Number(n).toLocaleString('ko-KR');
const swLimit = hw => Math.min(Math.floor(hw / 9), 6000000);

async function ensureCoord(page){
  if (!(await findId(page, 'accounts', d => d.name === COORD_ORG))){
    await H.addAccount(page, { type:'coord', name:COORD_ORG });
    await H.addContact(page, { org:COORD_ORG, name:COORD, title:'코디네이터', phone:'010-0000-0001', email:MAIL });
  }
}
/** 기관 + 담당자 + 과제 한 번에 */
async function setupProject(page, { company, rep, cycle, notice, supplier, extraContacts = [] }){
  await ensureCoord(page);
  await H.addAccount(page, { type:'sogongin', name:company });
  await H.addContact(page, { org:company, ...rep });
  for (const c of extraContacts) await H.addContact(page, { org:company, ...c });
  if (supplier){
    if (!(await findId(page, 'accounts', d => d.name === supplier.org))) await H.addAccount(page, { type:'supplier', name:supplier.org });
    if (supplier.name) await H.addContact(page, { org:supplier.org, name:supplier.name, title:supplier.title || '담당', email:supplier.email || '' });
  }
  const roles = { sogongin:[company, (extraContacts.find(c => c.assign) || rep).name], coord:[COORD_ORG, COORD] };
  if (supplier?.name) roles.supplier = [supplier.org, supplier.name];
  return H.addProject(page, { company, cycle, notice, roles });
}
const card = (page, company) => page.locator('.card', { hasText:company });
async function openSend(page, company, n){
  await H.openStep(page, company, n);
  await stepBody(page, n).getByRole('button', { name:'메일 · 카톡 보내기' }).click();
  await until(() => page.locator('.modal.wide').count(), '보내기 창이 열리지 않음');
  return page.locator('.modal.wide');
}
const chip = (m, text) => m.locator('.chip', { hasText:text });
/** 과제 상세 «도입 장비» 아래 견적 합계·S/W 한도 줄과 초과 경고(없으면 '') */
async function budget(page, company){
  await H.openProject(page, company);
  const d = page.locator(PD);
  await until(() => d.locator('.bsum').count(), '견적 합계 줄 없음');
  const sum = await d.locator('.bsum').innerText();
  const bw = d.locator('.bsum + .bwarn');   // 과제 요약 줄 바로 뒤의 경고(4단계 체크포인트의 경고는 따로 있다)
  const warn = (await bw.count()) ? await bw.innerText() : '';
  return { sum, warn };
}
/** «오늘» 탭의 카드(제목 h2로 고름 — 요약 타일에도 같은 문구가 있다) */
const todaySec = (page, title) => page.locator('#today section').filter({ has: page.locator('h2', { hasText:title }) });
async function editAsset(page, company, productLabelText, values){
  await H.openProject(page, company);
  await page.locator(PD + ' .rrow', { hasText:productLabelText }).first().click();   // 과제 상세(가운데 칸) → 자산 상세(떠 있는 패널)
  await page.locator('.drawer .dr-head').getByRole('button', { name:'수정' }).click();
  await H.fillForm(page, values);
  await H.saveModal(page);
  await H.closeDrawer(page);
}
async function search(page, q){
  await page.locator('#q').fill(q);
  await until(() => page.locator('#qres').isVisible(), '검색 결과 목록이 뜨지 않음');
  return page.locator('#qres').innerText();
}
async function clearSearch(page){ await page.locator('#q').fill(''); await page.locator('#q').blur(); }
async function cleanupCase(page, { company, products = [], contacts = [], accounts = [] }){
  if (await projectId(page, company)) await H.deleteProject(page, company);
  for (const p of products) if (await findId(page, 'products', d => d.name === p)){ const e = await H.deleteVia(page, 'prod', p); if (e) fail('장비 삭제 실패 ' + p + ': ' + e); }
  for (const c of contacts) if (await findId(page, 'contacts', d => d.name === c)){ const e = await H.deleteVia(page, 'con', c); if (e) fail('담당자 삭제 실패 ' + c + ': ' + e); }
  for (const a of accounts) if (await findId(page, 'accounts', d => d.name === a)){ const e = await H.deleteVia(page, 'acc', a); if (e) fail('기관 삭제 실패 ' + a + ': ' + e); }
}

/* ============================== CASE 1 ============================== */
export async function case1(run){
  const page = run.page;
  const CO = '[테스트] CASE1 플라스틱사출', SUP = '[테스트] CASE1 공급사', REP = '[테스트] C1대표', SALES = '[테스트] C1영업';
  const PRODUCTS = [
    { kind:'hw', name:'고속·고정밀 서보 취출 로봇', model:'FRANCIA-1013i-V', unitPrice:'16,500,000원', unit:'개', qty:1 },
    { kind:'hw', name:'고속·고속정밀 서보 취출로봇', model:'FRANCIA-510i-V', unitPrice:'13500000', unit:'개', qty:1 },
    { kind:'hw', name:'고속·고속정밀 스윙 취출로봇', model:'SMUS-800', unitPrice:'3750000', unit:'개', qty:4 },
    { kind:'sw', name:'소프트 품질관리 시스템', model:'link. MES', unitPrice:'3000000', unit:'식', qty:1 },
  ];
  let pid;
  await run.step('C1-01', async () => {
    await H.addAccount(page, { type:'sogongin', name:CO });
    await H.addAccount(page, { type:'coord', name:COORD_ORG });
    await H.addAccount(page, { type:'supplier', name:SUP });
    await tab(page, 'acc');
    for (const n of [CO, COORD_ORG, SUP]) await until(() => page.locator('#acc tbody tr', { hasText:n }).count(), '기관 목록에 없음: ' + n);
    await lacksText(page.locator('#acc tbody'), '예시', '테스트 기관에 예시 배지');
  });
  await run.step('C1-02', async () => {
    await H.addContact(page, { org:CO, name:REP, title:'대표', phone:'010-0000-1001', email:MAIL });
    await H.addContact(page, { org:COORD_ORG, name:COORD, title:'코디네이터', phone:'010-0000-0001', email:MAIL });
    await H.addContact(page, { org:SUP, name:SALES, title:'담당', email:MAIL });
    await tab(page, 'con');
    for (const n of [REP, COORD, SALES]) await until(() => page.locator('#con tbody tr', { hasText:n }).count(), '담당자 목록에 없음: ' + n);
    // 이름 끝에 직함을 넣으면 저장 거부(직함은 따로)
    await page.getByRole('button', { name:'+ 담당자 추가' }).click();
    await H.fillForm(page, { accountId:{ value:await findId(page, 'accounts', d => d.name === CO) }, name:'[검증용] 홍길동 대표', title:'대표' });
    if (!(await modal(page).locator('#ff-title-list option[value="대표"]').count())) fail('직함 추천 목록 없음');
    await H.saveModal(page);
    await hasText(modal(page).locator('.err'), '«대표»는 직함입니다');
    await H.closeModals(page);
    if (await findId(page, 'contacts', d => d.name === '[검증용] 홍길동 대표')) fail('이름에 직함이 든 담당자가 저장됨');
  });
  await run.step('C1-03', async () => {
    pid = await H.addProject(page, { company:CO, cycle:'2026-T1', notice:'main', roles:{ sogongin:[CO, REP], coord:[COORD_ORG, COORD], supplier:[SUP, SALES] } });
    await H.closeDrawer(page); await tab(page, 'board');
    const c = card(page, CO);
    await until(() => page.locator('.col[data-col="1"] .card', { hasText:CO }).count(), '1단계 열에 카드 없음');
    await hasText(c, '원공고'); await lacksText(c, '공고 미확인');
  });
  await run.step('C1-04', async () => {
    await page.locator('#fnotice').selectOption('extra');
    await until(async () => !(await card(page, CO).count()), '추가공고 필터에서 카드가 보임');
    await page.locator('#fnotice').selectOption('main');
    await until(() => card(page, CO).count(), '원공고 필터에서 카드 없음');
    await page.locator('#fnotice').selectOption('');
  });
  await run.step('C1-05', async () => {
    await H.setPlanned(page, CO, 1, Td(2));
    await H.closeDrawer(page); await tab(page, 'board');
    await hasText(card(page, CO).locator('.nextdue'), '다음 ' + md(Td(2)) + ' 1차 방문');
    await hasText(card(page, CO).locator('.nextdue'), 'D-2');
  });
  const DIAG1 = { 0:'불량률 감소에 대한 기대가 가장 높음', 1:'플라스틱 사출 — 취출 로봇 8기 중 노후 6기', 8:'대표 가족 외 내국인 3명' };
  await run.step('C1-06', async () => {
    const id = await H.openStep(page, CO, 1);
    for (const [i, v] of Object.entries(DIAG1)){ const ta = page.locator(`#dg-${id}-1-${i}`); await ta.fill(v); await ta.blur(); await page.waitForTimeout(150); }
    await hasText(stepBody(page, 1).locator('.diag .subhead'), '3/9');
    await page.reload(); await page.waitForTimeout(600);
    await H.openStep(page, CO, 1);
    for (const [i, v] of Object.entries(DIAG1)) await until(async () => (await page.locator(`#dg-${id}-1-${i}`).inputValue()) === v, '새로고침 후 값 없음: ' + i);
  });
  await run.step('C1-07', async () => {
    const d = await H.wordDraft(page, CO, 1, '수행일지·현장진단표 (1차)');
    for (const s of [CO, REP, '1차', ...Object.values(DIAG1), '미확인 — 불량 발생 시']) if (!d.text.includes(s)) fail('초안에 없음: ' + s);
    if (d.text.includes('대표 대표')) fail('«대표 대표» 중복');
    if (!d.filename.endsWith('.docx')) fail('파일명: ' + d.filename);
  });
  await run.step('C1-08', async () => {
    for (const p of PRODUCTS) await H.addProduct(page, { ...p, supplier:SUP });
    await tab(page, 'prod');
    await hasText(page.locator('#prod tbody'), '16,500,000원 / 개');
    const pr = (await docsOf(page, 'products'))[await findId(page, 'products', d => d.model === 'FRANCIA-1013i-V')];
    if (pr.unitPrice !== 16500000) fail('단가 저장값 ' + pr.unitPrice);
    await tab(page, 'acc'); await page.locator('#acc tbody tr', { hasText:SUP }).click();
    await hasText(page.locator('.drawer'), '공급 장비 4종');
    await H.closeDrawer(page);
  });
  await run.step('C1-09', async () => {
    await H.addProduct(page, { kind:'hw', name:'[검증용] 단가 오류', unitPrice:'1650만', supplier:SUP, expectError:'단가는 숫자만' });
    if (await findId(page, 'products', d => d.name === '[검증용] 단가 오류')) fail('잘못된 단가로 저장됨');
  });
  await run.step('C1-10', async () => {
    for (const p of PRODUCTS) await H.addAsset(page, CO, p.name, { qty:p.qty });
    await H.openProject(page, CO);
    await hasText(page.locator(PD), '도입 장비 4건');
    await hasText(page.locator(PD + ' .rrow', { hasText:'SMUS-800' }), '검토 중 · 4개');
    await H.closeDrawer(page); await tab(page, 'prod');
    await hasText(page.locator('#prod tbody tr', { hasText:'SMUS-800' }), '1건 · 4개');
  });
  await run.step('C1-11', async () => {
    await tab(page, 'asset');
    await hasText(page.locator('#asset .chips:not(.subnav)'), '검토 중 4');
  });
  await run.step('C1-12', async () => {
    await H.setStatus(page, CO, 3, 'doing'); await H.setStatus(page, CO, 4, 'doing');
    const d = await H.wordDraft(page, CO, 4, '사업계획서');
    for (const s of [CO, SUP]) if (!d.text.includes(s)) fail('초안에 없음: ' + s);
    for (const s of ['고속·고정밀 서보 취출 로봇 FRANCIA-1013i-V × 1개', '고속·고속정밀 스윙 취출로봇 SMUS-800 × 4개', '소프트 품질관리 시스템 link. MES × 1식'])
      if (!d.text.includes(s)) fail('자산 줄 없음: ' + s);
    if (/\d{1,3}(,\d{3}){2,}/.test(d.text)) fail('사업비 칸에 금액이 들어감');
  });
  await run.step('C1-13', async () => {
    const lim = swLimit(45000000);
    if (lim !== 5000000 || 3000000 > lim) fail('한도 계산 ' + lim);
    const b = await budget(page, CO);
    for (const s of ['H/W 45,000,000원', 'S/W 3,000,000원', '= 5,000,000원']) if (!b.sum.includes(s)) fail('합계 줄: ' + b.sum);
    if (b.warn) fail('한도 이내인데 경고: ' + b.warn);
    const text = `S/W 한도 min(45,000,000÷9, 6,000,000) = ${won(lim)} → S/W 3,000,000 이내`;
    await H.addNote(page, CO, 4, text);
    const head = await stepBody(page, 4).locator('.note', { hasText:'S/W 한도' }).locator('time').innerText();
    if (!head.startsWith(T + ' ')) fail('메모 날짜가 한국 날짜가 아님: ' + head);
    if (!head.includes('· 시험자')) fail('작성자 없음: ' + head);
  });
  await run.step('C1-14', async () => {
    await editAsset(page, CO, 'FRANCIA-1013i-V', { status:{ value:'ordered' }, orderedAt:Td(10) });
    await editAsset(page, CO, 'FRANCIA-1013i-V', { status:{ value:'installed' }, installedAt:Td(20) });
    await editAsset(page, CO, 'FRANCIA-1013i-V', { status:{ value:'operating' }, operatingAt:Td(25) });
    const as = (await docsOf(page, 'assets'))[await findId(page, 'assets', d => d.projectId === pid && d.status === 'operating')];
    if (!as || as.operatingAt !== Td(25)) fail('가동 중 상태·날짜 저장 안 됨');
    const p = (await docsOf(page, 'projects'))[pid];
    if (p.steps['6'].status !== 'todo' || p.steps['7'].status !== 'todo') fail('자산 상태가 단계 상태를 바꿈');
  });
  await run.step('C1-15', async () => {
    for (let n = 1; n <= 8; n++){ await H.checkAllDocs(page, CO, n); await H.setStatus(page, CO, n, 'done'); }
    if (await page.locator(PD + ' .step-body .notice').count()) fail('산출물을 다 체크했는데 누락 알림');
    const p = (await docsOf(page, 'projects'))[pid];
    if (p.currentStep !== 9) fail('currentStep ' + p.currentStep);
    for (let n = 1; n <= 8; n++) if (p.steps[n].actual !== T) fail(n + '단계 완료일 ' + p.steps[n].actual);
    await H.closeDrawer(page); await tab(page, 'board');
    await until(() => page.locator('.col[data-col="9"] .card', { hasText:CO }).count(), '완료 열에 없음');
  });
  await run.step('C1-16', async () => {
    await tab(page, 'report');
    await until(async () => (await page.locator('#report tbody tr', { hasText:CO }).count()) >= 4, '방문 실적 4건 아님');
    const rows = page.locator('#report section').nth(1).locator('tbody tr', { hasText:CO });
    if (await rows.count() !== 4) fail('방문 실적 ' + await rows.count() + '건');
    await hasText(rows.first(), T);
  });
  await run.step('C1-17', async () => {
    await H.deleteProject(page, CO);
    if (Object.values(await docsOf(page, 'assets')).some(a => a.projectId === pid)) fail('과제 자산이 남음');
    await cleanupCase(page, { company:CO, products:PRODUCTS.map(p => p.name), contacts:[REP, SALES], accounts:[CO, SUP] });
  });
}

/* ============================== CASE 2 ============================== */
export async function case2(run){
  const page = run.page;
  const CO = '[테스트] CASE2 파이프가공', SUP = '[테스트] CASE2 공급사', REP = '[테스트] C2대표', SALES = '[테스트] C2영업';
  let pid;
  await run.step('C2-01', async () => {
    pid = await setupProject(page, { company:CO, cycle:'2026-T2', notice:'main', rep:{ name:REP, title:'대표' }, supplier:{ org:SUP, name:SALES, title:'담당', email:MAIL } });
    await H.closeDrawer(page); await tab(page, 'board');
    await hasText(card(page, CO), '원공고');
  });
  await run.step('C2-02', async () => {
    await H.addProduct(page, { kind:'hw', name:'CNC 레이저 용접 시스템', unitPrice:'42000000', unit:'대', supplier:SUP });
    await H.addProduct(page, { kind:'sw', name:'ProdEX AI Smart', unitPrice:'1500000', unit:'월(임차)', supplier:SUP, spec:'1+1 패키지: 6개월 구독 시 6개월 무료' });
    await tab(page, 'prod');
    await hasText(page.locator('#prod tbody tr', { hasText:'ProdEX' }), '1,500,000원 / 월(임차)');
  });
  await run.step('C2-03', async () => {
    await H.addAsset(page, CO, 'CNC 레이저 용접 시스템', { qty:1 });
    await H.addAsset(page, CO, 'ProdEX AI Smart', { qty:6 });
    await H.openProject(page, CO);
    await hasText(page.locator(PD + ' .rrow', { hasText:'ProdEX' }), '검토 중 · 6월(임차)');
  });
  await run.step('C2-04', async () => {
    await H.addNote(page, CO, 3, "견적 H/W 1 EA — 현황의 '2대 추가 도입'과 불일치, 확인 필요");
    await hasText(stepBody(page, 3).locator('.note', { hasText:'불일치' }).locator('time'), '시험자');
  });
  await run.step('C2-05', async () => {
    const lim = swLimit(42000000), over = 9000000 - lim;
    if (lim !== 4666666 || over !== 4333334) fail('계산 ' + lim + '/' + over);
    const b = await budget(page, CO);
    if (!b.sum.includes('S/W 9,000,000원') || !b.sum.includes('= 4,666,666원')) fail('합계 줄: ' + b.sum);
    if (!b.warn.includes('4,333,334원 초과')) fail('초과 경고: ' + (b.warn || '없음'));
    await H.addNote(page, CO, 3, `S/W 한도 ${won(lim)} < S/W 9,000,000(1,500,000×6) → 초과 ${won(over)}`);
  });
  await run.step('C2-14', async () => {
    // 사업계획서 체크포인트(2026 규칙 = programs/2026): 기본 협약일 9/21 → 3개월, 협약일 7/1 → 5개월 20일
    const id = await H.openStep(page, CO, 4);
    const pc = stepBody(page, 4).locator('.pcheck');
    const off = () => pc.locator('.pspan').click();   // 칸 밖을 눌러 저장(blur)
    await hasText(pc, '2026년 기본값');
    await until(async () => (await pc.locator('.pspan').innerText()) === '2026-09-21 ~ 2026-12-20 · 3개월', '기본 협약일 사업기간: ' + await pc.locator('.pspan').innerText());
    await hasText(pc.locator('.pcsw', { hasText:'ProdEX' }).locator('.pcwarn'), '최대 3개월(4,500,000원)까지입니다. 넘는 3개월분 4,500,000원은 지원받을 수 없고 H/W 등으로 돌려 쓸 수도 없습니다');
    await hasText(pc.locator('.pcswrule'), 'H/W 등으로 돌려 쓸 수 없습니다');
    if ((await docsOf(page, 'projects'))[id].agreementDate) fail('기본 협약일이 과제에 저장됨(표시만 해야 함)');
    await page.locator('#ag-' + id).fill('2026-07-01');
    await until(async () => (await docsOf(page, 'projects'))[id].agreementDate === '2026-07-01', '협약일 저장 안 됨');
    await hasText(pc.locator('.pspan'), '2026-07-01 ~ 2026-12-20 · 5개월 20일');
    const sw = pc.locator('.pcsw', { hasText:'ProdEX' });
    await hasText(sw, '1,500,000원 × 6개월 = 9,000,000원 · 임차 2026-07-01 ~ 2026-12-31');
    await hasText(sw.locator('.pcwarn'), '사업기간 안에서는 최대 5개월(7,500,000원)');
    await pc.getByRole('button', { name:'+ 인력 추가' }).click();
    await until(async () => ((await docsOf(page, 'projects'))[id].labor || []).length === 1, '인력 행 추가 안 됨');
    const x0 = (await docsOf(page, 'projects'))[id].labor[0];
    if (x0.months !== 5 || x0.eligible !== false) fail('새 인력 기본값: ' + JSON.stringify(x0));
    const lb = k => page.locator(`#lb-${id}-0-${k}`);
    await lb('name').fill('[테스트] C2대표'); await lb('salary').click();
    await lb('salary').fill('36000000'); await lb('rate').click();
    await lb('rate').fill('100'); await off();
    await until(async () => { const x = (await docsOf(page, 'projects'))[id].labor[0]; return x.salary === 36000000 && x.rate === 100 && x.name === '[테스트] C2대표'; }, '인건비 입력 저장 안 됨');
    // 칸 라벨(값을 넣어도 무슨 칸인지 보임) · 연봉 쉼표 표시
    for (const l of ['이름', '직위', '2025년 연봉 (원)', '참여율 (%)', '계상 개월']) await until(() => pc.locator('.pclabor label', { hasText:l }).count(), '라벨 없음: ' + l);
    await until(async () => (await lb('salary').inputValue()) === '36,000,000', '연봉 쉼표 표시: ' + await lb('salary').inputValue());
    // «2025년 연봉 있음» 미체크 → 합계 제외
    await hasText(pc.locator('.pclabor'), '= 15,000,000원 (합계 제외)');
    await hasText(pc.locator('.pclabor .pcwarn'), '2025년 연봉이 없으면 현물로 계상할 수 없습니다');
    await hasText(pc.locator('.pcsum'), '현물(인건비) 0원');
    await lb('eligible').check();
    await until(async () => (await docsOf(page, 'projects'))[id].labor[0].eligible === true, '연봉 있음 체크 저장 안 됨');
    await hasText(pc.locator('.pcsum'), '현물(인건비) 15,000,000원');
    await hasText(pc.locator('.pcsum'), '= 6,000,000원');                 // min((42,000,000+15,000,000)×10/90, 6,000,000)
    await hasText(pc.locator('.pcsum'), '현물 목표(총 사업비의 20%) = 12,750,000원');   // (42,000,000+9,000,000)×20/80
    await hasText(pc.locator('.bwarn'), '3,000,000원 초과');               // S/W 9,000,000 − 6,000,000
    await hasText(pc.locator('.bwarn'), '20%를 2,250,000원 넘습니다');      // 15,000,000 − 12,750,000
    await lb('months').fill('6'); await off();
    await hasText(pc.locator('.pclabor .pcwarn'), '온전한 개월 수 5개월을 넘습니다');
    const b = await budget(page, CO);
    if (!b.sum.includes('현물(인건비) 18,000,000원')) fail('과제 상세 합계 줄: ' + b.sum);
  });
  await run.step('C2-15', async () => {
    // 사업 규칙 편집(메타정보): 과제 탭 카드 → 전용 «가능»이면 체크포인트 문구가 바뀌고, 되돌린다
    await tab(page, 'proj');
    const row = page.locator('.progcard tbody tr', { hasText:'2026' });
    await hasText(row, '2026-09-21'); await hasText(row, '불가'); await hasText(row, '3개월');
    const editRule = async values => { await row.getByRole('button', { name:'수정' }).click(); await H.fillForm(page, values); await H.saveModal(page); };
    await editRule({ agreeDefault:'2026-12-25' });
    await hasText(modal(page).locator('.err'), '기본 협약일이 사업 종료일보다 늦습니다');
    await H.closeModals(page);
    await editRule({ swLeftoverToHw:{ value:'true' } });
    await until(async () => (await docsOf(page, 'programs'))['2026'].swLeftoverToHw === true, '규칙 저장 안 됨');
    await H.openStep(page, CO, 4);
    const pc = stepBody(page, 4).locator('.pcheck');
    await hasText(pc.locator('.pcsw', { hasText:'ProdEX' }).locator('.pcwarn'), '남는 S/W 예산은 H/W 구매비로 쓸 수 있습니다');
    await hasText(pc.locator('.pcswrule'), 'H/W 구매비로 쓸 수 있습니다');
    await tab(page, 'proj');
    await editRule({ swLeftoverToHw:{ value:'false' } });
    await until(async () => (await docsOf(page, 'programs'))['2026'].swLeftoverToHw === false, '규칙 되돌리기 저장 안 됨');
    // 규칙이 없는 연도: 목으로 programs/2026을 잠시 지우면 «규칙 없음», 한도 경고 없음 → 복원
    const saved = (await docsOf(page, 'programs'))['2026'];
    await page.evaluate(async () => { const db = await window.claude.use('db'); await db.doc('programs/2026').delete(); });
    await H.openStep(page, CO, 4);
    await hasText(stepBody(page, 4).locator('.pcheck'), '2026년 사업 규칙이 없어 사업기간·한도를 점검하지 않습니다');
    const nb = await budget(page, CO);
    if (!nb.sum.includes('2026년 사업 규칙 없음') || nb.warn) fail('규칙 없음 표시: ' + nb.sum + ' / ' + nb.warn);
    await page.evaluate(async fx => { const db = await window.claude.use('db'); await db.doc('programs/2026').set(fx); }, saved);
    await until(async () => !!(await docsOf(page, 'programs'))['2026'], '규칙 복원 안 됨');
  });
  await run.step('C2-16', async () => {
    // 현물 목표 충족: 계상 2개월이면 부족, 기본 협약일(3개월)이면 참여율 100%로도 목표를 못 채움
    const id = await H.openStep(page, CO, 4);
    const pc = stepBody(page, 4).locator('.pcheck');
    await page.locator(`#lb-${id}-0-months`).fill('2'); await pc.locator('.pspan').click();
    await until(async () => (await docsOf(page, 'projects'))[id].labor[0].months === 2, '계상 개월 저장 안 됨');
    await hasText(pc.locator('.pcsum'), '현물(인건비) 6,000,000원');
    await hasText(pc.locator('.bwarn'), '현물이 목표(총 사업비의 20%)보다 6,750,000원 부족합니다');
    if (await pc.locator('.pcfill.pcwarn').count()) fail('7/1 협약(5개월)이면 최대 15,000,000원으로 채울 수 있는데 경고가 뜸');
    await page.locator('#ag-' + id).fill('');
    await until(async () => !(await docsOf(page, 'projects'))[id].agreementDate, '협약일 비우기 저장 안 됨');
    await hasText(pc.locator('.pcfill'), '사업기간 3개월 안에서 참여율 100%로 계상해도 최대 9,000,000원이라 현물 목표 12,750,000원을 채울 수 없습니다');
  });
  await run.step('C2-17', async () => {
    // «오늘»: 장비 도입 마감(종료일까지 설치 전 자산) · 사업계획서 점검 필요(4단계 완료 전)
    await tab(page, 'today');
    const dd = Math.round((Date.parse('2026-12-20T00:00:00Z') - Date.parse(T + 'T00:00:00Z')) / 864e5);
    const ddl = dd === 0 ? 'D-DAY' : dd > 0 ? 'D-' + dd : 'D+' + (-dd);
    const due = todaySec(page, '장비 도입 마감').locator('tbody tr', { hasText:CO });
    await until(async () => (await due.count()) === 2, '도입 마감 행 수: ' + await due.count());
    for (const n of ['CNC 레이저 용접 시스템', 'ProdEX AI Smart']) { const r = due.filter({ hasText:n }); await hasText(r, '2026-12-20'); await hasText(r, ddl); await hasText(r, '검토 중'); }
    const pl = todaySec(page, '사업계획서 점검 필요').locator('tbody tr', { hasText:CO });
    for (const t of ['S/W 한도 3,666,667원 초과', 'S/W 임차 기간 초과(ProdEX AI Smart)', '현물 6,750,000원 부족', '현물 목표를 채울 수 없음(최대 9,000,000원)']) await hasText(pl, t);
    await lacksText(pl, '계상 개월이 사업기간 초과');
    await pl.click();
    await until(() => page.locator(PD + ' .pcheck').count(), '행을 눌러도 4단계 체크포인트가 안 열림');
    if (!(await page.locator('#work').isVisible())) fail('할 일 행이 과제 탭 «목록»으로 이동하지 않음');
    await H.closeDrawer(page);
  });
  await run.step('C2-18', async () => {
    // 보고서 «사업비 현황»: 총 57,000,000 = H/W 42,000,000 + S/W 9,000,000 + 현물 6,000,000, 국비 60% = 34,200,000, 현금 = 16,800,000
    await tab(page, 'report');
    const row = page.locator('.budcard tbody tr', { hasText:CO });
    for (const t of ['42,000,000원', '9,000,000원', '6,000,000원', '57,000,000원', '34,200,000원', '16,800,000원', 'S/W 3,666,667원 초과', '현물 6,750,000원 부족']) await hasText(row, t);
    const before = await H.downloadCount(page);
    await page.locator('.budcard').getByRole('button', { name:'CSV 내보내기' }).click();
    const d = await H.nextDownload(page, before);
    if (!d.filename.startsWith('사업비현황_') || !d.text.includes('국비') || !d.text.includes('34200000')) fail('CSV: ' + d.filename + ' / ' + (d.text || '').slice(0, 200));
  });
  // 사업계획서 버전 · 체크리스트 점검 (C2-19~21), 관리 탭 (C2-22)
  const planDoc = async name => { const id = await projectId(page, CO); return ((await docsOf(page, 'projects'))[id].planDocs || []).find(d => d.name === name); };
  const upload = async (file, source, note) => {
    const id = await H.openStep(page, CO, 4);
    await page.locator('#pd-src-' + id).selectOption(source);
    await page.locator('#pd-note-' + id).fill(note);
    await page.locator('#pd-file-' + id).setInputFiles(file);
    await until(async () => !!(await planDoc(path.basename(file))), '사업계획서 등록 안 됨: ' + path.basename(file));
    return id;
  };
  const docRow = name => stepBody(page, 4).locator('.pdoc', { hasText:name });
  await run.step('C2-19', async () => {
    // 수정본(텍스트 PDF) 등록 → 점검: 보드 항목은 실제 계산, 문서 항목은 Claude(목) — 텍스트 모드
    const pg = await page.context().newPage();
    await pg.setContent(`<html><body style="font-family:'Malgun Gothic',sans-serif"><h1>[테스트] 사업계획서 수정본 CASE2</h1>
      <p>신청 유형: ■ 개별형 □ 클러스터형 / 신청 분야: ■ 공정기술형</p>
      <p>업체명 [테스트] CASE2 파이프가공. 도입 H/W: CNC 레이저 용접 시스템 1대. 도입 S/W: ProdEX AI Smart 6개월 임차.</p>
      <p>사업비: 정부지원금 34,200,000원, 현금 16,800,000원, 현물(인건비) 6,000,000원, 합계 57,000,000원. 설치비 1,000,000원 포함.</p>
      <p>현 생산공정의 문제점: 수작업 용접으로 불량률이 높고 작업 시간이 깁니다. 사후관리: 협약 종료 후 5년간 의무사용, 공급업체 A/S.</p>
      <p>HW 구축 일정: 10월 발주, 11월 입고·시운전. 표식 문장: 본문 텍스트 추출 확인용.</p></body></html>`);
    const file = path.join(HERE, 'results', 'plan-received.pdf');
    await pg.pdf({ path:file, format:'A4' }); await pg.close();
    await upload(file, 'received', '9/30 소공인 회신본');
    const row = docRow('plan-received.pdf');
    await hasText(row, '받은 수정본'); await hasText(row, '미점검'); await hasText(row, '9/30 소공인 회신본');
    const before = await page.evaluate(() => window.__mock.samples.length);
    await row.getByRole('button', { name:'체크리스트로 점검' }).click();
    await until(async () => !!(await planDoc('plan-received.pdf'))?.check, '점검 결과 저장 안 됨', 30000);
    const d = await planDoc('plan-received.pdf');
    if (d.check.mode !== 'text' || d.check.confirmed !== null) fail('모드·확정: ' + d.check.mode + ' / ' + JSON.stringify(d.check.confirmed));
    const r = id2 => d.check.results.find(x => x.id === id2);
    if (d.check.results.length !== 13) fail('결과 수 ' + d.check.results.length);
    if (r('ck_01').verdict !== 'fix' || !r('ck_01').evidence.includes('S/W 9,000,000원')) fail('보드 S/W 한도: ' + JSON.stringify(r('ck_01')));
    if (r('ck_02').verdict !== 'fix' || !r('ck_02').evidence.includes('2027-03-20')) fail('보드 임차 기간(기본 협약일 9/21 + 6개월 → 2027-03-20): ' + JSON.stringify(r('ck_02')));
    if (r('ck_10').verdict !== 'fix' || r('ck_06').verdict !== 'pass') fail('Claude 판정 반영: ' + JSON.stringify([r('ck_10'), r('ck_06')]));
    const call = await page.evaluate(i => window.__mock.samples[i], before);
    for (const t of ['[id:ck_06]', '[id:ck_13]', 'CNC 레이저 용접 시스템', 'ProdEX AI Smart × 6월(임차)', '2026-09-21 ~ 2026-12-20', '본문 텍스트 추출 확인용'])
      if (!call.prompt.includes(t)) fail('프롬프트에 없음: ' + t);
    if (call.prompt.includes('[id:ck_01]') || call.images) fail('보드 항목이 프롬프트에 들어갔거나 이미지가 감');
    const tbl = row.locator('.presult');
    await until(async () => (await tbl.locator('tbody tr').count()) === 13, '결과 표 행 수');
    await hasText(row.locator('.pstat'), '보완');
  });
  await run.step('C2-20', async () => {
    // 사람이 판정 수정 → 확정 → 확정 뒤 수정하면 확정이 풀림 → 보완 요청 문구
    const row = docRow('plan-received.pdf');
    const tr = row.locator('.presult tbody tr', { hasText:'신청 유형·신청 분야가 체크됨' });
    await tr.locator('select').selectOption('unknown');
    await until(async () => { const x = (await planDoc('plan-received.pdf')).check.results.find(r => r.id === 'ck_13'); return x.verdict === 'unknown' && x.edited; }, '판정 수정 저장 안 됨');
    await row.locator('.presult tbody tr', { hasText:'신청 유형·신청 분야가 체크됨' }).locator('input').fill('원본 총괄표 체크 여부 재확인');
    await row.locator('.presult tbody tr', { hasText:'신청 유형·신청 분야가 체크됨' }).locator('input').press('Tab');
    await until(async () => (await planDoc('plan-received.pdf')).check.results.find(r => r.id === 'ck_13').comment === '원본 총괄표 체크 여부 재확인', '의견 저장 안 됨');
    await docRow('plan-received.pdf').getByRole('button', { name:'점검 결과 확정' }).click();
    await until(async () => !!(await planDoc('plan-received.pdf')).check.confirmed, '확정 저장 안 됨');
    await hasText(docRow('plan-received.pdf').locator('.pstat'), '확정 ✓');
    await docRow('plan-received.pdf').getByRole('button', { name:'보완 요청 문구 복사' }).click();
    await hasText(docRow('plan-received.pdf').getByRole('button', { name:/복사/ }), '복사');
    // 확정 뒤 판정을 바꾸면 확정이 풀린다
    await docRow('plan-received.pdf').locator('.presult tbody tr', { hasText:'사후관리' }).locator('select').selectOption('fix');
    await until(async () => (await planDoc('plan-received.pdf')).check.confirmed === null, '확정이 안 풀림');
  });
  await run.step('C2-21', async () => {
    // 글자 없는 PDF(양식 원본 — Microsoft Print to PDF) → 쪽 이미지로 Claude에 전달
    const file = path.join(HERE, '..', '..', 'doc', '교재', '31_합숙', '양식', '03_PDF', '1. 소공인 사업계획서(총괄표, 상세).pdf');
    await upload(file, 'sent', '양식 원본(이미지 모드 확인)');
    const name = path.basename(file);
    const before = await page.evaluate(() => window.__mock.samples.length);
    await docRow(name).getByRole('button', { name:'체크리스트로 점검' }).click();
    await until(async () => !!(await planDoc(name))?.check, '이미지 모드 점검 저장 안 됨', 60000);
    const d = await planDoc(name);
    if (d.check.mode !== 'image' || d.check.pages !== 3 || d.check.pagesChecked !== 3) fail('이미지 모드: ' + JSON.stringify({ mode:d.check.mode, pages:d.check.pages, n:d.check.pagesChecked }));
    const call = await page.evaluate(i => window.__mock.samples[i], before);
    if (call.images !== 3 || !call.prompt.includes('쪽 이미지 3장을 첨부')) fail('이미지 전달: ' + call.images);
    await hasText(docRow(name), '보낸 초안');
  });
  await run.step('C2-22', async () => {
    // 관리 탭(소유자만): 항목 추가 → 순서 변경 → 삭제, 소유자가 아니면 탭이 숨는다
    if (!(await page.locator('#tabAdmin').isVisible())) fail('소유자인데 관리 탭이 안 보임');
    await tab(page, 'admin');
    await until(async () => (await page.locator('.admcard tbody tr').count()) === 13, '체크리스트 행 수');
    await page.getByRole('button', { name:'+ 항목 추가' }).click();
    await H.fillForm(page, { text:'[검증용] 대표 날인 여부', kind:{ value:'ai' }, guide:'' });
    await H.saveModal(page);
    await hasText(modal(page).locator('.err'), '판정 기준을 입력하세요');
    await H.fillForm(page, { guide:'마지막 쪽 신청인(대표) 날인·서명이 있는지' });
    await H.saveModal(page);
    const items = async () => (await docsOf(page, 'checklists')).plan.items;
    await until(async () => (await items()).length === 14 && (await items())[13].text === '[검증용] 대표 날인 여부', '항목 추가 저장 안 됨');
    await page.locator('.admcard tbody tr', { hasText:'[검증용] 대표 날인 여부' }).getByRole('button', { name:'위로' }).click();
    await until(async () => (await items())[12].text === '[검증용] 대표 날인 여부', '순서 변경 저장 안 됨');
    const del = page.locator('.admcard tbody tr', { hasText:'[검증용] 대표 날인 여부' }).getByRole('button', { name:'삭제' });
    await del.click(); await page.locator('.admcard tbody tr', { hasText:'[검증용] 대표 날인 여부' }).getByRole('button', { name:'삭제 확인' }).click();
    await until(async () => (await items()).length === 13, '항목 삭제 저장 안 됨');
    await page.evaluate(() => window.__mock.setOwner(false)); await page.reload(); await page.waitForTimeout(600);
    if (await page.locator('#tabAdmin').isVisible()) fail('소유자가 아닌데 관리 탭이 보임');
    await page.evaluate(() => window.__mock.setOwner(true)); await page.reload(); await page.waitForTimeout(600);
    await until(() => page.locator('#tabAdmin').isVisible(), '소유자 복원 후 관리 탭 안 보임');
    await tab(page, 'board');
  });
  await run.step('C2-23', async () => {
    // 새 과제: 연도·차수를 목록(콤보박스)에서 고른다 — 쓰고 있는 차수 + 사업 규칙 연도·올해의 연도-1·연도-2
    await tab(page, 'board');
    await page.locator('#newBtn').click();
    const opts = await page.locator('#nf-cycle-list option').evaluateAll(os => os.map(o => o.value));
    const y = String(new Date().getFullYear());
    for (const v of ['2026-T2', '2026-1', '2026-2', y + '-1']) if (!opts.includes(v)) fail('목록에 없음: ' + v + ' / ' + opts.join(','));
    if (opts.indexOf('2026-2') > opts.indexOf('2026-1')) fail('최신 먼저가 아님: ' + opts.join(','));
    if ((await page.locator('#nf-cycle').getAttribute('list')) !== 'nf-cycle-list') fail('입력칸에 목록 연결 안 됨');
    await H.closeModals(page);
  });
  await run.step('C2-24', async () => {
    // 지도 출발지: 비워 두면 현재 위치(브라우저 위치)를 자동으로 넣는다 → 입력하면 그 값 → «현재 위치로»로 되돌림
    const id = await H.openProject(page, CO);
    const d = page.locator(PD);
    await d.getByRole('button', { name:'구축지 따로 입력' }).click();
    await page.locator('#vs-' + id + '-address').fill('서울 중구 세종대로 110');
    await page.locator('#vs-' + id + '-address').press('Tab');
    await until(async () => (await docsOf(page, 'projects'))[id].visit?.address === '서울 중구 세종대로 110', '구축지 저장 안 됨');
    const link = () => d.getByRole('link', { name:'대중교통 길찾기 ↗' }).getAttribute('href');
    await hasText(d.locator('.origin .ohere'), '현재 위치 자동 (37.5665, 126.978)');
    await until(async () => (await link()).includes('origin=37.5665%2C126.978'), '길찾기에 현재 위치 없음: ' + await link());
    await d.locator('.origin input').fill('서울역'); await d.locator('.origin input').press('Tab');
    await until(async () => (await link()).includes('origin=' + encodeURIComponent('서울역')), '입력한 출발지가 우선이 아님: ' + await link());
    await d.locator('.origin').getByRole('button', { name:'현재 위치로' }).click();
    await until(async () => (await link()).includes('origin=37.5665%2C126.978'), '«현재 위치로» 후 좌표 아님: ' + await link());
    if (await page.evaluate(() => localStorage.getItem('smartcodi.origin'))) fail('출발지가 비워지지 않음');
    await d.getByRole('button', { name:'기관 주소 사용' }).click();   // 시험용 구축지 정리
    await until(async () => !(await docsOf(page, 'projects'))[id].visit, '구축지 정리 안 됨');
    await H.closeDrawer(page);
  });
  const CARD_ORG = '[테스트] 명함정밀', CARD_NAME = '[테스트] 명함';
  await run.step('C2-25', async () => {
    // 명함(텍스트) → Claude(목)가 칸을 뽑음 → 기관 창·담당자 창을 미리 채워 열고 사람이 저장
    await tab(page, 'acc');
    await page.getByRole('button', { name:'명함으로 등록' }).click();
    await page.locator('#ci-text').fill(['[테스트] 명함정밀', '[테스트] 명함 대표', 'M 010-0000-7777 T 02-000-7777', 'card@example.com', '서울 금천구 가산디지털1로 1, 3층'].join('\n'));
    const before = await page.evaluate(() => window.__mock.samples.length);
    await page.getByRole('button', { name:'명함 읽기' }).click();
    await until(() => page.locator('.cardres .kv').count(), '미리보기가 안 뜸');
    const call = await page.evaluate(i => window.__mock.samples[i], before);
    if (!call.prompt.includes('[명함]') || !call.prompt.includes('card@example.com') || call.images) fail('프롬프트·이미지: ' + call.images);
    await hasText(page.locator('.cardres'), '[테스트] 명함정밀');
    if ((await page.locator('#ci-type').inputValue()) !== 'sogongin') fail('유형 추정값이 기본이 아님');
    if ((await page.locator('#ci-acc').inputValue()) !== '') fail('새 기관이 기본이 아님');
    await page.getByRole('button', { name:'등록 창 열기' }).click();
    const val = k => modal(page).locator('#ff-' + k).inputValue();
    await until(async () => (await val('name')) === CARD_ORG, '기관 창 이름');
    for (const [k, v] of [['type','sogongin'], ['phone','02-000-7777'], ['address','서울 금천구 가산디지털1로 1'], ['addressDetail','3층']]) if ((await val(k)) !== v) fail('기관 창 ' + k + ': ' + await val(k));
    if (!(await val('memo')).includes('example.com')) fail('기관 메모에 웹사이트 없음');
    await H.saveModal(page);
    await until(async () => (await val('name')) === CARD_NAME, '담당자 창이 이어서 안 열림 / 이름: ' + await val('name').catch(() => ''));
    for (const [k, v] of [['title','대표'], ['phone','010-0000-7777'], ['email','card@example.com']]) if ((await val(k)) !== v) fail('담당자 창 ' + k + ': ' + await val(k));
    await H.saveModal(page);
    const aid = await findId(page, 'accounts', d => d.name === CARD_ORG);
    await until(async () => !!(await findId(page, 'contacts', d => d.name === CARD_NAME && d.accountId === aid && d.title === '대표')), '담당자 저장·기관 연결 안 됨');
  });
  await run.step('C2-26', async () => {
    // 명함(사진) → 이미지 전달, 같은 기관이면 «기존 기관에 담당자 추가», 같은 이메일·휴대폰이면 중복 경고 → 정리
    const pg = await page.context().newPage();
    await pg.setViewportSize({ width:560, height:320 });
    await pg.setContent('<div style="font:20px sans-serif;padding:30px"><b>[테스트] 명함정밀</b><p>[테스트] 명함 대표</p><p>010-0000-7777 · card@example.com</p></div>');
    const file = path.join(HERE, 'results', 'card.png');
    await pg.screenshot({ path:file }); await pg.close();
    await tab(page, 'con');
    await page.getByRole('button', { name:'명함으로 등록' }).click();
    await page.locator('#ci-img').setInputFiles(file);
    const before = await page.evaluate(() => window.__mock.samples.length);
    await page.getByRole('button', { name:'명함 읽기' }).click();
    await until(() => page.locator('.cardres .kv').count(), '미리보기가 안 뜸');
    const call = await page.evaluate(i => window.__mock.samples[i], before);
    if (call.images !== 1 || !call.prompt.includes('첨부 이미지 1장')) fail('이미지 전달: ' + call.images);
    const aid = await findId(page, 'accounts', d => d.name === CARD_ORG);
    if ((await page.locator('#ci-acc').inputValue()) !== aid) fail('기존 기관이 기본 선택이 아님');
    if (await page.locator('#ci-type').isVisible()) fail('기존 기관인데 유형 선택이 보임');
    await hasText(page.locator('.cardres .cdup'), '이미 등록된 담당자일 수 있습니다: ' + CARD_NAME + ' 대표');
    await page.getByRole('button', { name:'등록 창 열기' }).click();
    await until(async () => (await modal(page).locator('#ff-accountId').inputValue()) === aid, '담당자 창 기관이 기존 기관이 아님');
    await H.closeModals(page);
    await cleanupCase(page, { company:'(없음)', contacts:[CARD_NAME], accounts:[CARD_ORG] });
  });
  await run.step('C2-27', async () => {
    // 보드 도우미(오른쪽 대화창): 명함 사진 붙여 넣기 → 읽기 → 대화로 유형 정정 → «등록해 줘» → 미리 채운 창 저장 → 정리
    await tab(page, 'board');
    await page.locator('#assistBtn').click();
    await until(() => page.locator('#assist').isVisible(), '도우미 패널이 안 열림');
    const png = (await import('node:fs')).readFileSync(path.join(HERE, 'results', 'card.png')).toString('base64');
    await page.evaluate(b64 => {
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const dt = new DataTransfer(); dt.items.add(new File([bin], 'card.png', { type:'image/png' }));
      document.getElementById('as-input').dispatchEvent(new ClipboardEvent('paste', { clipboardData:dt, bubbles:true, cancelable:true }));
    }, png);
    await until(async () => (await page.locator('#assist .athumb').count()) === 1, '붙여 넣은 이미지가 안 붙음');
    const say = async (t, n) => {
      const before = await page.evaluate(() => window.__mock.samples.length);
      await page.locator('#as-input').fill(t); await page.locator('#as-input').press('Enter');
      await until(async () => (await page.evaluate(() => window.__mock.samples.length)) > before && !(await page.locator('#assist .abub.bot', { hasText:'읽는 중…' }).count()), '답이 안 옴: ' + t);
      return page.evaluate(i => window.__mock.samples[i], before);
    };
    const c1 = await say('이 명함 읽어 줘');
    if (c1.images !== 1 || !c1.prompt.includes('[도우미]') || !c1.prompt.includes('[테스트] CASE2 파이프가공')) fail('1턴 전달: 이미지 ' + c1.images);
    await until(() => page.locator('#as-1-type').count(), '명함 카드가 대화에 안 뜸');
    if ((await page.locator('#as-1-type').inputValue()) !== 'sogongin' || (await page.locator('#as-1-acc').inputValue()) !== '') fail('1턴 카드 기본값');
    if (await page.locator('#assist .athumb').count()) fail('보낸 뒤 이미지가 남음');
    await say('유형은 공급기업이야');
    await until(async () => (await page.locator('#as-2-type').inputValue().catch(() => '')) === 'supplier', '대화로 유형 정정 안 됨');
    const c3 = await say('등록해 줘');
    if (!c3.prompt.includes('유형은 공급기업이야') || !c3.prompt.includes('"orgType":"supplier"')) fail('3턴에 대화·현재 명함이 안 들어감');
    const val = k => modal(page).locator('#ff-' + k).inputValue();
    await until(async () => (await val('name').catch(() => '')) === CARD_ORG, '«등록해 줘»로 기관 창이 안 열림');
    if ((await val('type')) !== 'supplier' || (await val('phone')) !== '02-000-7777') fail('기관 창 값: ' + await val('type'));
    await hasText(page.locator('#assist .abub.sys').last(), '등록 창을 열었습니다');
    await H.saveModal(page);
    await until(async () => (await val('name').catch(() => '')) === CARD_NAME, '담당자 창이 이어서 안 열림');
    await H.saveModal(page);
    const aid = await findId(page, 'accounts', d => d.name === CARD_ORG && d.type === 'supplier');
    await until(async () => !!(await findId(page, 'contacts', d => d.name === CARD_NAME && d.accountId === aid)), '대화로 등록한 담당자 저장·연결 안 됨');
    await say('한빛정밀 과제 어디까지 진행됐어?');   // 목록에 없는 업체 + 열린 과제 없음 → 현황 카드 없이 되묻기
    await hasText(page.locator('#assist .abub.sys').last(), '어느 과제인지 모르겠습니다');
    if (await page.locator('#assist .svbox').count()) fail('모르는 과제인데 현황 카드가 뜸');
    await page.locator('#assist').getByRole('button', { name:'닫기' }).click();
    await until(async () => !(await page.locator('#assist').isVisible()), '도우미가 안 닫힘');
    await cleanupCase(page, { company:'(없음)', contacts:[CARD_NAME], accounts:[CARD_ORG] });
  });
  await run.step('C2-28', async () => {
    // 새 과제의 업체명: 소공인 기관만 목록에 있고(공급기업 없음), «+ 새 소공인 기관 등록…»으로 만들면 그 기관이 선택된다
    await tab(page, 'board');
    await page.locator('#newBtn').click();
    const sel = modal(page).locator('#nf-company');
    if ((await sel.evaluate(n => n.tagName)) !== 'SELECT') fail('업체명이 선택 목록이 아님');
    const accs = await docsOf(page, 'accounts');
    const vals = await sel.locator('option').evaluateAll(os => os.map(o => o.value));
    const bad = vals.filter(v => v && v !== '__new' && accs[v]?.type !== 'sogongin');
    if (bad.length) fail('소공인 아닌 기관이 목록에 있음: ' + bad.map(v => accs[v]?.name).join(', '));
    if (!vals.includes(await findId(page, 'accounts', d => d.name === CO))) fail('소공인 기관이 목록에 없음');
    if (vals.includes(await findId(page, 'accounts', d => d.name === SUP))) fail('공급기업이 목록에 있음');
    await sel.selectOption('__new');
    await until(async () => (await page.locator('.modal').count()) === 2, '새 기관 창이 안 열림');
    if ((await modal(page).locator('#ff-type').inputValue()) !== 'sogongin') fail('새 기관 창 유형이 소공인이 아님');
    await modal(page).locator('#ff-name').fill('[테스트] 목록에서 만든 업체');
    await H.saveModal(page);
    const nid = await until(() => findId(page, 'accounts', d => d.name === '[테스트] 목록에서 만든 업체' && d.type === 'sogongin'), '새 소공인 기관 저장 안 됨');
    await until(async () => (await page.locator('#nf-company').inputValue()) === nid, '새 기관이 업체로 선택되지 않음');
    await H.closeModals(page);
    await cleanupCase(page, { company:'(없음)', accounts:['[테스트] 목록에서 만든 업체'] });
  });
  await run.step('C2-29', async () => {
    // 보는 화면이 사진을 못 보낼 때(실측: claude.ai 웹)·Claude를 못 쓸 때 — 버튼은 보이고 도우미 창이 이유를 먼저 알린다
    const reopen = async view => { await page.evaluate(v => window.__mock.setView(v), view); await page.reload(); await page.waitForTimeout(700); };
    await reopen({ noImages:true });
    if (!(await page.locator('#assistBtn').isVisible())) fail('도우미 버튼이 안 보임(사진 불가 화면)');
    await page.locator('#assistBtn').click();
    await hasText(page.locator('#assist .abub.sys'), '사진을 보낼 수 없습니다');
    if ((await page.locator('#as-img').getAttribute('accept')) !== 'application/pdf') fail('사진 불가 화면인데 이미지 첨부 가능: ' + await page.locator('#as-img').getAttribute('accept'));
    if (!(await page.locator('#assist label', { hasText:'첨부' }).isVisible())) fail('견적서 PDF 첨부 버튼이 안 보임');
    if ((await page.locator('#as-input').getAttribute('placeholder')).includes('Ctrl+V')) fail('입력칸 안내가 사진 붙여 넣기 그대로');
    if (await page.locator('#assist').getByRole('button', { name:'보내기' }).isDisabled()) fail('텍스트는 보낼 수 있어야 함');
    await reopen({ noSample:true });
    if (!(await page.locator('#assistBtn').isVisible())) fail('도우미 버튼이 안 보임(Claude 불가 화면)');
    await page.locator('#assistBtn').click();
    await hasText(page.locator('#assist .abub.sys'), 'Claude를 쓸 수 없어 도우미를 사용할 수 없습니다');
    if (!(await page.locator('#assist').getByRole('button', { name:'보내기' }).isDisabled())) fail('Claude 불가인데 보내기가 켜짐');
    await reopen({});
    await tab(page, 'board');
  });
  // 도우미로 양식 초안 작성 → 단계 산출물로 등록 (C2-30·31)
  const askDraft = async text => {
    const n0 = await page.locator('#assist .dprev').count();
    await page.locator('#as-input').fill(text); await page.locator('#as-input').press('Enter');
    try { await until(async () => (await page.locator('#assist .dprev').count()) > n0, '초안 미리보기가 안 뜸', 15000); }
    catch (e){ fail('초안 미리보기가 안 뜸: ' + text + ' / 마지막 말풍선: ' + (await page.locator('#assist .abub').last().innerText().catch(() => '?')).slice(0, 200)); }
    return page.locator('#assist .dprev').last();
  };
  const stepOf = async (n) => (await docsOf(page, 'projects'))[await projectId(page, CO)].steps[String(n)];
  const closeAssist = async () => { if (await page.locator('#assist').isVisible()) await page.locator('#assist').getByRole('button', { name:'닫기' }).click(); };
  await run.step('C2-30', async () => {
    try {
      await tab(page, 'board');
      if (!(await page.locator('#assist').isVisible())) await page.locator('#assistBtn').click();
      await page.locator('#assist').getByRole('button', { name:'새 대화' }).click();
      const docsBefore = JSON.stringify((await stepOf(2)).docs || {});
      const before = await page.evaluate(() => window.__mock.samples.length);
      const pv = await askDraft(CO + ' 2차 수행일지 써 줘. 오늘 방문에서 용접 불량 원인 논의함');
      const calls = await page.evaluate(i => window.__mock.samples.slice(i), before);
      const w = calls.find(c => c.prompt.startsWith('[작성]'));
      if (!w) fail('작성 호출 없음');
      for (const t of ['수행일지·현장진단표 (2차)', '[칸 목록]', '코디네이팅 활동요약', '[근거]', '[사용자가 알려 준 내용]', '용접 불량 원인']) if (!w.prompt.includes(t)) fail('작성 프롬프트에 없음: ' + t);
      await hasText(pv, '(목) 작성 — 코디네이팅 활동요약 · 용접 불량 원인 논의 반영');
      await hasText(page.locator('#assist .abub.sys').last(), '(목) 수행시간을 알려 주세요');
      await pv.getByRole('button', { name:'2단계 산출물로 등록' }).click();
      await until(async () => ((await stepOf(2)).outputs || []).length === 1, '2단계 산출물 등록 안 됨');
      const o = (await stepOf(2)).outputs[0];
      if (o.name !== '수행일지·현장진단표 (2차) 초안 v1' || o.formId !== 'log2' || !o.draft?.sections?.length) fail('등록 내용: ' + JSON.stringify({ name:o.name, formId:o.formId }));
      if (JSON.stringify((await stepOf(2)).docs || {}) !== docsBefore) fail('산출물 체크가 자동으로 바뀜');
      await pv.getByRole('button', { name:'알려 준 내용을 단계 메모로 저장' }).click();
      await until(async () => ((await stepOf(2)).notes || []).some(x => x.text.startsWith('(도우미 대화)') && x.text.includes('용접 불량 원인')), '대화 내용이 메모로 안 남음');
      await page.locator('#assist').getByRole('button', { name:'닫기' }).click();
      await H.openStep(page, CO, 2);
      const row = stepBody(page, 2).locator('.pout', { hasText:'초안 v1' });
      const dl0 = await H.downloadCount(page);
      await row.getByRole('button', { name:'Word로 받기' }).click();
      const d = await H.nextDownload(page, dl0);
      const text = H.docxText(d.b64);
      if (!d.filename.endsWith('.docx') || !text.includes('(목) 작성 — 코디네이팅 활동요약') || !text.includes('보드 도우미가')) fail('Word 내용: ' + d.filename);
      await row.getByRole('button', { name:'보기' }).click();
      await until(() => stepBody(page, 2).locator('.pout .dview').count(), '초안 보기가 안 펼쳐짐');
      await H.closeDrawer(page);
    } finally { await closeAssist(); }
  });
  await run.step('C2-31', async () => {
    try {
      if (!(await page.locator('#assist').isVisible())) await page.locator('#assistBtn').click();
      const pv1 = await askDraft(CO + ' 4차 수행일지 써 줘');
      await hasText(pv1, '8단계');
      await pv1.getByRole('button', { name:'8단계 산출물로 등록' }).click();
      const pv2 = await askDraft(CO + ' 4차 수행일지 다시 써 줘');
      await pv2.getByRole('button', { name:'8단계 산출물로 등록' }).click();
      const pv3 = await askDraft(CO + ' 결과보고서 써 줘');
      await pv3.getByRole('button', { name:'8단계 산출물로 등록' }).click();
      await until(async () => ((await stepOf(8)).outputs || []).length === 3, '8단계 산출물 3건이 아님');
      const names = (await stepOf(8)).outputs.map(o => o.name);
      for (const n of ['수행일지·현장진단표 (4차) 초안 v1', '수행일지·현장진단표 (4차) 초안 v2', '결과보고서 초안 v1']) if (!names.includes(n)) fail('8단계 산출물에 없음: ' + n + ' / ' + names.join(', '));
      const log4 = (await stepOf(8)).outputs.find(o => o.formId === 'log4');
      if (!JSON.stringify(log4.draft).includes('4차')) fail('4차 초안에 차수 표시 없음');
      await page.locator('#assist').getByRole('button', { name:'닫기' }).click();
      await H.openStep(page, CO, 8);
      await hasText(stepBody(page, 8).locator('.diag .subhead').first(), '현장진단표 항목 (4차)');
      await hasText(stepBody(page, 8).locator('.forms'), '수행일지·현장진단표 (4차)');
      await H.closeDrawer(page);
    } finally { await closeAssist(); }
  });
  await run.step('C2-33', async () => {
    // 도우미에 견적서 PDF 첨부 → 표(공급기업·과제 자동 선택, 기존 장비·이미 있는 자산 표시) → «선택한 2건 등록» → 장비·자산(검토 중) 저장, 기존 단가 그대로
    try {
      await tab(page, 'board');
      if (!(await page.locator('#assist').isVisible())) await page.locator('#assistBtn').click();
      await page.locator('#assist').getByRole('button', { name:'새 대화' }).click();
      const pg = await page.context().newPage();
      await pg.setContent(`<html><body style="font-family:'Malgun Gothic',sans-serif"><h1>견 적 서</h1>
        <p>공급자: ${SUP} · 수신: ${CO} 귀하 · 견적일 2026-10-02 · 견적번호 Q-TEST-01 · 부가세 별도</p>
        <p>1. CNC 레이저 용접 시스템 1대 41,000,000 / 2. [테스트] 견적 계량기 QT-100 2대 1,500,000 / 3. [테스트] 견적 MES QM-1 3개월 400,000</p>
        <p>표식 문장: 견적서 텍스트 추출 확인용.</p></body></html>`);
      const file = path.join(HERE, 'results', 'quote.pdf');
      await pg.pdf({ path:file, format:'A4' }); await pg.close();
      await page.locator('#as-img').setInputFiles(file);
      await until(async () => (await page.locator('#assist .athumb', { hasText:'quote.pdf' }).count()) === 1, 'PDF가 첨부 목록에 안 붙음');
      const before = await page.evaluate(() => window.__mock.samples.length);
      const n0 = await page.locator('#assist .qbox').count();
      await page.locator('#as-input').fill('이 견적서 읽어 줘'); await page.locator('#as-input').press('Enter');
      try { await until(async () => (await page.locator('#assist .qbox').count()) > n0, '견적서 표가 안 뜸', 20000); }
      catch (e){ fail('견적서 표가 안 뜸 / 마지막 말풍선: ' + (await page.locator('#assist .abub').last().innerText().catch(() => '?')).slice(0, 200)); }
      const c = await page.evaluate(i => window.__mock.samples[i], before);
      if (c.images !== 0 || !c.prompt.includes('[첨부 PDF: quote.pdf') || !c.prompt.includes('견적서 텍스트 추출 확인용')) fail('PDF 텍스트 전달: 이미지 ' + c.images);
      const box = page.locator('#assist .qbox').last();
      const supId = await findId(page, 'accounts', d => d.name === SUP), pid = await projectId(page, CO);
      if ((await box.locator('select[id$="-sup"]').inputValue()) !== supId) fail('공급기업 자동 선택 안 됨');
      if ((await box.locator('select[id$="-proj"]').inputValue()) !== pid) fail('과제 자동 선택 안 됨');
      const cnc = box.locator('.qitem', { hasText:'CNC 레이저 용접 시스템' });
      await hasText(cnc, '기존 장비 사용'); await hasText(cnc, '단가 갱신'); await hasText(cnc, '이 과제에 이미 자산 있음');
      if (await cnc.locator('input[type=checkbox]').first().isChecked()) fail('이미 자산이 있는 품목이 선택됨');
      await hasText(box.locator('.qitem', { hasText:'견적 계량기' }), '새 장비');
      const cncId = await findId(page, 'products', d => d.name === 'CNC 레이저 용접 시스템');
      const nProd = Object.keys(await docsOf(page, 'products')).length;
      await box.getByRole('button', { name:'선택한 2건 등록' }).click();
      await hasText(page.locator('#assist .abub.sys').last(), '등록했습니다');
      const meterId = await until(() => findId(page, 'products', d => d.name === '[테스트] 견적 계량기'), '새 장비 저장 안 됨');
      const mesId = await until(() => findId(page, 'products', d => d.name === '[테스트] 견적 MES'), '새 장비(S/W) 저장 안 됨');
      await until(async () => Object.values(await docsOf(page, 'assets')).filter(a => a.projectId === pid && [meterId, mesId].includes(a.productId)).length === 2, '자산 2건 저장 안 됨');
      const prods = await docsOf(page, 'products'), assets = Object.values(await docsOf(page, 'assets'));
      const m = prods[meterId], s = prods[mesId];
      if (m.supplierId !== supId || m.unitPrice !== 1500000 || m.kind !== 'hw' || m.unit !== '대' || m.model !== 'QT-100') fail('계량기 장비: ' + JSON.stringify(m));
      if (s.kind !== 'sw' || s.unit !== '월(임차)' || s.unitPrice !== 400000 || !s.memo.includes('견적번호 Q-TEST-01')) fail('MES 장비: ' + JSON.stringify(s));
      if (Object.keys(prods).length !== nProd + 2) fail('장비 수가 ' + (Object.keys(prods).length - nProd) + '개 늘어남(기대 2)');
      const am = assets.find(a => a.productId === meterId), as2 = assets.find(a => a.productId === mesId);
      if (am.qty !== 2 || am.status !== 'review' || as2.qty !== 3 || as2.status !== 'review') fail('자산: ' + JSON.stringify([am, as2]));
      if (prods[cncId].unitPrice !== 42000000) fail('기존 장비 단가가 바뀜: ' + prods[cncId].unitPrice);
      if (assets.filter(a => a.projectId === pid && a.productId === cncId).length !== 1) fail('기존 자산이 중복 등록됨');
      if (!(await box.getByRole('button', { name:'등록됨' }).isDisabled())) fail('등록 뒤 버튼이 다시 눌림');
      // 대화로 «등록해 줘» → 표의 버튼을 안내만(자동 저장 안 함)
      await page.locator('#as-input').fill('등록해 줘'); await page.locator('#as-input').press('Enter');
      await hasText(page.locator('#assist .abub.sys').last(), '견적서는 위 표에서');
    } finally { await closeAssist(); }
  });
  await run.step('C2-34', async () => {
    // 방문 메모 → 1차 진단표 항목 제안 → 카드(메모에 없음·기존 값·메모에 없는 숫자는 해제) → «선택한 4칸을 진단표에 넣기» → «단계 메모로도 저장»
    try {
      const id = await H.openStep(page, CO, 1);
      const ta8 = page.locator(`#dg-${id}-1-8`); await ta8.fill('[테스트] 기존 담당 인력'); await ta8.blur();
      await until(async () => (await stepOf(1)).diag?.['⑧ 담당 가능 인력'] === '[테스트] 기존 담당 인력', '⑧ 기존 값 저장 안 됨');
      await H.closeDrawer(page);
      const st0 = await stepOf(1);
      if (!(await page.locator('#assist').isVisible())) await page.locator('#assistBtn').click();
      await page.locator('#assist').getByRole('button', { name:'새 대화' }).click();
      const before = await page.evaluate(() => window.__mock.samples.length);
      const n0 = await page.locator('#assist .dgbox').count();
      await page.locator('#as-input').fill(CO + ' 1차 방문 메모: 대표가 "불량이 하루 30개쯤 나와요"라고 함. 기록은 종이 일지. 검사는 육안. 다음 주 게이지 도입 검토 예정.');
      await page.locator('#as-input').press('Enter');
      try { await until(async () => (await page.locator('#assist .dgbox').count()) > n0, '진단표 카드가 안 뜸', 15000); }
      catch (e){ fail('진단표 카드가 안 뜸 / 마지막 말풍선: ' + (await page.locator('#assist .abub').last().innerText().catch(() => '?')).slice(0, 200)); }
      const c = await page.evaluate(i => window.__mock.samples[i], before);
      for (const t of ['현장진단표 나누기 규칙', '[현장진단표 항목]', '1차 | ⑤ 원인추적가능성 |', '(대표자 추정)', '원문 그대로', 'LEVEL을 쓰지 않습니다', '[현재 진단표 제안] 없음'])
        if (!c.prompt.includes(t)) fail('규칙 턴에 없음: ' + t);
      const box = page.locator('#assist .dgbox').last();
      await hasText(box, '1차 현장진단표 (1단계)');
      if ((await box.locator('.qitem').count()) !== 9) fail('1차 항목 카드가 9장이 아님');
      await hasText(box.locator('.qitem', { hasText:'① 전체 공정' }), '메모에 없음');
      await hasText(box.locator('.qitem', { hasText:'⑦ 안전·환경위험' }), '메모에 없음');   // «미확인» 값은 빈칸 취급
      await hasText(box, '맞지 않아 뺀 것: ⑨ 없는 항목');
      const item = t => box.locator('.qitem', { hasText:t });
      const on = async t => item(t).locator('input[type=checkbox]').isChecked();
      await hasText(item('⑧ 담당 가능 인력'), '기존: [테스트] 기존 담당 인력');
      if (await on('⑧ 담당 가능 인력')) fail('기존 값 있는 칸이 선택됨');
      await hasText(item('⑤ 원인추적가능성'), '메모에 없는 숫자: 5');
      if (await on('⑤ 원인추적가능성')) fail('메모에 없는 숫자 칸이 선택됨');
      for (const t of ['현상청취', '③ 현재 기록 방식', '④ KPI 변수', '⑥ 검사방식']) if (!(await on(t))) fail('선택 안 됨: ' + t);
      await box.getByRole('button', { name:'선택한 4칸을 진단표에 넣기' }).click();
      await hasText(page.locator('#assist .abub.sys').last(), '4칸을 넣었습니다');
      await until(async () => (await stepOf(1)).diag?.['⑥ 검사방식'] === '육안 검사', '진단표에 안 들어감');
      const st = await stepOf(1);
      const want = { '현상청취 (대표자의 말)':'"불량이 하루 30개쯤 나와요"', '③ 현재 기록 방식 수준':'종이 일지', '④ KPI 변수에 따른 기초 데이터 유형':'용접 불량 하루 30개 (대표자 추정)', '⑧ 담당 가능 인력':'[테스트] 기존 담당 인력' };
      for (const [k, v] of Object.entries(want)) if (st.diag[k] !== v) fail('진단값 ' + k + ': ' + st.diag[k]);
      if (st.diag['⑤ 원인추적가능성'] || st.diag['⑨ 없는 항목'] !== undefined) fail('걸러야 할 값이 저장됨');
      if (st.status !== st0.status || JSON.stringify(st.docs || {}) !== JSON.stringify(st0.docs || {})) fail('단계 상태·산출물 체크가 바뀜');
      if (!(await box.getByRole('button', { name:'넣음 (4칸)' }).isDisabled())) fail('넣은 뒤 버튼이 다시 눌림');
      await box.getByRole('button', { name:'단계 메모로도 저장' }).click();
      await until(async () => ((await stepOf(1)).notes || []).some(x => x.text.startsWith('(방문 메모)') && x.text.includes('종이 일지')), '방문 메모가 단계 메모로 안 남음');
      await page.locator('#assist').getByRole('button', { name:'닫기' }).click();
      await H.openStep(page, CO, 1);
      if ((await page.locator(`#dg-${id}-1-6`).inputValue()) !== '육안 검사') fail('상세 진단 칸에 값이 안 보임');
      await hasText(stepBody(page, 1).locator('.diag .subhead'), '5/9');
      await H.closeDrawer(page);
    } finally { await closeAssist(); }
  });
  await run.step('C2-35', async () => {
    // 과제 현황: Claude(목)는 과제만 고르고(action status) 카드 내용은 보드가 만든다 → «과제 열기» → 열린 과제로 되묻지 않고 카드. 저장 없음
    try {
      await H.closeDrawer(page);
      await tab(page, 'board');
      if (!(await page.locator('#assist').isVisible())) await page.locator('#assistBtn').click();
      await page.locator('#assist').getByRole('button', { name:'새 대화' }).click();
      const pid = await projectId(page, CO);
      const doc0 = JSON.stringify((await docsOf(page, 'projects'))[pid]);
      const ask = async text => {
        const before = await page.evaluate(() => window.__mock.samples.length);
        const n0 = await page.locator('#assist .svbox').count();
        await page.locator('#as-input').fill(text); await page.locator('#as-input').press('Enter');
        try { await until(async () => (await page.locator('#assist .svbox').count()) > n0, '현황 카드가 안 뜸', 15000); }
        catch (e){ fail('현황 카드가 안 뜸: ' + text + ' / 마지막 말풍선: ' + (await page.locator('#assist .abub').last().innerText().catch(() => '?')).slice(0, 200)); }
        return { c:await page.evaluate(i => window.__mock.samples[i], before), box:page.locator('#assist .svbox').last() };
      };
      const { c, box } = await ask(CO + ' 뭐가 남았어?');
      for (const t of ['과제 현황 규칙', '"status"', '짐작해서 고르지 않습니다', 'reply에 옮기지 않습니다']) if (!c.prompt.includes(t)) fail('규칙 턴에 없음: ' + t);
      await hasText(box.locator('.svco'), CO);
      const p = (await docsOf(page, 'projects'))[pid], cur = Math.min(p.currentStep || 1, 9);
      if (cur < 9) await hasText(box, '현재 단계');
      const sec = t => box.locator('.svsec', { hasText:t });
      await hasText(sec('사업계획서 점검'), 'S/W 한도');
      await hasText(sec('장비 도입 마감'), 'CNC 레이저 용접 시스템');
      await hasText(sec('장비 도입 마감'), '검토 중');
      if (cur < 9){
        const st = p.steps[String(cur)] || {};
        const checked = Object.entries(st.tasks || {}).filter(([k, v]) => v && k.startsWith(cur + '|')).length;
        if (!(await sec('이번 단계 남은 업무').count()) && checked === 0) fail('체크 안 한 업무가 있는데 «이번 단계 남은 업무»가 없음');
      }
      await hasText(box, '보드에 입력된 값으로 만든 현황');
      if (JSON.stringify((await docsOf(page, 'projects'))[pid]) !== doc0) fail('현황 조회로 과제가 바뀜');
      await box.getByRole('button', { name:'과제 열기' }).click();
      await until(() => page.locator(PD + ' h2', { hasText:CO }).count(), '«과제 열기»로 과제 상세가 안 열림');
      if (!(await page.locator('#work').isVisible())) fail('«과제 열기»가 과제 탭 «목록»으로 이동하지 않음');
      if (!(await page.locator('#assist').isVisible())) fail('«과제 열기» 뒤 도우미가 닫힘(넓은 화면은 오른쪽 칸에 그대로)');
      const cs = Math.min(p.currentStep || 1, 8);
      if (!(await page.locator('#st-' + pid + '-' + cs).count())) fail('«과제 열기»로 현재 단계(' + cs + ')가 안 펼쳐짐');
      // 상세가 열린 채로 업체명 없이 물으면 열린 과제의 카드(목은 projectId "")
      const r2 = await ask('뭐가 남았어?');
      await hasText(r2.box.locator('.svco'), CO);
      if (JSON.stringify((await docsOf(page, 'projects'))[pid]) !== doc0) fail('현황 조회로 과제가 바뀜(2)');
    } finally { await closeAssist(); await H.closeDrawer(page); }
  });
  await run.step('C2-36', async () => {
    // 방문 결과 → 끝낸 업무·산출물·완료일 제안 카드 → «선택한 항목 체크». 미래형 근거·기존 완료일은 해제, 이미 체크된 업무는 표시만, 단계 상태·currentStep 그대로
    try {
      const id = await H.openStep(page, CO, 2);
      const t1 = stepBody(page, 2).locator('.rolegrp label.chk', { hasText:'개선과제 공유 및 논의' }).locator('input');
      if (!(await t1.isChecked())) await t1.check();
      await page.locator(`#d-${id}-2-actual`).fill('2026-10-01');
      await until(async () => (await stepOf(2)).actual === '2026-10-01' && (await stepOf(2)).tasks?.['2|coord|개선과제 공유 및 논의'] === true, '사전 준비(체크·완료일) 저장 안 됨');
      await H.closeDrawer(page);
      const pid = await projectId(page, CO);
      const p0 = (await docsOf(page, 'projects'))[pid], st0 = p0.steps['2'];
      if (!(await page.locator('#assist').isVisible())) await page.locator('#assistBtn').click();
      await page.locator('#assist').getByRole('button', { name:'새 대화' }).click();
      const say = async text => {
        const before = await page.evaluate(() => window.__mock.samples.length);
        const n0 = await page.locator('#assist .pgbox').count();
        await page.locator('#as-input').fill(text); await page.locator('#as-input').press('Enter');
        try { await until(async () => (await page.locator('#assist .pgbox').count()) > n0, '체크 카드가 안 뜸', 15000); }
        catch (e){ fail('체크 카드가 안 뜸: ' + text + ' / 마지막 말풍선: ' + (await page.locator('#assist .abub').last().innerText().catch(() => '?')).slice(0, 200)); }
        return { c:await page.evaluate(i => window.__mock.samples[i], before), box:page.locator('#assist .pgbox').last() };
      };
      const { c, box } = await say(CO + ' 2차 방문 오늘 끝남. 개선과제 도출했고 대표 서명 받음. 수행일지는 내일 씀.');
      for (const t of ['방문 결과 체크 규칙', '[단계 업무·산출물]', '2 | 업무(코디네이터) | 개선과제 도출', '2 | 산출물 | 2차 방문 확인 서명', '끝났다고 말한 것만', '[현재 체크 제안] 없음'])
        if (!c.prompt.includes(t)) fail('규칙 턴에 없음: ' + t);
      await hasText(box, '2. 2차 방문');
      const item = t => box.locator('.qitem', { hasText:t });
      const on = async t => item(t).locator('input[type=checkbox]').isChecked();
      await hasText(item('개선과제 공유 및 논의'), '이미 체크됨');
      if (await item('개선과제 공유 및 논의').locator('input').count()) fail('이미 체크된 업무에 체크박스가 있음');
      await hasText(item('수행일지 작성'), '미래·부정형');
      if (await on('수행일지 작성')) fail('미래형 근거(«내일 씀») 업무가 선택됨');
      await hasText(item('완료일'), '기존 완료일 2026-10-01');
      if (await on('완료일')) fail('기존 완료일이 있는데 새 완료일이 선택됨');
      for (const t of ['코디네이터: 개선과제 도출', '서명 및 확인', '산출물: 2차 방문 확인 서명']) if (!(await on(t))) fail('선택 안 됨: ' + t);
      await hasText(box, '맞지 않아 뺀 것: 개선과제를 도출함, 수행일지 2차');
      await box.getByRole('button', { name:'선택한 항목 체크 (3)' }).click();
      await hasText(page.locator('#assist .abub.sys').last(), '업무 2개·산출물 1개를 체크했습니다');
      await until(async () => (await stepOf(2)).docs?.['2차 방문 확인 서명'] === true, '산출물 체크 저장 안 됨');
      const p1 = (await docsOf(page, 'projects'))[pid], st1 = p1.steps['2'];
      if (st1.tasks['2|coord|개선과제 도출'] !== true || st1.tasks['2|coord|서명 및 확인'] !== true) fail('업무 체크: ' + JSON.stringify(st1.tasks));
      if (st1.tasks['2|coord|수행일지 작성']) fail('미래형 업무가 체크됨');
      if (st1.actual !== '2026-10-01') fail('기존 완료일이 바뀜: ' + st1.actual);
      if (st1.status !== st0.status || p1.currentStep !== p0.currentStep) fail('단계 상태·현재 단계가 바뀜: ' + st0.status + '→' + st1.status + ', ' + p0.currentStep + '→' + p1.currentStep);
      if (!(await box.getByRole('button', { name:'체크함' }).isDisabled())) fail('체크 뒤 버튼이 다시 눌림');
      await box.getByRole('button', { name:'단계 메모로도 저장' }).click();
      await until(async () => ((await stepOf(2)).notes || []).some(x => x.text.startsWith('(방문 결과)') && x.text.includes('대표 서명 받음')), '방문 결과가 단계 메모로 안 남음');
      // 완료일이 비어 있으면 «오늘»을 보드가 today()로 바꿔 선택한 채로 제안, 이미 체크된 항목은 표시만
      await closeAssist();
      await H.openStep(page, CO, 2);
      await page.locator(`#d-${id}-2-actual`).fill('');
      await until(async () => !(await stepOf(2)).actual, '완료일 비우기 저장 안 됨');
      await H.closeDrawer(page);
      if (!(await page.locator('#assist').isVisible())) await page.locator('#assistBtn').click();
      await page.locator('#assist').getByRole('button', { name:'새 대화' }).click();
      const r2 = await say(CO + ' 2차 방문 오늘 끝남. 개선과제 도출했고 대표 서명 받음.');
      const today = await page.evaluate('today()');
      await hasText(r2.box.locator('.qitem', { hasText:'완료일' }), today);
      if (!(await r2.box.locator('.qitem', { hasText:'완료일' }).locator('input').isChecked())) fail('빈 완료일에 «오늘» 제안이 선택 안 됨');
      await hasText(r2.box.locator('.qitem', { hasText:'개선과제 도출' }).first(), '이미 체크됨');
      await r2.box.getByRole('button', { name:'선택한 항목 체크 (1)' }).click();
      await until(async () => (await stepOf(2)).actual === today, '완료일 «오늘»이 저장 안 됨');
      const p2 = (await docsOf(page, 'projects'))[pid];
      if (p2.steps['2'].status !== st0.status || p2.currentStep !== p0.currentStep) fail('완료일 저장으로 단계 상태·현재 단계가 바뀜');
      // 과제를 모르면(업체명 없음·열린 과제 없음) 카드 없이 되묻기 — 과제 탭 «목록»을 떠나면 열린 과제가 없다
      await tab(page, 'board');
      await page.locator('#as-input').fill('2차 방문 끝남. 서명 받음.'); await page.locator('#as-input').press('Enter');
      await hasText(page.locator('#assist .abub.sys').last(), '어느 과제의 방문 결과인지');
    } finally { await closeAssist(); await H.closeDrawer(page); }
  });
  await run.step('C2-37', async () => {
    // 방문 결과의 완료일 «어제»·명시 날짜: 어제 = today()-1(기존 완료일과 다르면 해제), 명시 날짜는 그대로, 없는 날짜(2월 30일)는 비움
    try {
      await H.closeDrawer(page);
      const pid = await projectId(page, CO);
      const p0 = (await docsOf(page, 'projects'))[pid], st0 = p0.steps['2'];
      if (!st0.actual) fail('사전 조건: 2단계 완료일이 있어야 함(C2-36)');
      if (!(await page.locator('#assist').isVisible())) await page.locator('#assistBtn').click();
      await page.locator('#assist').getByRole('button', { name:'새 대화' }).click();
      const say = async text => {
        const n0 = await page.locator('#assist .pgbox').count();
        await page.locator('#as-input').fill(text); await page.locator('#as-input').press('Enter');
        await until(async () => (await page.locator('#assist .pgbox').count()) > n0, '체크 카드가 안 뜸: ' + text, 15000);
        return page.locator('#assist .pgbox').last();
      };
      const yest = await page.evaluate("addDays(today(), -1)");
      const b1 = await say(CO + ' 2차 방문 어제 끝남. 개선과제 도출했고.');
      const d1 = b1.locator('.qitem', { hasText:'완료일' });
      await hasText(d1, yest);
      if (yest !== st0.actual) {
        await hasText(d1, '기존 완료일');
        if (await d1.locator('input').isChecked()) fail('기존 완료일과 다른 «어제»가 선택됨');
      }
      const b2 = await say(CO + ' 2차 방문 2026-02-30 끝남. 개선과제 도출했고.');
      await hasText(b2, '날짜로 읽지 못해');
      if (await b2.locator('.qitem', { hasText:'완료일' }).count()) fail('없는 날짜가 완료일로 제안됨');
      const b3 = await say(CO + ' 2차 방문 2026-09-15 끝남. 개선과제 도출했고.');
      const d3 = b3.locator('.qitem', { hasText:'완료일' });
      await hasText(d3, '2026-09-15');
      if (st0.actual !== '2026-09-15') {
        if (await d3.locator('input').isChecked()) fail('기존 완료일과 다른 명시 날짜가 선택됨');
        await d3.locator('input').check();
        await b3.getByRole('button', { name:'선택한 항목 체크 (1)' }).click();
        await until(async () => (await stepOf(2)).actual === '2026-09-15', '명시 날짜가 저장 안 됨');
      }
      const p1 = (await docsOf(page, 'projects'))[pid];
      if (p1.steps['2'].status !== st0.status || p1.currentStep !== p0.currentStep) fail('단계 상태·현재 단계가 바뀜');
    } finally { await closeAssist(); await H.closeDrawer(page); }
  });
  await run.step('C2-38', async () => {
    // 예정일 잡기: 말한 일정 → 카드(날짜·요일 크게, 변경 전 → 후, 시각은 메모) → «예정일 저장» → «캘린더에 등록»(create_event, 활동) → 날짜 바꿔 «캘린더 날짜 수정»(update_event).
    // 날짜 없음·과제 모름은 카드 없이 되묻기, 지난 날짜는 경고, «모레»는 규칙 턴의 [오늘]로 계산. 단계 상태·currentStep 그대로
    try {
      await H.setPlanned(page, CO, 7, '');
      await H.closeDrawer(page);
      const pid = await projectId(page, CO);
      const p0 = (await docsOf(page, 'projects'))[pid], st0 = p0.steps['7'];
      const T = await page.evaluate('today()'), d1 = await page.evaluate("addDays(today(), 16)"), d2 = await page.evaluate("addDays(today(), 21)");
      const dow = d => page.evaluate(x => withDow(x), d);
      if (!(await page.locator('#assist').isVisible())) await page.locator('#assistBtn').click();
      await page.locator('#assist').getByRole('button', { name:'새 대화' }).click();
      if ((await page.locator('#assist .abub.bot').first().locator('.agbtn').count()) !== 10) fail('새 대화 첫 인사에 기능 버튼 10개가 없음');
      const say = async text => {
        const before = await page.evaluate(() => window.__mock.samples.length);
        const n0 = await page.locator('#assist .plbox').count();
        await page.locator('#as-input').fill(text); await page.locator('#as-input').press('Enter');
        try { await until(async () => (await page.locator('#assist .plbox').count()) > n0, '일정 카드가 안 뜸', 15000); }
        catch (e){ fail('일정 카드가 안 뜸: ' + text + ' / 마지막 말풍선: ' + (await page.locator('#assist .abub').last().innerText().catch(() => '?')).slice(0, 200)); }
        return { c:await page.evaluate(i => window.__mock.samples[i], before), box:page.locator('#assist .plbox').last() };
      };
      const { c, box } = await say(CO + ' 3차 방문 ' + d1 + ' 오후 2시로 잡혔어');
      for (const t of ['예정일 잡기 규칙', '[오늘] ' + await dow(T), '[날짜 참고]', '날짜를 짐작하지 않습니다', '[현재 일정 제안] 없음']) if (!c.prompt.includes(t)) fail('규칙 턴에 없음: ' + t);
      await hasText(box.locator('.pldate'), await dow(d1));
      await hasText(box, '7. 3차 방문');
      await hasText(box.locator('.plold'), '지금 예정일 없음');
      await hasText(box, '시간은 메모, 캘린더는 종일');
      if (await box.locator('.plwarn').count()) fail('미래 날짜에 지난 날짜 경고');
      if (await box.getByRole('button', { name:'캘린더에 등록' }).isVisible()) fail('예정일 저장 전에 캘린더 버튼이 보임');
      await box.getByRole('button', { name:'예정일 저장' }).click();
      await until(async () => (await stepOf(7)).planned === d1, '예정일 저장 안 됨');
      await hasText(page.locator('#assist .abub.sys').last(), '바꾸지 않았습니다');
      await box.getByRole('button', { name:'단계 메모로도 저장' }).click();
      await until(async () => ((await stepOf(7)).notes || []).some(x => x.text.startsWith('(일정)') && x.text.includes('오후 2시')), '일정 원문이 단계 메모로 안 남음');
      await box.getByRole('button', { name:'캘린더에 등록' }).click();
      await until(() => box.getByRole('link', { name:'캘린더 등록됨 ↗' }).count(), '«캘린더 등록됨»으로 안 바뀜');
      const evs = () => page.evaluate(() => window.__mock.events()).then(o => Object.values(o).filter(e => e.summary === '[스마트제조] ' + CO + ' · 7. 3차 방문'));
      const ev1 = (await evs())[0];
      if (!ev1 || ev1.startTime !== d1 + 'T00:00:00' || ev1.allDay !== true || ev1.timeZone !== 'Asia/Seoul') fail('캘린더 이벤트: ' + JSON.stringify(ev1));
      const acts = () => docsOf(page, 'projects').then(d => (d[pid].activities || []).filter(a => a.channel === 'calendar' && a.step === 7));
      if (!(await acts()).some(a => a.eventId === ev1.id && a.date === d1)) fail('캘린더 등록 활동 없음');
      // 날짜 변경: 변경 전 → 후 표시 → 저장 → «캘린더 날짜 수정»(update_event, 활동에 «날짜 변경»)
      const r2 = await say(CO + ' 3차 방문 ' + d2 + '로 다시 잡혔어');
      await hasText(r2.box.locator('.plold'), '변경 전 ' + await dow(d1) + ' → 후 ' + await dow(d2));
      await hasText(r2.box, '등록돼 있음');
      await r2.box.getByRole('button', { name:'예정일 저장' }).click();
      await until(async () => (await stepOf(7)).planned === d2, '바뀐 예정일 저장 안 됨');
      await r2.box.getByRole('button', { name:'캘린더 날짜 수정 (' + d1 + ' → ' + d2 + ')' }).click();
      await until(async () => (await evs())[0]?.startTime === d2 + 'T00:00:00', '캘린더 이벤트 날짜가 안 바뀜');
      if ((await evs()).length !== 1) fail('날짜 수정인데 이벤트가 새로 생김');
      if (!(await acts()).some(a => (a.subject || '').includes('날짜 변경 ' + d1 + ' → ' + d2))) fail('날짜 변경 활동 없음');
      await until(() => r2.box.getByRole('link', { name:'캘린더 등록됨 ↗' }).count(), '날짜 수정 뒤 «캘린더 등록됨»으로 안 바뀜');
      // «모레» = 규칙 턴 [오늘] + 2일, 지난 날짜는 경고(저장 안 함)
      const r3 = await say(CO + ' 4차 방문 모레로 잡혔어');
      await hasText(r3.box.locator('.pldate'), await dow(await page.evaluate("addDays(today(), 2)")));
      await hasText(r3.box, '8. 4차 방문');
      const r4 = await say(CO + ' 4차 방문 2020-01-06로 잡혔어');
      await hasText(r4.box.locator('.plwarn'), '이전 날짜');
      // 날짜를 말하지 않음·없는 날짜·과제 모름 → 카드 없이 되묻기
      const n0 = await page.locator('#assist .plbox').count();
      const ask = async (text, want) => {
        await page.locator('#as-input').fill(text); await page.locator('#as-input').press('Enter');
        await hasText(page.locator('#assist .abub.sys').last(), want);
      };
      await ask(CO + ' 4차 방문 잡혔어, 날짜는 미정', '날짜를 알 수 없어');
      await ask(CO + ' 4차 방문 2026-02-30로 잡혔어', '날짜로 읽지 못했습니다');
      await tab(page, 'board');   // 과제 탭 «목록»을 떠나면 열린 과제가 없다
      await ask('3차 방문 ' + d1 + '로 잡혔어', '어느 과제의 일정인지');
      if ((await page.locator('#assist .plbox').count()) !== n0) fail('되물어야 할 때 일정 카드가 뜸');
      const p1 = (await docsOf(page, 'projects'))[pid];
      if (p1.steps['7'].status !== st0.status || p1.currentStep !== p0.currentStep) fail('단계 상태·현재 단계가 바뀜: ' + st0.status + '→' + p1.steps['7'].status + ', ' + p0.currentStep + '→' + p1.currentStep);
      if (p1.steps['8'].planned !== p0.steps['8'].planned) fail('저장하지 않은 8단계 예정일이 바뀜');
    } finally { await closeAssist(); await H.closeDrawer(page); }
  });
  await run.step('C2-39', async () => {
    // 예정일 잡기, 캘린더 커넥터(mcp) 없음: «예정일 저장» 뒤 등록 버튼 대신 구글 캘린더 «일정 만들기» 링크(종일). 이벤트는 만들어지지 않음
    try {
      await H.closeDrawer(page);
      const pid = await projectId(page, CO);
      const d = await page.evaluate("addDays(today(), 30)"), d1 = await page.evaluate("addDays('" + d + "', 1)");
      const n0 = Object.keys(await page.evaluate(() => window.__mock.events())).length;
      if (!(await page.locator('#assist').isVisible())) await page.locator('#assistBtn').click();
      await page.locator('#assist').getByRole('button', { name:'새 대화' }).click();
      await page.evaluate(() => { window.__mcp0 = mcp; mcp = null; });
      try {
        const c0 = await page.locator('#assist .plbox').count();
        await page.locator('#as-input').fill(CO + ' 4차 방문 ' + d + '로 잡혔어'); await page.locator('#as-input').press('Enter');
        await until(async () => (await page.locator('#assist .plbox').count()) > c0, '일정 카드가 안 뜸', 15000);
        const box = page.locator('#assist .plbox').last();
        await hasText(box.locator('.pldate'), d);
        if (await box.locator('a, button').filter({ hasText:'캘린더' }).count()) fail('예정일 저장 전에 캘린더 버튼·링크가 보임');
        await box.getByRole('button', { name:'예정일 저장' }).click();
        await until(async () => (await docsOf(page, 'projects'))[pid].steps['8'].planned === d, '예정일 저장 안 됨');
        const a = box.getByRole('link', { name:'구글 캘린더에 추가 ↗' });
        await until(() => a.count(), '«구글 캘린더에 추가» 링크가 안 뜸');
        const href = await a.getAttribute('href');
        for (const t of ['calendar.google.com/calendar/render', 'action=TEMPLATE', 'dates=' + d.replace(/-/g, '') + '/' + d1.replace(/-/g, ''), encodeURIComponent('[스마트제조] ' + CO + ' · 8. 4차 방문')]) if (!href.includes(t)) fail('링크에 없음: ' + t + ' / ' + href);
        if (await box.getByRole('button', { name:'캘린더에 등록' }).count()) fail('mcp 없는데 «캘린더에 등록» 버튼이 있음');
      } finally { await page.evaluate(() => { mcp = window.__mcp0; }); }
      if (Object.keys(await page.evaluate(() => window.__mock.events())).length !== n0) fail('mcp 없는데 캘린더 이벤트가 만들어짐');
      await H.setPlanned(page, CO, 8, '');   // 도우미를 연 채로 — 3칸 화면에서는 상세를 가리지 않는다
    } finally { await closeAssist(); await H.closeDrawer(page); }
  });
  await run.step('C2-40', async () => {
    // 과제 3칸 작업 화면(Q-20260929-12): 첫 화면 «할 일» · 과제 탭 «목록 | 칸반 | 표» · 목록 선택 → 가운데 상세(선택 기억) · 단계 필터 칩
    // · 다른 탭 링크 → 과제 탭으로 이동(«← 뒤로»는 보던 탭·상세로) · 도우미·떠 있는 상세가 과제 상세를 가리지 않음 · 칸반/표 → 목록
    await H.closeDrawer(page);
    const pid = await projectId(page, CO);
    await page.reload(); await page.waitForTimeout(600);
    if (!(await page.locator('#today').isVisible()) || (await page.locator('#tabTodo').getAttribute('aria-selected')) !== 'true') fail('첫 화면이 «할 일»이 아님');
    if (await page.locator('#work').isVisible()) fail('첫 화면에 과제 작업 화면이 보임');
    await tab(page, 'work');
    const keys = await page.locator('#wkbar .subnav [data-key]').evaluateAll(bs => bs.map(b => b.dataset.key + ':' + b.textContent));
    if (keys.join('|') !== 'work:목록|board:칸반|proj:표') fail('보기 칩: ' + keys.join('|'));
    const row = page.locator('#wklist .wkrow[data-id="' + pid + '"]');
    await hasText(row, CO); await hasText(row, '원공고');
    await row.click();
    await until(() => page.locator(PD + ' h2', { hasText:CO }).count(), '목록 행을 눌러도 가운데 칸에 상세가 안 뜸');
    if (!(await row.evaluate(n => n.classList.contains('on')))) fail('선택한 행 강조 없음');
    if ((await page.evaluate(() => localStorage.getItem('smartcodi.selProject'))) !== pid) fail('선택 과제가 기억되지 않음');
    if (await page.locator('.drawer').count()) fail('과제 상세가 떠 있는 패널로 열림');
    // 단계 필터 칩: 현재 단계 칩 → 그 과제만, 다른 단계 칩 → 빠짐, 다시 누르면 해제
    const cur = String(Math.min((await docsOf(page, 'projects'))[pid].currentStep || 1, 9));
    await page.locator('#wklist .chips [data-step="' + cur + '"]').click();
    await until(() => row.count(), '현재 단계 칩에서 과제가 빠짐');
    const other = page.locator('#wklist .chips button:not([disabled])[data-step]:not([data-step=""]):not([data-step="' + cur + '"])');
    if (await other.count()){ await other.first().click(); await until(async () => !(await row.count()), '다른 단계 칩인데 과제가 보임'); }
    await page.locator('#wklist .chips [data-step=""]').click();
    await until(() => row.count(), '«전체» 칩으로 안 돌아옴');
    // 새로고침 뒤 과제 탭을 열면 고른 과제가 그대로
    await page.reload(); await page.waitForTimeout(600);
    await page.locator('#tabProj').click();
    await until(() => page.locator(PD + ' h2', { hasText:CO }).count(), '새로고침 뒤 고른 과제가 기억되지 않음');
    // 기관 상세(떠 있는 패널) «관련 과제» → 과제 탭으로 이동 → «← 뒤로» = 기관 탭·기관 상세
    await tab(page, 'acc');
    await page.locator('#acc tbody tr:not(.absub)', { hasText:CO }).first().click();
    await page.locator('.drawer .rrow', { hasText:CO }).first().click();
    await until(() => page.locator(PD + ' h2', { hasText:CO }).count(), '기관 상세의 과제 링크로 과제 상세가 안 열림');
    if (!(await page.locator('#work').isVisible())) fail('기관 상세의 과제 링크가 과제 탭으로 이동하지 않음');
    if (await page.locator('.drawer').count()) fail('과제로 이동했는데 기관 상세가 남음');
    await page.locator(PD + ' .dr-head').getByRole('button', { name:'← 뒤로' }).click();
    await until(async () => (await page.locator('.drawer h2', { hasText:CO }).count()) && (await page.locator('#acc').isVisible()), '«← 뒤로»가 기관 탭·기관 상세로 돌아가지 않음');
    await H.closeDrawer(page);
    // 도우미를 열면 오른쪽 칸 — 목록·상세가 줄어들 뿐 가려지지 않음. 떠 있는 상세도 도우미 왼쪽
    await H.openProject(page, CO);
    const w0 = (await page.locator(PD).boundingBox()).width;
    try {
      if (!(await page.locator('#assist').isVisible())) await page.locator('#assistBtn').click();
      await until(() => page.locator('#assist').isVisible(), '도우미가 안 열림');
      const a = await page.locator('#assist').boundingBox(), d = await page.locator(PD).boundingBox(), l = await page.locator('#wklist').boundingBox();
      if (d.x + d.width > a.x + 1) fail('도우미가 과제 상세를 가림: 상세 오른쪽 ' + Math.round(d.x + d.width) + ' > 도우미 왼쪽 ' + Math.round(a.x));
      if (!l || l.x + l.width > d.x + 1) fail('목록 칸이 상세와 겹치거나 없음');
      if (d.width >= w0) fail('도우미를 열어도 상세가 줄지 않음(' + w0 + ' → ' + d.width + ')');
      await page.locator(PD + ' .dr-head').getByRole('button', { name:'기관 보기' }).click();
      await until(() => page.locator('.drawer').count(), '«기관 보기»로 기관 상세가 안 뜸');
      const r = await page.locator('.drawer').boundingBox();
      if (r.x + r.width > a.x + 1) fail('떠 있는 기관 상세가 도우미를 가림');
      await H.closeDrawer(page);
      if (!(await page.locator(PD + ' h2', { hasText:CO }).count())) fail('기관 상세를 닫자 과제 상세가 사라짐');
    } finally { await closeAssist(); }
    if (Math.abs((await page.locator(PD).boundingBox()).width - w0) > 2) fail('도우미를 닫아도 상세가 안 넓어짐');
    // 칸반 카드 → 목록 보기 · 표 행 → 목록 보기 (표에 CSV·전체 백업·사업 규칙 유지)
    await tab(page, 'board');
    if (!(await page.locator('#board .col[data-col="1"]').count())) fail('칸반 열이 없음');
    await card(page, CO).click();
    await until(async () => (await page.locator('#work').isVisible()) && (await page.locator(PD + ' h2', { hasText:CO }).count()), '칸반 카드로 과제 상세가 안 열림');
    await tab(page, 'proj');
    for (const b of ['CSV 내보내기', '전체 백업 (JSON)']) if (!(await page.locator('#proj').getByRole('button', { name:b }).count())) fail('표 보기에 없음: ' + b);
    if (!(await page.locator('#proj .progcard').count())) fail('표 보기에 사업 규칙 카드가 없음');
    if (!(await page.locator('#newBtn').isVisible())) fail('과제 탭에 «+ 새 과제»가 안 보임');
    await page.locator('#proj tbody tr', { hasText:CO }).first().click();
    await until(async () => (await page.locator('#work').isVisible()) && (await page.locator(PD + ' h2', { hasText:CO }).count()), '표 행으로 과제 상세가 안 열림');
    await tab(page, 'today');
    if (await page.locator('#newBtn').isVisible()) fail('할 일 탭에 «+ 새 과제»가 보임');
  });
  await run.step('C2-41', async () => {
    // 도우미 기능 안내(Q-20260929-13): 첫 인사 = 기능 버튼 10개, 누르면 설명·예시 펼침(한 번에 하나, 다시 누르면 접힘)
    // «예시 넣기»는 입력창만 채움(sample 호출·말풍선 안 늘어남), 머리 «? 기능»은 대화를 지우지 않고 안내를 다시 띄움
    try {
      if (!(await page.locator('#assist').isVisible())) await page.locator('#assistBtn').click();
      await page.locator('#assist').getByRole('button', { name:'새 대화' }).click();
      const g = page.locator('#assist .abub.bot').first();
      const names = (await g.locator('.agbtn').allInnerTexts()).map(t => t.trim());
      if (names.join('|') !== '명함 등록|견적서 등록|납품 서류 반영|양식 초안|진단표 나누기|방문 결과 체크|과제 현황|예정일 잡기|메일·카톡 문구|회신 요약') fail('기능 버튼: ' + names.join('|'));
      await hasText(g.locator('.rnote'), '사진·PDF는 저장하지 않습니다');
      await hasText(g.locator('.rnote'), 'Claude 사용량');
      const more = g.locator('.agmore');
      if (await more.isVisible()) fail('누르기 전에 설명이 펼쳐져 있음');
      const btn = n => g.locator('.agbtn', { hasText:n });
      const expanded = () => g.locator('.agbtn[aria-expanded="true"]').allInnerTexts();
      await btn('양식 초안').click();
      await hasText(more, '단계 산출물로 등록');
      await hasText(more.locator('.agex'), '대한정밀 2차 수행일지 써 줘');
      await btn('과제 현황').click();
      await hasText(more, '할 일');
      if ((await expanded()).join('|') !== '과제 현황') fail('한 번에 하나만 펼쳐져야 함: ' + (await expanded()).join('|'));
      await btn('과제 현황').click();
      if (await more.isVisible()) fail('다시 눌러도 설명이 안 접힘');
      if ((await expanded()).length) fail('접었는데 눌린 버튼이 남음');
      await btn('예정일 잡기').click();
      for (const t of ['캘린더에 등록', '캘린더 날짜 수정', '구글 캘린더에 추가', '단계 메모로도 저장']) await hasText(more, t);
      const s0 = await page.evaluate(() => window.__mock.samples.length), b0 = await page.locator('#assist .abub').count();
      await page.locator('#as-input').fill('');
      await more.getByRole('button', { name:'예시 넣기' }).click();
      if ((await page.locator('#as-input').inputValue()) !== '대한정밀 3차 방문 10월 15일 오후 2시로 잡혔어') fail('예시가 입력창에 안 들어감: ' + await page.locator('#as-input').inputValue());
      await page.waitForTimeout(500);
      if ((await page.evaluate(() => window.__mock.samples.length)) !== s0) fail('«예시 넣기»가 Claude를 불렀음');
      if ((await page.locator('#assist .abub').count()) !== b0) fail('«예시 넣기»가 말풍선을 만들었음(자동 발송)');
      await page.locator('#as-input').fill('');
      // «? 기능»: 기존 말풍선은 그대로, 안내가 맨 아래에 하나 더
      await page.locator('#assist .ahead').getByRole('button', { name:'? 기능' }).click();
      if ((await page.locator('#assist .abub').count()) !== b0 + 1) fail('«? 기능»이 대화를 지우거나 안내를 안 띄움');
      const g2 = page.locator('#assist .abub').last();
      if ((await g2.locator('.agbtn').count()) !== 10) fail('«? 기능» 안내에 버튼 10개가 없음');
      await g2.locator('.agbtn', { hasText:'납품 서류 반영' }).click();
      for (const t of ['선택한 N건 반영', '새로 만들지 않습니다', '«가동 중»은 현장에서 확인한 뒤']) await hasText(g2.locator('.agmore'), t);
      await g2.locator('.agbtn', { hasText:'메일·카톡 문구' }).click();
      for (const t of ['보내기 창 열기', '두 번', '카톡용 문구 복사', '[확인 필요]', '도우미는 보내지 않습니다']) await hasText(g2.locator('.agmore'), t);
      await g2.locator('.agbtn', { hasText:'명함 등록' }).click();
      await hasText(g2.locator('.agmore'), '등록해 줘');
      if ((await page.evaluate(() => window.__mock.samples.length)) !== s0) fail('안내 버튼이 Claude를 불렀음');
    } finally { await closeAssist(); }
  });
  await run.step('C2-42', async () => {
    // 도우미 메일·카톡 문구(Q-20260929-05): 미리보기 → «보내기 창 열기»로 제목·본문·받는 역할이 채워짐. 도우미는 send_message를 부르지 않음
    // 인사말·서명은 보드가 한 번만 붙임(존칭 겹침 없음), [확인 필요]가 남으면 Gmail 발송 막힘, 채워도 첫 클릭은 확인 단계, 받는 사람·과제 모르면 되묻기
    const HEAD = '[테스트] C2영업 담당님 안녕하세요.';   // C2-06과 같은 addressee() 결과
    try {
      await H.openProject(page, CO);
      const pid = await projectId(page, CO);
      const a0 = ((await docsOf(page, 'projects'))[pid].activities || []).length;
      const sendN = () => page.evaluate(() => window.__mock.calls.filter(c => c.tool === 'send_message').length);
      const n0 = await sendN();
      if (!(await page.locator('#assist').isVisible())) await page.locator('#assistBtn').click();
      await page.locator('#assist').getByRole('button', { name:'새 대화' }).click();
      const c0 = await page.locator('#assist .mlbox').count();
      await page.locator('#as-input').fill(CO + ' 견적서 부가세 포함으로 다시 달라고 공급기업에 메일 써 줘'); await page.locator('#as-input').press('Enter');
      await until(async () => (await page.locator('#assist .mlbox').count()) > c0, '문구 카드가 안 뜸', 15000);
      const prompt = await page.evaluate(() => window.__mock.samples.at(-1).prompt);
      for (const t of ['메일·카톡 문구 규칙', '[확인 필요]', '[현재 메일 제안]']) if (!prompt.includes(t)) fail('규칙 턴에 없음: ' + t);
      if (!prompt.slice(prompt.lastIndexOf('\n[메일 근거]')).includes(pid)) fail('[메일 근거]에 말한 과제가 없음');
      const box = page.locator('#assist .mlbox').last();
      await hasText(box, '공급기업 ' + SALES);
      await hasText(box.locator('.mlsub'), '[소공인 스마트제조] ' + CO);
      await hasText(box.locator('.mlsub'), '견적서 재발행 요청 (부가세 포함)');
      const pv = await box.locator('.mlbody').innerText();
      if (!pv.startsWith(HEAD)) fail('미리보기 인사말: ' + pv.split('\n')[0]);
      if (pv.split('안녕하세요').length !== 2) fail('인사말이 겹침: ' + pv);
      if (pv.split('드림').length !== 2 || pv.includes('(목) 코디')) fail('서명이 겹침: ' + pv);
      if (/대표 대표님|담당 담당님|담당자 담당자님/.test(pv)) fail('존칭 겹침: ' + pv);
      if (!pv.includes('부가세 포함 금액으로 다시 발행')) fail('본문 요지가 없음');
      await hasText(box.locator('.mlwarn'), '[확인 필요] 1곳');
      await hasText(box, '인사말·서명 3줄');
      await hasText(box, '도우미는 보내지 않습니다');
      if ((await sendN()) !== n0) fail('도우미가 send_message를 불렀음');
      // «보내기 창 열기» → 제목·본문·받는 역할이 채워진 기존 보내기 창. 도우미 칸을 가리지 않음
      await box.getByRole('button', { name:'보내기 창 열기' }).click();
      await until(() => page.locator('.modal.wide').count(), '보내기 창이 안 열림');
      const m = page.locator('.modal.wide');
      const subj = await m.locator('#send-subject').inputValue();
      if (!subj.startsWith('[소공인 스마트제조] ' + CO) || !subj.includes('견적서 재발행 요청 (부가세 포함)')) fail('제목: ' + subj);
      const body = await m.locator('#send-body').inputValue();
      if (body.trim() !== pv.trim()) fail('보내기 창 본문이 미리보기와 다름:\n' + body);
      const rc = t => m.locator('.sf').first().locator('.chip', { hasText:t });
      if ((await rc('공급기업').getAttribute('aria-pressed')) !== 'true' || (await rc('소공인').getAttribute('aria-pressed')) !== 'false') fail('받는 역할이 공급기업만이 아님');
      if (!(await m.locator('.chip.on', { hasText:'도우미 문구' }).count())) fail('«도우미 문구» 칩이 선택돼 있지 않음');
      const ab = await page.locator('#assist').boundingBox(), mb = await m.boundingBox(), sb = await page.locator('.scrim.sscrim').boundingBox();
      if (mb.x + mb.width > ab.x + 1) fail('보내기 창이 도우미를 가림');
      if (sb.x + sb.width > ab.x + 1) fail('보내기 창 배경이 도우미를 덮음');
      // 받는 사람을 더해도 본문 요지는 그대로, 호칭은 addressee()로(«대표 대표님» 없음)
      await rc('소공인').click();
      const b2 = await m.locator('#send-body').inputValue();
      // 담당자 표시 이름 = 이름 + 직함(«[테스트] C2대표 대표») → addressee()는 «님»만 붙인다(«… 대표 대표 대표님»·«대표님 대표님» 없음)
      if (b2.split('\n')[0] !== REP + ' 대표님, ' + HEAD || !b2.includes('부가세 포함 금액으로 다시 발행')) fail('소공인 추가 후 본문: ' + b2.split('\n')[0]);
      await rc('소공인').click();
      // [확인 필요]가 남으면 Gmail 발송 막힘 → 채우면 첫 클릭은 확인 단계(발송 0건)
      await m.getByRole('button', { name:'Gmail로 보내기' }).click();
      await hasText(m.locator('.sendstat'), '[확인 필요]');
      await m.locator('#send-body').fill((await m.locator('#send-body').inputValue()).replace('[확인 필요]', '(테스트) 다음 주 중'));
      await m.getByRole('button', { name:'Gmail로 보내기' }).click();
      await until(async () => (await m.locator('.sendbar button.primary').innerText()).includes('발송 확인'), '확인 단계로 안 바뀜');
      if ((await sendN()) !== n0 || (await page.evaluate(() => window.__mock.sent())).length) fail('첫 클릭에 발송됨');
      await H.closeModals(page);
      if (((await docsOf(page, 'projects'))[pid].activities || []).length !== a0) fail('보내지 않았는데 활동이 늘어남');
      // 되묻기: 받는 사람 모름 → 카드 없음 / 다른 탭에서 업체명 없이 → 과제 되묻기
      const c1 = await page.locator('#assist .mlbox').count();
      await page.locator('#as-input').fill(CO + ' 견적서 다시 달라고 메일 써 줘'); await page.locator('#as-input').press('Enter');
      await until(() => page.locator('#assist .abub.sys', { hasText:'누구에게 보낼지' }).count(), '받는 사람을 되묻지 않음', 15000);
      await tab(page, 'today');
      await page.locator('#as-input').fill('보완 요청 메일 써 줘'); await page.locator('#as-input').press('Enter');
      await until(() => page.locator('#assist .abub.sys', { hasText:'어느 과제의 문구인지' }).count(), '과제를 되묻지 않음', 15000);
      if ((await page.locator('#assist .mlbox').count()) !== c1) fail('되묻기인데 문구 카드가 뜸');
      if ((await sendN()) !== n0) fail('도우미가 send_message를 불렀음');
    } finally { await H.closeModals(page); await closeAssist(); }
  });
  await run.step('C2-43', async () => {
    // 도우미 납품 서류 반영(Q-20260929-09): 기존 자산만 갱신 — 거래명세서 → 발주까지, 납품확인서 → 설치 완료까지, «가동 중» 제안 없음, 앞선 상태는 그대로,
    // 짝 없는 품목은 표시만(장비·자산 수 불변), 기존 시리얼·날짜는 선택 해제로 시작, 발행일은 날짜로 안 씀, 6단계 status·currentStep 불변, 과제 모르면 되묻기
    try {
      const pid = await projectId(page, CO);
      await editAsset(page, CO, 'CNC 레이저 용접 시스템', { status:{ value:'installed' }, serial:'CNC-OLD-1', installedAt:'2026-09-25' });
      const assetOf = async name => { const prid = await findId(page, 'products', d => d.name === name); return Object.values(await docsOf(page, 'assets')).find(a => a.projectId === pid && a.productId === prid); };
      await until(async () => (await assetOf('CNC 레이저 용접 시스템'))?.status === 'installed', 'CNC 자산 준비(설치 완료) 저장 안 됨');
      const p0 = (await docsOf(page, 'projects'))[pid];
      const nProd = Object.keys(await docsOf(page, 'products')).length, nAsset = Object.keys(await docsOf(page, 'assets')).length;
      const pdfOf = async (name, html) => {
        const pg = await page.context().newPage();
        await pg.setContent(`<html><body style="font-family:'Malgun Gothic',sans-serif">${html}</body></html>`);
        const file = path.join(HERE, 'results', name);
        await pg.pdf({ path:file, format:'A4' }); await pg.close(); return file;
      };
      const ask = async (text, file) => {
        if (file){
          await page.locator('#as-img').setInputFiles(file);
          await until(async () => (await page.locator('#assist .athumb', { hasText:path.basename(file) }).count()) === 1, 'PDF가 첨부 목록에 안 붙음');
        }
        const n0 = await page.locator('#assist .dlbox').count();
        await page.locator('#as-input').fill(text); await page.locator('#as-input').press('Enter');
        try { await until(async () => (await page.locator('#assist .dlbox').count()) > n0, '납품 서류 카드가 안 뜸', 20000); }
        catch (e){ fail('납품 서류 카드가 안 뜸: ' + text + ' / 마지막 말풍선: ' + (await page.locator('#assist .abub').last().innerText().catch(() => '?')).slice(0, 200)); }
        return page.locator('#assist .dlbox').last();
      };
      const item = (b, t) => b.locator('.qitem', { hasText:t });
      const chk = (card, t) => card.locator('.dlrow', { hasText:t }).locator('input[type=checkbox]');
      if (!(await page.locator('#assist').isVisible())) await page.locator('#assistBtn').click();
      await page.locator('#assist').getByRole('button', { name:'새 대화' }).click();
      // 1) 거래명세서 PDF: 이미 설치 완료인 CNC는 상태 그대로(후퇴 없음)·기존 시리얼 해제, 계량기는 검토 중 → 발주·수량 다름 경고, 짝 없는 품목은 표시만
      const f1 = await pdfOf('delivery-order.pdf', `<h1>거 래 명 세 서</h1>
        <p>공급자: ${SUP} · 공급받는자: ${CO} 귀하</p><p>작성일자: 2026-10-04</p><p>거래일자: 2026-10-05</p>
        <p>1. CNC 레이저 용접 시스템 1대 S/N CNC-NEW-9 / 2. [테스트] 견적 계량기 QT-100 3대 S/N QT-SN-001 / 3. [테스트] 없던 품목 NX-1 1개</p>`);
      const before = await page.evaluate(() => window.__mock.samples.length);
      const b1 = await ask('이 거래명세서 반영해 줘', f1);
      const c = await page.evaluate(i => window.__mock.samples[i], before);
      for (const t of ['[첨부 PDF: delivery-order.pdf', '납품 서류 반영 규칙', '발행일·출력일은 date로 쓰지 않습니다', '[현재 납품 서류]']) if (!c.prompt.includes(t)) fail('프롬프트에 없음: ' + t);
      const cnc = item(b1, 'CNC 레이저 용접 시스템'), meter = item(b1, '견적 계량기'), none = item(b1, '없던 품목');
      await hasText(cnc, '상태 그대로 — 이미 «설치 완료»');
      await hasText(cnc, '기존 CNC-OLD-1');
      if (await chk(cnc, '시리얼').isChecked()) fail('기존 시리얼이 있는데 선택됨');
      await hasText(meter, '상태 검토 중 → 발주');
      if (!(await chk(meter, '상태').isChecked())) fail('계량기 상태 제안이 선택 안 됨');
      await hasText(meter, '수량 다름: 서류 3 · 자산 2');
      await hasText(meter, '발주일 2026-10-05');
      await hasText(none, '견적서에 없던 품목');
      if (await none.locator('input').count()) fail('짝 없는 품목에 체크박스가 있음');
      if ((await b1.innerText()).includes('→ 가동 중') || (await b1.innerText()).includes('2026-10-04')) fail('가동 중 제안 또는 작성일이 날짜로 들어감');
      await meter.locator('.dlrow', { hasText:'시리얼' }).locator('input[type=text]').fill('QT-SN-001A');   // 사람이 시리얼을 고침
      await b1.getByRole('button', { name:'선택한 2건 반영' }).click();
      await hasText(page.locator('#assist .abub.sys').last(), '반영했습니다');
      await until(async () => (await assetOf('[테스트] 견적 계량기'))?.status === 'ordered', '계량기 발주 반영 안 됨');
      const m1 = await assetOf('[테스트] 견적 계량기'), k1 = await assetOf('CNC 레이저 용접 시스템');
      if (m1.orderedAt !== '2026-10-05' || m1.serial !== 'QT-SN-001A' || m1.qty !== 2 || !m1.memo.includes('거래명세서에서 반영')) fail('계량기 자산: ' + JSON.stringify(m1));
      if (k1.status !== 'installed' || k1.serial !== 'CNC-OLD-1' || k1.installedAt !== '2026-09-25' || k1.orderedAt !== '2026-10-05') fail('CNC 자산(후퇴·시리얼 덮기 금지): ' + JSON.stringify(k1));
      if (!(await b1.getByRole('button', { name:/반영됨/ }).isDisabled())) fail('반영 뒤 버튼이 다시 눌림');
      // 2) 납품확인서 PDF: 발행일·납품일이 함께 있으면 납품일만, 발주 → 설치 완료, 기존 시리얼은 해제로 시작
      const f2 = await pdfOf('delivery-install.pdf', `<h1>납 품 확 인 서</h1>
        <p>공급자: ${SUP} · 납품처: ${CO}</p><p>발행일 2026-10-09</p><p>납품일: 2026-10-08</p>
        <p>1. [테스트] 견적 계량기 QT-100 2대 S/N QT-SN-002 / 2. [테스트] 견적 MES QM-1 3개월</p>`);
      const b2 = await ask('이 납품확인서 반영해 줘', f2);
      const meter2 = item(b2, '견적 계량기'), mes = item(b2, '견적 MES');
      await hasText(meter2, '상태 발주 → 설치 완료');
      await hasText(meter2, '설치일 2026-10-08');
      if (await chk(meter2, '시리얼').isChecked()) fail('기존 시리얼(QT-SN-001A)이 있는데 새 시리얼이 선택됨');
      await hasText(mes, '상태 검토 중 → 설치 완료');
      if ((await b2.innerText()).includes('2026-10-09') || (await b2.innerText()).includes('→ 가동 중') || (await b2.innerText()).includes('수량 다름')) fail('발행일·가동 중·수량 경고가 잘못 나옴');
      await b2.getByRole('button', { name:'선택한 2건 반영' }).click();
      await until(async () => (await assetOf('[테스트] 견적 MES'))?.status === 'installed', 'MES 설치 완료 반영 안 됨');
      const m2 = await assetOf('[테스트] 견적 계량기'), s2 = await assetOf('[테스트] 견적 MES');
      if (m2.status !== 'installed' || m2.installedAt !== '2026-10-08' || m2.serial !== 'QT-SN-001A') fail('계량기 자산(납품): ' + JSON.stringify(m2));
      if (s2.installedAt !== '2026-10-08' || s2.serial) fail('MES 자산: ' + JSON.stringify(s2));
      // 3) 붙여 넣은 설치확인서(발행일만) → 날짜 비움, 이미 설치 완료라 반영할 것 없음(버튼 꺼짐)
      const b3 = await ask(CO + ' 설치확인서: 발행일 2026-10-09, CNC 레이저 용접 시스템 1대 설치');
      await hasText(b3, '거래·납품·설치일로 적힌 날짜가 아닙니다');
      await hasText(item(b3, 'CNC 레이저 용접 시스템'), '반영할 것 없음');
      if (!(await b3.getByRole('button', { name:'선택한 0건 반영' }).isDisabled())) fail('반영할 것이 없는데 버튼이 켜짐');
      // 4) 과제 모름: 할 일 탭에서 업체명 없이 → 카드 없이 되묻기
      await tab(page, 'today');
      const n3 = await page.locator('#assist .dlbox').count();
      await page.locator('#as-input').fill('거래명세서 반영해 줘'); await page.locator('#as-input').press('Enter');
      await until(() => page.locator('#assist .abub.sys', { hasText:'어느 과제의 서류인지' }).count(), '과제를 되묻지 않음', 15000);
      if ((await page.locator('#assist .dlbox').count()) !== n3) fail('되묻기인데 카드가 뜸');
      // 불변: 장비·자산 수, 가동 중 없음, 6단계 상태·산출물 체크·현재 단계
      const p1 = (await docsOf(page, 'projects'))[pid], assets = Object.values(await docsOf(page, 'assets'));
      if (Object.keys(await docsOf(page, 'products')).length !== nProd || assets.length !== nAsset) fail('장비·자산 수가 바뀜(새로 만들면 안 됨)');
      if (assets.some(a => a.projectId === pid && a.status === 'operating')) fail('«가동 중»으로 바뀐 자산이 있음');
      if (JSON.stringify(p1.steps?.['6'] || {}) !== JSON.stringify(p0.steps?.['6'] || {}) || p1.currentStep !== p0.currentStep) fail('6단계·현재 단계가 바뀜');
    } finally { await closeAssist(); await H.closeDrawer(page); }
  });
  await run.step('C2-44', async () => {
    // 도우미 납품 서류 반영 보강(Q-20260929-09 검수): (1) 자산 없는 과제 → 카드 없이 «견적서 등록부터», 자산·장비 새로 안 만듦
    // (2) 카드를 띄운 뒤 자산이 바뀌면(시리얼) 선택해도 덮지 않고 «그사이 자산이 바뀌어 반영하지 않았습니다»
    const EMPTY = '[테스트] C2납품빈과제', ERep = '[테스트] C2빈대표';
    try {
      await setupProject(page, { company:EMPTY, cycle:'2026-T3', notice:'main', rep:{ name:ERep, title:'대표' } });
      await H.closeDrawer(page);
      const nAsset = Object.keys(await docsOf(page, 'assets')).length, nProd = Object.keys(await docsOf(page, 'products')).length;
      if (!(await page.locator('#assist').isVisible())) await page.locator('#assistBtn').click();
      await page.locator('#assist').getByRole('button', { name:'새 대화' }).click();
      const n0 = await page.locator('#assist .dlbox').count();
      await page.locator('#as-input').fill(EMPTY + ' 거래명세서: 거래일자 2026-10-06, 품목 CNC 레이저 용접 시스템 1대'); await page.locator('#as-input').press('Enter');
      await until(() => page.locator('#assist .abub.sys', { hasText:'도입 장비(자산)가 없습니다' }).count(), '자산 없는 과제인데 견적서 안내가 없음', 15000);
      await hasText(page.locator('#assist .abub.sys').last(), '견적서 등록부터');
      if ((await page.locator('#assist .dlbox').count()) !== n0) fail('자산이 없는데 카드가 뜸');
      if (Object.keys(await docsOf(page, 'assets')).length !== nAsset || Object.keys(await docsOf(page, 'products')).length !== nProd) fail('자산·장비가 새로 만들어짐');
      // (2) CO의 CNC 자산: 카드 뜬 뒤 시리얼을 바꾸고 «시리얼» 칸을 선택해 반영 시도
      const pid = await projectId(page, CO), prid = await findId(page, 'products', d => d.name === 'CNC 레이저 용접 시스템');
      const cncEntry = async () => Object.entries(await docsOf(page, 'assets')).find(([, a]) => a.projectId === pid && a.productId === prid);
      const [aid, a0] = await cncEntry();
      const nb = await page.locator('#assist .dlbox').count();
      await page.locator('#as-input').fill(CO + ' 거래명세서: 거래일자 2026-10-06'); await page.locator('#as-input').press('Enter');
      try { await until(async () => (await page.locator('#assist .dlbox').count()) > nb, '납품 서류 카드가 안 뜸', 20000); }
      catch (e){ fail('납품 서류 카드가 안 뜸 / 마지막 말풍선: ' + (await page.locator('#assist .abub').last().innerText().catch(() => '?')).slice(0, 200)); }
      const box = page.locator('#assist .dlbox').last(), cnc = box.locator('.qitem', { hasText:'CNC 레이저 용접 시스템' });
      await hasText(cnc, '시리얼 (기존 ' + a0.serial);
      await cnc.locator('.dlrow', { hasText:'시리얼' }).locator('input[type=checkbox]').check();
      await page.evaluate(([id, serial]) => saveAsset(id, Object.assign({}, state.assets.get(id), { serial })), [aid, 'CNC-CHANGED-BY-OTHER']);
      await until(async () => (await cncEntry())[1].serial === 'CNC-CHANGED-BY-OTHER', '다른 곳의 시리얼 변경 저장 안 됨');
      await box.getByRole('button', { name:'선택한 1건 반영' }).click();
      await hasText(page.locator('#assist .abub.sys').last(), '그사이 자산이 바뀌어 반영하지 않았습니다');
      await hasText(page.locator('#assist .abub.sys').last(), '0건에');
      const a1 = (await cncEntry())[1];
      if (a1.serial !== 'CNC-CHANGED-BY-OTHER' || String(a1.memo || '') !== String(a0.memo || '')) fail('바뀐 자산을 덮었거나 메모를 남김: ' + JSON.stringify(a1));
    } finally {
      await closeAssist(); await H.closeDrawer(page);
      await cleanupCase(page, { company:EMPTY, contacts:[ERep], accounts:[EMPTY] });
      await tab(page, 'today');
    }
  });
  await run.step('C2-32', async () => {
    // 화면 구성: 위 탭 7개(묶음) + 보기 전환 칩 · 기관별 보기에서 담당자 펼침·검색 강조 · 통합 검색으로 담당자 상세
    await H.closeDrawer(page);
    const tabs = (await page.locator('nav.tabs .tab:not(.tabmore):visible').allInnerTexts()).map(t => t.trim());
    if (tabs.join('|') !== '할 일|과제|기관·담당자|장비·자산|보고서|관리') fail('위 탭: ' + tabs.join('|'));
    if (await page.locator('#tabBoard').count()) fail('«보드» 탭이 남아 있음');
    await tab(page, 'today');
    await hasText(page.locator('#today .subnav'), '목록'); await hasText(page.locator('#today .subnav'), '달력');
    await page.locator('#today .subnav [data-key="sched"]').click();
    await until(() => page.locator('#sched').isVisible(), '달력 보기로 안 바뀜');
    await hasText(page.locator('#sched'), '구글 캘린더에 올리기');
    await page.locator('#tabProj').click(); await page.locator('#tabTodo').click();
    await until(() => page.locator('#sched').isVisible(), '할 일을 다시 누르면 마지막 보기(달력)로 가야 함');
    await tab(page, 'act');
    await hasText(page.locator('#act .subnav [data-key="act"]'), '연락 이력');
    await tab(page, 'acc');
    const supRow = page.locator('#acc tbody tr:not(.absub)', { hasText:SUP });
    if (await page.locator('#acc tbody tr.absub', { hasText:SALES }).count()) fail('펼치기 전에 담당자가 보임');
    await supRow.locator('.abtg').click();
    await until(() => page.locator('#acc tbody tr.absub', { hasText:SALES }).count(), '▸를 눌러도 담당자가 안 펼쳐짐');
    await supRow.locator('.abtg').click();
    await until(async () => !(await page.locator('#acc tbody tr.absub', { hasText:SALES }).count()), '▾로 안 접힘');
    await page.locator('#ab-q:visible').fill('C2영업');
    await until(() => page.locator('#acc tbody tr.absub.hit', { hasText:SALES }).count(), '검색으로 담당자가 펼쳐지고 강조되지 않음');
    await page.locator('#acc tbody tr.absub.hit', { hasText:SALES }).click();
    await hasText(page.locator('.drawer .dr-head'), SALES);
    await H.closeDrawer(page);
    await page.locator('#ab-q:visible').fill('');
    await page.locator('#acc .subnav [data-key="con"]').click();
    await until(() => page.locator('#con tbody tr', { hasText:SALES }).count(), '담당자 전체 보기에 담당자 표가 없음');
    await tab(page, 'prod'); await page.locator('#prod .subnav [data-key="asset"]').click();
    await until(() => page.locator('#asset').isVisible(), '장비 → 자산 전환 안 됨');
    const t = await search(page, 'C2영업');
    if (!t.includes('담당자')) fail('통합 검색에 담당자 없음');
    await page.locator('#qres button', { hasText:SALES }).click();
    await hasText(page.locator('.drawer'), '연락처');
    await clearSearch(page); await H.closeDrawer(page);
  });
  let m;
  await run.step('C2-06', async () => {
    m = await openSend(page, CO, 3);
    await chip(m, '자료 요청').click();
    const body = await m.locator('#send-body').inputValue();
    if (!body.startsWith('[테스트] C2영업 담당님 안녕하세요.')) fail('인사말: ' + body.split('\n')[0]);
    if (!body.includes('[요청 자료]')) fail('[요청 자료] 없음');
  });
  await run.step('C2-07', async () => {
    const b = m.locator('#send-body');
    await b.fill((await b.inputValue()) + '\nS/W 한도(4,666,666원) 초과로 구독 기간·금액 조정 견적을 요청드립니다.');
    await m.getByRole('button', { name:'Gmail로 보내기' }).click();
    await until(async () => (await m.locator('.sendbar button.primary').innerText()).includes('발송 확인'), '확인 단계로 안 바뀜');
    if ((await page.evaluate(() => window.__mock.sent())).length) fail('첫 클릭에 발송됨');
  });
  await run.step('C2-08', async () => {
    await m.locator('.sendbar button.primary').click();
    await hasText(m.locator('.sendstat'), '발송했습니다');
    const sent = await page.evaluate(() => window.__mock.sent());
    if (sent.length !== 1 || sent[0].to[0] !== MAIL) fail('발송 기록 ' + JSON.stringify(sent));
    if (!sent[0].body.includes('조정 견적')) fail('고친 본문이 발송되지 않음');
    await H.closeModals(page);
    const acts = page.locator(PD + ' .step').nth(2).locator('.mail').first();
    for (const s of ['Gmail · 자동', '자료 요청', '기록 시험자']) await hasText(acts, s);
  });
  await run.step('C2-09', async () => {
    await tab(page, 'today');
    const c = todaySec(page, '회신 대기');
    await hasText(c, '오늘 발송 · 미회신');
  });
  await run.step('C2-10', async () => {
    const tid = (await page.evaluate(() => window.__mock.sent()))[0].threadId;
    await page.evaluate(t => window.__mock.reply(t), tid);
    await page.reload(); await page.waitForTimeout(500);
    await until(async () => ((await docsOf(page, 'projects'))[pid].activities || []).some(a => a.repliedAt), 'repliedAt 저장 안 됨');
    await tab(page, 'today');
    await hasText(todaySec(page, '회신 대기'), '회신을 기다리는 메일이 없습니다');
    await H.openStep(page, CO, 3);
    await hasText(stepBody(page, 3).locator('.mail').first(), '회신 ' + T.slice(5).replace('-', '/'));
  });
  await run.step('C2-45', async () => {
    // 도우미 회신 요약(Q-20260929-10): get_thread PLAIN_TEXT(실측 모양) → 보낸 메일 뒤 회신(SENT 없음)의 plaintextBody만 요약(snippet 안 씀, 인용 줄 뺌)
    // → 카드(원문 수치 그대로, 원문에 없는 숫자 줄은 선택 해제, 첨부 파일명) → «3단계 메모로 저장»(원문 본문은 저장 안 됨). status·currentStep 불변
    // get_thread 오류 = 안내만·재시도 없음, 회신 없는 스레드 = 요약 안 함, 과제 모르면 되묻기, 활동 이력 «회신 요약» 버튼
    const tid = (await page.evaluate(() => window.__mock.sent()))[0].threadId;
    const BODY = '안녕하세요. 조정 견적 금액은 1,234,000원(부가세 별도)입니다.\n납품은 10월 15일부터 가능할 것 같습니다.\n\n> 원래 메일 인용줄 — 요약에 가면 안 됨';
    const reads = () => page.evaluate(() => window.__mock.calls.filter(c => c.tool === 'get_thread' && c.input.messageFormat === 'PLAIN_TEXT').length);
    const sums = () => page.evaluate(() => window.__mock.samples.filter(x => x.prompt.startsWith('[회신 요약]')).length);
    const ask = async (text, sel, msg) => {
      const n = await page.locator(sel).count();
      await page.locator('#as-input').fill(text); await page.locator('#as-input').press('Enter');
      await until(async () => (await page.locator(sel).count()) > n, msg, 15000);
      await until(async () => !(await page.locator('#assist .abub.bot', { hasText:'읽는 중' }).count()) && !(await page.locator('#assist .abub.bot', { hasText:'요약하는 중' }).count()), '읽는 중이 안 끝남', 15000);
    };
    try {
      const before = (await docsOf(page, 'projects'))[pid];
      const notes0 = (before.steps['3'].notes || []).length;
      if (!(await page.locator('#assist').isVisible())) await page.locator('#assistBtn').click();
      await page.locator('#assist').getByRole('button', { name:'새 대화' }).click();
      const g = page.locator('#assist .abub.bot').first();
      if ((await g.locator('.agbtn').count()) !== 10) fail('기능 버튼이 10개가 아님');
      await g.locator('.agbtn', { hasText:'회신 요약' }).click();
      for (const t of ['회신 본문을 Claude에게 보냅니다', '원문 그대로', '회신 원문은 저장하지 않습니다', '보낸 사람의 Gmail']) await hasText(g.locator('.agmore'), t);
      // (1) get_thread 오류: 안내만, 재시도 없음, 요약 호출 없음
      await page.evaluate(() => window.__mock.threadError('needs_reauth'));
      const r0 = await reads(), s0 = await sums();
      await ask(CO + ' 회신 요약해 줘', '#assist .abub.sys', '연결 오류 안내가 없음');
      await hasText(page.locator('#assist .abub.sys').last(), 'Gmail 커넥터를 쓸 수 없어');
      await page.waitForTimeout(800);
      if ((await reads()) !== r0 + 1) fail('get_thread 오류 뒤 재시도함: ' + ((await reads()) - r0) + '회');
      if ((await sums()) !== s0) fail('오류인데 요약을 부름');
      await page.evaluate(() => window.__mock.threadError(null));
      // (2) 회신 없는 스레드: 읽기는 하되 요약 안 함
      await page.evaluate(t => window.__mock.unreply(t), tid);
      await ask(CO + ' 회신 요약해 줘', '#assist .abub.sys', '회신 없음 안내가 없음');
      await hasText(page.locator('#assist .abub.sys').last(), '회신을 찾지 못했습니다');
      if ((await reads()) !== r0 + 2 || (await sums()) !== s0) fail('회신 없는 스레드인데 요약함');
      // (3) 회신 있음 → 카드
      await page.evaluate(([t, body]) => window.__mock.reply(t, { body, attachments:[{ filename:'조정견적서_v2.pdf', mimeType:'application/pdf' }] }), [tid, BODY]);
      const c0 = await page.locator('#assist .rybox').count();
      await ask(CO + ' 회신 요약해 줘', '#assist .rybox', '회신 요약 카드가 안 뜸');
      if ((await sums()) !== s0 + 1) fail('요약 호출이 1회가 아님');
      const sp = await page.evaluate(() => window.__mock.samples.filter(x => x.prompt.startsWith('[회신 요약]')).at(-1).prompt);
      if (!sp.includes('1,234,000원')) fail('요약 근거에 쉼표 있는 원문 수치가 없음(snippet을 씀?)');
      if (sp.includes('원래 메일 인용줄')) fail('인용된 이전 메일이 요약 근거에 들어감');
      if (sp.includes('tester@example.com')) fail('보낸 사람 주소가 Claude로 나감');
      const rp = await page.evaluate(() => window.__mock.samples.filter(x => x.prompt.includes('[도우미]')).at(-1).prompt);
      for (const t of ['회신 요약 규칙', '"replysum"']) if (!rp.includes(t)) fail('규칙 턴에 없음: ' + t);
      const box = page.locator('#assist .rybox').last();
      await hasText(box, '«1,234,000원»');
      await hasText(box, '조정견적서_v2.pdf');
      await hasText(box, '회신 본문을 Claude에게 보내');
      const bad = box.locator('.qitem', { hasText:'99일' });
      await hasText(bad.locator('.qwarn'), '원문에 없는 숫자: 99');
      if (await bad.locator('input[type=checkbox]').isChecked()) fail('원문에 없는 숫자 줄이 선택된 채로 시작');
      if (!(await box.locator('.qitem', { hasText:'1,234,000' }).locator('input[type=checkbox]').isChecked())) fail('원문 수치 줄이 선택 해제로 시작');
      const go = box.getByRole('button', { name:/3단계 메모로 저장 \(2줄\)/ });
      await go.click();
      await hasText(page.locator('#assist .abub.sys').last(), '3단계 메모에 회신 요약');
      await until(async () => ((await docsOf(page, 'projects'))[pid].steps['3'].notes || []).length === notes0 + 1, '메모가 저장 안 됨');
      const after = (await docsOf(page, 'projects'))[pid], note = after.steps['3'].notes.at(-1).text;
      if (!note.startsWith('(메일 회신 요약)') || !note.includes('«1,234,000원»') || !note.includes('첨부: 조정견적서_v2.pdf')) fail('메모 내용: ' + note);
      if (note.includes('99일')) fail('선택 해제한 줄이 저장됨');
      if (note.includes('납품은 10월 15일부터 가능할 것 같습니다') || note.includes('원래 메일 인용줄')) fail('회신 원문이 저장됨');
      if (JSON.stringify(after).includes('부가세 별도)입니다')) fail('과제 문서에 회신 원문이 남음');
      if (after.currentStep !== before.currentStep || after.steps['3'].status !== before.steps['3'].status) fail('단계 상태·currentStep이 바뀜');
      if ((after.activities || []).length !== (before.activities || []).length) fail('활동이 늘어남');
      // (4) 과제 모르면 되묻기(열린 과제 없음)
      await H.closeDrawer(page); await tab(page, 'today');
      const s1 = await sums();
      await ask('회신 요약해 줘', '#assist .abub.sys', '과제를 되묻지 않음');
      await hasText(page.locator('#assist .abub.sys').last(), '어느 과제의 회신인지');
      if ((await sums()) !== s1) fail('과제를 모르는데 요약함');
      // (5) 과제 상세 활동 이력 «회신 요약» 버튼 → 도우미에 카드
      await H.openStep(page, CO, 3);
      const rb = stepBody(page, 3).locator('.mail').first().locator('.rybtn');
      if (!(await rb.count())) fail('회신 확인된 활동에 «회신 요약» 버튼이 없음');
      const c1 = await page.locator('#assist .rybox').count();
      await rb.click();
      await until(async () => (await page.locator('#assist .rybox').count()) > c1, '버튼으로 회신 요약 카드가 안 뜸', 15000);
      if (c1 <= c0) fail('카드 수 이상');
    } finally { await page.evaluate(() => window.__mock.threadError(null)); await closeAssist(); await H.closeDrawer(page); }
  });
  await run.step('C2-11', async () => {
    m = await openSend(page, CO, 3);
    await chip(m, '공급기업').click();   // 끄기
    await chip(m, '소공인').click();     // 켜기 (이메일 없음)
    await m.getByRole('button', { name:'Gmail로 보내기' }).click();
    await hasText(m.locator('.sendstat'), '이메일이 비었거나 형식이 맞지 않는 수신자');
  });
  await run.step('C2-12', async () => {
    const kinds = await m.locator('.sf').nth(1).locator('.chip').allInnerTexts();
    if (kinds.includes('수행일지 송부')) fail('3단계에 수행일지 송부 칩: ' + kinds.join(','));
    await H.closeModals(page);
  });
  await run.step('C2-13', async () => {
    await cleanupCase(page, { company:CO, products:['CNC 레이저 용접 시스템', 'ProdEX AI Smart', '[테스트] 견적 계량기', '[테스트] 견적 MES'], contacts:[REP, SALES], accounts:[CO, SUP] });
  });
}

/* ============================== CASE 3 ============================== */
export async function case3(run){
  const page = run.page;
  const CO = '[테스트] CASE3 골프양말', REP = '[테스트] C3대표', DIR = '[테스트] C3담당';
  let pid;
  await run.step('C3-01', async () => {
    pid = await setupProject(page, { company:CO, cycle:'2026-T3', notice:'main', rep:{ name:REP, title:'대표' },
      extraContacts:[{ name:DIR, title:'이사', phone:'010-0000-3333', email:MAIL, assign:true }] });
    await H.openProject(page, CO);
    await hasText(page.locator(PD + ' .contacts'), DIR + ' 이사');
  });
  await run.step('C3-02', async () => {
    const m = await openSend(page, CO, 1);
    await chip(m, '일정 조율').click();
    const first = (await m.locator('#send-body').inputValue()).split('\n')[0];
    if (first !== DIR + ' 이사님 안녕하세요.') fail('인사말: ' + first);
    await H.closeModals(page);
  });
  await run.step('C3-03', async () => {
    await H.closeDrawer(page); await tab(page, 'con');
    await page.locator('#con tbody tr', { hasText:DIR }).click();
    await page.locator('.drawer .dr-head').getByRole('button', { name:'수정' }).click();
    await H.fillForm(page, { phone:'010-0000-3334' }); await H.saveModal(page); await H.closeDrawer(page);
    await until(async () => (await docsOf(page, 'projects'))[pid].contacts.sogongin.phone === '010-0000-3334', '과제 스냅샷에 반영 안 됨');
  });
  await run.step('C3-04', async () => {
    const t = await search(page, '01000003334');
    if (!t.includes(CO)) fail('과제 결과 없음');
    if (!t.includes('담당자') || !t.includes(DIR)) fail('담당자 결과 없음');
  });
  await run.step('C3-05', async () => {
    for (const q of ['3334', '0000-3334', '0000 3334']){ const t = await search(page, q); if (!t.includes(CO) || !t.includes(DIR)) fail('«' + q + '» 결과 다름'); }
    await clearSearch(page);
  });
  await run.step('C3-06', async () => {
    await H.addProduct(page, { kind:'hw', name:'하이테크 양말편직기', model:'커즌(Kejun)', unitPrice:'21000000', unit:'대', spec:'Auto-linking System(발가락 자동봉조공정 통합형), 2개 장치(1세트)' });
    const YC = { kind:'sw', name:'YARNCHAIN GRID', unit:'식', memo:"원문 합계 '6,600,00원' 오기 — 공급가 6,000,000 VAT 별도 기준" };
    await H.addProduct(page, { ...YC, unitPrice:'6,600,00', expectError:'쉼표 자리가 맞지 않습니다' });
    if (await findId(page, 'products', d => d.name === 'YARNCHAIN GRID')) fail('쉼표 오기 단가로 저장됨');
    const id = await H.addProduct(page, { ...YC, unitPrice:'6,000,000' });
    await until(async () => (await docsOf(page, 'products'))[id].unitPrice === 6000000, '정정 단가 저장 안 됨');
  });
  await run.step('C3-07', async () => {
    await H.addAsset(page, CO, '하이테크 양말편직기', { qty:2 });
    await H.addAsset(page, CO, 'YARNCHAIN GRID', { qty:1 });
    await H.openProject(page, CO);
    await hasText(page.locator(PD + ' .rrow', { hasText:'양말편직기' }), '검토 중 · 2대');
  });
  await run.step('C3-08', async () => {
    await H.setPlanned(page, CO, 6, Td(30));
    await H.closeDrawer(page); await tab(page, 'board');
    await hasText(card(page, CO).locator('.nextdue'), '장비 공급');
    await hasText(card(page, CO).locator('.nextdue'), 'D-30');
  });
  await run.step('C3-09', async () => {
    await tab(page, 'today');   // 예정 일정 표는 «할 일 → 목록»(30일 뒤 = «그 뒤 예정»)
    const row = todaySec(page, '그 뒤 예정').locator('tbody tr', { hasText:CO });
    await row.getByRole('button', { name:'등록', exact:true }).click();
    await until(() => row.locator('a.gcal.on').count(), '«등록됨»으로 안 바뀜');
    const ev = Object.values(await page.evaluate(() => window.__mock.events())).filter(e => e.summary.includes(CO));   // 다른 CASE(C2-38)가 만든 이벤트는 뺀다
    if (ev.length !== 1) fail('이벤트 ' + ev.length + '건');
    const acts = (await docsOf(page, 'projects'))[pid].activities || [];
    if (!acts.some(a => a.channel === 'calendar' && a.eventId === ev[0].id && a.by === 'u_tester')) fail('캘린더 활동 기록 없음');
  });
  await run.step('C3-10', async () => {
    const e = Object.values(await page.evaluate(() => window.__mock.events())).filter(e => e.summary.includes(CO))[0];
    if (e.summary !== '[스마트제조] ' + CO + ' · 6. 장비 공급') fail('제목 ' + e.summary);
    if (e.startTime !== Td(30) + 'T00:00:00' || e.endTime !== Td(31) + 'T00:00:00') fail('날짜 ' + e.startTime + '~' + e.endTime);
    if (e.timeZone !== 'Asia/Seoul' || e.allDay !== true) fail('시간대/종일 ' + e.timeZone + '/' + e.allDay);
  });
  await run.step('C3-11', async () => {
    await H.setPlanned(page, CO, 6, Td(35));
    await tab(page, 'today');
    const row = todaySec(page, '그 뒤 예정').locator('tbody tr', { hasText:CO });
    await until(() => row.getByRole('button', { name:'날짜 수정' }).count(), '예정일을 바꿨는데 «날짜 수정»이 안 뜸');
    if ((await row.getByRole('button', { name:'날짜 수정' }).getAttribute('title')) !== '캘린더 ' + Td(30) + ' → 보드 예정일 ' + Td(35)) fail('날짜 수정 안내');
  });
  await run.step('C3-12', async () => {
    await tab(page, 'today');
    await todaySec(page, '그 뒤 예정').locator('tbody tr', { hasText:CO }).getByRole('button', { name:'날짜 수정' }).click();
    await until(async () => Object.values(await page.evaluate(() => window.__mock.events())).filter(e => e.summary.includes(CO))[0].startTime === Td(35) + 'T00:00:00', '이벤트 날짜 안 바뀜');
    const acts = (await docsOf(page, 'projects'))[pid].activities || [];
    if (!acts.some(a => (a.subject || '').includes('날짜 변경 ' + Td(30) + ' → ' + Td(35)))) fail('날짜 변경 활동 없음');
    await tab(page, 'today');
    await until(() => todaySec(page, '그 뒤 예정').locator('tbody tr', { hasText:CO }).locator('a.gcal.on').count(), '날짜 수정 뒤 «등록됨»으로 안 돌아옴');
  });
  const NOTE2 = '실제 경영 판단은 담당 이사 — 서명·결재 주체 확인 필요';
  let draft2;
  await run.step('C3-13', async () => {
    await H.addNote(page, CO, 2, NOTE2);
    draft2 = await H.wordDraft(page, CO, 2, '수행일지·현장진단표 (2차)');
    const mmdd = T.slice(5);
    if (!draft2.text.includes('· (' + mmdd + ') ' + NOTE2)) fail('활동요약에 메모 원문 없음');
  });
  await run.step('C3-14', async () => {
    if (!draft2) fail('초안 없음');
    if (!draft2.text.includes('신청인(대표) : ' + DIR)) fail('서명란: ' + (draft2.text.match(/신청인\(대표\)[^\n]*/) || [''])[0]);
    run.note('C3-14', '서명란이 이사 이름 — 질문 3');
  });
  await run.step('C3-15', async () => {
    await H.deleteProject(page, CO);
    await hasText(page.locator('#notice'), '구글 캘린더에 등록된 일정 1건은 지워지지 않았습니다');
    await cleanupCase(page, { company:CO, products:['하이테크 양말편직기', 'YARNCHAIN GRID'], contacts:[REP, DIR], accounts:[CO] });
  });
}

/* ============================== CASE 4 ============================== */
export async function case4(run, { mobilePage }){
  const page = run.page;
  const CO = '[테스트] CASE4 치과보철', REP = '[테스트] C4대표';
  let pid;
  const D1 = { 0:'CNC 가공기가 정상 작동하는 것이 가장 해결해야 할 과제', 2:'티타늄 보철물 일일 생산량', 3:'수기', 4:'티타늄 보철물 하루 6개 (도입 후 10개 정도 기대)', 8:'대표 1인, 채용 예정' };
  const D2 = { 1:'노후 CNC 가공기의 정밀도 저하', 2:'덴탈 CNC 밀링기(마닉스 5SA) 도입으로 티타늄 보철물 일일 생산량 6개 → 10개', 4:'수기' };
  await run.step('C4-01', async () => {
    pid = await setupProject(page, { company:CO, cycle:'2026-T4', notice:'', rep:{ name:REP, title:'대표' } });
    await H.openProject(page, CO);
    await hasText(page.locator(PD), '매출 요건이 정반대');
    await H.closeDrawer(page); await tab(page, 'board');
    await hasText(card(page, CO), '공고 미확인');
  });
  await run.step('C4-02', async () => {
    await page.locator('#fnotice').selectOption('none');
    await until(() => card(page, CO).count(), '미확인 필터에서 안 보임');
    await page.locator('#fnotice').selectOption('');
  });
  await run.step('C4-03', async () => {
    await H.openProject(page, CO);
    await page.locator('#ng-' + pid).selectOption('extra');
    await until(async () => (await docsOf(page, 'projects'))[pid].notice === 'extra', '공고 저장 안 됨');
    await H.closeDrawer(page); await tab(page, 'board');
    await hasText(card(page, CO), '추가공고');
    await page.locator('#fnotice').selectOption('main');
    await until(async () => !(await card(page, CO).count()), '원공고 필터에서 보임');
    await page.locator('#fnotice').selectOption('');
    await tab(page, 'proj');
    const before = await H.downloadCount(page);
    await page.locator('#proj').getByRole('button', { name:'CSV 내보내기' }).click();
    const d = await H.nextDownload(page, before);
    const line = d.text.split('\r\n').find(l => l.includes(CO));
    if (!line || !line.includes('"추가공고"')) fail('CSV 공고 열: ' + line);
  });
  // ---- 휴대폰 ----
  const mp = await mobilePage();   // 데스크톱 상태를 복사해 연 휴대폰 페이지
  await run.step('C4-04', async () => {
    await mp.waitForTimeout(500);
    if (!(await mp.locator('#tabMore').isVisible())) fail('더보기 버튼 안 보임');
    if (await mp.locator('#tabOrg').isVisible()) fail('기관·담당자 탭이 하단바에 보임');
    for (const t of ['#tabTodo', '#tabProj', '#tabReport']) if (!(await mp.locator(t).isVisible())) fail('하단바에 없음: ' + t);
    const pos = await mp.locator('nav.tabs').evaluate(n => getComputedStyle(n).position);
    if (pos !== 'fixed') fail('탭바 position ' + pos);
    const over = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 0) fail('가로 넘침 ' + over + 'px');
    if (await mp.locator('#legend').isVisible()) fail('범례가 보임');
  });
  await run.step('C4-05', async () => {
    await H.openStep(mp, CO, 1);
    // 역할별 담당자: 휴대폰에서 라벨 위·내용 아래 전체 폭(.crow.m 70px 열에 눌리던 버그)
    const cw = await mp.evaluate(() => [...document.querySelectorAll('.crow.m .cbody')].map(n => n.getBoundingClientRect().width));
    const vw = await mp.evaluate(() => window.innerWidth);
    if (!cw.length || cw.some(w => w < vw / 2)) fail('역할별 담당자 칸이 좁음: ' + cw.map(Math.round).join(',') + ' / 화면 ' + vw);
    const keys = Object.keys(D1);
    const fs = await mp.locator(`#dg-${pid}-1-0`).evaluate(n => getComputedStyle(n).fontSize);
    if (fs !== '16px') fail('입력칸 글자 ' + fs);
    for (let k = 0; k < keys.length; k++){
      const ta = mp.locator(`#dg-${pid}-1-${keys[k]}`);
      await ta.fill(D1[keys[k]]);
      const next = keys[k + 1] != null ? mp.locator(`#dg-${pid}-1-${keys[k + 1]}`) : mp.locator(`#dg-${pid}-1-1`);
      await next.tap();
      await mp.waitForTimeout(250);
      if (keys[k + 1] != null){
        const act = await mp.evaluate(() => document.activeElement && document.activeElement.id);
        if (act !== `dg-${pid}-1-${keys[k + 1]}`) fail('탭 한 번으로 다음 칸 포커스 안 됨: ' + act);
      }
    }
    await until(async () => { const d = (await docsOf(mp, 'projects'))[pid].steps['1'].diag || {}; return Object.entries(D1).every(([i, v]) => Object.values(d).includes(v)); }, '진단값 저장 안 됨');
  });
  await run.step('C4-06', async () => {
    const ta = mp.locator(`#dg-${pid}-1-5`);
    await ta.tap(); await ta.fill('입력 중 — 아직 저장 안 함');
    await mp.evaluate(() => window.__mock.bump('projects'));
    await mp.waitForTimeout(300);
    if ((await mp.locator(`#dg-${pid}-1-5`).inputValue()) !== '입력 중 — 아직 저장 안 함') fail('재그리기 후 입력 글자 사라짐');
    await mp.locator(`#dg-${pid}-1-5`).fill(''); await mp.locator(`#dg-${pid}-1-5`).blur();
  });
  await run.step('C4-13', async () => {
    await H.closeDrawer(mp);
    await mp.locator('#tabMore').tap();
    await until(() => mp.locator('#moreMenu').isVisible(), '더보기 메뉴 안 열림');
    await mp.locator('#moreMenu button', { hasText:'장비·자산' }).tap();
    await until(async () => (await mp.locator('#tabMore').innerText()).includes('장비·자산 ▴'), '더보기 라벨 안 바뀜');
    await mp.locator('.subnav:visible [data-key="asset"]').tap();
    await until(() => mp.locator('#asset').isVisible(), '자산 목록 안 보임');
  });
  await H.syncBack(mp, page);   // 휴대폰에서 바꾼 상태를 데스크톱으로
  await run.step('C4-07', async () => {
    const id = await H.openStep(page, CO, 2);
    for (const [i, v] of Object.entries(D2)){ const ta = page.locator(`#dg-${id}-2-${i}`); await ta.fill(v); await ta.blur(); await page.waitForTimeout(150); }
    await until(async () => Object.values((await docsOf(page, 'projects'))[pid].steps['2'].diag || {}).length >= 3, '2차 진단 저장 안 됨');
  });
  const drafts = [];
  await run.step('C4-08', async () => {
    const d = await H.wordDraft(page, CO, 1, '수행일지·현장진단표 (1차)'); drafts.push(d.text);
    for (const v of Object.values(D1)) if (!d.text.includes(v)) fail('1차 초안에 없음: ' + v);
    for (const g of ['미확인 — 불량 발생 시', '미확인 — 육안 검사인지', '미확인 — 고온·화학물질']) if (!d.text.includes(g)) fail('미확인 안내 없음: ' + g);
  });
  await run.step('C4-09', async () => {
    const d2 = await H.wordDraft(page, CO, 2, '수행일지·현장진단표 (2차)'); drafts.push(d2.text);
    if (!d2.text.includes(D2[2])) fail('2차 ③ 없음');
    const d3 = await H.wordDraft(page, CO, 7, '수행일지·현장진단표 (3차)'); drafts.push(d3.text);
    if (!d3.text.includes('미확인 — 협약 이후 사후관리 주기')) fail('3차 향후 사후관리 미확인 아님');
  });
  await run.step('C4-11', async () => {
    const d = await H.wordDraft(page, CO, 8, '결과보고서'); drafts.push(d.text);
    for (const s of ['[1차 진단 · ② KPI 결정변수]', '[1차 진단 · ④ KPI 변수에 따른 기초 데이터 유형]', '[2차 진단 · ② KPI 원인 변수 특정]', '[1차 진단 · ③ 현재 기록 방식 수준] 수기', '[2차 진단 · 현재 기록 방식 수준] 수기', '[보드 메모 기반 초안 — 검토 후 다듬을 것]'])
      if (!d.text.includes(s)) fail('결과보고서에 없음: ' + s);
  });
  await run.step('C4-10', async () => {
    if (drafts.length < 4) fail('초안 ' + drafts.length + '건뿐(앞 단계 실패)');
    for (const t of drafts){ if (/%|증가율|66\.7/.test(t)) fail('만들어진 수치: ' + (t.match(/.{0,20}(%|증가율|66\.7).{0,10}/) || [''])[0]); }
  });
  await run.step('C4-12', async () => {
    await H.addProduct(page, { kind:'hw', name:'덴탈 CNC밀링기', model:'마닉스 5SA', unitPrice:'42000000', unit:'대', spec:'5축 건/습식 밀링머신' });
    await H.addProduct(page, { kind:'sw', name:'Dentalsoft', unitPrice:'6000000', unit:'식', memo:'협약기간 임차' });
    await H.addAsset(page, CO, '덴탈 CNC밀링기'); await H.addAsset(page, CO, 'Dentalsoft');
    // 자산 → 3차 «④ 도입 장비»·결과보고서 4 (장비 마스터의 이름·모델·단위, 자산 상태)
    const lines = ['· [H/W] 덴탈 CNC밀링기 마닉스 5SA × 1대 (검토 중)', '· [S/W] Dentalsoft × 1식 (검토 중)'];
    for (const [n, f] of [[7, '수행일지·현장진단표 (3차)'], [8, '결과보고서']]){
      const d = await H.wordDraft(page, CO, n, f);
      for (const s of lines) if (!d.text.includes(s)) fail(f + '에 자산 줄 없음: ' + s);
      if (d.text.includes('42,000,000')) fail(f + '에 금액이 들어감');
    }
  });
  await run.step('C4-14', async () => {
    await cleanupCase(page, { company:CO, products:['덴탈 CNC밀링기', 'Dentalsoft'], contacts:[REP], accounts:[CO] });
  });
}

/* ============================== CASE 5 ============================== */
export async function case5(run){
  const page = run.page;
  const CO = '[테스트] CASE5 친환경벽지', REP = '[테스트] C5대표', QT = '[테스트] QT-AI 공급사';
  let pid;
  await run.step('C5-01', async () => {
    pid = await setupProject(page, { company:CO, cycle:'2026-T5', notice:'extra', rep:{ name:REP, title:'대표', kakao:'test-case5' } });
    await H.setPlanned(page, CO, 1, Td(-3)); await H.setPlanned(page, CO, 2, Td(4));
    await H.closeDrawer(page); await tab(page, 'board');
    await hasText(card(page, CO).locator('.nextdue'), '다음 ' + md(Td(-3)) + ' 1차 방문');
    await hasText(card(page, CO).locator('.nextdue'), 'D+3');
    await hasText(card(page, CO), '지연 1');
  });
  await run.step('C5-02', async () => {
    await tab(page, 'today');
    await hasText(todaySec(page, '기한 경과').locator('tr', { hasText:CO }), '1. 1차 방문');
    await hasText(todaySec(page, '이번 주 예정').locator('tr', { hasText:CO }), '2. 2차 방문');
  });
  await run.step('C5-03', async () => {
    await H.setStatus(page, CO, 1, 'done');
    await hasText(stepBody(page, 1).locator('.notice'), '현장진단표, 1차 방문 확인 서명');
    if ((await docsOf(page, 'projects'))[pid].steps['1'].status !== 'done') fail('상태가 완료가 아님');
  });
  await run.step('C5-04', async () => {
    await stepBody(page, 1).locator('.docs .chk', { hasText:'현장진단표' }).locator('input').check();
    await until(async () => { const t = await stepBody(page, 1).locator('.notice').innerText(); return !t.includes('현장진단표,') && t.includes('1차 방문 확인 서명'); }, '알림이 줄지 않음');
    await stepBody(page, 1).locator('.docs .chk', { hasText:'1차 방문 확인 서명' }).locator('input').check();
    await until(async () => !(await stepBody(page, 1).locator('.notice').count()), '다 체크해도 알림이 남음');
  });
  await run.step('C5-05', async () => {
    await H.openStep(page, CO, 1);
    await stepBody(page, 1).locator('.docs .chk', { hasText:'1차 방문 확인 서명' }).locator('input').uncheck();
    await page.waitForTimeout(200);
    await tab(page, 'today');
    await hasText(todaySec(page, '서명·서류 미수집').locator('tr', { hasText:CO }), '1차 방문 확인 서명');
  });
  await run.step('C5-06', async () => {
    const m = await openSend(page, CO, 1);
    await chip(m, '수행일지 송부').click();
    await m.getByRole('button', { name:'카톡 보냄 기록' }).click();
    await hasText(m.locator('.sendstat'), '카톡으로 보냄을 «활동 이력»에 기록했습니다(수동 기록)');
    const b = m.getByRole('button', { name:'기록됨' });
    if (!(await b.isDisabled())) fail('기록됨 버튼이 비활성이 아님');
    if ((await m.locator('.sendstat').innerText()).includes('발송했습니다')) fail('«발송했습니다» 표시');
    await H.closeModals(page);
  });
  await run.step('C5-07', async () => {
    await tab(page, 'act');
    const row = page.locator('#act tbody tr', { hasText:CO }).first();
    await hasText(row, '카톡 · 수동'); await hasText(row, '시험자');
  });
  await run.step('C5-08', async () => {
    await H.addNote(page, CO, 1, '지원 이후 KPI 설정 필요 — 현재 데이터 정리 자료 부족');
    const head = await stepBody(page, 1).locator('.note', { hasText:'KPI 설정' }).locator('time').innerText();
    const hh = new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 13);
    if (!head.startsWith(T + ' ' + hh) || !head.includes('· 시험자')) fail('메모 머리: ' + head);
  });
  await run.step('C5-09', async () => {
    await H.addAccount(page, { type:'supplier', name:QT });
    await H.addProduct(page, { kind:'hw', name:'LATEX 730', unitPrice:'37000000', unit:'대', spec:'무상 보증 1년, PLC센서 포함' });
    await H.addProduct(page, { kind:'hw', name:'CNYX RIP', unitPrice:'', unit:'대', memo:'LATEX 730 견적에 포함' });
    await H.addProduct(page, { kind:'sw', name:'QT-AI자동견적 (LITE)', unitPrice:'5286000', unit:'식', supplier:QT, memo:'임대단가 6,000,000 − 할인 714,000, 1,200,000원/월 × 5개월, 무료 유지보수 2년' });
    await tab(page, 'prod');
    const cells = await page.locator('#prod tbody tr', { hasText:'CNYX RIP' }).locator('td').allInnerTexts();
    if (cells[4] !== '—') fail('RIP 단가 칸: ' + cells[4]);
    const rip = (await docsOf(page, 'products'))[await findId(page, 'products', d => d.name === 'CNYX RIP')];
    if (rip.unitPrice !== '') fail('RIP 단가 저장값 ' + JSON.stringify(rip.unitPrice));
  });
  await run.step('C5-10', async () => {
    for (const n of ['LATEX 730', 'CNYX RIP', 'QT-AI자동견적 (LITE)']) await H.addAsset(page, CO, n);
    const b = await budget(page, CO);
    if (!b.sum.includes('H/W 37,000,000원') || !b.sum.includes('단가 없는 장비 1건 제외(CNYX RIP)')) fail('합계 줄: ' + b.sum);
    if (!b.warn.includes('1,174,889원 초과')) fail('초과 경고: ' + (b.warn || '없음'));
    await H.closeDrawer(page);
  });
  await run.step('C5-11', async () => {
    await tab(page, 'proj');
    const before = await H.downloadCount(page);
    await page.locator('#proj').getByRole('button', { name:'전체 백업 (JSON)' }).click();
    const d = await H.nextDownload(page, before);
    if (d.filename !== 'smartcodi_백업_' + T.replace(/-/g, '') + '.json') fail('파일명 ' + d.filename);
    const j = JSON.parse(d.text);
    if (j.counts.products < 3 || Object.values(j.assets).filter(a => a.projectId === pid).length !== 3) fail('장비·자산 수 ' + JSON.stringify(j.counts));
    if (j.projects[pid].notice !== 'extra') fail('notice ' + j.projects[pid].notice);
    if (!j.projects[pid].activities.some(a => a.by === 'u_tester')) fail('활동 by 없음');
    if (d.text.includes('시험자')) fail('백업에 사람 이름이 들어감');
  });
  await run.step('C5-12', async () => {
    await cleanupCase(page, { company:CO, products:['LATEX 730', 'CNYX RIP', 'QT-AI자동견적 (LITE)'], contacts:[REP], accounts:[CO] });
    if (!(await findId(page, 'accounts', d => d.name === QT))) fail('QT-AI 공급사가 지워짐');
  });
}

/* ============================== CASE 6 ============================== */
export async function case6(run){
  const page = run.page;
  const CO = '[테스트] CASE6 간판출력', REP = '[테스트] C6대표', HW = '[테스트] CASE6 HW공급사', QT = '[테스트] QT-AI 공급사';
  const PR = ['VG3-640', 'RET-2002', 'QT-AI 자동견적(BASIC)'];
  let pid;
  await run.step('C6-01', async () => {
    pid = await setupProject(page, { company:CO, cycle:'2026-T6', notice:'main', rep:{ name:REP, title:'대표' } });
    await H.addAccount(page, { type:'supplier', name:HW });
  });
  await run.step('C6-02', async () => {
    if (!(await findId(page, 'accounts', d => d.name === QT))) await H.addAccount(page, { type:'supplier', name:QT });
    await H.addProduct(page, { kind:'hw', name:'VG3-640', unitPrice:'36630000', unit:'대', spec:'솔벤 플로터', supplier:HW });
    await H.addProduct(page, { kind:'hw', name:'RET-2002', unitPrice:'5753000', unit:'대', spec:'전동식 재단기', supplier:HW });
    await H.addProduct(page, { kind:'sw', name:'QT-AI 자동견적(BASIC)', unitPrice:'6000000', unit:'식', supplier:QT, memo:"원문 사양에 '(LITE형)' 표기 — CASE5 LITE와 동일 모델 여부 미확인" });
  });
  await run.step('C6-03', async () => {
    await tab(page, 'acc'); await page.locator('#acc tbody tr', { hasText:QT }).click();
    await hasText(page.locator('.drawer'), 'QT-AI 자동견적(BASIC)');
    await H.closeDrawer(page);
  });
  await run.step('C6-04', async () => { for (const n of PR) await H.addAsset(page, CO, n); });
  await run.step('C6-05', async () => {
    await tab(page, 'prod');
    await page.locator('#prod .chip', { hasText:'S/W' }).click();
    await page.locator('#pd-q').fill('QT-AI');
    await until(async () => (await page.locator('#prod tbody tr').count()) === 1, 'S/W·QT-AI 필터 결과가 1행이 아님');
    await hasText(page.locator('#prod tbody'), 'QT-AI 자동견적(BASIC)');
    await page.locator('#pd-q').fill(''); await page.locator('#prod .chip', { hasText:'전체' }).click();
  });
  await run.step('C6-06', async () => {
    const t = await search(page, 'VG3');
    if (!t.includes('장비')) fail('장비 결과 없음');
    await page.locator('#qres button', { hasText:'VG3-640' }).click();
    await hasText(page.locator('.drawer'), '도입된 자산 1건');
    await hasText(page.locator('.drawer'), CO);
    await clearSearch(page); await H.closeDrawer(page);
  });
  await run.step('C6-07', async () => {
    const hw = 36630000 + 5753000, lim = swLimit(hw), over = 6000000 - lim;
    if (hw !== 42383000 || lim !== 4709222 || over !== 1290778) fail('계산 ' + [hw, lim, over]);
    const b = await budget(page, CO);
    if (!b.sum.includes('H/W 42,383,000원') || !b.warn.includes('1,290,778원 초과')) fail('합계·경고: ' + b.sum + ' / ' + b.warn);
    await H.addNote(page, CO, 3, `H/W ${won(hw)} → S/W 한도 ${won(lim)}, S/W 6,000,000 초과 ${won(over)}`);
  });
  await run.step('C6-08', async () => {
    const e = await H.deleteVia(page, 'prod', 'VG3-640');
    if (!e.includes('자산 1건에 쓰이고 있어 삭제할 수 없습니다')) fail('거부 문구: ' + e);
  });
  await run.step('C6-09', async () => {
    await H.openProject(page, CO);
    const head = page.locator(PD + ' .dr-head');
    await head.getByRole('button', { name:'삭제', exact:true }).click();
    await until(() => head.getByRole('button', { name:'삭제 확인' }).count(), '«삭제 확인»으로 안 바뀜');
    await page.waitForTimeout(4400);
    if (!(await head.getByRole('button', { name:'삭제', exact:true }).count())) fail('4초 후 «삭제»로 복귀하지 않음');
    if (!(await projectId(page, CO))) fail('한 번 눌렀는데 삭제됨');
  });
  await run.step('C6-10', async () => {
    await H.deleteProject(page, CO);
    if (Object.values(await docsOf(page, 'assets')).some(a => a.projectId === pid)) fail('자산이 남음');
    for (const n of PR) if (!(await findId(page, 'products', d => d.name === n))) fail('장비가 같이 지워짐: ' + n);
  });
  await run.step('C6-11', async () => {
    const e = await H.deleteVia(page, 'prod', 'VG3-640');
    if (e) fail('삭제 안 됨: ' + e);
  });
  await run.step('C6-12', async () => {
    const e = await H.deleteVia(page, 'acc', CO);
    if (!e.includes('소속 담당자 1명이 있어 삭제할 수 없습니다')) fail('거부 문구: ' + e);
  });
  await run.step('C6-13', async () => {
    for (const [col, tabKey] of [['products','prod'], ['contacts','con'], ['accounts','acc']]){
      for (let guard = 0; guard < 30; guard++){
        const docs = await docsOf(page, col);
        const left = Object.values(docs).find(d => JSON.stringify(d).includes('[테스트]') || col === 'products');
        if (!left) break;
        const e = await H.deleteVia(page, tabKey, left.name);
        if (e) fail(col + ' 삭제 실패 ' + left.name + ': ' + e);
      }
    }
    const s = await H.mockState(page);
    const dirty = Object.entries(s.db).filter(([, docs]) => JSON.stringify(docs).includes('[테스트]')).map(([c]) => c);
    if (dirty.length) fail('남은 테스트 데이터: ' + dirty.join(', '));
  });
}
