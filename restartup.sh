#! /bin/bash
git pull

git log -1

pm2 delete StockApp

npm run build

pm2 start ecosystem.config.js --env production

