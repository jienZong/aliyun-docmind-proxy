module.exports = {
  apps: [{
    name: 'aliyun-docmind-proxy',
    script: './dist/server.js',
    cwd: process.cwd(),
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    // 进程管理配置
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,
    // 内存监控
    max_memory_restart: '1G',
    // 日志配置
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    // 集群模式（如果需要）
    // instances: 'max', // 使用所有CPU核心
    // exec_mode: 'cluster'
  }]
};
