module.exports = {
  apps: [
    {
      name: 'whatsapp-health',
      script: 'dist/index.js',
      node_args: '--max-old-space-size=256',
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '200M',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
    },
  ],
};
