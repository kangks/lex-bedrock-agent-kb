#!/bin/bash
set -e

export DISPLAY=:10

# Xvfb &
Xvfb $DISPLAY -ac -screen 0 1024x768x24 -dpi 96 &
tint2 -c $HOME/app/tint2/tint2rc &
x11vnc -noxdamage -nopw -forever &

# exec "$@"
python3 $HOME/app/computer_use.py "$@"
