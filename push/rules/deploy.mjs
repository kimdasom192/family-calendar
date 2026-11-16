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
const D = '/databases/(default)/documents/';
const au = w => w ? { uid:'u_' + w, token:{ email:w + '@family-cal.app' } } : null;
const T = (exp, w, method, path, data, newData, uid) => { const req = { auth:au(w), path:D + path, method }; if (uid && req.auth) req.auth.uid = uid; if (newData) req.resource = { data:newData }; const tc = { expectation:exp, request:req }; if (data) tc.resource = { data }; return tc; };
const cases = [
  T('ALLOW','me','get','events/e1',{people:['kid1']}), T('ALLOW','hus','list','events/e1',{people:['me']}),
  T('ALLOW','kid1','get','events/e1',{people:['kid1','me']}), T('DENY','kid1','get','events/e1',{people:['me','hus']}), T('DENY','kid2','get','events/e1',{people:['kid1']}),
  T('ALLOW','kid1','create','events/e9',null,{people:['kid1'],title:'x'}), T('DENY','kid1','create','events/e9',null,{people:['kid2'],title:'x'}),
  T('ALLOW','kid1','update','events/e1',{people:['kid1']},{people:['kid1','me']}), T('DENY','kid1','update','events/e1',{people:['me']},{people:['me','kid1']}),
  T('DENY','kid1','get','work/2026-11-18',{course:'3'}), T('DENY','kid1','get','ledger/l1',{amount:1}), T('DENY','kid1','get','config/budget',{}), T('ALLOW','kid1','get','config/main',{}), T('DENY','kid1','update','config/main',{},{names:{}}),
  T('ALLOW','me','get','ledger/l1',{amount:1}), T('ALLOW','hus','update','config/budget',{},{a:1}),
  T('ALLOW','kid1','get','log/x',{vis:['me','hus','kid1']}), T('DENY','kid1','get','log/x',{vis:['me','hus']}), T('DENY','kid1','get','log/x',{act:'new'}), T('ALLOW','kid1','create','log/y',null,{vis:['kid1']}), T('DENY','kid1','update','log/y',{vis:['hus']},{vis:['hus']}),
  T('ALLOW','kid1','create','share/cycle_kid1',null,{owner:'kid1'}), T('ALLOW','kid1','update','share/cycle_kid1',{owner:'kid1'},{owner:'kid1'}), T('DENY','kid1','create','share/cycle',null,{}), T('DENY','kid1','get','share/cycle_kid1',{owner:'kid1'}), T('DENY','kid2','create','share/cycle_kid1',null,{}),
  T('ALLOW','hus','get','share/cycle_kid1',{owner:'kid1'}), T('ALLOW','me','update','share/cycle',{},{owner:'me'}),
  T('ALLOW','kid1','update','kcycle/kid1',{periods:[]},{periods:[]}), T('ALLOW','kid1','get','kcycle/kid1',{periods:[]}), T('ALLOW','me','get','kcycle/kid1',{periods:[]}),
  T('DENY','me','update','kcycle/kid1',{periods:[]},{periods:[]}), T('DENY','hus','get','kcycle/kid1',{periods:[]}), T('DENY','kid2','get','kcycle/kid1',{periods:[]}),
  T('ALLOW','kid1','get','annivs/a',{who:'kid1'}), T('DENY','kid1','create','annivs/a',null,{who:'kid1'}), T('ALLOW','kid1','create','notices/n',null,{text:'x'}), T('ALLOW','kid2','get','photos/p',{data:''}),
  T('ALLOW','kid1','update','members/u_kid1',{who:'kid1'},{who:'kid1'},'u_kid1'), T('DENY','kid1','update','members/u_kid1',{who:'kid1'},{who:'me'},'u_kid1'),
  T('ALLOW','kid1','get','private/u_kid1/log/a',{},null,'u_kid1'), T('DENY','me','get','private/u_kid1/log/a',{},null,'u_me'), T('ALLOW','me','get','private/u_me/config/cycle',{},null,'u_me'),
  T('ALLOW',null,'create','inbox/i1',null,{key:KEY,app:'하나은행',text:'출금 1,000원'}), T('DENY',null,'create','inbox/i1',null,{key:'wrong',app:'a',text:'t'}), T('DENY',null,'get','events/e1',{people:['me']}),
  T('DENY','me','get','private/u_me/inbox/x',{},null,'u_hus'),
];
// 새 규칙을 먼저 만들어(아직 적용 전) 문법을 확인하고, 그 규칙으로 시험해요
const rs = await api(`projects/${P}/rulesets`, { method:'POST', body:JSON.stringify({ source:{ files:[{ name:'firestore.rules', content:src }] } }) });
console.log('새 규칙 만듦(적용 전):', rs.name.split('/').pop());
let res;
try { res = await api(`${rs.name}:test`, { method:'POST', body:JSON.stringify({ testSuite:{ testCases:cases } }) }); }
catch(e){ console.log('시험 권한 없음 →', String(e.message).slice(0, 120)); if (!process.argv.includes('--no-test')) process.exit(1); res = { testResults:[] }; }
if (res.issues && res.issues.length) { console.log('문법 문제:', JSON.stringify(res.issues).slice(0, 800)); process.exit(1); }
let bad = 0; if (res.testResults && res.testResults.length) (res.testResults || []).forEach((r, i) => { if (r.state !== 'SUCCESS') { bad++; const c = cases[i]; console.log('실패', i, c.expectation, c.request.auth && c.request.auth.token.email, c.request.method, c.request.path.replace(D, ''), JSON.stringify(r.debugMessages || r.errorPosition || '').slice(0, 200)); } });
if (res.testResults && res.testResults.length) console.log(`시험 ${cases.length}개 중 통과 ${cases.length - bad}개`);
if (bad) process.exit(1);
if (!apply) { console.log('시험만 했어요 (적용 안 함)'); process.exit(0); }
await api(`projects/${P}/releases/cloud.firestore`, { method:'PATCH', body:JSON.stringify({ release:{ name:`projects/${P}/releases/cloud.firestore`, rulesetName:rs.name } }) });
console.log('적용 완료:', rs.name.split('/').pop(), '(이전:', rel.rulesetName.split('/').pop() + ')');
// 옛 일정에 '누구 일정인지(people)' 채우기 — 아이들 화면이 이 값으로 보여 줘요
const { initializeApp } = await import('firebase-admin/app');
const { getFirestore } = await import('firebase-admin/firestore');
initializeApp({ credential:cert(sa) });
const fs = getFirestore(), PS = ['me','hus','kid1','kid2'], G = { couple:['me','hus'], kids:['kid1','kid2'], family:PS };
let n = 0;
for (const d of (await fs.collection('events').get()).docs) { const e = d.data(); if (Array.isArray(e.people) && e.people.length) continue; const ps = (G[e.cat] || [e.cat]).filter(p => PS.includes(p)); await d.ref.update({ people:ps.length ? ps : ['me'] }); n++; }
console.log('옛 일정 정리:', n, '건');
