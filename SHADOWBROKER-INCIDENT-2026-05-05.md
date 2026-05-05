# Shadowbroker 0.9.7 repair + NPM proxy fix + recovery notes

## Summary
Shadowbroker on `10.30.1.15` was updated to upstream `v0.9.7` and repaired. The app now works locally and through Nginx Proxy Manager. Main failures were caused by changed internal ports in the new release plus NPM targeting the wrong upstream from inside Docker.

## Main issues
1. New version changed internal ports
- old assumptions:
  - frontend internal `3037`
  - backend internal `8021`
- actual `v0.9.7` image ports:
  - frontend internal `3000`
  - backend internal `8000`

2. Compose/source mismatch
- frontend still pointed to `http://backend:8021`
- backend container mapping had old assumptions mixed in
- result: page loaded but data/API calls failed with `ECONNREFUSED`

3. NPM reverse proxy issue
- NPM runs in Docker on same Windows host
- proxy target `10.30.1.15:9091` failed from inside the NPM container
- correct target is `host.docker.internal:9091`

4. Docker friction on Windows
- Docker Desktop credential-helper/auth issues complicated update/rebuild
- worked around enough to get the new images deployed

## What was fixed
- SSH access established
- Docker access verified
- Shadowbroker repo found:
  - `C:\Users\Shootre\source\Shadowbroker`
- OpenSky credentials added to `.env`
- Repo updated to upstream `v0.9.7`
- Compose/source corrected for new ports
- frontend restored on host port `9091`
- backend restored on host port `9090`
- NPM corrected to use `host.docker.internal:9091`

## Current good state
- local frontend:
  - `http://localhost:9091`
- local backend health:
  - `http://127.0.0.1:9090/api/health`
- frontend host port:
  - `9091 -> 3000`
- backend host port:
  - `9090 -> 8000`
- frontend upstream:
  - `BACKEND_URL=http://backend:8000`
- NPM upstream:
  - `host.docker.internal:9091`

## OpenSky
Configured and working:
- `OPENSKY_CLIENT_ID=shootre-api-client`
- `OPENSKY_CLIENT_SECRET=<secret>`

Backend logs showed token refresh and OpenSky fetch success.

## How to diagnose faster next time
1. If localhost works but public domain fails:
   - check NPM first
2. If UI loads but no data appears:
   - check frontend logs for `backend:8021`
   - if present, frontend is pointed at the wrong backend port
3. Check compose expectations:
   - frontend must use internal `3000`
   - backend must use internal `8000`
4. Check NPM target from inside its container:
   - `host.docker.internal:9091` should work
   - `10.30.1.15:9091` may fail from container context
5. Keep host ports stable:
   - frontend host `9091`
   - backend host `9090`
6. Don’t reuse old internal port assumptions after upgrades.

## Files created
- `SHADOWBROKER-INCIDENT-2026-05-05.md`
- `SHADOWBROKER-RECOVERY-CHECKLIST.md`
