const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 允许所有 Host 头访问
app.use((req, res, next) => {
  console.log(`Request from: ${req.headers.host} - ${req.method} ${req.url}`);
  next();
});

// 设置 CORS 头
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

// 服务静态文件
app.use(express.static(path.join(__dirname, 'build')));

// 处理所有路由，返回 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Access via: http://liuran.top:${PORT} or http://118.190.147.162:${PORT}`);
});
