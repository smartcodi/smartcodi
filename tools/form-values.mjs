#!/usr/bin/env node
/*
 * 보드 과제 데이터 → kordoc fill 값 JSON (원본 HWP 양식의 "인식된 필드"만).
 *
 *   node tools/form-values.mjs <formId> <project.json> <fields.json> [accounts.json] [products.json assets.json projectId] > values.json
 *
 *   formId        log1 | log2 | log3 | result | plan   (보드 FORMS와 같은 id)
 *   project.json  projects 문서의 data (ArtifactData get 결과의 "data")
 *   fields.json   `npx -y kordoc@^4 fill forms/<원본>.hwpx --dry-run` 출력
 *
 * ⚠ 원본은 반드시 한글에서 저장한 .hwpx(forms/)를 쓴다. .hwp를 직접 채우면 kordoc이 hwpx로 재생성하면서
 *   표 칸이 빠지고 배열 값이 라벨 칸을 덮어쓴다(2026-09-28 실측). 필드 순서·블록 구분 로직은 .hwp dry-run
 *   기준으로만 확인됐으므로, .hwpx 원본이 들어오면 dry-run 순서를 다시 확인한 뒤 쓴다(미검증).
 *   accounts.json 선택. {accountId: account} — 코디 소속·구축지 주소를 기관에서 찾을 때
 *   products.json·assets.json·projectId 선택. {id: data} — 사업계획서 H/W·S/W 공급기업을 이 과제 자산의 장비 마스터에서 찾을 때
 *
 * 규칙은 smartcodi-board.html의 buildDraft와 같다(바꾸면 함께 바꿀 것):
 *   기초 항목 = 보드 값, 없으면 원본 칸 그대로 / 본문 = 관련 단계 메모·완료 업무·연락 이력 목록 + 초안 표시,
 *   근거가 없으면 원본 안내문 그대로. 수치를 새로 만들지 않는다.
 * STEPS·TITLES·ROLES·MSG_KINDS·CHANNELS는 보드 HTML에서 그대로 읽어 온다(정의가 한 곳에만 있도록).
 *
 * 수행일지 원본은 1·2·3차 블록이 한 파일에 있고 블록마다 [수행일지, 현장진단표, 작성 예제] 순서라
 * 같은 라벨이 반복된다. 대상 차수 블록의 해당 칸에만 새 값을 넣고, 나머지 칸(다른 차수·예제)은
 * 원본 값을 그대로 배열에 넣어 보존한다. 인식되지 않는 칸(진단표 ①~⑧, 결과보고서 1·3~6 등)은
 * 이 스크립트가 다루지 않는다 — CLAUDE.md «양식 작성»의 patch 단계에서 steps[n].diag 입력값으로 채운다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [formId, projPath, fieldsPath, accPath, prodPath, assetPath, projectId] = process.argv.slice(2);
if (!formId || !projPath || !fieldsPath) {
  console.error('사용법: node tools/form-values.mjs <formId> <project.json> <fields.json> [accounts.json]');
  process.exit(2);
}
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const p = readJson(projPath);
const fields = readJson(fieldsPath).fields;
const accounts = accPath ? readJson(accPath) : {};
const products = prodPath ? readJson(prodPath) : {};
const assets = assetPath && projectId ? Object.values(readJson(assetPath)).filter(a => a.projectId === projectId) : [];

// ---- 보드 HTML에서 정의 가져오기 ----
const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'smartcodi-board.html'), 'utf8');
const grab = name => {
  const m = html.match(new RegExp('const ' + name + ' = ([\\s\\S]*?);\\n'));
  if (!m) throw new Error('보드에서 ' + name + ' 정의를 찾지 못했습니다');
  return m[1];
};
const { STEPS, TITLES, ROLES, MSG_KINDS, CHANNELS, DIAG } = new Function(
  'return { STEPS:' + grab('STEPS') + ', TITLES:' + grab('TITLES') + ', ROLES:' + grab('ROLES')
  + ', MSG_KINDS:' + grab('MSG_KINDS') + ', CHANNELS:' + grab('CHANNELS') + ', DIAG:' + grab('DIAG') + ' };')();
const KIND_LABEL = Object.fromEntries(MSG_KINDS.map(t => [t.k, t.label]));
const VISIT_STEPS = [1, 2, 7, 8];
const DRAFT_TAG = '[보드 메모 기반 초안 — 검토 후 다듬을 것]';

// ---- 규칙 (보드 buildDraft와 동일) ----
const st = n => p.steps?.[String(n)] || {};
const bareName = c => {
  const mt = String(c?.name || '').match(/^(.+?)\s+(\S+)$/);
  return mt && TITLES.test(mt[2]) ? mt[1] : (c?.name || '');
};
const mmdd = ts => { const d = new Date(ts); return isNaN(d) ? '' : String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const activitiesOf = () => {
  const out = (p.activities || []).slice();
  for (const [k, s] of Object.entries(p.steps || {})) for (const ml of s.mails || [])
    out.push({ ts:ml.ts, step:Number(k), channel:'gmail', record:'auto', kind:ml.kind, to:[{ role:ml.role, name:ml.name || '', addr:ml.to }] });
  return out.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
};
const recipText = to => (to || []).map(t => [t.role ? ROLES[t.role]?.label : '추가', t.name || t.addr].filter(Boolean).join(' ')).join(', ');
function evidence(steps, opts = {}) {
  const lines = [];
  for (const n of steps) {
    const s = st(n);
    for (const nt of s.notes || []) lines.push('· (' + mmdd(nt.ts) + ') ' + nt.text);
    if (opts.tasksOf) for (const t of STEPS[n - 1].tasks[opts.tasksOf] || []) if (s.tasks?.[n + '|' + opts.tasksOf + '|' + t]) lines.push('· [완료] ' + t);
    if (opts.acts) for (const a of activitiesOf().filter(a => a.step === n).reverse())
      lines.push('· (' + mmdd(a.ts) + ') ' + (CHANNELS[a.channel] || a.channel) + ' · ' + (a.record === 'auto' ? '자동' : '수동') + ' '
        + (KIND_LABEL[a.kind] || '') + (a.channel === 'calendar' ? ' ' + (a.date || '') : ' → ' + (recipText(a.to) || '—')));
  }
  return lines;
}
const DIAG_STEP = { 1:1, 2:2, 3:7 };   // 진단 차수 → 방문 단계 (보드 DIAG_STEP)
const diagVal = (round, label) => String(st(DIAG_STEP[round]).diag?.[label] || '').trim();
const diagLines = refs => refs.map(([r, i]) => { const k = DIAG[r][i][0], v = diagVal(r, k); return v ? '· [' + r + '차 진단 · ' + k + '] ' + v : null; }).filter(Boolean);
const body = lines => lines.length ? lines.join('\n') + '\n' + DRAFT_TAG : null;   // null = 원본 칸 유지
function visitOf() {
  if (p.visit?.address) return p.visit;
  const a = accounts[p.contacts?.sogongin?.accountId];
  return a?.address ? a : null;
}
const fullAddr = v => [v.address, v.addressDetail].filter(Boolean).join(' ');
const dots = d => { const [y, m, dd] = d.split('-'); return y + '. ' + m + '. ' + dd + '.'; };
const dow = d => '일월화수목금토'[new Date(d + 'T00:00:00').getDay()];
const korDate = d => { const [y, m, dd] = d.split('-'); return y + '년 ' + m + '월 ' + dd + '일'; };

// ---- 필드 배열 채우기 ----
const occ = label => fields.map((f, i) => [i, f]).filter(([, f]) => f.label === label).map(([i]) => i);
const planned = new Map();   // label → Map(fieldIndex → value)
function put(label, value, pick = 0, range = [0, Infinity]) {
  if (value == null || value === '') return;
  const idx = occ(label).filter(i => i >= range[0] && i < range[1]);
  if (idx[pick] == null) { console.error('경고: 필드 없음 — ' + JSON.stringify(label) + ' #' + pick); return; }
  if (!planned.has(label)) planned.set(label, new Map());
  planned.get(label).set(idx[pick], value);
}
function output() {
  const out = {};
  for (const [label, m] of planned) {
    const all = occ(label);
    out[label] = all.length === 1 ? m.get(all[0]) : all.map(i => m.has(i) ? m.get(i) : fields[i].value);
  }
  return out;
}

const sg = p.contacts?.sogongin || {}, co = p.contacts?.coord || {}, sp = p.contacts?.supplier || {};
const coOrg = co.org || accounts[co.accountId]?.name || '';
const spOrg = sp.org || sp.name || '';
// 보드 assetSuppliers와 같음: 이 과제 자산의 장비 공급기업(중복 제거), 없으면 ''
const assetSuppliers = kind => [...new Set(assets.map(a => products[a.productId]).filter(pr => pr && pr.kind === kind)
  .map(pr => accounts[pr.supplierId]?.name).filter(Boolean))].join(', ');

if (/^log[123]$/.test(formId)) {
  const round = Number(formId[3]);
  const stepN = [1, 2, 7][round - 1];   // 1차→1단계, 2차→2단계, 3차→7단계
  const starts = occ('신청인(대표자명)');
  if (starts.length !== 3) throw new Error('수행일지 원본의 차수 블록을 찾지 못했습니다 (신청인 칸 ' + starts.length + '개)');
  // 블록 시작 = 수행일지 첫 칸 '업체명' (신청인 칸 바로 앞). 신청인 칸 기준으로 자르면 업체명이 이전 블록에 들어간다.
  const blockStart = i => (fields[i - 1]?.label === '업체명' ? i - 1 : i);
  const R = [blockStart(starts[round - 1]), starts[round] != null ? blockStart(starts[round]) : Infinity];
  const s = st(stepN), day = s.actual || s.planned;
  const nxt = VISIT_STEPS[VISIT_STEPS.indexOf(stepN) + 1], ns = STEPS[nxt - 1];
  // 수행일지
  put('업체명', p.company, 0, R);
  put('신청인(대표자명)', bareName(sg), 0, R);
  put('신청인 연락처', sg.phone, 0, R);
  put('코디네이터 성명', bareName(co), 0, R);
  put('코디네이터 연락처', co.phone, 0, R);
  put('코디네이팅 차수', '( ' + round + ' )차', 0, R);
  if (day) put('수 행 일 자', dots(day) + ' (' + dow(day) + '요일)', 0, R);
  put('코디네이팅\n활동요약', body(evidence([stepN], { tasksOf:'coord', acts:true })), 0, R);
  if (st(nxt).planned) put('차기수행일', korDate(st(nxt).planned), 0, R);
  put('차기수행내용', ns ? nxt + '. ' + ns.name + ' — ' + ns.aim + ((ns.tasks.coord || []).length ? '\n' + ns.tasks.coord.map(t => '· ' + t).join('\n') : '') : '', 0, R);
  // 현장진단표 (블록의 첫 표 = 빈 양식, 둘째 = 작성 예제는 건드리지 않음)
  put('업체명', p.company, 1, R);
  if (day) put('방문일자', dots(day), 0, R);
  put('방문차수', round + ' 차', 0, R);
  put('대  표  자', bareName(sg) ? bareName(sg) + ' (서명)' : '', 0, R);
  put('담당 코디네이터', bareName(co), 0, R);
  if (round === 1) put('종합의견', body(evidence([1])), 0, R);
} else if (formId === 'result') {
  const days = new Set(VISIT_STEPS.map(st).filter(s => s.status === 'done' && s.actual).map(s => s.actual));
  if (days.size) put('총 수행일수', days.size + '일');
  put('업체명', p.company);
  put('신청인(대표자명)', bareName(sg));
  put('신청인 연락처', sg.phone);
  put('소  속 ', coOrg);
  put('성  명 ', bareName(co));
  put('연락처 ', co.phone);
  put('이메일 ', co.email);
  put('2. 도입 목적 및 범위', body([...diagLines([[2,2], [2,3], [3,0]]), ...evidence([2])]));
} else if (formId === 'plan') {
  const v = visitOf();
  put('업 체 명', p.company);
  put('대표자명', bareName(sg));
  put('대표자 연락처', sg.phone);
  if (v) put('구축지 주소', fullAddr(v));
  ['hw', 'sw'].forEach((k, i) => { const org = assetSuppliers(k) || spOrg; if (org) put('공급\n기업', '공급기업명: ' + org + '                         사업자등록번호:', i); });   // 0 = H/W, 1 = S/W
  put('기업개요(소개)', body(evidence([1])));
} else {
  console.error('알 수 없는 formId: ' + formId + ' (log1|log2|log3|result|plan)');
  process.exit(2);
}

process.stdout.write(JSON.stringify(output(), null, 2) + '\n');
