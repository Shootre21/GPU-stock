# Reverse Proxy Troubleshooting Checklist

Use this when a site behind Nginx Proxy Manager (or another reverse proxy) is failing.

## 1) Confirm DNS
- Does the hostname resolve to the expected public IP?
- If DNS is wrong, fix that first.

## 2) Check what the proxy is returning
- `502 Bad Gateway` usually means upstream issue
- `404` may mean the app is reachable but the route/path is wrong
- `301/302` may indicate redirect behavior
- TLS/certificate errors may mean HTTPS mismatch

## 3) Verify upstream settings
- Upstream host/IP correct?
- Upstream port correct?
- Upstream scheme correct (`http` vs `https`)?

## 4) Test the upstream directly from the proxy host
- `curl -I http://HOST:PORT`
- `curl -k -I https://HOST:PORT`

Interpretation:
- HTTP works, HTTPS fails -> use `http` upstream
- Neither works -> wrong host/port, firewall, or service down
- HTTPS works -> `https` upstream is okay

## 5) Remember where TLS terminates
Common pattern:
- Browser/client -> reverse proxy = HTTPS
- Reverse proxy -> internal app = HTTP

Only use HTTPS upstream if the app itself serves TLS.

## 6) Validate after changes
- Reload or regenerate proxy config if needed
- Test the public URL again
- Confirm you now get an app response instead of a proxy error

## 7) Capture the final state
Record:
- hostname
- upstream host
- upstream port
- upstream scheme
- what changed
- what verified the fix
