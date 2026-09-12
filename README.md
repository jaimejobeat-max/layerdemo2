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
