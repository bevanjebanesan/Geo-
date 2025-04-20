import http.server
import ssl
import sys

PORT = 8000
if len(sys.argv) > 1:
    try:
        PORT = int(sys.argv[1])
    except ValueError:
        pass

CERT_FILE = 'create-cert+1.pem'
KEY_FILE = 'create-cert+1-key.pem'

Handler = http.server.SimpleHTTPRequestHandler
httpd = http.server.HTTPServer(('0.0.0.0', PORT), Handler)

context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certfile=CERT_FILE, keyfile=KEY_FILE)
httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

print(f'Serving HTTPS on https://192.168.0.100:{PORT}/')
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print('\nKeyboard interrupt received, exiting.')
    httpd.server_close()
