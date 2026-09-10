#!/bin/zsh
cd "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
node scripts/setup.mjs
if [ $? -ne 0 ]; then
  read 'reply?Setup failed. Press Return to close.'
fi
