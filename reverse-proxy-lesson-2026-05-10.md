# Reverse Proxy Lesson Learned — 2026-05-10

## Short lesson
The public site can be HTTPS while the internal upstream service is only HTTP.

In this case:
- Public URL: `https://gpu.sh00tre.cc`
- Upstream app: `http://10.30.1.13:4388`
- Mistake: setting the Nginx Proxy Manager upstream scheme to `https`
- Result: `502 Bad Gateway`

## Rule of thumb
If the reverse proxy holds the certificate, then usually:
- Client -> reverse proxy = HTTPS
- Reverse proxy -> app = HTTP

Only use HTTPS upstream if the backend app itself is actually serving TLS.

## Fast checks next time
1. Test `http://HOST:PORT`
2. Test `https://HOST:PORT`
3. If HTTP works and HTTPS fails, proxy upstream should be `http`
4. If hostname resolves and proxy returns `502`, investigate upstream IP/port/scheme first
