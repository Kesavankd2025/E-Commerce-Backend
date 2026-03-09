module.exports = {
  apps: [
    {
      name: 'CNI-backend',
      script: 'ts-node-dev',
      args: '--respawn --transpileOnly ./src/index.ts',
      watch: true,
      time: true,
      error_file: './pm2logs/err.log',
      out_file: './pm2logs/out.log',
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};