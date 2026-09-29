#!/bin/bash
# usage: dgs_dl.sh DATASET_ID OUTFILE
D=$1; OUT=$2
curl -s -m 30 "https://api-open.data.gov.sg/v1/public/api/datasets/$D/initiate-download" >/dev/null
for i in 1 2 3 4 5 6; do
  J=$(curl -s -m 30 "https://api-open.data.gov.sg/v1/public/api/datasets/$D/poll-download")
  URL=$(echo "$J" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('data',{}).get('url',''))" 2>/dev/null)
  if [ -n "$URL" ]; then curl -s -m 120 -o "$OUT" "$URL"; echo "$D -> $OUT $(wc -c <"$OUT") bytes"; exit 0; fi
  sleep 3
done
echo "FAILED $D: $J"
