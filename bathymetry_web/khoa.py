"""Coordinate-based KHOA bathymetry client. No credentials in returned objects."""
import json
import math
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlencode
from urllib.request import Request, urlopen

ENDPOINT = 'https://apis.data.go.kr/1192136/waterDepth/GetWaterDepthApiService'
BASE = Path(__file__).resolve().parents[1]


class DepthError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def credential():
    key = os.environ.get('KHOA_SERVICE_KEY', '').strip()
    if not key:
        try:
            for line in (BASE / 'readme.txt').read_text(encoding='utf-8-sig').splitlines():
                if '인증키' in line and ':' in line:
                    key = line.split(':', 1)[1].strip()
                    break
        except OSError:
            pass
    if not key:
        raise DepthError('서버에 국립해양조사원 인증키가 설정되지 않았습니다.', 503)
    return unquote(key)


def coordinates(lat, lon):
    if isinstance(lat, bool) or isinstance(lon, bool) or lat is None or lon is None:
        raise DepthError('위도와 경도를 숫자로 입력해 주세요.', 400)
    try:
        lat, lon = float(lat), float(lon)
    except (TypeError, ValueError):
        raise DepthError('위도와 경도를 숫자로 입력해 주세요.', 400) from None
    if not math.isfinite(lat) or not math.isfinite(lon) or not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise DepthError('위도는 -90~90, 경도는 -180~180 범위여야 합니다.', 400)
    return lat, lon


def distance_m(lat1, lon1, lat2, lon2):
    a1, a2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((a2-a1)/2)**2 + math.cos(a1)*math.cos(a2)*math.sin(math.radians(lon2-lon1)/2)**2
    return 12742017.6 * math.asin(math.sqrt(min(1, max(0, a))))


def query_bounds(lat, lon):
    """Outward four-decimal bounds: live API rejects six-decimal requests."""
    lower = lambda v: math.floor(v * 10000 + 1e-7) / 10000
    upper = lambda v: math.ceil(v * 10000 - 1e-7) / 10000
    return dict(ymin=lower(max(-90, lat-.005)), ymax=upper(min(90, lat+.005)),
                xmin=lower(max(-180, lon-.005)), xmax=upper(min(180, lon+.005)))


def extract(lat, lon):
    lat, lon = coordinates(lat, lon)
    # Preserve the input coordinate; only quantize the small API search window.
    bounds = query_bounds(lat, lon)
    key, points, total = credential(), {}, None
    start = time.monotonic()
    for page in range(1, 5):
        query = urlencode(dict(serviceKey=key, type='json', **bounds, pageNo=page, numOfRows=300))
        req = Request(ENDPOINT+'?'+query, headers={'User-Agent': 'DesignBasis-DepthAtlas/1.0', 'Accept': 'application/json'})
        try:
            with urlopen(req, timeout=15) as response:
                raw = response.read(4_000_001)
            if len(raw) > 4_000_000:
                raise DepthError('API 응답이 허용 크기를 초과했습니다.')
            payload = json.loads(raw.decode('utf-8-sig'))
        except (HTTPError, URLError, TimeoutError, OSError):
            raise DepthError('수심 API에 연결하지 못했습니다. 잠시 후 다시 조회해 주세요.', 502) from None
        except (ValueError, UnicodeError):
            raise DepthError('API가 JSON 대신 오류 응답을 반환했습니다. 인증 상태와 API 운영 상태를 확인해 주세요.') from None
        if not isinstance(payload, dict):
            raise DepthError('API 응답 구조가 예상과 다릅니다.')
        envelope = payload.get('response', payload)
        header = envelope.get('header') or {}
        code = str(header.get('resultCode', ''))
        if code not in ('0', '00'):
            errors = {'3': '주변 영역에 수심자료가 없습니다.', '03': '주변 영역에 수심자료가 없습니다.',
                      '20': 'API 접근 권한을 확인해 주세요.', '30': 'API 인증키 등록 상태를 확인해 주세요.',
                      '31': 'API 인증키 이용기간이 만료되었습니다.', '22': 'API 호출 한도를 초과했습니다.',
                      '10': 'API가 조회 좌표 형식을 거부했습니다. 입력값을 확인해 주세요.'}
            raise DepthError(errors.get(code, 'API가 오류 응답을 반환했습니다. 제공기관의 상태를 확인해 주세요.'), 404 if code in ('3', '03') else 502)
        body = envelope.get('body') or {}
        try:
            total = int(body['totalCount'])
            page_size = int(body.get('numOfRows', 300))
            if total < 0 or page_size <= 0:
                raise ValueError()
        except (KeyError, ValueError, TypeError):
            raise DepthError('API 응답의 자료 건수를 읽을 수 없습니다.') from None
        items = body.get('items') or {}
        items = items.get('item', []) if isinstance(items, dict) else items
        if isinstance(items, dict):
            items = [items]
        if not isinstance(items, list):
            raise DepthError('API 응답의 자료 목록을 읽을 수 없습니다.')
        for item in items:
            try:
                a, b, depth = (float(item[k]) for k in ('lat', 'lot', 'dpwt'))
            except (KeyError, ValueError, TypeError):
                raise DepthError('API에 수심 또는 좌표가 없는 자료가 있습니다. 결과 채택을 보류합니다.') from None
            if not all(math.isfinite(v) for v in (a, b, depth)) or not bounds['ymin']-1e-9 <= a <= bounds['ymax']+1e-9 or not bounds['xmin']-1e-9 <= b <= bounds['xmax']+1e-9:
                raise DepthError('API 자료의 좌표·수심 유효성 검사를 통과하지 못했습니다.')
            points[a, b] = dict(latitude=a, longitude=b, depth_m=depth, distance_m=round(distance_m(lat, lon, a, b), 2))
        if page * page_size >= total:
            break
    else:
        raise DepthError('조회영역의 자료가 너무 많아 전체 수집을 완료하지 못했습니다.')
    if not points:
        raise DepthError('주변 영역에 유효한 수심자료가 없습니다. 다른 해상 좌표를 선택해 주세요.', 404)
    if len(points) != total:
        raise DepthError('전체 자료 건수가 일치하지 않아 결과 채택을 보류합니다.')
    ordered = sorted(points.values(), key=lambda p: p['distance_m'])
    return dict(input=dict(latitude=lat, longitude=lon), nearest=ordered[0],
                points=ordered, count=len(ordered), bounds=bounds,
                minimum_depth_m=min(p['depth_m'] for p in ordered),
                maximum_depth_m=max(p['depth_m'] for p in ordered),
                queried_at=datetime.now(timezone.utc).isoformat(), elapsed_seconds=round(time.monotonic()-start, 2),
                source='국립해양조사원 자연과학용 수심정보', source_url='https://www.data.go.kr/data/15142498/openapi.do',
                selection_method='nearest_point_no_interpolation', distribution_spacing_m=150,
                vertical_datum='미확인', horizontal_crs='미확인', survey_date='미확인',
                distance_assumption='API 위경도를 지리좌표로 간주한 구면거리',
                note='최근접 자료점의 수심이며 입력점의 직접 측량값이 아닙니다. 육해상 판정과 수심 정확도 검증은 수행하지 않았습니다.')
