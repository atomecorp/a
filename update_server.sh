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

server_update="$project_root/scripts_utils/server_update.js"
node_bin="${NODE_BIN:-node}"

if [[ ! -f "$server_update" ]]; then
	echo "Missing updater script: $server_update"
	exit 1
fi

restart_after=true
no_git=false
for arg in "$@"; do
	if [[ "$arg" == "--no-restart" ]]; then
		restart_after=false
	elif [[ "$arg" == "--no-git" ]]; then
		no_git=true
	fi
done

update_args=("$@" "--no-restart")

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
	"$node_bin" "$server_update" "${update_args[@]}"
else
	sudo "$node_bin" "$server_update" "${update_args[@]}"
fi

if [[ "$no_git" == false ]]; then
	git -C "$project_root" submodule sync --recursive
	git -C "$project_root" submodule update --init --recursive
fi

eve_dir="$project_root/src/application/eVe"
eve_branch="${EVE_BRANCH:-main}"
if [[ -d "$eve_dir/.git" ]]; then
	git -C "$eve_dir" fetch origin
	if git -C "$eve_dir" show-ref --verify --quiet "refs/heads/$eve_branch"; then
		git -C "$eve_dir" checkout "$eve_branch"
	else
		git -C "$eve_dir" checkout -B "$eve_branch" "origin/$eve_branch"
	fi
	git -C "$eve_dir" reset --hard "origin/$eve_branch"
fi

if [[ "$restart_after" == true ]]; then
	"$project_root/run.sh" restart
fi
