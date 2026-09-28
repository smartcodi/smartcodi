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
    // 명함 읽기: 고정 추출 결과(직함을 이름에 붙여 돌려줘 보드가 나누는지 확인)
    if (prompt.includes('[명함]')) return { org:'[테스트] 명함정밀', orgType:'sogongin', orgTypeWhy:'(목) 제조 업체명', name:'[테스트] 명함 대표', title:'',
      mobile:'010-0000-7777', tel:'02-000-7777', email:'card@example.com', kakao:'', address:'서울 금천구 가산디지털1로 1', addressDetail:'3층', website:'example.com', other:'팩스 02-000-7778' };
    return [...prompt.matchAll(/^\[id:([\w-]+)\] (.*)$/gm)].map(([, id, line]) => /지원 불가/.test(line)
      ? { id, verdict:'fix', evidence:'(목) 2쪽: 설치비 1,000,000원', comment:'(목) 설치·운송비는 지원 불가 — 사업비에서 빼 주세요' }
      : { id, verdict:'pass', evidence:'(목) 문서 근거', comment:'' });
  };
  sampleFn.limits = async () => ({ maxPromptBytes:65536, images:{ maxCount:20, maxInputBytes:20e6, mediaTypes:['image/png','image/jpeg'] } });

  const NS = { db, downloads:downloadsNs, mcp, user, assets, sample:sampleFn };
  window.claude = { use: name => new Promise(ok => setTimeout(() => ok(NS[name] || null), 5)) };

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
    reset(){ localStorage.removeItem(KEY); localStorage.removeItem('__mock_owner'); },
  };
})();
