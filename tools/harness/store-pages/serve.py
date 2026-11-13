# Serves the store screenshot pages over HTTPS, picking the page by host name,
# so each one can sit at a believable address (the browser maps those names to
# 127.0.0.1 with --host-resolver-rules). Reuses the test certificate in
# ../mail-pages (cert.pem and key.pem, see mail-e2e.cjs for how to make it).
#   python3 serve.py 8444
import http.server, ssl, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
CERT = os.path.join(HERE, '..', 'mail-pages')

def page_for(host):
    if host.startswith('mail.'):
        return 'mail.html'
    if 'booking' in host:
        return 'captcha.html'
    return 'signin.html'

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=HERE, **k)

    def do_GET(self):
        if not self.path.startswith('/qr.png'):
            self.path = '/' + page_for((self.headers.get('Host') or '').split(':')[0])
        super().do_GET()

    def log_message(self, *a):
        pass

httpd = http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(os.path.join(CERT, 'cert.pem'), os.path.join(CERT, 'key.pem'))
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
httpd.serve_forever()
