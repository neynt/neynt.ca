#!/bin/bash
set -euo pipefail

this_script="$0"

function install_npm_packages {
  npm i -g html-minifier
}

function serve {
  python3 -m http.server 9001 --directory public
}

function deploy {
  rsync -r public/* neynt@hanabi:~/neynt.ca/
}

function build {
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
    ln -sf ../public/$f serve/$f
  done
  wait
}

function watch {
  while fswatch -1 \
    config.toml \
    content/** \
    templates/** \
    sass/** \
    static/** \
    >/dev/null 2>/dev/null; do
    time build
  done
}

function gen-fonts {
  rm -r static/iosevka-neynt
  cp -r static/iosevka-neynt-raw static/iosevka-neynt
  rm -r static/iosevka-neynt/TTF
  rm -r static/iosevka-neynt/TTF-Unhinted
  rm -r static/iosevka-neynt/WOFF2-Unhinted
  rm -r static/iosevka-neynt/neynt-Unhinted.css
  for ttf in static/iosevka-neynt-raw/TTF/*.ttf; do
    basename=$(basename $ttf)
    output_woff="static/iosevka-neynt/WOFF2/${basename%.ttf}.woff2"
    echo "$ttf --> $output_woff"
    pyftsubset \
      $ttf \
      --output-file=$output_woff \
      --flavor=woff2 \
      --layout-features=* \
      --no-hinting \
      --desubroutinize \
      --unicodes="U+0000-00A0,U+00A2-00A9,U+00AC-00AE,U+00B0-00B7,\
        U+00B9-00BA,U+00BC-00BE,U+00D7,U+00F7,U+2000-206F,U+2074,\
        U+20AC,U+2122,U+2190-21BB,U+2212,U+2215,U+F8FF,U+FEFF,\
        U+FFFD"
  done
}

if [[ $# -eq 0 ]]; then
  echo "commands are:"
  grep -E "^function" $this_script | cut -d' ' -f2
  exit 1
fi

"$@"
