#!/bin/bash
# Print the plan logins' usage meters (five-hour %, seven-day %) as one line — read from the
# site's slot-accounts door. Used around a bench run to say what the run used of the weekly meter.
#   bash scripts/humanities-bench/meter.sh ["a label"]
cd "$(dirname "$0")/../.." || exit 1
PW=$(node -e "require('dotenv').config({path:'.env.local',quiet:true});process.stdout.write((process.env.ADMIN_PASSWORD||'').trim())")
curl -s -m 20 https://www.adrianmathtuition.com/api/admin/slot-accounts -H "Authorization: Bearer $PW" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const a=JSON.parse(s).accounts||[];
console.log(new Date().toISOString()+' '+(process.argv[1]||'')+' · '+a.map((x,i)=>'login '+(i+1)+(x.on?'':' (off)')+': 5h '+(x.usage?.five_hour??'?')+'% 7d '+(x.usage?.seven_day??'?')+'% (read '+(x.usage?.at||'?')+')').join(' · '))}catch(e){console.log('meter unreadable')}})" "$1"
