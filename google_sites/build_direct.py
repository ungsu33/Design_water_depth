"""Keep the Google Sites single-file embed in sync with its JS source files."""
from pathlib import Path

root = Path(__file__).resolve().parent
page = root / "GoogleSites_독립실행.html"
html = page.read_text(encoding="utf-8")
start = html.index("<script>/* Google Sites")
end = html.index("</script>", start)
html = html[:start] + "<script>" + (root / "direct_api.js").read_text(encoding="utf-8") + "\n" + (root / "direct_client.js").read_text(encoding="utf-8") + html[end:]
html = html.replace('>키 적용</button>', '>키 적용 · 연결 확인</button>')
if 'id="connection-help"' not in html:
    html = html.replace('</details><form', '</details><p id="connection-help" role="status" class="hint" style="margin:-8px 0 18px;color:#286470">새 접속·새로고침 후에는 일반 인증키를 다시 입력해 주세요. 키 적용 시 현재 좌표로 연결을 확인합니다.</p><form')
html = html.replace('DEPTH ATLAS / DESIGN BASIS</span>', 'DEPTH ATLAS / DESIGN BASIS · v1.1</span>')
page.write_text(html, encoding="utf-8", newline="\n")
print("Built standalone HTML; API and UI sources synchronized.")
