#!/bin/bash
install_npm_packages() {
  npm i -g html-minifier
}
build() {
  gutenberg build
  rm serve/*
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
  for f in $(find public -maxdepth 1 -printf '%P\n'); do
    ln -s ../public/$f serve/$f
  done
  wait
}
time build
while inotifywait -e close_write \
  config.toml \
  content/** \
  templates/** \
  sass/** \
  static/** \
  >/dev/null 2>/dev/null; do
  time build
done
