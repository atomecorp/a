#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
log_dir="${LOG_DIR:-$project_root/logs}"
log_file="${LOG_FILE:-$log_dir/update_server.log}"
quiet="${QUIET:-1}"

mkdir -p "$log_dir"

if [[ "$quiet" == "1" ]]; then
	exec >"$log_file" 2>&1
else
	exec > >(tee -a "$log_file") 2>&1
fi

cd "$project_root"

server_update="$project_root/scripts/server_update.js"
node_bin="${NODE_BIN:-node}"

if [[ ! -f "$server_update" ]]; then
	echo "Missing updater script: $server_update"
	exit 1
fi

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

# ── SSL Certificate check & renewal ──────────────────────────────────────
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
		echo "[$timestamp][cert] BEFORE renewal — domain: ${domain}"
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
		echo "[$timestamp][cert] AFTER renewal — domain: ${domain}"
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

if [[ "$no_cert" == false ]]; then
	renew_certificate
fi

# ── Application update ────────────────────────────────────────────────────
update_args=("$@" "--no-restart")

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
	"$node_bin" "$server_update" "${update_args[@]}"
else
	sudo "$node_bin" "$server_update" "${update_args[@]}"
fi

if [[ "$no_git" == false ]]; then
	pull_script="$project_root/eve/application/git_utils/pull.sh"
	if [[ -f "$pull_script" ]]; then
		bash "$pull_script"
	else
		echo "Missing eVe updater script: $pull_script"
		exit 1
	fi
fi

if [[ "$restart_after" == true ]]; then
	"$project_root/run.sh" restart
fi
