# SmartCodi Agent 운영 규칙

## 1. 목적

이 파일은 `C:\workspace\02-automation\smartcodi`에서 Claude Code가 기존 SmartCodi 기능을 보존하면서 Agent 기능을 통합하도록 하는 운영 규칙이다.

## 2. 작업 순서

모든 작업은 다음 순서를 따른다.

```text
요청 해석
→ 관련 문서 검색
→ 현재 코드/데이터 구조 확인
→ 기존 기능/테스트 확인
→ 변경 범위 제안
→ 구현
→ 검증
→ 문서/테스트 동기화
```

사용자가 "분석만"이라고 하면 코드를 수정하지 않는다.

## 3. 하위 Agent 역할

### structure-reviewer

검토:

- 문서 구조
- 데이터 모델
- 코드/문서 불일치
- Action 계약
- migration 영향
- 기능 중복

출력:

```text
문제
영향
근거
권장 수정
결정 필요 사항
```

### assistant-dev

담당:

- 자연어 intent
- project/step 식별
- Agent Action
- confirmation UI
- 기존 Assistant 연계
- connector 연계
- normalization

원칙:

- 기존 응답 계약을 우선 호환
- 직접 DB 수정 로직을 Agent에 넣지 않음
- 실행은 기존 앱의 승인/검증 경로를 호출

### board-tester

담당:

- E2E
- 회귀 테스트
- Assistant 테스트
- 저장 결과 확인
- 오류 경로

특히:

- 동일 업체 다중 과제
- 잘못된 업체명
- 날짜 누락
- 미래형/부정형
- 기존 값 충돌
- connector 실패
- 권한 오류
- 빈 문서
- 숫자 오독

## 4. 사용자 결정이 필요한 경우

다음은 임의 결정하지 않는다.

- 8단계/역할/task 문구 변경
- Action 계약 변경
- 저장 구조 변경
- confirmation 없이 자동 실행
- 사업 규칙 변경
- KPI 데이터 모델 결정
- HWPX 자동화 방식 변경
- 외부 connector 권한/응답 형식 불명확

질문 형식:

```text
[결정 필요]

문제:
...

현재 근거:
...

선택지:
A.
B.
C.

결정 영향:
...
```

## 5. Agent 실행 모델

### Understand

```text
자연어
→ intent
→ projectId
→ step
→ 필요한 데이터
```

### Propose

```text
기존 데이터
+ 첨부
+ 공식 근거
+ 사용자 발화
→ 변경안
```

### Execute

```text
사용자 승인
→ 기존 앱 함수/API
→ 실행 결과 확인
→ activity/output 기록
```

Understand/Propose와 Execute를 섞지 않는다.

## 6. 변경 금지

사용자 승인 없이 다음을 변경하지 않는다.

- 8단계 이름
- 역할 코드
- task 문구
- 산출물 문구
- task key 구조
- `currentStep`의 자유 진행 의미
- asset 상태 의미
- 방문 단계 1/2/7/8
- `programs/{year}` 구조

## 7. 파일 작업 규칙

- 관련 파일만 수정한다.
- 대규모 재작성보다 기존 코드에 최소 변경을 우선한다.
- 작업 후 `git diff` 또는 이에 준하는 변경 확인을 한다.
- 생성 파일/임시 파일/로그를 프로젝트에 무단으로 남기지 않는다.
- 비밀키, 토큰, 개인정보를 로그/프롬프트/fixture에 넣지 않는다.
