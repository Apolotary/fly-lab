#!/bin/zsh
cd "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
node scripts/start.mjs
if [ $? -ne 0 ]; then
  read 'reply?Could not start. Press Return to close.'
fi
