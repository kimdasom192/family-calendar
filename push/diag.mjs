// 한 번만 쓰는 점검: 최근 자동 기록 원문을 다솜님만 보는 곳(private/<uid>/config/diag)에 모아요. 로그에는 숫자만.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential:cert(JSON.parse(process.env.FIREBASE_SA)) });
const fs = getFirestore();
const members = (await fs.collection('members').get()).docs.map(d => ({ uid:d.id, ...d.data() }));
const me = members.find(m => m.who === 'me');
const lim = new Date(Date.now() - 12 * 864e5).toISOString().slice(0, 10);
async function dump(path){
  const docs = (await fs.collection(path).get()).docs.map(d => ({ id:d.id, ...d.data() })).filter(x => x.src === 'auto' && (x.date || '') >= lim);
  return docs.sort((a, b) => (b.at || 0) - (a.at || 0)).map(x => `${x.date} ${x.time} | ${x.card} | ${x.type} ${x.amount} | ${x.merchant} | ${String(x.raw || '').replace(/\n/g, ' / ').slice(0, 160)}`);
}
const out = { at:Date.now(), fam:await dump('ledger') };
if (me) out.mine = await dump(`private/${me.uid}/ledger`);
if (me) await fs.doc(`private/${me.uid}/config/diag`).set(out);
console.log('fam', out.fam.length, 'mine', (out.mine || []).length);
