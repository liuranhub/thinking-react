#! /bin/bash
git pull

git log -1

pm2 delete StockApp

export HOST=0.0.0.0
export PORT=3000
export DANGEROUSLY_DISABLE_HOST_CHECK=true
export NODE_ENV=production

npm run build

pm2 start npm --name "StockApp" -- run start --prefix ~/Software/thinking-react

