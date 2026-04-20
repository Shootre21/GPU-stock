# X Post Deployer v1

Text-only single-sentence X posting pipeline scaffold.

## Current state
This project currently provides:
- config file
- job storage
- submit path
- worker state machine skeleton
- logging
- browser/automation dependency detection

It does **not** yet perform real browser posting.

## To prepare real browser automation

```bash
cd x-post-deployer
npm run install:playwright
```

This installs Playwright and a Chromium runtime for the deployer.

## Files
- `config.json`
- `submit.js`
- `worker.js`
- `jobs/`
- `logs/`
- `screenshots/`
- `profile/`

## Usage
Submit a sentence:

```bash
cd x-post-deployer
node submit.js "your one sentence here"
```

Run the worker:

```bash
cd x-post-deployer
node worker.js
```
