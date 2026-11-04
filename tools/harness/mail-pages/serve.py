import http.server, ssl, sys, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
httpd = http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), http.server.SimpleHTTPRequestHandler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain('cert.pem', 'key.pem')
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
httpd.serve_forever()
