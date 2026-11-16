// 한 번만 실행: 다솜님 '내 가계부' 데이터 삭제 (주기·알림 설정은 남김)
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential:cert(JSON.parse(process.env.FIREBASE_SA)) });
const fs = getFirestore();
const ms = await fs.collection('members').get();
const me = ms.docs.find(d => d.data().who === 'me');
if (!me) { console.log('엄마 계정을 못 찾았어요'); process.exit(1); }
const base = `private/${me.id}`;
const res = {};
async function wipeCol(name, keep = () => false){
  const s = await fs.collection(`${base}/${name}`).get(); let n = 0, k = 0;
  for (const d of s.docs) { if (keep(d.data(), d.id)) { k++; continue; } await d.ref.delete(); n++; }
  res[name] = `지움 ${n}` + (k ? ` / 남김 ${k}` : '');
}
await wipeCol('ledger');
await wipeCol('inbox');
await wipeCol('budgetAlerts');
await wipeCol('log', (x, id) => x.type === 'cycle' || id.startsWith('cyc'));
for (const c of ['budget','fixed','balances','catmap','lastInbox','diag']) { const r = fs.doc(`${base}/config/${c}`); const s = await r.get(); if (s.exists) { await r.delete(); res['config/'+c] = '지움'; } }
const left = (await fs.collection(`${base}/config`).get()).docs.map(d => d.id);
console.log(JSON.stringify(res, null, 1)); console.log('남은 설정:', left.join(', '));
