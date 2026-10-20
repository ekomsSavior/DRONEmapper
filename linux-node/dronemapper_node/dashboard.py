"""Loopback-only dashboard with same-origin mutation checks. AGPL-3.0-or-later."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import secrets
import socket
from urllib.parse import urlsplit
from .radios import doctor
from .platform_support import system

STATIC=Path(__file__).with_name('static')


def make_server(engine,port=8790):
    csrf=secrets.token_urlsafe(32)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):
            pass

        def allowed_host(self):
            return self.headers.get('Host') in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}

        def reply(self,value,status=200,mime='application/json; charset=utf-8'):
            data=value if isinstance(value,bytes) else json.dumps(value,allow_nan=False).encode()
            self.send_response(status)
            self.send_header('Content-Type',mime)
            self.send_header('Content-Length',str(len(data)))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Referrer-Policy','no-referrer')
            self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if not self.allowed_host() or self.headers.get('Sec-Fetch-Site')=='cross-site':
                self.reply({'error':'Use the local dashboard address'},403)
                return
            path=urlsplit(self.path).path
            if path=='/api/status':
                self.reply({**engine.snapshot(),'csrf':csrf})
            elif path=='/api/doctor':
                self.reply(doctor())
            elif path in ('/','/app.js','/radar.js','/style.css','/icon.svg'):
                file='index.html' if path=='/' else path[1:]
                mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[Path(file).suffix]
                self.reply((STATIC/file).read_bytes(),mime=mime)
            else:
                self.reply({'error':'Not found'},404)

        def do_POST(self):
            if not self.allowed_host() or self.headers.get('Origin')!='http://'+self.headers.get('Host','') or not secrets.compare_digest(self.headers.get('X-Node-CSRF',''),csrf):
                self.reply({'error':'Open this action from the local dashboard'},403)
                return
            if self.headers.get('Content-Type','').split(';')[0]!='application/json':
                self.reply({'error':'JSON required'},415)
                return
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=16384:
                    raise ValueError('Invalid request size')
                body=json.loads(self.rfile.read(length),parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Invalid number')))
                if not isinstance(body,dict):
                    raise ValueError('Expected an object')
                if self.path=='/api/start':
                    engine.start()
                elif self.path=='/api/stop':
                    engine.stop()
                elif self.path=='/api/settings':
                    engine.configure(body)
                elif self.path=='/api/pair':
                    self.reply(engine.connection.start())
                    return
                elif self.path=='/api/disconnect':
                    engine.store.disconnect()
                else:
                    self.reply({'error':'Not found'},404)
                    return
                self.reply({'ok':True})
            except (ValueError,OSError) as error:
                self.reply({'error':str(error)[:240]},400)
            except Exception:
                self.reply({'error':'Request could not be completed; check connection and try again'},503)
    class LocalServer(ThreadingHTTPServer):
        allow_reuse_address=system()!='Windows'
        def server_bind(self):
            if system()=='Windows':
                self.socket.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
            super().server_bind()
    server=LocalServer(('127.0.0.1',port),Handler)
    server.daemon_threads=True
    return server
