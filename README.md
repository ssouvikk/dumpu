# dumpu

Dump your git-tracked codebase into a single `.md` (default) or `.txt` file with syntax highlighting.

## Run (npx)
npx dumpu@latest
npx dumpu@latest --fileName mydump.md --format md --maxKB 500

## Global
npm i -g dumpu
dumpu --fileName mydump.txt --format txt

## Options
--fileName <name>   Output file name (with/without extension)
--format <md|txt>   Output format (default: md)
--maxKB <number>    Max file size in KB (default: 200)
