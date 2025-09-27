# 宝塔服务器部署指南

本指南详细介绍如何在宝塔面板上部署阿里云文档智能代理服务。

## 前置要求

- 宝塔面板已安装
- Node.js 16+ 版本
- PM2 进程管理器
- Nginx 反向代理

## 1. 服务器环境准备

### 1.1 安装 Node.js

1. 登录宝塔面板
2. 进入 `软件商店` → `运行环境`
3. 安装 `Node.js版本管理器`
4. 安装 Node.js 16.x 或更高版本（推荐 18.x）

### 1.2 安装 PM2

在宝塔终端中执行：

```bash
npm install -g pm2
```

## 2. 项目部署

### 2.1 上传项目文件

1. 在宝塔面板中创建网站目录：
   ```
   /www/wwwroot/aliyun-docmind-proxy/
   ```

2. 将项目文件上传到该目录，或使用 Git 克隆：

```bash
cd /www/wwwroot/aliyun-docmind-proxy/
git clone <your-repo-url> .
```

### 2.2 安装依赖

```bash
cd /www/wwwroot/aliyun-docmind-proxy/
npm install
```

### 2.3 构建项目

```bash
npm run build
```

## 3. 环境配置

### 3.1 创建环境配置文件

```bash
cd /www/wwwroot/aliyun-docmind-proxy/
cp .env.example .env
```

### 3.2 编辑环境配置

编辑 `.env` 文件：

```ini
# 阿里云文档智能代理服务配置

# ===========================================
# 必需配置
# ===========================================
# 服务端口号（内网端口，不要使用80/443）
PORT=3000

# JWT签名密钥（生产环境必须修改为复杂字符串）
JWT_SECRET=your-production-secret-key-change-this-to-something-complex

# 允许访问的IP地址（生产环境必须配置）
# 格式：127.0.0.1,::1,192.168.1.0/24
# 如果允许所有IP访问，可以设置为：0.0.0.0/0
ALLOWED_IPS=127.0.0.1,::1

# ===========================================
# 可选配置
# ===========================================
# 是否允许默认凭证回退
ALLOW_DEFAULT_CREDENTIALS=false

# 默认超时设置（毫秒）
DEFAULT_CONNECT_TIMEOUT=30000
DEFAULT_READ_TIMEOUT=60000
```

**重要配置说明：**

- `PORT`：设置为内网端口（如3000），不要使用80或443
- `JWT_SECRET`：必须修改为复杂的随机字符串
- `ALLOWED_IPS`：根据实际需求配置允许访问的IP地址
- `ALLOW_DEFAULT_CREDENTIALS`：生产环境建议设置为 `false`

## 4. PM2 进程管理

### 4.1 创建 PM2 配置文件

创建 `ecosystem.config.js` 文件：

```javascript
module.exports = {
  apps: [{
    name: 'aliyun-docmind-proxy',
    script: './dist/server.js',
    cwd: '/www/wwwroot/aliyun-docmind-proxy/',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/www/wwwroot/aliyun-docmind-proxy/logs/err.log',
    out_file: '/www/wwwroot/aliyun-docmind-proxy/logs/out.log',
    log_file: '/www/wwwroot/aliyun-docmind-proxy/logs/combined.log',
    time: true
  }]
};
```

### 4.2 创建日志目录

```bash
mkdir -p /www/wwwroot/aliyun-docmind-proxy/logs
```

### 4.3 启动服务

```bash
cd /www/wwwroot/aliyun-docmind-proxy/
pm2 start ecosystem.config.js
```

### 4.4 设置开机自启

```bash
pm2 startup
pm2 save
```

### 4.5 PM2 常用命令

```bash
# 查看服务状态
pm2 status

# 查看日志
pm2 logs aliyun-docmind-proxy

# 重启服务
pm2 restart aliyun-docmind-proxy

# 停止服务
pm2 stop aliyun-docmind-proxy

# 删除服务
pm2 delete aliyun-docmind-proxy
```

## 5. Nginx 反向代理配置

### 5.1 在宝塔面板创建网站

1. 进入 `网站` → `添加站点`
2. 填写域名（如：`docmind.yourdomain.com`）
3. 选择 `PHP版本` 为 `纯静态`

### 5.2 配置反向代理

1. 进入网站设置 → `反向代理`
2. 添加反向代理规则：

**代理名称：** `aliyun-docmind-proxy`
**目标URL：** `http://127.0.0.1:3000`
**发送域名：** `$host`
**代理目录：** `/`

**高级配置：**
```nginx
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Port $server_port;

# 支持大文件上传
client_max_body_size 50M;
proxy_connect_timeout 60s;
proxy_send_timeout 60s;
proxy_read_timeout 60s;

# 支持WebSocket（如果需要）
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### 5.3 手动配置 Nginx（可选）

如果需要更精细的控制，可以手动编辑 Nginx 配置：

```nginx
server {
    listen 80;
    server_name docmind.yourdomain.com;
    
    # 支持大文件上传
    client_max_body_size 50M;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

## 6. SSL 证书配置

### 6.1 申请 SSL 证书

1. 在宝塔面板中进入网站设置
2. 点击 `SSL` → `Let's Encrypt`
3. 填写邮箱地址，申请免费证书

### 6.2 强制 HTTPS

在 SSL 设置中开启 `强制HTTPS`

## 7. 防火墙配置

### 7.1 宝塔面板防火墙

1. 进入 `安全` → `防火墙`
2. 确保以下端口开放：
   - `80` (HTTP)
   - `443` (HTTPS)
   - `3000` (内网端口，仅用于测试)

### 7.2 服务器防火墙

```bash
# 开放HTTP和HTTPS端口
ufw allow 80
ufw allow 443

# 如果需要直接访问内网端口（仅测试用）
ufw allow 3000
```

## 8. 服务验证

### 8.1 检查服务状态

```bash
# 检查PM2服务
pm2 status

# 检查端口监听
netstat -tlnp | grep 3000

# 检查Nginx配置
nginx -t
```

### 8.2 测试API接口

```bash
# 健康检查
curl http://docmind.yourdomain.com/health

# 测试STS接口
curl -X POST http://docmind.yourdomain.com/api/auth/sts \
  -H "Content-Type: application/json" \
  -d '{
    "accessKeyId": "YOUR_ACCESS_KEY_ID",
    "accessKeySecret": "YOUR_ACCESS_KEY_SECRET",
    "roleArn": "acs:ram::1234567890123456:role/DocMindRole",
    "roleSessionName": "test-session"
  }'
```

## 9. 监控和维护

### 9.1 日志监控

```bash
# 实时查看日志
pm2 logs aliyun-docmind-proxy --lines 100

# 查看错误日志
tail -f /www/wwwroot/aliyun-docmind-proxy/logs/err.log
```

### 9.2 性能监控

```bash
# 查看PM2监控
pm2 monit

# 查看系统资源
htop
```

### 9.3 定期维护

```bash
# 更新依赖
npm update

# 重新构建
npm run build

# 重启服务
pm2 restart aliyun-docmind-proxy
```

## 10. 常见问题

### 10.1 服务无法启动

1. 检查端口是否被占用：
```bash
netstat -tlnp | grep 3000
```

2. 检查配置文件：
```bash
node -c dist/server.js
```

3. 查看详细错误：
```bash
pm2 logs aliyun-docmind-proxy --err
```

### 10.2 Nginx 502 错误

1. 检查后端服务是否运行：
```bash
pm2 status
```

2. 检查端口配置：
```bash
curl http://127.0.0.1:3000/health
```

3. 检查Nginx配置：
```bash
nginx -t
```

### 10.3 文件上传失败

1. 检查Nginx配置中的 `client_max_body_size`
2. 检查PM2内存限制
3. 检查磁盘空间

## 11. 安全建议

1. **定期更新依赖**：`npm audit` 检查安全漏洞
2. **限制访问IP**：在 `.env` 中配置 `ALLOWED_IPS`
3. **使用HTTPS**：强制使用SSL证书
4. **定期备份**：备份配置文件和日志
5. **监控异常**：设置日志监控和告警

## 12. 性能优化

1. **启用Gzip压缩**：在Nginx配置中启用
2. **设置缓存策略**：对静态资源设置缓存
3. **负载均衡**：如需要可配置多实例
4. **数据库优化**：如有数据库需求

---

部署完成后，您的服务将可以通过 `https://docmind.yourdomain.com` 访问。
