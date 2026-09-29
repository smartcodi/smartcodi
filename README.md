# smartcodi — 소공인 스마트제조 코디네이터 단계관리 보드

코디네이터의 8단계 업무를 **과제(업체 × 연도·차수) 단위**로 추적하는 웹앱입니다. 단일 HTML 파일(`smartcodi-board.html`)이며 claude.ai Artifact로 게시해 씁니다.

> 보드는 claude.ai 런타임(`window.claude` — 공유 저장소·Gmail·Google Calendar 커넥터·Claude 호출)에서만 동작합니다. 이 저장소는 소스 보관·이력 관리용이며 GitHub Pages로 서비스하지 않습니다.

## 주요 기능

- 보드(8단계 칸반) · 오늘 · 과제 · 기관 · 담당자 · 장비 · 자산 · 일정(구글 캘린더) · 활동 · 보고서 · 관리(소유자) 탭
- 단계별 메일(Gmail 발송)·카톡 문구, 캘린더 등록, 양식 Word 초안, 현장진단표 입력
- 사업계획서 체크포인트(사업기간·S/W 임차·현물 인건비), 연도별 사업 규칙, 사업비 현황
- 사업계획서 PDF 등록 + 체크리스트 기반 점검(보드 수치 + Claude 판정, 사람 확정)

## 폴더

| 경로 | 내용 |
|---|---|
| `smartcodi-board.html` | 보드 (단일 파일) |
| `tools/form-values.mjs` | 보드 과제 → 한글 양식(kordoc fill) 값 JSON |
| `tests/e2e/` | E2E 하네스: 보드 HTML + `window.claude` 목 + Playwright |
| `doc/단계_역할_정본.md` | 8단계 × 4역할 정본 (앱 `STEPS`의 근거) |
| `doc/테스트/` | E2E 시나리오(엑셀 정본)·실행 결과·질문 기록 |
| `doc/설계/` | 기능 설계 문서 — 화면·구글 캘린더·양식·지도·메일·데이터 모델 |
| `CLAUDE.md` | 개발 규칙·데이터 모델·절차 (Claude Code 작업 지침) |

사업 공고·교재 원본, 한글 양식 원본, 보드 데이터 내보내기는 저장소에 올리지 않습니다(`.gitignore`).

## 테스트

```bash
cd tests/e2e
npm install            # playwright
node run.mjs           # 전체 CASE 1~6 (약 3분) → doc/테스트/E2E_시나리오_CASE1-6.xlsx 에 회차 기록
node run.mjs 2 3       # 일부 CASE
```

Chrome이 설치돼 있어야 합니다(`channel:'chrome'`). 목은 실제 플랫폼 호출을 흉내 낸 것이며 가정은 `doc/테스트/실행결과_*.md`에 적혀 있습니다. 테스트 데이터는 모두 `[테스트]`가 붙은 가상 값입니다.
