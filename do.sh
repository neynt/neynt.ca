#!/bin/bash
set -euo pipefail

this_script="$0"

function install_npm_packages() {
  npm i -g html-minifier
}

function serve() {
  python3 -m http.server 9001 --directory public
}

function deploy() {
  rsync -r public/* neynt@hanabi:~/neynt.ca/
}

function build() {
  mkdir -p serve
  zola build
  rm -f serve/*
  for f in $(find public -iname '*.html'); do
    html-minifier $f -o $f \
      --collapse-whitespace \
      --remove-comments \
      --case-sensitive \
      --minify-js &
  done
  for f in $(find public -iname '*.ts'); do
    tsc $f &
  done
  for f in $(find public -mindepth 1 -maxdepth 1 | cut -d'/' -f2); do
    ln -s ../public/$f serve/$f
  done
  wait
}

function watch() {
  while inotifywait -e close_write \
    config.toml \
    content/** \
    templates/** \
    sass/** \
    static/** \
    >/dev/null 2>/dev/null; do
    time build
  done
}

if [[ $# -eq 0 ]]; then
  echo "commands are:"
  grep -E "^function" $this_script | cut -d' ' -f2 | sed 's/..$//'
  exit 1
fi

"$@"


