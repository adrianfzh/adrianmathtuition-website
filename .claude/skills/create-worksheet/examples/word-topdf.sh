#!/bin/bash
# topdf.sh <docx> <tag> -> writes <tag>.pdf in cwd, via Word's own folder
C=~/Library/Containers/com.microsoft.Word/Data/Documents/adrianmath-export
cp "$1" "$C/$2.docx"
perl -e 'alarm 90; exec "osascript","-e","tell application \"Microsoft Word\"\nopen file name POSIX file \"'$C'/'$2'.docx\"\ndelay 3\nset d to document 1\nif (name of d) does not contain \"'$2'\" then error \"not mine\"\nsave as d file name \"'$C'/'$2'.pdf\" file format format PDF\nend tell"' >/dev/null 2>&1
osascript -e 'tell application "Microsoft Word" to close (every document whose name contains "'$2'") saving no' >/dev/null 2>&1
cp "$C/$2.pdf" .
