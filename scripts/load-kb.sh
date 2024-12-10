#!/bin/env bash

set -e -x

DOCUMENTS=("https://raw.githubusercontent.com/doitintl/amazon-q-business-workshop/refs/heads/main/knowledge/doc/Restaurant_Childrens_Menu.pdf"
"https://raw.githubusercontent.com/doitintl/amazon-q-business-workshop/refs/heads/main/knowledge/doc//Restaurant_Dinner_Menu.pdf"
"https://raw.githubusercontent.com/doitintl/amazon-q-business-workshop/refs/heads/main/knowledge/doc/Restaurant_week_specials.pdf")

rm -fr sample_data
mkdir -p sample_data

pushd sample_data
# download the books
for document in "${DOCUMENTS[@]}"
do
  curl -L -o "$(basename $document)" $document
done

popd
