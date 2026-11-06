// 가족달력 휴대폰 알림: 새 소식(log)·기념일·주기 알림을 모아 각자 휴대폰으로 보내요.
// GitHub Actions가 5분마다 실행해요. 시간대는 TZ=Asia/Seoul 기준이에요.
import { readFileSync } from 'node:fs';

const LUNAR = JSON.parse(readFileSync(new URL('./lunar.json', import.meta.url), 'utf8'));
const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dd0 = (a, b) => Math.round((fromYmd(b) - fromYmd(a)) / 864e5);
const WD = '일월화수목금토';
const dLabel = s => { if (!s) return ''; const d = fromYmd(s); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };

const PERSONS = ['me', 'hus', 'kid1', 'kid2'];
const DEF = { me:'엄마', hus:'아빠', kid1:'첫째', kid2:'둘째', couple:'부부', family:'가족', kids:'아이들', work:'근무' };
const ELDER = { mil:'시어머니', fil:'시아버지', mom:'엄마', dad:'아빠' };
const KIND = { event:'일정', work:'근무', anniv:'기념일', notice:'공지' };
const ACT = { new:'새', edit:'바뀐', del:'지운' };

function makeNames(cfg){ const n = (cfg && cfg.names) || {}; return k => n[k] || DEF[k] || ''; }

/* ---- 기념일 ---- */
function lunarToSolar(ly, m, d){ const row = (LUNAR[ly] || []).find(x => x[0] === m && x[1] === 0); if (!row) return null; return addDays(fromYmd(row[2]), Math.min(d, row[3]) - 1); }
function annivOcc(a, Y){
  const out = [];
  if (a.lunar) { [Y - 1, Y].forEach(ly => { const d = lunarToSolar(ly, +a.month, +a.day); if (d && d.getFullYear() === Y) out.push(ymd(d)); }); }
  else { let d = new Date(Y, a.month - 1, a.day); if (d.getMonth() !== a.month - 1) d = new Date(Y, a.month - 1, 28); out.push(ymd(d)); }
  return out;
}
function annivTitle(a, L){
  const w = a.who === 'other' ? (a.whoText || '') : (ELDER[a.who] || L(a.who)), elder = !['me','hus','kid1','kid2','couple','family'].includes(a.who);
  if (a.kind === 'birthday') return `${w} ${elder ? '생신' : '생일'}`.trim();
  if (a.kind === 'memorial') return `${w} 기일`.trim();
  if (a.kind === 'wedding') return (a.who === 'couple' || !w) ? '결혼기념일' : `${w} 결혼기념일`;
  return a.title || (w ? `${w} 기념일` : '기념일');
}
function annivIcon(a){ if (a.emoji) return a.emoji + ' '; return a.kind === 'birthday' && PERSONS.includes(a.who) ? '🎂 ' : '📌 '; }

/* ---- 주기 (앱과 같은 계산) ---- */
export function cycPred(periods, today){
  const ps = (periods || []).filter(p => p.start).slice().sort((a, b) => a.start.localeCompare(b.start));
  if (!ps.length) return null;
  const iv = []; for (let i = 1; i < ps.length; i++) { const g = dd0(ps[i - 1].start, ps[i].start); if (g >= 15 && g <= 60) iv.push(g); }
  const recent = iv.slice(-6);
  const avgCycle = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : 28;
  const last = ps[ps.length - 1], td = ymd(today);
  const ongoing = !last.end && dd0(last.start, td) >= 0 && dd0(last.start, td) < 10;
  const next = ymd(addDays(fromYmd(last.start), avgCycle));
  const overdue = dd0(next, td) > 0 ? dd0(next, td) : 0;
  return { next, ongoing, overdue };
}

/* ---- 새 소식 → 알림 문구 ---- */
function logMsg(x, L, members, priv){
  if (x.type === 'cycle') {
    if (priv) return { title:'🔒 개인 알림', body:'앱에서 확인해 주세요', tag:'cyc' };
    const start = String(x.id || '').startsWith('cyc_start');
    return { title:start ? '🌧 배려 모드' : '⚠️ 다솜주의보', body:(x.changes || [])[0] || '', tag:'cyc-share' };
  }
  if (x.act === 'alert' || x.type === 'budget') {
    if (!x.lv) return null; // 연결 확인용 시험 알림
    return { title:priv ? '🔒 내 가계부' : '💳 가계부', body:(x.changes || [])[0] || x.title || '', tag:'budget' };
  }
  const who = L(members[x.by] || '') || '가족';
  const kind = KIND[x.type] || '소식';
  const ch = (x.changes || []).slice(0, 2).join(' · ');
  return { title:`${who} · ${ACT[x.act] || ''} ${kind}`.replace(/\s+/g, ' ').trim(), body:[x.date ? dLabel(x.date) : '', x.title || ''].filter(Boolean).join(' ') + (ch ? `\n${ch}` : ''), tag:'log' };
}

/* db: { get(path) -> data|null, list(path) -> [{id,...}], query(path, field, after) -> [{id,...}], set(path, data, merge) }
   send(sub, payload) -> { ok, gone } */
export async function run(db, send, now = new Date(), log = console.log){
  const hour = now.getHours(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), td = ymd(today);
  const daytime = hour >= 9 && hour < 22;
  const members = {}; for (const m of await db.list('members')) members[m.id] = m.who;
  const L = makeNames(await db.get('config/main'));

  // 1) 주기 알림 만들기 (다솜님 앱을 열지 않아도 제때)
  const meUid = Object.keys(members).find(u => members[u] === 'me');
  if (meUid && daytime) {
    const c = await db.get(`private/${meUid}/config/cycle`);
    const st = { share:true, warn:true, alert:true, ...((c && c.settings) || {}) };
    const p = c && cycPred(c.periods, today);
    if (p && !p.ongoing) {
      const left = dd0(td, p.next);
      if (st.alert !== false && (left === 1 || left === 2 || left === 0)) {
        const key = left === 0 ? `cyc_${p.next}_d0` : `cyc_${p.next}_d2`;
        if (!(await db.get(`private/${meUid}/log/${key}`))) await db.set(`private/${meUid}/log/${key}`, { act:'alert', type:'cycle', lv:0, ref:'', date:td, changes:[left === 0 ? '🌙 오늘이 예정일이에요' : `🌙 예정일이 ${left}일 남았어요 (${+p.next.slice(5, 7)}/${+p.next.slice(8)})`], by:'system', at:now.getTime() });
      }
      if (st.warn !== false && !p.overdue && left >= 1 && left <= 7) {
        const wk = `log/cyc_warn_${p.next}`;
        if (!(await db.get(wk))) await db.set(wk, { act:'alert', type:'cycle', lv:90, ref:'', date:td, to:['hus'], changes:[`⚠️ 다솜주의보 예비 발령! ${+p.next.slice(5, 7)}/${+p.next.slice(8)}쯤부터 다솜 컨디션이 안 좋을 수 있어요. 간식 비축 권장 🍫`], by:'system', at:now.getTime() });
      }
    }
  }

  const annivs = await db.list('annivs');
  // 다솜 컨디션 표시 (실제 기간 · 예정일 지나 미뤄지는 중) — 날마다 아침 한 번
  const share = await db.get('share/cycle');
  const condToday = share && ((share.cond || []).some(c => td >= c.from && td <= c.to) || (share.roll && td >= share.roll.from && td <= share.roll.until));
  const startedToday = condToday && !!(await db.get(`log/cyc_start_${td}`));
  let sentTotal = 0;
  for (const uid of Object.keys(members)) {
    const who = members[uid];
    const push = await db.get(`private/${uid}/config/push`);
    const subs = (push && push.subs) || [];
    if (!subs.length) continue;
    const stPath = `private/${uid}/config/pushState`;
    const st = (await db.get(stPath)) || {};
    const since = st.lastAt || now.getTime() - 10 * 60e3;
    const sent = { ...(st.sent || {}) };
    const msgs = [];
    let maxAt = since;

    // 휴대폰 시계가 조금 달라도 놓치지 않게 2분 겹쳐서 읽고, 이미 보낸 건 id로 건너뛰어요
    const from = since - 2 * 60e3;
    const fam = (await db.query('log', 'at', from)).filter(x => x.by && x.by !== uid && (!x.to || x.to.includes(who)));
    const mine = await db.query(`private/${uid}/log`, 'at', from);
    for (const [arr, priv] of [[fam, false], [mine, true]]) for (const x of arr) {
      const lk = `log:${priv ? 'p' : 'f'}:${x.id}`; if (sent[lk]) continue; sent[lk] = now.getTime();
      maxAt = Math.max(maxAt, x.at || 0);
      const m = logMsg(x, L, members, priv); if (m) msgs.push({ ...m, at:x.at || 0 });
    }
    // 기념일: 한 달 전·일주일 전·당일 (오전 9시 이후)
    if (daytime) for (const a of annivs) {
      if (!a.month || !a.day) continue;
      for (const Y of [today.getFullYear(), today.getFullYear() + 1]) for (const ds of annivOcc(a, Y)) {
        const d = dd0(td, ds); if (![30, 7, 0].includes(d)) continue;
        const key = `anniv:${a.id}:${ds}:${d}`; if (sent[key]) continue;
        sent[key] = now.getTime();
        msgs.push({ title:`${annivIcon(a)}${annivTitle(a, L)}`, body:d === 0 ? `오늘이에요 · ${dLabel(ds)}` : `D-${d} · ${dLabel(ds)}${d === 30 ? ' (한 달 남았어요)' : ''}`, tag:'anniv', at:now.getTime() });
      }
    }
    if (condToday && daytime && !startedToday && (share.to || []).includes(who)) {
      const key = `cond:${td}`;
      if (!sent[key]) { sent[key] = now.getTime(); msgs.push({ title:'🌧 다솜 컨디션', body:'다솜 컨디션 저하 중 · 따뜻한 말 한마디 + 디저트 효과 좋음 🍰', tag:'cond', at:now.getTime() }); }
    }
    // 연결 시험
    let testAt = st.testAt || 0;
    if (push.testAt && push.testAt > testAt) { testAt = push.testAt; msgs.push({ title:'🔔 휴대폰 알림이 연결됐어요', body:'이제 새 소식이 오면 이렇게 알려 드릴게요.', tag:'test', at:now.getTime() }); }

    if (msgs.length) {
      msgs.sort((a, b) => a.at - b.at);
      const out = msgs.length > 3 ? [{ title:`🔔 새 소식 ${msgs.length}건`, body:msgs.slice(-5).reverse().map(m => `${m.title} ${m.body.split('\n')[0]}`.trim()).join('\n'), tag:'many' }] : msgs;
      const keep = [];
      for (const sub of subs) {
        let alive = true;
        for (const m of out) { const r = await send(sub, { title:m.title, body:m.body, tag:m.tag, url:'./' }); if (r && r.gone) { alive = false; break; } if (r && r.ok) sentTotal++; }
        if (alive) keep.push(sub);
      }
      if (keep.length !== subs.length) await db.set(`private/${uid}/config/push`, { subs:keep }, true);
      log(`${who}: ${out.length}개 보냄 (${msgs.length}건)`);
    }
    // 오래된 기록 정리
    for (const k of Object.keys(sent)) if (now.getTime() - sent[k] > (k.startsWith('log:') ? 864e5 : 90 * 864e5)) delete sent[k];
    await db.set(stPath, { lastAt:Math.max(maxAt, since), sent, testAt, runAt:now.getTime() }, false);
  }
  return sentTotal;
}
