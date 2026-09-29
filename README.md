# Layer Studios — Homepage

정적 HTML/CSS/JS 사이트. 빌드 스크립트 하나로 모든 페이지를 생성하고, 생성된 결과를 그대로 배포합니다.

## 구조

- `src/partials/` — 공통 부품 (head, header, menu, search, footer). 링크·메뉴를 바꾸려면 여기만 고칩니다.
- `src/pages/` — 홈, 아카이브, 저널, About, Guide, Q&A, 404의 본문
- `data/studios.json` — 스튜디오 12개 (소개문 한/영, 위치, 링크, 파트별 이미지, 비교표)
- `data/images.json` — 원격 이미지 → 로컬 WebP 매핑
- `js/archive-data.js`, `js/journal-data.js` — 아카이브 116건, 저널 27건
- `tools/build.py` — 위 소스로 루트 페이지 7개, `studios/*.html` 12개, `js/search-index.js`, `sitemap.xml` 생성
- 생성물: `index.html`, `archives.html`, `journal.html`, `about.html`, `guide.html`, `qna.html`, `404.html`, `studios/`

## 작업 흐름

```bash
python3 tools/build.py          # 소스나 데이터를 고친 뒤 실행 → 모든 페이지 재생성
python3 -m http.server 8765     # 로컬 확인
```

`main`에 push하면 Vercel이 자동 배포합니다. 생성된 HTML도 함께 커밋합니다.

## 이미지 파이프라인

원격 이미지를 로컬 WebP(1920px / 960px)로 변환해 `assets/img/`에 둡니다.

```bash
python3 tools/images.py <urls.json> <cache-dir>   # 다운로드 + 변환, data/images.json 갱신
python3 tools/apply_images.py                     # src/pages/index.html, 아카이브/저널 데이터에 적용
python3 tools/build.py
```

## 분석 도구

`tools/build.py` 상단의 `ANALYTICS` 에 GA4 측정 ID(`G-…`)나 네이버 애널리틱스 ID를 넣고 빌드하면 모든 페이지에 스크립트가 들어갑니다. 비워 두면 아무것도 삽입되지 않습니다.

## 언어

헤더의 KO / EN 토글. 긴 본문은 `class="ko"` / `class="en"` 두 벌, 짧은 라벨은 `js/i18n.js` 사전과 `data-i18n` 속성으로 관리합니다.

## 예약 API (`api/reserve.js`) + 승인 콘솔 (`/admin`)

홈페이지 예약 폼(`/reservation`)의 신청은 Supabase의 `reservation_requests` 표에 **대기** 상태로 저장되고 슬랙으로 알림이 갑니다. CS가 `/admin` 승인 콘솔에서 그날 게시판 현황과 함께 보고 승인하면, 그때 레이소다(제로보드) 스케줄 게시판에 가부킹(`++`) 글이 자동으로 작성됩니다. 반려·보류·메모는 `reservation_events`에 기록됩니다. Vercel 서버리스 함수로 동작하며 별도 서버가 없습니다.

- 표 생성 SQL: `supabase/schema.sql` (Supabase → SQL Editor에서 한 번 실행)
- `RESERVE_MODE=direct` 로 두면 예전처럼 신청 즉시 게시판에 쓰는 방식으로 돌아갑니다.
- `/api/keepalive` 가 매일 한 번 크론으로 돌아 무료 플랜의 무활동 정지를 막습니다.
- **수정 (`/admin` → 수정 펼치기)**: 파트·날짜·시간·인원·연락처 등을 고치면 Supabase 행이 바뀌고 `reservation_events`에 "수정"으로 남습니다. 승인된 건은 게시판 글도 함께 고칩니다(`POST /api/admin?action=edit`). 승인 때 본문에 `접수번호 #id`를 적어 두고 그 글 번호를 `board_post_no`에 저장하며, 콘솔이 쓴 라벨·본문은 `board_snapshot` 이벤트로 남깁니다. 고칠 때는 게시판 글을 먼저 읽어 **줄 단위로 병합**합니다(`api/_merge.js`): 콘솔이 만든 `* 항목 :` 줄만 바꾸고 스태프가 적은 줄은 그대로 두며, 스태프가 콘솔 줄을 직접 고쳤으면 409로 돌려보내 어느 쪽을 남길지 묻습니다. 날짜가 바뀌면 새 날짜에 글을 쓰고 옛 글을 지웁니다. 글을 못 찾는 예전 건은 콘솔 기록만 바꿉니다.
- `GET /api/availability?studio=layer-41&y=2026&m=10` — 달력용 월별 현황. 지점 스케줄 게시판의 라벨(`A 10-19 …`, `$$$ 10/05~08 …`, `++(W1)`)과 Supabase 대기 건을 파트·시간 블록으로 합쳐 돌려줍니다(이름은 서버에서 제거). 인스턴스·CDN에서 60초 캐시. `/reserve-mock` 달력이 이걸 씁니다.

Vercel 프로젝트 → Settings → Environment Variables 에 아래를 넣어야 동작합니다.

| 변수 | 내용 |
|---|---|
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SECRET_KEY` | Supabase secret key (`sb_secret_…`, 서버 전용) |
| `ADMIN_PASSWORD` | 승인 콘솔 비밀번호 |
| `SITE_URL` | (선택) 슬랙 알림의 승인 콘솔 링크 도메인, 기본값 `https://layerdemo2.vercel.app` |
| `RESERVE_MODE` | (선택) `direct`면 승인 없이 바로 게시판에 기록 |
| `RAYSODA_ID` | 레이소다 게시판 로그인 아이디 |
| `RAYSODA_PW` | 레이소다 게시판 비밀번호 |
| `SLACK_WEBHOOK_URL` | (선택) 예약 알림 채널의 Incoming Webhook URL |
| `RESERVE_AUTHOR` | (선택) 게시글 작성자명, 기본값 `홈페이지` |
| `RESERVE_POST_PW` | (선택) 게시글 비밀번호, 기본값 `layer` |
| `RESERVE_DRY_RUN` | `1`이면 게시판에 쓰지 않고 슬랙만 (테스트용) |

게시글 형식: 제목 = 날짜(`2026/10/20`), 캘린더 라벨(`sitelink1`) = `++(W1)` (같은 날 기존 `++` 글 수 + 1), 본문 = 기존 예약 양식(대관 날짜 / 지점 / 파트 / 시간 / 내용 / 인원 / 차량 / 연락처).
Layer 10과 Faust는 스케줄 게시판이 없어 슬랙 알림만 갑니다.
