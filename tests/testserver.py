"""Static server for the repo. Port 8000 strips the CSP <meta> (Playwright's wait_for_function needs eval);
port 8001 serves files untouched, for the CSP-aware tests (console_sweep.py, xss_probe.py)."""
import http.server, re, sys, functools, threading
import os; ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    strip = False
    def log_message(self, *a): pass
    def send_head(self):
        path = self.translate_path(self.path)
        if self.strip and path.endswith('.html'):
            try: body = open(path, 'rb').read()
            except OSError: return super().send_head()
            body = re.sub(rb'<meta http-equiv="Content-Security-Policy"[^>]*>', b'', body)
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8'); self.send_header('Content-Length', str(len(body))); self.end_headers()
            import io; return io.BytesIO(body)
        return super().send_head()
class Strip(H): strip = True
def serve(port, cls):
    http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(cls, directory=ROOT)).serve_forever()
threading.Thread(target=serve, args=(8001, H), daemon=True).start()
serve(8000, Strip)
