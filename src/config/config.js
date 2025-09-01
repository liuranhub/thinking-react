const config = {
  development: {
    API_HOST: 'http://localhost:18888'
  },
  production: {
    API_HOST: 'http://118.190.147.162:18888'  // 生产环境可以替换为实际的 API 地址
  }
};

const env = process.env.NODE_ENV || 'development';
export const API_HOST = config[env].API_HOST; 