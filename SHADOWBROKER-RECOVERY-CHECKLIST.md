# Shadowbroker Recovery Checklist

## Verify app locally
- Open frontend: `http://localhost:9091`
- Check backend health: `http://127.0.0.1:9090/api/health`

## Verify ports
- Frontend host port should be `9091`
- Backend host port should be `9090`
- Frontend internal port should be `3000`
- Backend internal port should be `8000`

## Verify frontend/backend wiring
- Frontend env should use:
  - `BACKEND_URL=http://backend:8000`
- If logs still reference `backend:8021`, config is stale/wrong

## Verify Nginx Proxy Manager target
- NPM upstream should point to:
  - `host.docker.internal:9091`
- Do not assume `10.30.1.15:9091` works from inside the NPM container

## Verify OpenSky
- Confirm `.env` contains valid `OPENSKY_CLIENT_ID`
- Confirm `.env` contains valid `OPENSKY_CLIENT_SECRET`
- Check backend logs for token refresh / successful fetches

## If UI loads but has no data
- Check frontend logs for bad backend URL
- Check backend health endpoint
- Check container logs for connection errors

## If public domain fails but localhost works
- Check NPM target first
- Re-test using `host.docker.internal:9091`

## Upgrade reminder
- Do not reuse old internal port assumptions after upgrading releases
- Re-check compose and app env values after every upstream update
