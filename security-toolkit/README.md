# Security Toolkit Installer

This folder contains a reusable installer for an authorized defensive security toolkit.

## Files
- `install-security-tools.sh` — installs requested tools, creates organized directories, writes basic configs, skips tools already present, and verifies installs.

## Tools covered
- nmap
- dnsx
- subfinder
- amass
- httpx
- whatweb
- wafw00f
- ffuf
- gobuster
- nikto
- nuclei
- sqlmap
- wapiti
- tcpdump
- wireshark
- Burp Suite Community

## Workspace structure created
Default root: `~/pentest-workspace`

- `reconnaissance/`
- `scanning/`
- `exploitation/`
- `reporting/`
- `evidence/`
- `targets/`
- `notes/`

## Tool storage created
Default root: `~/security-tools`

- `logs/`
- `config/`
- `src/`
- `bin/`
- `state/`

## Usage
```bash
cd /home/shootre/.openclaw/workspace/security-toolkit
chmod +x install-security-tools.sh
./install-security-tools.sh
```

## Notes
- Uses `apt`, `snap`, and `go install` where appropriate.
- Requires `sudo` for package installation.
- Burp Suite Community is installed via snap.
- Go-based tools are symlinked into `~/security-tools/bin`.
- Review configs and API key placeholders before active use.

## Safety
Use only for authorized defensive security testing, labs, and owned systems.
