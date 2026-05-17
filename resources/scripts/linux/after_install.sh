#!/bin/bash
# after-install.sh

set -e

# Define the installation directory (Standard for electron-builder .deb is /opt/ProductName)
APP_DIR="/opt/aisphere"
ARCH=$(uname -m)
APPARMOR_PROFILE="/etc/apparmor.d/aisphere"

echo "AiSphere is installed under $APP_DIR"

IS_UBUNTU=false
if [ -f /etc/os-release ] && grep -q "Ubuntu" /etc/os-release; then
    IS_UBUNTU=true
fi

fix_sandbox_permissions() {
    SANDBOX_PATH="$APP_DIR/chrome-sandbox"
    if [ -f "$SANDBOX_PATH" ]; then
        chown root:root "$SANDBOX_PATH"
        chmod 4755 "$SANDBOX_PATH"
        echo "Fixed permissions for $SANDBOX_PATH"
    else
        echo "Warning: chrome-sandbox not found at $SANDBOX_PATH"
    fi
}

setup_apparmor_profile() {
    # Create AppArmor profile for Ubuntu 24.04+ compatibility
    if [ ! -d "/etc/apparmor.d" ]; then
        return 0
    fi

    echo "Creating AppArmor profile for AiSphere at $APPARMOR_PROFILE"

#     cat <<EOF > "$APPARMOR_PROFILE"
# abi <abi/4.0>,
# include <tunables/global>

# profile aisphere ${APP_DIR}/aisphere flags=(attach_disconnected) {
#   include <abstractions/base>
#   include <abstractions/nameservice>

#   capability,
#   dbus,
#   network,
#   userns,

#   /opt/AiSphere/** mr,
#   /opt/AiSphere/aisphere ix,
#   /opt/AiSphere/chrome-sandbox px,

#   / r,
#   /** mrwk,
# }
# EOF

    cat <<EOF > "$APPARMOR_PROFILE"
abi <abi/4.0>,
include <tunables/global>

profile aisphere {${APP_DIR}/aisphere,${APP_DIR}/apptainer/bin/apptainer{,-suid}} flags=(unconfined) {
  include if exists <local/apptainer>
}
EOF

    if command -v apparmor_parser >/dev/null 2>&1; then
        apparmor_parser -r "$APPARMOR_PROFILE" || echo "Warning: Failed to load AppArmor profile"
    fi
}

fix_sandbox_permissions
setup_apparmor_profile

exit 0
