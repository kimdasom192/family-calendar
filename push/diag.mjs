// 한 번만 쓰는 점검: 결과는 다솜님만 볼 수 있는 곳(private/<uid>/config/diag)에 저장해요. 로그에는 숫자 요약만 남겨요.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential:cert(JSON.parse(process.env.FIREBASE_SA)) });
const fs = getFirestore();
const members = (await fs.collection('members').get()).docs.map(d => ({ uid:d.id, ...d.data() }));
const me = members.find(m => m.who === 'me');
const since = Date.now() - 10 * 864e5;
async function summ(path){
  const docs = (await fs.collection(path).get()).docs.map(d => ({ id:d.id, ...d.data() }));
  const recent = docs.filter(x => (x.date || '') >= new Date(since).toISOString().slice(0, 10));
  const by = {}; recent.forEach(x => { const k = `${x.date}|${x.src || 'manual'}`; by[k] = (by[k] || 0) + 1; });
  const auto = docs.filter(x => x.src === 'auto').sort((a, b) => (b.at || 0) - (a.at || 0));
  return { total:docs.length, review:docs.filter(x => x.review).length, byDay:by, lastAuto:auto.slice(0, 8).map(x => ({ date:x.date, time:x.time, card:x.card, type:x.type, amount:x.amount, merchant:x.merchant, review:!!x.review, at:x.at })) };
}
const out = { at:Date.now(), members:members.map(m => m.who), fam:await summ('ledger'), famInbox:(await fs.collection('inbox').get()).size };
if (me) { out.mine = await summ(`private/${me.uid}/ledger`); out.mineInbox = (await fs.collection(`private/${me.uid}/inbox`).get()).size; }
for (const m of members) { const p = await fs.doc(`private/${m.uid}/config/push`).get(); out['push_' + m.who] = p.exists ? (p.data().subs || []).length : 0; }
const users = (await fs.collection('data/users/list').get().catch(() => ({ docs:[] }))).docs.length;
if (me) await fs.doc(`private/${me.uid}/config/diag`).set(out);
console.log('fam', out.fam.total, 'review', out.fam.review, 'inbox', out.famInbox, '| mine', out.mine && out.mine.total, 'review', out.mine && out.mine.review, 'inbox', out.mineInbox, '| push', members.map(m => m.who + ':' + out['push_' + m.who]).join(' '));
