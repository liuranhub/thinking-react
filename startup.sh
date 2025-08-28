#! /bin/bash

# 删除旧的进程
pm2 delete StockApp

# 构建项目
npm run build

# 启动自定义服务器
pm2 start server.js --name "StockApp"

