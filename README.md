# 가족달력

가족이 함께 쓰는 일정 달력 웹앱이에요. 휴대폰 홈 화면에 추가하면 앱처럼 쓸 수 있어요.

- 월·주·일 보기, 사람별 필터, 한 줄 빠른 입력
- 버스 근무 코스(평일·토요일·공휴일 근무표) 자동 시간 표시
- 기념일(음력 포함) 매년 반복, 한 달 전 알림
- 가족 공지, 새 소식 표시
- 사람별 코드 로그인 (Firebase Authentication), 일정 저장 (Cloud Firestore)

## 파일
- `index.html` 달력 앱
- `firebase-config.js` Firebase 웹앱 설정
- `firestore.rules` Firestore 보안 규칙 (Firebase 콘솔에 붙여넣기)
- `manifest.webmanifest`, `sw.js`, `icons/` 홈 화면 설치용
