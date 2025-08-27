#! /bin/bash

npm install

nohup npm start > stock.log 2>&1 &
