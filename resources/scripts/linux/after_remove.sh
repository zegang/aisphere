#!/bin/bash
# after-remove.sh

set -e

APP_DIR="/opt/aisphere"

# Cleanup AppArmor profile
if [ -f "/etc/apparmor.d/aisphere" ]; then
    rm -f "/etc/apparmor.d/aisphere"
fi

if [ -d "$APP_DIR" ]; then
    echo "Cleaning up isolated toolchains and resources in $APP_DIR..."
    rm -rf "$APP_DIR"
fi