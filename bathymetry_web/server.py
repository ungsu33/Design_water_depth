"""Dependency-free local web server. Bind only to loopback; API key stays server-side."""
import argparse
import csv
import json
import mimetypes
import os
import socket
import threading
import time
import uuid
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen

from khoa import BASE, DepthError, coordinates, credential, extract

STATIC = Path(__file__).resolve().parent / 'static'
CACHE = {}
LOCK = threading.Lock()
UPSTREAM = threading.BoundedSemaphore(2)


class LocalServer(ThreadingHTTPServer):
    # Windows SO_REUSEADDR can let two servers bind the same port.
    allow_reuse_address = os.name != 'nt'

    def server_bind(self):
        if os.name == 'nt':
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def save_result(result):
    folder = BASE / 'results' / 'web_queries'
    folder.mkdir(parents=True, exist_ok=True)
    name = datetime.now().strftime('%Y%m%d_%H%M%S_') + uuid.uuid4().hex[:8]
    path = folder / (name + '.json')
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    with (folder / (name+'.csv')).open('w', encoding='utf-8-sig', newline='') as f:
        rows = [dict(input_latitude=result['input']['latitude'], input_longitude=result['input']['longitude'],
                     **point, queried_at=result['queried_at'], vertical_datum='unconfirmed',
                     survey_date='unconfirmed') for point in result['points']]
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader(); writer.writerows(rows)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Avoid request-body, URL or exception credential leakage.

    def response(self, status, data, content_type='application/json; charset=utf-8'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def json(self, status, payload):
        self.response(status, json.dumps(payload, ensure_ascii=False, allow_nan=False).encode('utf-8'))

    def valid_host(self):
        return self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}')

    def do_GET(self):
        if not self.valid_host():
            return self.json(403, {'error': '허용되지 않은 접속 주소입니다.'})
        path = urlsplit(self.path).path
        if path == '/api/health':
            try:
                credential(); ready = True
            except DepthError:
                ready = False
            return self.json(200, {'ready': ready, 'mode': 'local', 'source': 'KHOA'})
        files = {'/': STATIC/'index.html', '/app.js': STATIC/'app.js', '/style.css': STATIC/'style.css',
                 '/vendor/leaflet.js': STATIC/'vendor/leaflet.js', '/vendor/leaflet.css': STATIC/'vendor/leaflet.css'}
        target = files.get(path)
        if not target:
            return self.json(404, {'error': '페이지를 찾을 수 없습니다.'})
        mime = mimetypes.guess_type(str(target))[0] or 'application/octet-stream'
        self.response(200, target.read_bytes(), mime + ('; charset=utf-8' if mime.startswith('text/') or mime in ('application/javascript',) else ''))

    def do_POST(self):
        if not self.valid_host() or self.headers.get('Origin') not in (None, f'http://{self.headers.get("Host")}'):
            return self.json(403, {'error': '같은 웹페이지에서 조회해 주세요.'})
        if self.path != '/api/depth':
            return self.json(404, {'error': '잘못된 요청 주소입니다.'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.json(415, {'error': 'JSON 요청이 필요합니다.'})
        try:
            length = int(self.headers.get('Content-Length', 0))
            if not 0 < length <= 1024:
                raise ValueError()
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError()
            lat, lon = coordinates(data.get('latitude'), data.get('longitude'))
            cache_key = (lat, lon)
            with LOCK:
                cached = CACHE.get(cache_key)
            if cached and time.monotonic()-cached[0] < 300:
                return self.json(200, dict(cached[1], cached=True))
            if not UPSTREAM.acquire(blocking=False):
                return self.json(429, {'error': '다른 조회를 처리하고 있습니다. 잠시 후 다시 시도해 주세요.'})
            try:
                result = extract(lat, lon)
            finally:
                UPSTREAM.release()
            try:
                save_result(result)
                result['saved_locally'] = True
            except OSError:
                result['saved_locally'] = False
            with LOCK:
                if len(CACHE) >= 100:
                    CACHE.clear()
                CACHE[cache_key] = (time.monotonic(), result)
            self.json(200, dict(result, cached=False))
        except DepthError as exc:
            self.json(exc.status, {'error': str(exc)})
        except (ValueError, TypeError, UnicodeError):
            self.json(400, {'error': '입력값을 확인해 주세요.'})
        except Exception:
            self.json(500, {'error': '조회 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--open', action='store_true')
    args = parser.parse_args()
    try:
        server = LocalServer(('127.0.0.1', args.port), Handler)
    except OSError:
        url = f'http://127.0.0.1:{args.port}'
        try:
            with urlopen(url+'/api/health', timeout=2) as response:
                health = json.load(response)
            if health.get('mode') == 'local' and health.get('source') == 'KHOA':
                print(f'Depth Atlas is already running: {url}', flush=True)
                if args.open:
                    webbrowser.open(url)
                return
        except Exception:
            pass
        print(f'Port {args.port} is unavailable. Use --port 8766.', flush=True)
        return
    url = f'http://127.0.0.1:{server.server_port}'
    print(f'Depth Atlas ready: {url}', flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
