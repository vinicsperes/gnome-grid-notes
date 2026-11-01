#!/usr/bin/env bash
# Runs an isolated GNOME Shell with no real display, the extension enabled and
# its own data folder, so changes can be exercised without touching the session
# you are working in. The shell stays up until the given command exits.
#
#   tools/headless.sh [--data DIR] [--size WxH] [--zip FILE] COMMAND...
#
# With --zip the extension is installed from that package, as a user would,
# instead of being linked from this folder.
#
# COMMAND sees GRID_NOTES_RUN (the sandbox) and can talk to the shell over D-Bus.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
size=1920x1080
seed=""
zip=""
while [[ ${1:-} == --* ]]; do
    case "$1" in
        --data) seed="$2"; shift 2 ;;
        --size) size="$2"; shift 2 ;;
        --zip) zip="$(realpath "$2")"; shift 2 ;;
        *) echo "unknown option $1" >&2; exit 2 ;;
    esac
done

run="$(mktemp -d "${TMPDIR:-/tmp}/grid-notes-run.XXXXXX")"
chmod 700 "$run"
cleanup() {
    # The document portal and gvfs leave FUSE mounts in the runtime folder.
    for mount in "$run/runtime/doc" "$run/runtime/gvfs"; do
        fusermount3 -uz "$mount" 2>/dev/null || true
    done
    rm -rf "$run" 2>/dev/null || { sleep 1; rm -rf "$run"; }
}
trap cleanup EXIT
mkdir -p "$run/data/gnome-shell/extensions" "$run/config" "$run/cache" "$run/runtime" "$run/data/grid-notes" "$run/home/Desktop"
chmod 700 "$run/runtime"
glib-compile-schemas "$root/extension/schemas"
ln -s "$root/tools/driver@grid-notes" "$run/data/gnome-shell/extensions/driver@grid-notes"
[[ -n $seed ]] && cp "$seed"/*.json "$run/data/grid-notes/"

export GRID_NOTES_RUN="$run" GRID_NOTES_ROOT="$root"
export HOME="$run/home"
export XDG_DATA_HOME="$run/data" XDG_CONFIG_HOME="$run/config" XDG_CACHE_HOME="$run/cache"
export XDG_RUNTIME_DIR="$run/runtime"
export XDG_SESSION_TYPE=wayland
unset DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS

if [[ -n $zip ]]; then
    gnome-extensions install "$zip"
else
    ln -s "$root/extension" "$run/data/gnome-shell/extensions/grid-notes@desktop"
fi

exec 3>&2
dbus-run-session -- bash -c '
    set -euo pipefail
    exec 2>&3
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.shell welcome-dialog-last-shown-version "999"
    gsettings set org.gnome.desktop.background picture-uri "file://$GRID_NOTES_ROOT/tools/wallpaper.png"
    gsettings set org.gnome.desktop.background picture-uri-dark "file://$GRID_NOTES_ROOT/tools/wallpaper.png"
    gsettings set org.gnome.desktop.interface color-scheme prefer-dark
    gsettings set org.gnome.shell enabled-extensions "[\"driver@grid-notes\", \"grid-notes@desktop\"${GRID_NOTES_DING:+, \"ding@rastersoft.com\"}]"
    gnome-shell --headless --wayland --no-x11 --wayland-display=grid-notes-0 \
        --virtual-monitor "$0" >"$GRID_NOTES_RUN/shell.log" 2>&1 &
    shell=$!
    trap "kill $shell 2>/dev/null || true" EXIT
    for _ in $(seq 100); do
        gdbus call --session -d org.gnome.Shell -o /org/gnome/Shell \
            -m org.gnome.Shell.Eval "1" 2>/dev/null | grep -q true && break
        sleep 0.2
    done
    "$@"
' "$size" "$@" 2>"$run/dbus.log"
