#!/bin/env bash

set -e -x

BOOKS_LIST=("https://www.gutenberg.org/ebooks/84.txt.utf-8"
  "https://www.gutenberg.org/ebooks/1342.txt.utf-8"
  "https://www.gutenberg.org/ebooks/2701.txt.utf-8"
  "https://www.gutenberg.org/ebooks/1513.txt.utf-8")

mkdir -p sample_data

pushd sample_data
# download the books
for book in "${BOOKS_LIST[@]}"
do
  curl -L -o "$(basename $book).txt" $book
done

popd
