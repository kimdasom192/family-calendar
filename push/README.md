# 휴대폰 알림 보내기

GitHub Actions(`.github/workflows/push.yml`)가 5분마다 `push/send.mjs`를 실행해요.

- 가족 새 소식(일정·근무·기념일·공지 추가/수정/삭제), 가계부 예산 알림, 기념일(한 달 전·일주일 전·당일), 다솜주의보를 각자 휴대폰으로 보내요.
- 필요한 비밀값 (Settings → Secrets and variables → Actions):
  - `FIREBASE_SA`: Firebase 서비스 계정 키(JSON 파일 내용 전체)
  - `VAPID_PRIVATE`: 웹 푸시 비공개 키
- 휴대폰에서는 앱 ⚙ 설정 → "휴대폰 알림 켜기"를 눌러요.
