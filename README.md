# Layer Studios — Homepage

정적 HTML/CSS/JS 프로토타입. 빌드 과정 없이 그대로 배포됩니다.

- `index.html` — 홈 (풀스크린 스냅 슬라이드 + 사이드 메뉴 + Our Studios)
- `archives.html` — 아카이브 (유형/스튜디오 필터, 상세 오버레이)
- `journal.html` — 저널 + Layer Events (연도 필터, 상세 오버레이)
- `studios/*.html` — 스튜디오 상세 12개 (`tools/build_studios.py`로 생성)
- `about.html`, `guide.html`, `qna.html` — 회사 소개, 이용 안내, FAQ
- `studios/*.html` — 스튜디오 상세 12개. `data/studios.json`에서 `python3 tools/build_studios.py`로 생성
- `js/*-data.js`, `data/studios.json` — 임시 콘텐츠 데이터 (plusjun.com에서 가져옴)

로컬 실행:

```bash
python3 -m http.server 8765
```

## 이미지 파이프라인

원격 이미지를 로컬 WebP(1920px / 960px)로 변환해 `assets/img/`에 둡니다.

```bash
python3 tools/images.py <urls.json> <cache-dir>   # 다운로드 + 변환, data/images.json 갱신
python3 tools/apply_images.py                     # index.html, 아카이브/저널 데이터에 적용
python3 tools/build_studios.py                    # 스튜디오 페이지 재생성
```

아카이브/저널 상세 보기 이미지까지 모두 로컬 WebP를 사용합니다.
