// 규칙 바꾸기: 지금 규칙에서 비밀 키를 그대로 가져와 새 규칙에 넣고, 시험을 모두 통과하면 적용해요.
// node push/rules/deploy.mjs [--apply]
import { readFileSync } from 'node:fs';
import { cert } from 'firebase-admin/app';
const sa = JSON.parse(process.env.FIREBASE_SA), P = sa.project_id, apply = process.argv.includes('--apply');
const tok = (await cert(sa).getAccessToken()).access_token;
const api = async (path, opt = {}) => { const r = await fetch('https://firebaserules.googleapis.com/v1/' + path, { ...opt, headers:{ authorization:'Bearer ' + tok, 'content-type':'application/json' } }); const j = await r.json(); if (!r.ok) throw new Error(path + ' ' + r.status + ' ' + JSON.stringify(j).slice(0, 400)); return j; };
const rel = await api(`projects/${P}/releases/cloud.firestore`);
const cur = await api(rel.rulesetName);
const old = cur.source.files[0].content;
const m = old.match(/match\s+\/inbox\/\{[^}]+\}\s*\{[\s\S]*?key\s*==\s*'([^']+)'/);
if (!m) throw new Error('지금 규칙에서 알림 키를 못 찾았어요');
const KEY = m[1];
console.log('현재 규칙:', rel.rulesetName.split('/').pop(), '| 키 길이', KEY.length);
const src = readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8').replace('__INBOX_KEY__', KEY);
// 새 규칙을 먼저 만들어(아직 적용 전) 문법을 확인해요
const rs = await api(`projects/${P}/rulesets`, { method:'POST', body:JSON.stringify({ source:{ files:[{ name:'firestore.rules', content:src }] } }) });
console.log('새 규칙 문법 통과:', rs.name.split('/').pop());
if (!apply) { console.log('적용은 안 했어요'); process.exit(0); }

const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
const { getAuth } = await import('firebase-admin/auth');
initializeApp({ credential:cert(sa) });
const fs = getFirestore(), auth = getAuth();
const release = name => api(`projects/${P}/releases/cloud.firestore`, { method:'PATCH', body:JSON.stringify({ release:{ name:`projects/${P}/releases/cloud.firestore`, rulesetName:name } }) });
await release(rs.name);
console.log('적용함 → 실제 계정 흉내로 시험해요 (규칙 퍼지는 동안 70초 기다림)');
await new Promise(r => setTimeout(r, 70000));

/* ---- 실제 시험: 시험용 임시 계정(rt_*)과 임시 문서(rt_*)로만 해요 ---- */
const APIKEY = 'AIzaSyD4CClgKtGJpVI9fGBysr_ohsnvKFI_K8k';
const FSB = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents`;
const toks = {};
async function idTok(w){ if (!w) return null; if (toks[w]) return toks[w];
  const ct = await auth.createCustomToken('rt_' + w, { email:w + '@family-cal.app' });
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${APIKEY}`, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ token:ct, returnSecureToken:true }) });
  const j = await r.json(); if (!j.idToken) throw new Error('시험 계정 로그인 실패 ' + JSON.stringify(j).slice(0, 200)); return (toks[w] = j.idToken); }
const val = v => Array.isArray(v) ? { arrayValue:{ values:v.map(val) } } : typeof v === 'number' ? { integerValue:String(v) } : typeof v === 'object' ? { mapValue:{ fields:Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } } : { stringValue:String(v) };
const fields = d => Object.fromEntries(Object.entries(d).map(([k, x]) => [k, val(x)]));
async function call(w, method, url, body){ const t = await idTok(w); const r = await fetch(url, { method, headers:{ 'content-type':'application/json', ...(t ? { authorization:'Bearer ' + t } : {}) }, body:body ? JSON.stringify(body) : undefined }); return r.status; }
const ops = {
  get:(w, p) => call(w, 'GET', `${FSB}/${p}`),
  list:(w, c) => call(w, 'GET', `${FSB}/${c}?pageSize=1`),
  query:(w, c, f, v) => call(w, 'POST', `${FSB}:runQuery`, { structuredQuery:{ from:[{ collectionId:c }], where:{ fieldFilter:{ field:{ fieldPath:f }, op:'ARRAY_CONTAINS', value:val(v) } }, limit:1 } }),
  create:(w, p, d) => call(w, 'PATCH', `${FSB}/${p}?currentDocument.exists=false`, { fields:fields(d) }),
  update:(w, p, d) => call(w, 'PATCH', `${FSB}/${p}?currentDocument.exists=true`, { fields:fields(d) }),
};
const KEEP = '2000-01-01';
const setup = { 'events/rt_e_kid1':{ people:['kid1'], title:'rt', date:KEEP }, 'events/rt_e_par':{ people:['me','hus'], title:'rt', date:KEEP },
  'log/rt_l_kid':{ vis:['kid1'], at:0 }, 'log/rt_l_par':{ vis:['me','hus'], at:0 }, 'log/rt_l_old':{ act:'new', at:0 }, 'members/rt_kid1':{ who:'kid1', at:0 } };
for (const [p, d] of Object.entries(setup)) await fs.doc(p).set(d);
const C = [
  ['ALLOW','kid1','get','events/rt_e_kid1'], ['DENY','kid1','get','events/rt_e_par'], ['ALLOW','kid1','query','events','people','kid1'], ['DENY','kid1','list','events'],
  ['ALLOW','kid1','create','events/rt_c1',{ people:['kid1'], title:'rt', date:KEEP }], ['DENY','kid1','create','events/rt_c2',{ people:['kid2'], title:'rt', date:KEEP }],
  ['DENY','kid1','list','work'], ['ALLOW','kid1','get','config/main'], ['DENY','kid1','get','config/budget'], ['DENY','kid1','list','ledger'], ['DENY','kid1','update','config/main',{ x:'1' }],
  ['ALLOW','kid1','get','log/rt_l_kid'], ['DENY','kid1','get','log/rt_l_par'], ['DENY','kid1','get','log/rt_l_old'], ['ALLOW','kid1','query','log','vis','kid1'], ['DENY','kid1','list','log'], ['ALLOW','kid1','create','log/rt_lc',{ vis:['kid1'], at:0 }],
  ['ALLOW','kid2','create','share/cycle_kid2',{ owner:'kid2' }], ['DENY','kid1','update','share/cycle_kid2',{ owner:'kid1' }], ['DENY','kid1','get','share/cycle'], ['ALLOW','hus','get','share/cycle_kid2'],
  ['ALLOW','kid2','create','kcycle/kid2',{ x:'1' }], ['ALLOW','me','get','kcycle/kid2'], ['DENY','hus','get','kcycle/kid2'], ['DENY','kid1','get','kcycle/kid2'], ['DENY','me','update','kcycle/kid2',{ x:'2' }],
  ['ALLOW','me','get','events/rt_e_kid1'], ['ALLOW','me','list','ledger'], ['ALLOW','hus','get','config/budget'], ['ALLOW','hus','list','events'], ['ALLOW','me','get','kcycle/kid1'],
  ['ALLOW','kid1','list','annivs'], ['DENY','kid1','create','annivs/rt_a',{ who:'kid1' }], ['ALLOW','kid1','create','notices/rt_n',{ text:'rt', until:KEEP }], ['ALLOW','kid2','list','members'],
  ['ALLOW','kid1','update','members/rt_kid1',{ who:'kid1', at:0 }], ['DENY','kid1','update','members/rt_kid1',{ who:'me', at:0 }],
  ['ALLOW','kid1','get','private/rt_kid1/log/x'], ['DENY','kid1','get','private/rt_me/log/x'],
  ['ALLOW',null,'create','inbox/rt_i',{ key:KEY, app:'rt', text:'rt 시험' }], ['DENY',null,'create','inbox/rt_i2',{ key:'wrong', app:'rt', text:'rt' }], ['DENY',null,'get','events/rt_e_par'],
];
let bad = [];
try {
  for (const c of C) { const [exp, w, op, ...a] = c; const st = await ops[op](w, ...a); const got = (st === 200 || st === 404) ? 'ALLOW' : st === 403 ? 'DENY' : 'ERR' + st; if (got !== exp) bad.push(`${exp}≠${got} ${w || '로그인안함'} ${op} ${a[0]}`); }
} finally {
  // 시험 흔적 지우기
  for (const p of [...Object.keys(setup), 'events/rt_c1', 'events/rt_c2', 'log/rt_lc', 'share/cycle_kid2', 'kcycle/kid2', 'annivs/rt_a', 'notices/rt_n', 'inbox/rt_i', 'inbox/rt_i2']) await fs.doc(p).delete().catch(() => {});
  for (const w of Object.keys(toks)) await auth.deleteUser('rt_' + w).catch(() => {});
}
console.log(`시험 ${C.length}개 중 통과 ${C.length - bad.length}개`); bad.forEach(x => console.log('  실패:', x));
if (bad.length) { await release(rel.rulesetName); console.log('↩ 문제가 있어 이전 규칙으로 되돌렸어요:', rel.rulesetName.split('/').pop()); process.exit(1); }
console.log('적용 완료:', rs.name.split('/').pop(), '(이전:', rel.rulesetName.split('/').pop() + ')');

// 옛 일정에 '누구 일정인지(people)' 채우기 — 아이들 화면이 이 값으로 보여 줘요
const PS = ['me','hus','kid1','kid2'], G = { couple:['me','hus'], kids:['kid1','kid2'], family:PS };
let n = 0;
for (const d of (await fs.collection('events').get()).docs) { const e = d.data(); if (Array.isArray(e.people) && e.people.length) continue; const ps = (G[e.cat] || [e.cat]).filter(p => PS.includes(p)); await d.ref.update({ people:ps.length ? ps : ['me'] }); n++; }
console.log('옛 일정 정리:', n, '건');
