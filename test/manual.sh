#!/bin/bash

root=$(git rev-parse --show-toplevel)
bin_path="$root/src/cli/index.js"

tmp_dir=$(mktemp -d)

cd $tmp_dir


node $bin_path
