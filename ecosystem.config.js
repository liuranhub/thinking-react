module.exports = {
  apps: [
    {
      name: 'StockApp',
      script: 'npm',
      args: 'run start',
      cwd: '~/Software/thinking-react',
      env_production: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 3000,
        DANGEROUSLY_DISABLE_HOST_CHECK: 'true'
      }
    }
  ]
};
