/* 코디 보드 E2E용 window.claude 목.
   보드(smartcodi-board.html)가 실제로 부르는 호출만 흉내 낸다. 상태는 localStorage에 보존해
   새로고침·CASE 간에 이어지고, window.__mock 으로 테스트가 들여다보고 조작한다.
   db.update 의미는 플랫폼 타입 문서(db.d.ts 0.2.60) 그대로:
   "Merge-write that REQUIRES the document to exist — rejects invalid_argument otherwise.
    Nested objects merge recursively; anything else (arrays included) replaces that field wholesale." */
(() => {
  const KEY = '__mock_state';
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  let st;
  try { st = JSON.parse(localStorage.getItem(KEY)); } catch (e) { st = null; }
  st = st || { db:{}, threads:{}, sent:[], events:{}, seq:1 };
  const save = () => localStorage.setItem(KEY, JSON.stringify(st));
  const nid = p => p + (st.seq++);

  const downloads = [];   // 이 페이지 수명 동안만 (docx는 base64)
  const calls = [];       // mcp 호출 기록

  /* ---------- db ---------- */
  const listeners = {};   // col → Set(fn)
  function emit(col){
    const docs = Object.entries(st.db[col] || {}).map(([id, d]) => ({ id, data: () => clone(d) }));
    for (const fn of listeners[col] || []) setTimeout(() => fn({ docs }), 0);
  }
  function merge(t, p){
    for (const k of Object.keys(p)){
      if (isObj(p[k]) && isObj(t[k])) merge(t[k], p[k]);
      else t[k] = clone(p[k]);
    }
  }
  const db = {
    doc(path){
      const [col, id] = path.split('/');
      return {
        path,
        async get(){ const d = st.db[col]?.[id]; return { exists: !!d, id, data: () => clone(d) }; },
        async set(data){ (st.db[col] = st.db[col] || {})[id] = clone(data); save(); emit(col); },
        async update(patch){
          const d = st.db[col]?.[id];
          if (!d) throw { code:'invalid_argument', message:'document does not exist' };
          merge(d, patch); save(); emit(col);
        },
        async delete(){ if (st.db[col]) delete st.db[col][id]; save(); emit(col); },
      };
    },
    collection(col){
      return {
        onSnapshot(next, err){
          (listeners[col] = listeners[col] || new Set()).add(next);
          emit(col);
          return () => listeners[col].delete(next);
        },
      };
    },
  };

  /* ---------- downloads ---------- */
  const toB64 = async data => {
    const buf = data instanceof Blob ? await data.arrayBuffer() : typeof data === 'string' ? new TextEncoder().encode(data).buffer : data;
    let s = ''; const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const downloadsNs = {
    async save({ filename, data }){
      downloads.push({ filename, b64: await toB64(data), text: typeof data === 'string' ? data : null });
      return { ok:true };
    },
  };

  /* ---------- mcp ---------- */
  const watchers = new Set();   // list_events 구독
  const evList = () => Object.values(st.events).map(e => ({
    id:e.id, summary:e.summary, htmlLink:e.htmlLink, status:'confirmed',
    start:{ date: e.startTime.slice(0,10) + 'T00:00:00Z' }, end:{ date: e.endTime.slice(0,10) + 'T00:00:00Z' },
  }));
  const pushEvents = () => { for (const w of watchers) setTimeout(() => w({ type:'data', result:{ payload:{ events: evList() }, cache:{ storedAt: Date.now() } } }), 0); };
  async function callTool(server, tool, input){
    calls.push({ server, tool, input: clone(input) });
    if (server === 'Gmail' && tool === 'send_message'){
      const id = nid('m'), threadId = nid('t');
      st.threads[threadId] = { id:threadId, messages:[{ id, internalDate:String(Date.now()), labelIds:['SENT'], sender:'sender@example.com' }] };
      st.sent.push({ id, threadId, to:input.to, subject:input.subject, body:input.body, attachments:(input.attachments || []).map(a => a.filename) });
      save();
      return { payload:{ id, threadId, labelIds:['SENT'] } };
    }
    if (server === 'Gmail' && tool === 'get_thread'){
      const t = st.threads[input.threadId];
      if (!t) throw { code:'tool_error', message:'Requested entity was not found.' };
      return { payload: clone(t) };
    }
    if (server === 'Google Calendar' && tool === 'create_event'){
      const id = nid('e');
      st.events[id] = { id, htmlLink:'https://calendar.google.com/event?eid=' + id, ...clone(input) };
      save(); pushEvents();
      return { payload:{ id, htmlLink: st.events[id].htmlLink } };
    }
    if (server === 'Google Calendar' && tool === 'update_event'){
      const e = st.events[input.eventId];
      if (!e) throw { code:'tool_error', message:'not found' };
      Object.assign(e, clone(input)); save(); pushEvents();
      return { payload:{ id:e.id, htmlLink:e.htmlLink } };
    }
    throw { code:'not_in_manifest', message: server + '/' + tool };
  }
  const mcp = {
    callTool,
    watchTool(server, tool, input, handler){
      if (server === 'Google Calendar' && tool === 'list_events'){
        watchers.add(handler);
        setTimeout(() => handler({ type:'data', result:{ payload:{ events: evList() }, cache:{ storedAt: Date.now() } } }), 0);
        return () => watchers.delete(handler);
      }
      setTimeout(() => handler({ type:'error', error:{ code:'not_in_manifest' } }), 0);
      return () => {};
    },
    async listTools(){ return { fileArgs:true, servers:[] }; },
    async invalidate(){ pushEvents(); },
  };

  /* ---------- user / assets ---------- */
  const user = {
    async id(){ return 'u_tester'; },
    async profiles(ids){ return Object.fromEntries([].concat(ids).map(i => [i, { id:i, name: i === 'u_tester' ? '시험자' : '', isMe: i === 'u_tester' }])); },
  };
  const assets = {
    async upload(file, opts = {}){
      const r = await fetch('/__blob', { method:'POST', body:file, headers:{ 'content-type': opts.type || file.type || 'application/octet-stream' } });
      const { id } = await r.json();
      return { id, url:'/_blob/' + id, sizeBytes:file.size, contentType: opts.type || file.type };
    },
    async delete(id){ await fetch('/__blob/' + id, { method:'DELETE' }); },
  };

  /* ---------- user.isOwner — __mock.setOwner(false)로 소유자가 아닌 사람 흉내(새로고침 후 적용) ---------- */
  user.isOwner = async () => localStorage.getItem('__mock_owner') !== '0';
  user.canEdit = async () => true;

  /* ---------- sample(Claude) — 실제 계약(sample.d.ts 0.2.60)의 모양만 흉내 낸다 ----------
     json(): 프롬프트의 [id:…] 항목마다 판정을 돌려준다. 기준에 «지원 불가»가 든 항목은 fix(보완 1건 흉내), 나머지 pass.
     64KiB 넘는 입력은 실제처럼 prompt_too_large. 호출은 __mock.samples에 남긴다. */
  const samples = [];
  const promptOf = input => typeof input === 'string' ? input : input.map(t => t.content).join('\n');
  const sampleFn = async (input, opts = {}) => ({ text: String(await sampleFn.json(input, opts)), truncated:false, modelTierApplied: opts.modelTier || 'default' });
  sampleFn.json = async (input, opts = {}) => {
    const prompt = promptOf(input);
    if (new TextEncoder().encode(prompt).length > 65536) throw { code:'prompt_too_large', message:'over 64 KiB' };
    if (opts.signal?.aborted) throw { code:'cancelled', message:'aborted' };
    const images = opts.images ? [].concat(opts.images).length : 0;
    samples.push({ prompt, images, modelTier: opts.modelTier || 'default' });
    await new Promise(ok => setTimeout(ok, 50));
    // 보드 도우미(대화): 마지막 사용자 말의 첫 줄로 흉내 — 견적서 PDF → quote, 등록해/네 → register, 공급기업 → 유형 정정, 과제 → 못 함, 그 밖 → 명함 읽기
    // 양식 초안 작성: [칸 목록]의 key마다 채움. 사용자가 알려 준 «용접 불량 원인»이 프롬프트에 있으면 반영(근거 전달 확인용)
    if (prompt.startsWith('[작성]')){
      const told = prompt.includes('용접 불량 원인') ? ' · 용접 불량 원인 논의 반영' : '';
      const cells = {};
      for (const m of prompt.matchAll(/^(s\d+r\d+) \| ([^|]+?) \|/gm)) cells[m[1]] = '(목) 작성 — ' + m[2].trim() + told;
      return { cells, questions:['(목) 수행시간을 알려 주세요'] };
    }
    if (prompt.includes('[도우미]')){
      const lastFull = Array.isArray(input) ? input[input.length - 1].content : prompt;
      const last = lastFull.split(/\r?\n/)[0];
      // 견적서 PDF(보드가 뽑은 텍스트): «공급자: …»와 과제 목록의 업체명으로 공급기업·과제를 흉내, 품목은 고정(기존 장비 1 + 새 장비 2)
      if (lastFull.includes('[견적서 PDF')){
        const plist = prompt.slice(prompt.lastIndexOf('\n[과제 목록]'), prompt.lastIndexOf('\n[지금 열린 과제]'));
        const proj = [...plist.matchAll(/^- (\S+) \| (.+?) \| /gm)].find(([, , co]) => lastFull.includes(co));
        const sup = (lastFull.match(/공급자:\s*(.+?)\s*·/) || [])[1] || '';
        return { reply:'(목) 견적서를 읽었습니다: ' + sup + ' · 3품목. 아래 표에서 확인하고 등록을 눌러 주세요.', card:null, action:'none', projectId: proj ? proj[1] : '',
          quote:{ supplier:{ name:sup, tel:'02-000-8888', address:'', addressDetail:'', bizNo:'' }, to: proj ? proj[2] : '', date:'2026-10-02', number:'Q-TEST-01', vat:'별도',
            totals:{ supply:'45,200,000', vat:'', total:'' },
            items:[
              { kind:'hw', kindWhy:'(목) 설비', name:'CNC 레이저 용접 시스템', model:'', spec:'', unit:'대', unitRaw:'대', qty:1, unitPrice:'41,000,000', amount:'41,000,000', note:'' },
              { kind:'hw', kindWhy:'(목) 계측 장비', name:'[테스트] 견적 계량기', model:'QT-100', spec:'(목) 0~30kg', unit:'대', unitRaw:'EA', qty:'2', unitPrice:'1,500,000', amount:'3,000,000', note:'' },
              { kind:'sw', kindWhy:'(목) 월 구독 SW', name:'[테스트] 견적 MES', model:'QM-1', spec:'', unit:'월(임차)', unitRaw:'개월', qty:3, unitPrice:400000, amount:1200000, note:'(목) 설치 교육 포함' },
            ] } };
      }
      // 방문 결과 → 끝낸 업무·산출물 체크 제안. 일부러 섞음: 이미 체크된 업무, 미래형 근거(«내일 씀»), 문구가 다른 업무·산출물 — 보드의 걸러내기 확인용
      if (/방문 결과|끝남|끝났/.test(last)){
        const plist = prompt.slice(prompt.lastIndexOf('\n[과제 목록]'), prompt.lastIndexOf('\n[지금 열린 과제]'));
        const proj = [...plist.matchAll(/^- (\S+) \| (.+?) \| /gm)].find(([, , co]) => last.includes(co));
        const step = { 1:1, 2:2, 3:7, 4:8 }[(last.match(/([1-4])차/) || [])[1]] || 0;
        return { reply:'(목) 끝낸 항목 3개를 찾았습니다. 수행일지는 아직입니다. 아래 카드에서 확인하고 체크를 눌러 주세요.', card:null, quote:null, diag:null, action:'none',
          progress:{ projectId: proj ? proj[1] : '', step, actual: /오늘/.test(last) ? '오늘' : '',
            tasks:[
              { task:'개선과제 공유 및 논의', said:'개선과제 공유' },
              { task:'개선과제 도출', said:'개선과제 도출했고' },
              { task:'서명 및 확인', said:'대표 서명 받음' },
              { task:'수행일지 작성', said:'수행일지는 내일 씀' },
              { task:'개선과제를 도출함', said:'개선과제 도출했고' },
            ],
            docs:[{ doc:'2차 방문 확인 서명', said:'대표 서명 받음' }, { doc:'수행일지 2차', said:'수행일지는 내일 씀' }] } };
      }
      // 방문 메모 → 현장진단표(1차 항목명). 일부러 섞음: 기존 값 있는 칸(⑧), 메모에 없는 숫자(⑤ 5%), 없는 항목명(⑨) — 보드의 걸러내기 확인용
      if (/방문 메모/.test(last)){
        const plist = prompt.slice(prompt.lastIndexOf('\n[과제 목록]'), prompt.lastIndexOf('\n[지금 열린 과제]'));
        const proj = [...plist.matchAll(/^- (\S+) \| (.+?) \| /gm)].find(([, , co]) => last.includes(co));
        const round = Number((last.match(/([1-4])차/) || [])[1] || 0);
        return { reply:'(목) 방문 메모를 1차 진단표 5칸으로 나눴습니다. 아래 카드에서 확인하고 넣기를 눌러 주세요.', card:null, quote:null, action:'none',
          diag:{ projectId: proj ? proj[1] : '', round, items:{
            '현상청취 (대표자의 말)':'"불량이 하루 30개쯤 나와요"',
            '③ 현재 기록 방식 수준':'종이 일지',
            '④ KPI 변수에 따른 기초 데이터 유형':'용접 불량 하루 30개 (대표자 추정)',
            '⑤ 원인추적가능성':'(목) 불량률 5%',
            '⑥ 검사방식':'육안 검사',
            '⑧ 담당 가능 인력':'(목) 새 담당 인력',
            '⑨ 없는 항목':'(목) 버려져야 함',
            '⑦ 안전·환경위험':'미확인',
          } } };
      }
      if (/수행일지|사업계획서|결과보고서|다시 써/.test(last)){
        const plist = prompt.slice(prompt.lastIndexOf('\n[과제 목록]'), prompt.lastIndexOf('\n[지금 열린 과제]'));   // 과제 목록 절만(규칙 문장·양식 목록과 섞이지 않게)
        const proj = [...plist.matchAll(/^- (\S+) \| (.+?) \| /gm)].find(([, , co]) => last.includes(co));
        const n = (last.match(/([1-4])차/) || [])[1];
        const formId = /사업계획서/.test(last) ? 'plan' : /결과보고서/.test(last) ? 'result' : n ? 'log' + n : '';
        return { reply:'(목) 초안을 씁니다.', card:null, action:'draft', projectId: proj ? proj[1] : '', formId };
      }
      const CARD = { org:'[테스트] 명함정밀', orgType:'sogongin', orgTypeWhy:'(목) 제조 업체명', name:'[테스트] 명함 대표', title:'', mobile:'010-0000-7777', tel:'02-000-7777',
        email:'card@example.com', kakao:'', address:'서울 금천구 가산디지털1로 1', addressDetail:'3층', website:'example.com', other:'' };
      if (/등록해|^네/.test(last)) return { reply:'(목) 등록 창을 엽니다.', card:null, action:'register' };
      if (/공급기업/.test(last)) return { reply:'(목) 유형을 공급기업으로 고쳤습니다.', card:Object.assign({}, CARD, { orgType:'supplier', orgTypeWhy:'사용자 정정' }), action:'none' };
      // 과제 한 건 현황: 과제 목록의 업체명이 말에 있으면 그 id, 없으면 ""(보드가 열린 과제로 대신하거나 되묻는다). reply에 일부러 수치를 넣지 않는다
      if (/남았|어디까지|현황/.test(last)){
        const plist = prompt.slice(prompt.lastIndexOf('\n[과제 목록]'), prompt.lastIndexOf('\n[지금 열린 과제]'));
        const proj = [...plist.matchAll(/^- (\S+) \| (.+?) \| /gm)].find(([, , co]) => last.includes(co));
        return { reply:'(목) 과제 현황입니다. 아래 카드를 보세요.', card:null, quote:null, diag:null, action:'status', projectId: proj ? proj[1] : '' };
      }
      if (/과제/.test(last)) return { reply:'(목) 과제 조회는 아직 못 합니다.', card:null, action:'none' };
      return { reply:'(목) [테스트] 명함정밀(소공인 추정), [테스트] 명함 대표, 010-0000-7777로 읽었습니다. 등록 창을 열까요?', card:CARD, action:'none' };
    }
    // 명함 읽기: 고정 추출 결과(직함을 이름에 붙여 돌려줘 보드가 나누는지 확인)
    if (prompt.includes('[명함]')) return { org:'[테스트] 명함정밀', orgType:'sogongin', orgTypeWhy:'(목) 제조 업체명', name:'[테스트] 명함 대표', title:'',
      mobile:'010-0000-7777', tel:'02-000-7777', email:'card@example.com', kakao:'', address:'서울 금천구 가산디지털1로 1', addressDetail:'3층', website:'example.com', other:'팩스 02-000-7778' };
    return [...prompt.matchAll(/^\[id:([\w-]+)\] (.*)$/gm)].map(([, id, line]) => /지원 불가/.test(line)
      ? { id, verdict:'fix', evidence:'(목) 2쪽: 설치비 1,000,000원', comment:'(목) 설치·운송비는 지원 불가 — 사업비에서 빼 주세요' }
      : { id, verdict:'pass', evidence:'(목) 문서 근거', comment:'' });
  };
  // 보는 화면의 차이 흉내(새로고침 후 적용): __mock.setView({ noImages }) = 사진 못 보냄(실측: claude.ai 웹 2026-09-29), { noSample } = Claude 못 씀
  const flag = k => localStorage.getItem('__mock_' + k) === '1';
  sampleFn.limits = async () => flag('noImages') ? { maxPromptBytes:65536 }
    : { maxPromptBytes:65536, images:{ maxCount:20, maxInputBytes:20e6, mediaTypes:['image/png','image/jpeg'] } };

  const NS = { db, downloads:downloadsNs, mcp, user, assets, sample:sampleFn };
  window.claude = { use: name => new Promise(ok => setTimeout(() => ok(name === 'sample' && flag('noSample') ? null : NS[name] || null), 5)) };

  /* ---------- 테스트용 조작면 ---------- */
  window.__mock = {
    state: () => clone(st),
    downloads, calls,
    sent: () => clone(st.sent),
    events: () => clone(st.events),
    reply(threadId){
      const t = st.threads[threadId];
      t.messages.push({ id: nid('r'), internalDate: String(Date.now() + 1000), labelIds:['INBOX','UNREAD'], sender:'tester@example.com' });
      save();
    },
    // 다른 기기의 쓰기처럼 스냅샷을 강제로 다시 보낸다(내용 동일)
    bump(col){ emit(col); },
    samples,
    setOwner(v){ localStorage.setItem('__mock_owner', v ? '1' : '0'); },
    setView(v = {}){ for (const k of ['noImages','noSample']) localStorage.setItem('__mock_' + k, v[k] ? '1' : '0'); },
    reset(){ localStorage.removeItem(KEY); localStorage.removeItem('__mock_owner'); localStorage.removeItem('__mock_noImages'); localStorage.removeItem('__mock_noSample'); },
  };
})();
