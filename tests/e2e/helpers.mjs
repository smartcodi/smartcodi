// E2E 공통 도우미 — 단계 기록, 대기형 단언, 보드 조작, docx 텍스트 추출
import zlib from 'node:zlib';

/* ---------- 날짜 (보드와 같은 한국 날짜) ---------- */
export const T = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
export const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const Td = n => addDays(T, n);
export const md = d => Number(d.slice(5, 7)) + '/' + Number(d.slice(8));

/* ---------- 단계 기록 ---------- */
export class Run {
  constructor(page, caseId){ this.page = page; this.caseId = caseId; this.results = []; }
  async step(id, fn){
    const t0 = Date.now();
    try { await fn(); this.results.push({ id, result:'통과', ms:Date.now() - t0 }); }
    catch (e){
      const msg = String(e && (e.message || e)).split('\n')[0].slice(0, 400);
      this.results.push({ id, result: e && e.blocked ? '차단' : '실패', memo: msg, ms:Date.now() - t0 });
      console.log('   ✗', id, msg);
      try { await this.page.keyboard.press('Escape'); await closeModals(this.page); } catch (x) {}
    }
  }
  note(id, memo){ const r = this.results.find(x => x.id === id); if (r) r.memo = (r.memo ? r.memo + ' / ' : '') + memo; }
}
export const fail = m => { throw new Error(m); };
export const blocked = m => { const e = new Error(m); e.blocked = true; throw e; };

/** cond()가 참이 될 때까지 기다린다 */
export async function until(cond, msg, ms = 5000){
  const end = Date.now() + ms; let last;
  while (Date.now() < end){
    try { last = await cond(); if (last) return last; } catch (e) { last = e.message; }
    await new Promise(r => setTimeout(r, 100));
  }
  fail(msg + (last && last !== true && typeof last === 'string' ? ' (' + last + ')' : ''));
}
export async function hasText(loc, text, msg){
  await until(async () => (await loc.innerText()).includes(text), (msg || '문구 없음') + ': "' + text + '"');
}
export async function lacksText(loc, text, msg){
  const t = await loc.innerText();
  if (t.includes(text)) fail((msg || '있으면 안 되는 문구') + ': "' + text + '"');
}

/* ---------- 목 상태 ---------- */
export const mockState = page => page.evaluate(() => window.__mock.state());
export async function docsOf(page, col){ const s = await mockState(page); return s.db[col] || {}; }
export async function findId(page, col, pred){
  const docs = await docsOf(page, col);
  const hit = Object.entries(docs).find(([, d]) => pred(d));
  return hit ? hit[0] : null;
}
export const projectId = (page, company) => findId(page, 'projects', d => d.company === company);

/* ---------- 모달 ---------- */
export const modal = page => page.locator('.modal').last();
export async function closeModals(page){
  for (let i = 0; i < 3 && await page.locator('.modal').count(); i++){
    const c = modal(page).getByRole('button', { name:/^(취소|닫기)$/ });
    if (await c.count()) await c.first().click(); else break;
  }
}
export async function closeDrawer(page){
  const d = page.locator('.drawer');
  if (await d.count()) await d.locator('.dr-head').getByRole('button', { name:'닫기', exact:true }).click();
}
export async function fillForm(page, values){
  const m = modal(page);
  for (const [k, v] of Object.entries(values)){
    const el = m.locator('#ff-' + k);
    const tag = await el.evaluate(n => n.tagName);
    if (tag === 'SELECT') await el.selectOption(typeof v === 'object' ? v : { label:v }).catch(() => el.selectOption(v));
    else await el.fill(String(v));
  }
}
export const saveModal = async page => { await modal(page).getByRole('button', { name:'저장', exact:true }).click(); };

/* ---------- 탭 ---------- */
const TAB = { board:'#tabBoard', today:'#tabToday', proj:'#tabProj', acc:'#tabAcc', con:'#tabCon', prod:'#tabProd', asset:'#tabAsset', sched:'#tabSched', act:'#tabAct', report:'#tabReport', admin:'#tabAdmin' };
export async function tab(page, key){ await closeDrawer(page); await page.locator(TAB[key]).click(); }

/* ---------- 엔터티 생성 (화면 조작) ---------- */
export async function addAccount(page, a){
  await tab(page, 'acc');
  await page.getByRole('button', { name:'+ 기관 추가' }).click();
  await fillForm(page, { type:{ value:a.type }, name:a.name, ...(a.phone ? { phone:a.phone } : {}) });
  await saveModal(page);
  await until(() => findId(page, 'accounts', d => d.name === a.name), '기관 저장 안 됨: ' + a.name);
}
export async function addContact(page, c){
  const aid = await findId(page, 'accounts', d => d.name === c.org);
  await tab(page, 'con');
  await page.getByRole('button', { name:'+ 담당자 추가' }).click();
  await fillForm(page, { accountId:{ value:aid }, name:c.name, title:c.title || '', phone:c.phone || '', email:c.email || '', kakao:c.kakao || '' });
  await saveModal(page);
  await until(() => findId(page, 'contacts', d => d.name === c.name && d.accountId === aid), '담당자 저장 안 됨: ' + c.name);
}
export const contactId = async (page, org, name) => {
  const aid = await findId(page, 'accounts', d => d.name === org);
  return findId(page, 'contacts', d => d.name === name && d.accountId === aid);
};
/** 새 과제. roles = {sogongin:[org,name], coord:[…], supplier:[…]} */
export async function addProject(page, p){
  await tab(page, 'board');
  await page.locator('#newBtn').click();
  const m = modal(page);
  const aid = await findId(page, 'accounts', d => d.name === p.company && d.type === 'sogongin');
  if (!aid) fail('소공인 기관 없음: ' + p.company);
  await m.locator('#nf-company').selectOption(aid);   // 업체 = 소공인 기관 선택(자유 입력 없음)
  await m.locator('#nf-cycle').fill(p.cycle);
  if (p.notice) await m.locator('#nf-notice').selectOption(p.notice);
  for (const [r, [org, name]] of Object.entries(p.roles || {})){
    const cid = await contactId(page, org, name);
    if (!cid) fail('담당자 없음: ' + org + '/' + name);
    await m.locator('#nf-r-' + r).selectOption(cid);
  }
  await m.getByRole('button', { name:'등록', exact:true }).click();
  return until(() => projectId(page, p.company), '과제 저장 안 됨');
}
/** 과제 상세를 열고 단계 n을 펼친다 */
export async function openProject(page, company){
  const id = await projectId(page, company);
  if (!id) fail('과제 없음: ' + company);
  if (!(await page.locator('.drawer h2', { hasText:company }).count())){
    await tab(page, 'proj');
    await page.locator('#proj tr', { hasText:company }).first().click();
    await until(() => page.locator('.drawer h2', { hasText:company }).count(), '과제 상세가 열리지 않음');
  }
  return id;
}
export async function openStep(page, company, n){
  const id = await openProject(page, company);
  if (!(await page.locator('#st-' + id + '-' + n).count())){
    await page.locator('.drawer .step-head').nth(n - 1).click();
    await until(() => page.locator('#st-' + id + '-' + n).count(), n + '단계가 펼쳐지지 않음');
  }
  return id;
}
export const stepBody = (page, n) => page.locator('.drawer .step').nth(n - 1).locator('.step-body');
export async function setPlanned(page, company, n, date){
  const id = await openStep(page, company, n);
  await page.locator('#d-' + id + '-' + n + '-planned').fill(date);
  await until(async () => (await docsOf(page, 'projects'))[id]?.steps?.[n]?.planned === date, n + '단계 예정일 저장 안 됨');
}
export async function setStatus(page, company, n, status){
  const id = await openStep(page, company, n);
  await page.locator('#st-' + id + '-' + n).selectOption(status);
  await until(async () => (await docsOf(page, 'projects'))[id]?.steps?.[n]?.status === status, n + '단계 상태 저장 안 됨');
}
export async function checkAllDocs(page, company, n){
  await openStep(page, company, n);
  const boxes = stepBody(page, n).locator('.docs input[type=checkbox]');
  for (let i = 0; i < await boxes.count(); i++) if (!(await boxes.nth(i).isChecked())) { await boxes.nth(i).check(); await page.waitForTimeout(120); }
}
export async function addNote(page, company, n, text){
  const id = await openStep(page, company, n);
  await page.locator('#nt-' + id + '-' + n).fill(text);
  await stepBody(page, n).locator('.noteadd button').click();
  await until(async () => ((await docsOf(page, 'projects'))[id]?.steps?.[n]?.notes || []).some(x => x.text === text), '메모 저장 안 됨');
}
export async function addProduct(page, pr){
  await tab(page, 'prod');
  await page.getByRole('button', { name:'+ 장비 추가' }).click();
  const sup = pr.supplier ? await findId(page, 'accounts', d => d.name === pr.supplier) : '';
  await fillForm(page, { kind:{ value:pr.kind }, supplierId:{ value:sup || '' }, name:pr.name, model:pr.model || '', unitPrice:pr.unitPrice ?? '', unit:{ value:pr.unit || '대' }, spec:pr.spec || '', memo:pr.memo || '' });
  await saveModal(page);
  if (pr.expectError){ await hasText(modal(page).locator('.err'), pr.expectError); await closeModals(page); return null; }
  return until(() => findId(page, 'products', d => d.name === pr.name), '장비 저장 안 됨: ' + pr.name);
}
export async function addAsset(page, company, productName, a = {}){
  await openProject(page, company);
  await page.locator('.drawer').getByRole('button', { name:'+ 장비 도입 등록' }).click();
  const prid = await findId(page, 'products', d => d.name === productName);
  await fillForm(page, { productId:{ value:prid }, qty:String(a.qty || 1), ...(a.serial ? { serial:a.serial } : {}), ...(a.status ? { status:{ value:a.status } } : {}) });
  await saveModal(page);
  const pid = await projectId(page, company);
  return until(() => findId(page, 'assets', d => d.productId === prid && d.projectId === pid), '자산 저장 안 됨: ' + productName);
}

/* ---------- 다운로드 ---------- */
export const downloadCount = page => page.evaluate(() => window.__mock.downloads.length);
export async function nextDownload(page, before, ms = 20000){
  await until(async () => (await downloadCount(page)) > before, '다운로드가 생기지 않음', ms);
  return page.evaluate(i => window.__mock.downloads[i], before);
}
/** docx(base64) → document.xml 의 텍스트(문단 = 줄바꿈) */
export function docxText(b64){
  const buf = Buffer.from(b64, 'base64');
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  const n = buf.readUInt16LE(eocd + 10), cd = buf.readUInt32LE(eocd + 16);
  let p = cd;
  for (let i = 0; i < n; i++){
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString();
    if (name === 'word/document.xml'){
      const ln = buf.readUInt16LE(off + 26), le = buf.readUInt16LE(off + 28);
      const data = buf.slice(off + 30 + ln + le, off + 30 + ln + le + csize);
      const xml = (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
      return xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    }
    p += 46 + nlen + elen + clen;
  }
  fail('docx에 document.xml 없음');
}
export async function wordDraft(page, company, n, formName){
  await openStep(page, company, n);
  const before = await downloadCount(page);
  await stepBody(page, n).locator('.frow', { hasText:formName }).getByRole('button', { name:'Word 초안 받기' }).click();
  try { var d = await nextDownload(page, before, 25000); }
  catch (e){
    const msg = await stepBody(page, n).locator('.frow', { hasText:formName }).locator('.fmsg').innerText().catch(() => '');
    if (msg.includes('라이브러리')) blocked('docx 라이브러리 로드 실패(네트워크)');
    throw e;
  }
  return { filename:d.filename, text:docxText(d.b64) };
}

/* ---------- 기기 간 상태 복사 (목 상태는 localStorage) ---------- */
export async function copyState(from, to){
  const s = await from.evaluate(() => localStorage.getItem('__mock_state'));
  await to.evaluate(v => localStorage.setItem('__mock_state', v), s);
  await to.reload(); await to.waitForTimeout(500);
}
export const syncBack = (mp, page) => copyState(mp, page);

/* ---------- 삭제 ---------- */
export async function deleteProject(page, company){
  const id = await openProject(page, company);
  const b = page.locator('.drawer .dr-head').getByRole('button', { name:'삭제', exact:true });
  await b.click();
  await page.locator('.drawer .dr-head').getByRole('button', { name:'삭제 확인' }).click();
  await until(async () => !(await docsOf(page, 'projects'))[id], '과제가 삭제되지 않음');
}
/** 기관·담당자·장비: 목록 행 → 상세 «수정» → 모달 «삭제» 두 번. 거부 문구를 돌려준다(삭제되면 '') */
export async function deleteVia(page, tabKey, rowText){
  await tab(page, tabKey);
  const listSel = { acc:'#acc', con:'#con', prod:'#prod' }[tabKey];
  await page.locator(listSel + ' tbody tr', { hasText:rowText }).first().click();
  await page.locator('.drawer .dr-head').getByRole('button', { name:'수정' }).click();
  const m = modal(page);
  await m.getByRole('button', { name:'삭제', exact:true }).click();
  await m.getByRole('button', { name:'삭제 확인' }).click();
  await page.waitForTimeout(200);
  if (await page.locator('.modal').count()){
    const err = await modal(page).locator('.err').innerText().catch(() => '');
    await closeModals(page);
    return err || '(삭제 안 됨)';
  }
  await closeDrawer(page);
  return '';
}
