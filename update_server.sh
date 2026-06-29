#!/usr/bin/env bash

set -Eeuo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
log_dir="${LOG_DIR:-$project_root/logs}"
log_file="${LOG_FILE:-$log_dir/update_server.log}"
quiet="${QUIET:-0}"
run_id="${RUN_ID:-$(date -u '+%Y%m%dT%H%M%SZ')-$$}"
run_started_epoch="$(date +%s)"
active_phase="startup"
export RUN_ID="$run_id"

mkdir -p "$log_dir" "$(dirname -- "$log_file")"

if [[ "$quiet" == "1" ]]; then
	exec >>"$log_file" 2>&1
else
	exec > >(tee -a "$log_file") 2>&1
	echo "Writing update log to: $log_file"
fi

cd "$project_root"

server_update="$project_root/scripts/server_update.js"
node_bin="${NODE_BIN:-node}"
verify_script="$project_root/scripts/verify_deployed_source.js"

if [[ ! -f "$server_update" ]]; then
	echo "Missing updater script: $server_update"
	exit 1
fi

timestamp() {
	date -u '+%Y-%m-%dT%H:%M:%SZ'
}

log_update() {
	echo "[$(timestamp)][update][$run_id][$active_phase] $*"
}

git_value() {
	local args="$1"
	git -C "$project_root" $args 2>/dev/null || true
}

command_value() {
	local command_name="$1"
	shift
	if command -v "$command_name" >/dev/null 2>&1; then
		"$command_name" "$@" 2>&1 | head -n 1 || true
	else
		echo "not found"
	fi
}

phase_start() {
	active_phase="$1"
	phase_started_epoch="$(date +%s)"
	log_update "START"
}

phase_end() {
	local duration
	duration="$(( $(date +%s) - phase_started_epoch ))"
	log_update "END duration=${duration}s"
	active_phase="idle"
}

phase_skip() {
	active_phase="$1"
	log_update "SKIP $2"
	active_phase="idle"
}

phase_fail() {
	local exit_code="$1"
	local command="$2"
	local duration
	duration="$(( $(date +%s) - phase_started_epoch ))"
	log_update "FAIL exit_code=$exit_code duration=${duration}s git_head=$(git_value 'rev-parse HEAD') command=$command log_file=$log_file"
}

run_phase() {
	local phase_name="$1"
	shift
	phase_start "$phase_name"
	log_update "COMMAND start $*"
	set +e
	"$@"
	local status=$?
	set -e
	if [[ "$status" -ne 0 ]]; then
		phase_fail "$status" "$*"
		exit "$status"
	fi
	log_update "COMMAND end exit_code=0 $*"
	phase_end
}

on_error() {
	local exit_code="$1"
	local line="$2"
	local command="$3"
	echo "[$(timestamp)][update][$run_id][$active_phase] ERROR line=$line exit_code=$exit_code git_head=$(git_value 'rev-parse HEAD') command=$command log_file=$log_file"
}

trap 'on_error $? $LINENO "$BASH_COMMAND"' ERR

restart_after=true
no_git=false
no_cert=false
for arg in "$@"; do
	if [[ "$arg" == "--no-restart" ]]; then
		restart_after=false
	elif [[ "$arg" == "--no-git" ]]; then
		no_git=true
	elif [[ "$arg" == "--no-cert" ]]; then
		no_cert=true
	fi
done

preflight() {
	log_update "run_id=$run_id"
	log_update "started_at=$(timestamp)"
	log_update "project_root=$project_root"
	log_update "cwd=$(pwd)"
	log_update "args=$*"
	log_update "user=$(id -un 2>/dev/null || true) uid=${EUID:-$(id -u)}"
	log_update "node=$("$node_bin" --version 2>&1 || echo 'not available')"
	log_update "npm=$(command_value npm --version)"
	log_update "git=$(command_value git --version)"
	log_update "git_head_initial=$(git_value 'rev-parse HEAD')"
	log_update "git_branch_initial=$(git_value 'branch --show-current')"
	log_update "git_status_initial=$(git_value 'status --porcelain=v1' | wc -l | tr -d ' ') changed entries"
	if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
		log_update "root_check=ok"
	elif command -v sudo >/dev/null 2>&1; then
		log_update "root_check=using sudo for privileged server_update phase"
	else
		log_update "root_check=failed sudo not found"
		return 1
	fi
	if command -v systemctl >/dev/null 2>&1; then
		if systemctl is-active --quiet squirrel; then
			log_update "service_status_initial=active"
		else
			log_update "service_status_initial=inactive"
		fi
	else
		log_update "service_status_initial=systemctl not found"
	fi
	log_update "server_update=$server_update"
	log_update "verify_script=$verify_script"
	log_update "log_file=$log_file"
	[[ -f "$server_update" ]]
	[[ -f "$project_root/run.sh" ]]
}

# --- SSL certificate check and renewal ---
renew_certificate() {
	local domain="${DOMAIN:-atome.one}"
	local cert_path="/etc/letsencrypt/live/${domain}/fullchain.pem"
	local timestamp
	timestamp="$(date '+%Y-%m-%d %H:%M:%S')"

	echo "[$timestamp][cert] === SSL certificate renewal check START ==="

	if ! command -v certbot &>/dev/null; then
		echo "[$timestamp][cert] SKIP: certbot not found on this system"
		return 0
	fi
	echo "[$timestamp][cert] certbot found: $(certbot --version 2>&1)"

	if ! command -v openssl &>/dev/null; then
		echo "[$timestamp][cert] SKIP: openssl not found, cannot verify certificate"
		return 0
	fi

	# Log current certificate state before renewal
	if [[ -f "$cert_path" ]]; then
		local before_expiry
		before_expiry="$(openssl x509 -enddate -noout -in "$cert_path" 2>&1)" || true
		local before_issuer
		before_issuer="$(openssl x509 -issuer -noout -in "$cert_path" 2>&1)" || true
		local before_serial
		before_serial="$(openssl x509 -serial -noout -in "$cert_path" 2>&1)" || true
		echo "[$timestamp][cert] BEFORE renewal - domain: ${domain}"
		echo "[$timestamp][cert]   path:    $cert_path"
		echo "[$timestamp][cert]   expiry:  $before_expiry"
		echo "[$timestamp][cert]   issuer:  $before_issuer"
		echo "[$timestamp][cert]   serial:  $before_serial"
	else
		echo "[$timestamp][cert] WARNING: no certificate found at $cert_path"
	fi

	# Attempt renewal (stop nginx before so certbot can bind port 80, restart after)
	echo "[$timestamp][cert] Running: certbot renew --non-interactive --force-renewal ..."
	echo "[$timestamp][cert]   Using pre/post hooks to stop/start nginx (port 80 conflict workaround)"
	local certbot_output
	local certbot_exit=0
	certbot_output="$(certbot renew --non-interactive --force-renewal \
		--pre-hook "systemctl stop nginx" \
		--post-hook "systemctl start nginx" 2>&1)" || certbot_exit=$?

	timestamp="$(date '+%Y-%m-%d %H:%M:%S')"
	echo "[$timestamp][cert] certbot exit code: $certbot_exit"
	echo "[$timestamp][cert] certbot output:"
	echo "$certbot_output" | sed 's/^/    /'

	if [[ "$certbot_exit" -ne 0 ]]; then
		echo "[$timestamp][cert] FAILURE: certbot renew failed (exit $certbot_exit)"
		echo "[$timestamp][cert]   Troubleshoot: sudo certbot renew --dry-run"
		echo "[$timestamp][cert]   Certbot logs: /var/log/letsencrypt/letsencrypt.log"
		echo "[$timestamp][cert] === SSL certificate renewal check END (FAILED) ==="
		return 1
	fi

	# Verify new certificate after renewal
	if [[ -f "$cert_path" ]]; then
		local after_expiry
		after_expiry="$(openssl x509 -enddate -noout -in "$cert_path" 2>&1)" || true
		local after_issuer
		after_issuer="$(openssl x509 -issuer -noout -in "$cert_path" 2>&1)" || true
		local after_serial
		after_serial="$(openssl x509 -serial -noout -in "$cert_path" 2>&1)" || true
		echo "[$timestamp][cert] AFTER renewal - domain: ${domain}"
		echo "[$timestamp][cert]   expiry:  $after_expiry"
		echo "[$timestamp][cert]   issuer:  $after_issuer"
		echo "[$timestamp][cert]   serial:  $after_serial"

		# Check the certificate is not already expired
		if openssl x509 -checkend 0 -noout -in "$cert_path" 2>/dev/null; then
			echo "[$timestamp][cert] VERIFIED: certificate is currently valid"
		else
			echo "[$timestamp][cert] ERROR: certificate is STILL EXPIRED after renewal!"
			echo "[$timestamp][cert] === SSL certificate renewal check END (CERT STILL EXPIRED) ==="
			return 1
		fi

		# Check it covers the expected domain
		local cert_domains
		cert_domains="$(openssl x509 -noout -text -in "$cert_path" 2>/dev/null | grep -A1 'Subject Alternative Name' | tail -1)" || true
		echo "[$timestamp][cert]   SANs:    $cert_domains"
	else
		echo "[$timestamp][cert] ERROR: certificate file missing after renewal at $cert_path"
		echo "[$timestamp][cert] === SSL certificate renewal check END (FILE MISSING) ==="
		return 1
	fi

	# Verify nginx can use it
	if command -v nginx &>/dev/null; then
		if nginx -t 2>&1; then
			echo "[$timestamp][cert] VERIFIED: nginx config test passed"
		else
			echo "[$timestamp][cert] WARNING: nginx config test FAILED after renewal"
		fi
	fi

	echo "[$timestamp][cert] === SSL certificate renewal check END (OK) ==="
}

run_phase preflight preflight "$@"

if [[ "$no_cert" == false ]]; then
	run_phase certificate renew_certificate
else
	phase_skip certificate "--no-cert"
fi

verify_update_applied() {
	if [[ ! -f "$verify_script" ]]; then
		echo "[verify] ERROR: missing deployed source verifier: $verify_script"
		exit 1
	fi

	"$node_bin" "$verify_script" "$project_root"
}

postcheck() {
	"$project_root/run.sh" status
	if command -v journalctl >/dev/null 2>&1; then
		journalctl -u squirrel -n 30 --no-pager -l
	else
		log_update "journalctl not found, skipping recent service logs"
	fi
	if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet squirrel; then
		if command -v curl >/dev/null 2>&1; then
			curl -fsS http://127.0.0.1:3001/health
		else
			log_update "curl not found, skipping healthcheck"
		fi
	else
		log_update "service is not active, skipping healthcheck"
	fi
}

summary() {
	local duration
	duration="$(( $(date +%s) - run_started_epoch ))"
	log_update "SUCCESS final_head=$(git_value 'rev-parse HEAD') duration=${duration}s log_file=$log_file"
}

# --- Application update ---
update_args=("$@")
server_update_has_no_restart=false
for arg in "${update_args[@]}"; do
	if [[ "$arg" == "--no-restart" ]]; then
		server_update_has_no_restart=true
	fi
done
if [[ "$server_update_has_no_restart" == false ]]; then
	update_args+=("--no-restart")
fi

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
	run_phase server_update "$node_bin" "$server_update" "${update_args[@]}"
else
	run_phase server_update sudo "$node_bin" "$server_update" "${update_args[@]}"
fi

if [[ "$no_git" == false ]]; then
	pull_script="$project_root/eVe/git_utils/pull.sh"
	if [[ -f "$pull_script" ]]; then
		run_phase optional_eve_pull bash "$pull_script"
	else
		phase_skip optional_eve_pull "script not found: $pull_script"
	fi
else
	phase_skip optional_eve_pull "--no-git"
fi

run_phase verify_deployed_source verify_update_applied

if [[ "$restart_after" == true ]]; then
	run_phase restart "$project_root/run.sh" restart
	run_phase postcheck postcheck
else
	phase_skip restart "--no-restart"
	phase_skip postcheck "--no-restart"
fi

run_phase summary summary
