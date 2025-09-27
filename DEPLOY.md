# 快速部署指南

## 宝塔服务器一键部署

### 1. 准备工作

确保您的宝塔服务器已安装：
- ✅ Node.js 16+ 
- ✅ PM2 进程管理器
- ✅ Nginx 反向代理

### 2. 上传项目文件

将项目文件上传到服务器目录：
```bash
# 方式一：直接上传
# 将项目文件夹上传到 /www/wwwroot/aliyun-docmind-proxy/

# 方式二：Git克隆
cd /www/wwwroot/
git clone <your-repo-url> aliyun-docmind-proxy
```

### 3. 一键部署

在服务器终端中执行：

```bash
cd /www/wwwroot/aliyun-docmind-proxy
chmod +x scripts/deploy-bt.sh
bash scripts/deploy-bt.sh
```

### 4. 配置环境变量

编辑配置文件：
```bash
nano .env
```

**重要配置项：**
```ini
# 服务端口（内网端口）
PORT=3000

# JWT密钥（必须修改为复杂字符串）
JWT_SECRET=your-production-secret-key-change-this

# 允许访问的IP（生产环境必须配置）
ALLOWED_IPS=127.0.0.1,::1,your.allowed.ip

# 生产环境建议关闭默认凭证回退
ALLOW_DEFAULT_CREDENTIALS=false
```

### 5. 配置Nginx反向代理

在宝塔面板中：

1. **创建网站**：`网站` → `添加站点`
   - 域名：`docmind.yourdomain.com`
   - 选择：`纯静态`

2. **配置反向代理**：网站设置 → `反向代理`
   - 代理名称：`docmind-proxy`
   - 目标URL：`http://127.0.0.1:3000`
   - 高级配置：参考 `nginx.conf.template` 文件

3. **申请SSL证书**：网站设置 → `SSL` → `Let's Encrypt`

### 6. 验证部署

```bash
# 检查服务状态
pm2 status

# 测试健康检查
curl http://docmind.yourdomain.com/health

# 测试API接口
curl -X POST http://docmind.yourdomain.com/api/auth/sts \
  -H "Content-Type: application/json" \
  -d '{
    "accessKeyId": "YOUR_ACCESS_KEY_ID",
    "accessKeySecret": "YOUR_ACCESS_KEY_SECRET", 
    "roleArn": "acs:ram::1234567890123456:role/DocMindRole",
    "roleSessionName": "test-session"
  }'
```

## 常用管理命令

```bash
# 查看服务状态
pm2 status

# 查看日志
pm2 logs aliyun-docmind-proxy

# 重启服务
pm2 restart aliyun-docmind-proxy

# 停止服务
pm2 stop aliyun-docmind-proxy

# 更新代码后重新部署
git pull
npm run build
pm2 restart aliyun-docmind-proxy
```

## 故障排除

### 服务无法启动
```bash
# 查看详细错误
pm2 logs aliyun-docmind-proxy --err

# 检查端口占用
netstat -tlnp | grep 3000

# 手动启动测试
node dist/server.js
```

### Nginx 502 错误
```bash
# 检查后端服务
curl http://127.0.0.1:3000/health

# 检查Nginx配置
nginx -t

# 重启Nginx
systemctl restart nginx
```

### 文件上传失败
- 检查Nginx配置中的 `client_max_body_size`
- 检查PM2内存限制
- 检查磁盘空间

## 安全建议

1. **修改默认配置**：
   - 修改 `JWT_SECRET` 为复杂字符串
   - 配置 `ALLOWED_IPS` 限制访问IP

2. **启用HTTPS**：
   - 申请SSL证书
   - 强制HTTPS访问

3. **定期维护**：
   - 更新依赖：`npm update`
   - 检查安全漏洞：`npm audit`
   - 备份配置文件

## 性能优化

1. **启用Gzip压缩**
2. **配置静态资源缓存**
3. **监控服务性能**
4. **设置日志轮转**

---

部署完成后，您的服务将可通过 `https://docmind.yourdomain.com` 访问！
