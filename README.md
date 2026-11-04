# Design_water_depth · Depth Atlas v1.1

좌표를 입력하거나 한반도 주변해역 지도에서 위치를 선택해 국립해양조사원의 최근접 수심자료를 조회합니다. Python 웹앱과 Google Sites 독립 HTML을 제공하는 수심 조회 전용 저장소입니다.

## 로컬 Python 웹앱

Python 3.11 이상이 필요하며 외부 Python 패키지는 설치하지 않아도 됩니다.

```powershell
# 본인의 수심정보 API 인증키를 현재 셸에 설정합니다. 실제 키를 커밋하지 마세요.
$env:KHOA_SERVICE_KEY = '<본인 일반 인증키>'
python bathymetry_web/server.py --open
```

브라우저 주소는 `http://127.0.0.1:8765`입니다. Windows에서는 `수심조회_실행.bat`로도 실행할 수 있습니다. 서버는 `KHOA_SERVICE_KEY` 또는 이 폴더의 로컬 `readme.txt`에 있는 `일반 인증키 : ...` 값을 읽습니다. 실제 키 파일은 Git에서 제외합니다.

## Google Sites 독립 실행형

`google_sites/GoogleSites_독립실행.html`을 Google Sites의 전체 페이지 삽입 코드로 사용합니다. 이 버전은 브라우저에서 국립해양조사원 API를 직접 호출하므로 Python 서버와 Apps Script가 필요하지 않습니다.

페이지를 연 뒤 일반 인증키를 입력하고 **키 적용 · 연결 확인**을 누릅니다. 키는 현재 탭에서만 사용하며 새로고침·새 접속 시 다시 입력합니다. 브라우저 저장소, 게시 HTML, CSV/JSON에 저장하지 않습니다. API 이용 승인과 인터넷 연결이 필요하고, 브라우저 또는 API 서버가 교차 출처 요청을 차단하면 조회할 수 없습니다.

수정 후 독립 HTML을 다시 생성하는 명령:

```powershell
python google_sites/build_direct.py
```

## 소수점 6자리 좌표 오류 수정

기존 요청에서 조회영역 경계를 소수점 6자리로 보내면 API 오류 10이 발생하는 사례를 재현했습니다. 같은 위치에 소수점 4자리 경계를 보내면 정상 응답했습니다. 이는 실제 검증 결과이며 API 문서의 공식 자릿수 제한을 단정하지 않습니다.

v1.1은 원래 입력 좌표를 보존하고 API 조회영역만 소수점 4자리로 바깥쪽 양자화합니다. 하한은 내림, 상한은 올림하므로 원래 ±0.005도 영역을 포함합니다. 실제 조회경계는 JSON에 기록하며 거리 계산·CSV/JSON의 입력 좌표에는 원래 정밀도를 사용합니다. 일시적인 네트워크 실패와 HTTP 429/5xx는 1회 재시도하고, 취소 및 오류 종류를 구분합니다.

실제 API 및 재게시본에서 확인한 예제:

| 위도 | 경도 | 최근접 수심 (m) |
|---|---|---|
| 37.812345 | 128.987654 | 111.74 |
| 37.995503 | 129.023438 | 1062.88 |
| 37.8 | 128.98 | 82.72 |
| 36.95 | 129.5 | 137.10 |
| 35.5 | 129.55 | 106.81 |

검증일: 2026-11-04. 해당 시점 API 응답에 대한 예제이며 해역 전체의 측량 정확도를 검증한 것은 아닙니다.

## 인증키 없는 자동 검사

Python 3.11 이상과 Node.js 22를 사용합니다. 아래 검사는 외부 API 호출과 인증키가 필요 없습니다.

```powershell
python -m unittest discover -s bathymetry_web -p test_khoa.py -v
node google_sites/test_direct.cjs
```

Python 9개와 JavaScript 21개 검사를 포함합니다. JavaScript 검사의 `fixtures/`는 국립해양조사원 API에서 받은 강릉·울진·울산 예제 응답이며 인증키나 요청 URL을 포함하지 않습니다. 실제 API 통합 검사는 인증키를 설정한 뒤 `node google_sites/test_live_direct.cjs`로 별도 실행합니다. 통합 검사는 API 호출 한도를 사용하고 결과 파일은 Git에서 제외됩니다.

## 자료 해석과 출처

표시값은 입력점의 직접 측량값이 아닌 최근접 배포자료이며 보간하지 않습니다. 배포 간격 150 m는 수심 정확도를 뜻하지 않습니다. 수심 기준면·수평좌표계·측량연도·현장 정확도는 별도 확인이 필요합니다. 육지·해안 부근에서도 인접 해상값이 선택될 수 있고, 배경지도는 항해용 해도가 아닙니다.

- 국립해양조사원 자연과학용 수심정보: https://www.data.go.kr/data/15142498/openapi.do (출처표시)
- OpenStreetMap contributors: https://www.openstreetmap.org/copyright
- Leaflet 1.9.4: https://leafletjs.com/ (BSD-2-Clause, 동봉된 `leaflet.LICENSE` 참고)

API 조회 좌표는 국립해양조사원에, 배경지도 화면 범위는 OpenStreetMap 타일 서버에 전달됩니다. 사용자의 인증정보·Google 프로젝트 설정·개인 배포 상태·원본 활용가이드 문서는 이 코드 묶음에 포함하지 않습니다.
