#! /bin/bash

pm2 delete StockApp

pm2 start npm --name "StockApp" -- run start

