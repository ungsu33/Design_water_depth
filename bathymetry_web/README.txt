Depth Atlas / 해양 수심 조회 웹앱

실행: launch.bat를 더블클릭합니다. 기본 주소: http://127.0.0.1:8765
수동 실행: python server.py --open
포트 변경: python server.py --port 8766 --open
Python 3.11 이상. 외부 Python 패키지 설치 불필요.

기능:
- 위도·경도 입력 또는 지도 클릭, 강릉/울진/울산 예제
- 국립해양조사원 API의 ±0.005도 영역 조회 및 최근접 자료점 선택
- 한반도 주변해역 지도, 입력점·수심자료점 표시, 전체 해역 복귀
- 최근접 수심, 자료점 좌표, 거리, 주변 수심 범위, 자료 건수
- CSV/JSON 다운로드 및 Design_Basis/results/web_queries 자동 저장
- 동일 좌표 5분 캐시 (원 조회시각 표시)

인증키: 상위 Design_Basis/readme.txt의 '일반 인증키' 항목을 서버가 읽습니다.
또는 KHOA_SERVICE_KEY 환경변수를 사용합니다. URL 인코딩 키도 지원합니다.
키를 브라우저에 보내거나 소스코드에 포함하지 않습니다.
127.0.0.1에만 바인딩하는 로컬 웹앱입니다. 서버 종료: 실행 창에서 Ctrl+C.
자료조회는 인터넷 연결과 API 이용권한이 필요합니다.

자료 해석:
- 수심 단위 m. 입력점의 직접 측량값이 아닌 최근접 자료점 수심입니다. 보간하지 않습니다.
- API 배포 간격 150m는 정확도 또는 원시 측량점 간격을 의미하지 않습니다.
- 수심 기준면, 수평좌표계, 수심 부호 정의, 지점별 측량연도/불확실성은 미확인입니다.
- 거리는 API 좌표를 지리 위경도로 간주한 구면거리입니다.
- 육해상 판정 기능은 없습니다. 육지 인근 입력에서도 인접 해상값이 선택될 수 있습니다.
- 주변 최소~최대 수심은 영역 내 값의 범위이며 신뢰구간이 아닙니다.
- 현장 정확도/설계 채택 적합성을 자동 검증하지 않습니다.

출처:
국립해양조사원 자연과학용 수심정보 (공공누리 제1유형: 출처표시)
https://www.data.go.kr/data/15142498/openapi.do
지도: OpenStreetMap contributors / https://www.openstreetmap.org/copyright
지도 라이브러리: Leaflet 1.9.4 (BSD-2-Clause), static/vendor/leaflet.LICENSE
https://leafletjs.com/
지도 타일: https://tile.openstreetmap.org/{z}/{x}/{y}.png
https://operations.osmfoundation.org/policies/tiles/
지도는 일반 배경지도이며 수심도/항해용 해도가 아닙니다.

화면 지도 이동에 따라 OpenStreetMap에 화면 범위의 타일 요청이 전달됩니다.
API 조회 좌표는 국립해양조사원에 전송되며 결과는 사용자 PC에 저장됩니다.

구현 구분: 프런트엔드 HTML/CSS/JavaScript, 백엔드 Python 표준 라이브러리.
Sites 호스팅의 Cloudflare Workers에서는 이 Python 서버를 직접 실행할 수 없으므로 로컬로 제공합니다.
