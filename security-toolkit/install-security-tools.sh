#!/usr/bin/env bash
set -euo pipefail

TOOLS_ROOT="${TOOLS_ROOT:-$HOME/security-tools}"
WORKSPACE_ROOT="${WORKSPACE_ROOT:-$HOME/pentest-workspace}"
LOG_DIR="$TOOLS_ROOT/logs"
CONFIG_DIR="$TOOLS_ROOT/config"
SRC_DIR="$TOOLS_ROOT/src"
BIN_DIR="$TOOLS_ROOT/bin"
STATE_DIR="$TOOLS_ROOT/state"
REPORT_FILE="$LOG_DIR/install-report.txt"

mkdir -p "$LOG_DIR" "$CONFIG_DIR" "$SRC_DIR" "$BIN_DIR" "$STATE_DIR"
mkdir -p "$WORKSPACE_ROOT"/{reconnaissance,scanning,exploitation,reporting,evidence,targets,notes}

APT_UPDATED=0
FAILED_TOOLS=()
INSTALLED_TOOLS=()
SKIPPED_TOOLS=()

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*" | tee -a "$REPORT_FILE"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

run_cmd() {
  local desc="$1"
  shift
  log "$desc"
  "$@"
}

ensure_apt_updated() {
  if [[ "$APT_UPDATED" -eq 0 ]]; then
    run_cmd "Updating apt package lists" sudo apt-get update
    APT_UPDATED=1
  fi
}

ensure_apt_packages() {
  ensure_apt_updated
  run_cmd "Installing apt packages: $*" sudo apt-get install -y "$@"
}

ensure_snap_package() {
  local name="$1"
  local classic="${2:-no}"
  if snap list | awk '{print $1}' | grep -qx "$name"; then
    log "Snap package $name already installed; skipping"
    return 0
  fi
  if [[ "$classic" == "yes" ]]; then
    run_cmd "Installing snap package $name (classic)" sudo snap install "$name" --classic
  else
    run_cmd "Installing snap package $name" sudo snap install "$name"
  fi
}

install_go_tool() {
  local binary="$1"
  local package="$2"
  if need_cmd "$binary"; then
    log "$binary already present; skipping"
    SKIPPED_TOOLS+=("$binary")
    return 0
  fi
  ensure_apt_packages golang-go
  export GOPATH="${GOPATH:-$HOME/go}"
  export PATH="$PATH:$GOPATH/bin"
  run_cmd "Installing Go tool $binary from $package" go install "$package"
  if [[ -x "$GOPATH/bin/$binary" ]]; then
    ln -sf "$GOPATH/bin/$binary" "$BIN_DIR/$binary"
    INSTALLED_TOOLS+=("$binary")
  else
    FAILED_TOOLS+=("$binary")
  fi
}

install_git_tool() {
  local name="$1"
  local repo="$2"
  local verify_cmd="$3"
  local target="$SRC_DIR/$name"
  if eval "$verify_cmd" >/dev/null 2>&1; then
    log "$name already present; skipping"
    SKIPPED_TOOLS+=("$name")
    return 0
  fi
  ensure_apt_packages git python3 python3-pip python3-venv
  if [[ ! -d "$target/.git" ]]; then
    run_cmd "Cloning $name from $repo" git clone "$repo" "$target"
  else
    run_cmd "Updating existing clone for $name" git -C "$target" pull --ff-only
  fi
}

write_config() {
  local path="$1"
  local content="$2"
  mkdir -p "$(dirname "$path")"
  printf '%s\n' "$content" > "$path"
  log "Wrote config: $path"
}

verify_tool() {
  local name="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    log "Verified $name"
    return 0
  fi
  log "Verification failed for $name"
  FAILED_TOOLS+=("$name")
  return 1
}

install_nmap() {
  if need_cmd nmap; then SKIPPED_TOOLS+=("nmap"); return; fi
  ensure_apt_packages nmap
  verify_tool nmap nmap --version && INSTALLED_TOOLS+=("nmap") || true
}

install_dnsx() { install_go_tool dnsx github.com/projectdiscovery/dnsx/cmd/dnsx@latest; verify_tool dnsx "$BIN_DIR/dnsx" -version || true; }
install_subfinder() { install_go_tool subfinder github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest; verify_tool subfinder "$BIN_DIR/subfinder" -version || true; }
install_amass() {
  if need_cmd amass; then SKIPPED_TOOLS+=("amass"); return; fi
  ensure_apt_packages amass
  write_config "$CONFIG_DIR/amass.ini" '# add API keys here if desired\n'
  verify_tool amass amass -version && INSTALLED_TOOLS+=("amass") || true
}
install_httpx() { install_go_tool httpx github.com/projectdiscovery/httpx/cmd/httpx@latest; verify_tool httpx "$BIN_DIR/httpx" -version || true; }

install_whatweb() {
  if need_cmd whatweb; then SKIPPED_TOOLS+=("whatweb"); return; fi
  ensure_apt_packages whatweb
  verify_tool whatweb whatweb --version && INSTALLED_TOOLS+=("whatweb") || true
}

install_wafw00f() {
  if need_cmd wafw00f; then SKIPPED_TOOLS+=("wafw00f"); return; fi
  ensure_apt_packages wafw00f
  verify_tool wafw00f wafw00f --version && INSTALLED_TOOLS+=("wafw00f") || true
}

install_ffuf() { install_go_tool ffuf github.com/ffuf/ffuf/v2@latest; verify_tool ffuf "$BIN_DIR/ffuf" -V || true; }

install_gobuster() {
  if need_cmd gobuster; then SKIPPED_TOOLS+=("gobuster"); return; fi
  ensure_apt_packages gobuster
  verify_tool gobuster gobuster version && INSTALLED_TOOLS+=("gobuster") || true
}

install_nikto() {
  if need_cmd nikto; then SKIPPED_TOOLS+=("nikto"); return; fi
  ensure_apt_packages nikto
  verify_tool nikto nikto -Version && INSTALLED_TOOLS+=("nikto") || true
}

install_nuclei() {
  install_go_tool nuclei github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
  "$BIN_DIR/nuclei" -update-templates >/dev/null 2>&1 || true
  verify_tool nuclei "$BIN_DIR/nuclei" -version || true
}

install_sqlmap() {
  if need_cmd sqlmap; then SKIPPED_TOOLS+=("sqlmap"); return; fi
  ensure_apt_packages sqlmap
  verify_tool sqlmap sqlmap --version && INSTALLED_TOOLS+=("sqlmap") || true
}

install_wapiti() {
  if need_cmd wapiti; then SKIPPED_TOOLS+=("wapiti"); return; fi
  ensure_apt_packages wapiti
  verify_tool wapiti wapiti --version && INSTALLED_TOOLS+=("wapiti") || true
}

install_tcpdump() {
  if need_cmd tcpdump; then SKIPPED_TOOLS+=("tcpdump"); return; fi
  ensure_apt_packages tcpdump
  verify_tool tcpdump tcpdump --version && INSTALLED_TOOLS+=("tcpdump") || true
}

install_wireshark() {
  if need_cmd wireshark; then SKIPPED_TOOLS+=("wireshark"); return; fi
  ensure_apt_packages wireshark
  verify_tool wireshark wireshark --version && INSTALLED_TOOLS+=("wireshark") || true
}

install_burp_suite() {
  if snap list | awk '{print $1}' | grep -qx 'burpsuite'; then
    log "Burp Suite Community already installed; skipping"
    SKIPPED_TOOLS+=("burpsuite")
    return 0
  fi
  ensure_snap_package burpsuite yes
  INSTALLED_TOOLS+=("burpsuite")
}

main() {
  : > "$REPORT_FILE"
  log "Starting authorized defensive security tool installation"
  ensure_apt_packages curl wget unzip build-essential ca-certificates python3 python3-pip jq
  install_nmap
  install_dnsx
  install_subfinder
  install_amass
  install_httpx
  install_whatweb
  install_wafw00f
  install_ffuf
  install_gobuster
  install_nikto
  install_nuclei
  install_sqlmap
  install_wapiti
  install_tcpdump
  install_wireshark
  install_burp_suite

  write_config "$CONFIG_DIR/README.md" "Store per-tool configs and API keys here.\n- amass.ini\n- nuclei-config.yaml\n- wordlists/\n"
  write_config "$WORKSPACE_ROOT/README.md" "Authorized security testing workspace\n\nFolders:\n- reconnaissance\n- scanning\n- exploitation\n- reporting\n- evidence\n- targets\n- notes\n"

  log "Installed: ${INSTALLED_TOOLS[*]:-none}"
  log "Skipped: ${SKIPPED_TOOLS[*]:-none}"
  log "Failed: ${FAILED_TOOLS[*]:-none}"

  if [[ ${#FAILED_TOOLS[@]} -gt 0 ]]; then
    log "One or more tools failed to install"
    exit 1
  fi
  log "Security tool installation completed successfully"
}

main "$@"
