// GitHub Actions에서 실행: node push/send.mjs
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import webpush from 'web-push';
import { run } from './core.mjs';
import { applyCodes } from './codes.mjs';

const VAPID_PUBLIC = 'BDL11cuUbIlZJJeRCVAWP7rU2n_lhxoU2c87DN04eLcLW_GvMfoOvdYa2pegSTK61tHlq0eZSPAagC5ica7hn30';
if (!process.env.FIREBASE_SA || !process.env.VAPID_PRIVATE) { console.log('비밀값(FIREBASE_SA, VAPID_PRIVATE)이 아직 없어요. GitHub 설정에서 넣어 주세요.'); process.exit(0); }
const sa = JSON.parse(process.env.FIREBASE_SA);
initializeApp({ credential:cert(sa) });
const fs = getFirestore();
webpush.setVapidDetails('mailto:family-calendar@users.noreply.github.com', VAPID_PUBLIC, process.env.VAPID_PRIVATE.trim());

const db = {
  async get(path){ const s = await fs.doc(path).get(); return s.exists ? s.data() : null; },
  async list(path){ const s = await fs.collection(path).get(); return s.docs.map(d => ({ id:d.id, ...d.data() })); },
  async query(path, field, after){ const s = await fs.collection(path).where(field, '>', after).get(); return s.docs.map(d => ({ id:d.id, ...d.data() })); },
  async set(path, data, merge){ await fs.doc(path).set(data, merge ? { merge:true } : {}); },
  async del(path){ await fs.doc(path).delete(); }
};
async function send(sub, payload){
  try { await webpush.sendNotification(sub, JSON.stringify(payload), { TTL:86400, urgency:'normal' }); return { ok:true }; }
  catch(e){ if (e.statusCode === 404 || e.statusCode === 410) return { gone:true }; console.log('보내기 실패', e.statusCode || e.message); return { ok:false }; }
}
// 가족 코드 다시 정하기 신청 처리
const APIKEY = 'AIzaSyD4CClgKtGJpVI9fGBysr_ohsnvKFI_K8k';
const auth = getAuth();
try {
  await applyCodes({ db,
    setPassword: async (em, code) => { const u = await auth.getUserByEmail(em); await auth.updateUser(u.uid, { password:code }); },
    codeWorks: async (em, code) => { const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${APIKEY}`, { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ email:em, password:code, returnSecureToken:false }) }); return r.ok; } });
} catch(e){ console.log('코드 신청 처리 실패', e.message); }
const n = await run(db, send, new Date());
console.log(`완료: ${n}개 보냄`);
