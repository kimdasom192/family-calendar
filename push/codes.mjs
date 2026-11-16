// 가족 코드 다시 정하기: 엄마(또는 아빠→엄마 코드만)가 앱에서 신청하면 여기서 바꿔요.
// 신청: private/<신청한 사람 uid>/config/codeReq = { who, code, at }  (본인만 읽고 쓰는 곳)
// 결과: private/<uid>/config/codeRes = { who, ok, msg, at }  — 코드 자체는 남기지 않아요.
const PERSONS = ['me', 'hus', 'kid1', 'kid2'];
const email = w => `${w}@family-cal.app`;
export const allowedTargets = who => who === 'me' ? PERSONS : who === 'hus' ? ['me'] : [];
export async function applyCodes({ db, setPassword, codeWorks, now = Date.now(), log = console.log }){
  const members = {}; for (const m of await db.list('members')) members[m.id] = m.who;
  let n = 0;
  for (const uid of Object.keys(members)) {
    const who = members[uid]; if (!allowedTargets(who).length) continue;
    const path = `private/${uid}/config/codeReq`;
    const req = await db.get(path); if (!req) continue;
    const res = { who:req.who || '', ok:false, msg:'', at:now };
    const code = String(req.code || '');
    if (!allowedTargets(who).includes(req.who)) res.msg = '바꿀 수 없는 사람이에요';
    else if (!/^\d{6,12}$/.test(code)) res.msg = '코드는 숫자 6~12자리예요';
    else {
      let taken = false;
      for (const o of PERSONS) if (o !== req.who && await codeWorks(email(o), code)) { taken = true; break; }
      if (taken) res.msg = '다른 가족 코드와 같아요. 다른 숫자로 정해 주세요';
      else { try { await setPassword(email(req.who), code); res.ok = true; res.msg = '바꿨어요'; n++; } catch(e){ res.msg = '바꾸지 못했어요 (' + (e.code || e.message) + ')'; } }
    }
    await db.del(path);
    await db.set(`private/${uid}/config/codeRes`, res);
    log(`코드 신청 처리: ${who} → ${req.who} ${res.ok ? '완료' : '실패: ' + res.msg}`);
  }
  return n;
}
