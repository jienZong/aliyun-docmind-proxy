#!/bin/bash

# 阿里云文档智能代理服务 - 宝塔部署脚本
# 使用方法：bash scripts/deploy-bt.sh

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
PROJECT_NAME="aliyun-docmind-proxy"
PROJECT_DIR="/www/wwwroot/${PROJECT_NAME}"
SERVICE_PORT="3000"
NGINX_CONFIG_DIR="/www/server/panel/vhost/nginx"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}阿里云文档智能代理服务 - 宝塔部署脚本${NC}"
echo -e "${BLUE}========================================${NC}"

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}请使用root用户运行此脚本${NC}"
    exit 1
fi

# 检查宝塔面板是否安装
if [ ! -d "/www/server/panel" ]; then
    echo -e "${RED}未检测到宝塔面板，请先安装宝塔面板${NC}"
    exit 1
fi

echo -e "${YELLOW}1. 检查环境依赖...${NC}"

# 检查Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js 未安装，请先在宝塔面板中安装 Node.js${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo -e "${RED}Node.js 版本过低（当前：$(node -v)），请安装 Node.js 16+ 版本${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node.js 版本检查通过：$(node -v)${NC}"

# 检查PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}正在安装 PM2...${NC}"
    npm install -g pm2
fi

echo -e "${GREEN}✓ PM2 已安装${NC}"

# 检查Nginx
if ! command -v nginx &> /dev/null; then
    echo -e "${RED}Nginx 未安装，请先在宝塔面板中安装 Nginx${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Nginx 已安装${NC}"

echo -e "${YELLOW}2. 创建项目目录...${NC}"

# 创建项目目录
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

echo -e "${GREEN}✓ 项目目录已创建：$PROJECT_DIR${NC}"

echo -e "${YELLOW}3. 检查项目文件...${NC}"

# 检查必要文件是否存在
if [ ! -f "package.json" ]; then
    echo -e "${RED}未找到 package.json，请确保项目文件已正确上传${NC}"
    exit 1
fi

if [ ! -f "src/server.ts" ]; then
    echo -e "${RED}未找到 src/server.ts，请确保项目文件已正确上传${NC}"
    exit 1
fi

echo -e "${GREEN}✓ 项目文件检查通过${NC}"

echo -e "${YELLOW}4. 安装项目依赖...${NC}"

# 安装依赖
npm install

echo -e "${GREEN}✓ 依赖安装完成${NC}"

echo -e "${YELLOW}5. 构建项目...${NC}"

# 构建项目
npm run build

echo -e "${GREEN}✓ 项目构建完成${NC}"

echo -e "${YELLOW}6. 配置环境变量...${NC}"

# 检查环境配置文件
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${YELLOW}已创建 .env 文件，请编辑配置文件：${NC}"
        echo -e "${BLUE}  nano $PROJECT_DIR/.env${NC}"
        echo -e "${YELLOW}重要：请修改 JWT_SECRET 和 ALLOWED_IPS${NC}"
    else
        echo -e "${RED}未找到 .env.example 文件${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✓ 环境配置检查完成${NC}"

echo -e "${YELLOW}7. 创建日志目录...${NC}"

# 创建日志目录
mkdir -p "$PROJECT_DIR/logs"

echo -e "${GREEN}✓ 日志目录已创建${NC}"

echo -e "${YELLOW}8. 配置 PM2...${NC}"

# 创建PM2配置文件
cat > "$PROJECT_DIR/ecosystem.config.js" << EOF
module.exports = {
  apps: [{
    name: '${PROJECT_NAME}',
    script: './dist/server.js',
    cwd: '${PROJECT_DIR}/',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: ${SERVICE_PORT}
    },
    error_file: '${PROJECT_DIR}/logs/err.log',
    out_file: '${PROJECT_DIR}/logs/out.log',
    log_file: '${PROJECT_DIR}/logs/combined.log',
    time: true
  }]
};
EOF

echo -e "${GREEN}✓ PM2 配置文件已创建${NC}"

echo -e "${YELLOW}9. 启动服务...${NC}"

# 停止已存在的服务
pm2 delete "$PROJECT_NAME" 2>/dev/null || true

# 启动服务
pm2 start "$PROJECT_DIR/ecosystem.config.js"

# 设置开机自启
pm2 startup systemd -u root --hp /root 2>/dev/null || true
pm2 save

echo -e "${GREEN}✓ 服务已启动${NC}"

echo -e "${YELLOW}10. 检查服务状态...${NC}"

# 等待服务启动
sleep 3

# 检查服务状态
if pm2 list | grep -q "$PROJECT_NAME.*online"; then
    echo -e "${GREEN}✓ 服务运行正常${NC}"
else
    echo -e "${RED}✗ 服务启动失败${NC}"
    echo -e "${YELLOW}查看日志：pm2 logs $PROJECT_NAME${NC}"
    exit 1
fi

# 检查端口监听
if netstat -tlnp 2>/dev/null | grep -q ":$SERVICE_PORT "; then
    echo -e "${GREEN}✓ 端口 $SERVICE_PORT 监听正常${NC}"
else
    echo -e "${YELLOW}⚠ 端口 $SERVICE_PORT 未监听，请检查服务状态${NC}"
fi

echo -e "${YELLOW}11. 生成 Nginx 配置模板...${NC}"

# 生成Nginx配置模板
cat > "$PROJECT_DIR/nginx.conf.template" << 'EOF'
# 阿里云文档智能代理服务 Nginx 配置
# 将此配置添加到您的网站 Nginx 配置中

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # 支持大文件上传
    client_max_body_size 50M;
    
    # 超时设置
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
EOF

echo -e "${GREEN}✓ Nginx 配置模板已生成：$PROJECT_DIR/nginx.conf.template${NC}"

echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}部署完成！${NC}"
echo -e "${BLUE}========================================${NC}"

echo -e "${YELLOW}下一步操作：${NC}"
echo -e "${BLUE}1. 编辑环境配置：${NC}"
echo -e "   nano $PROJECT_DIR/.env"
echo -e ""
echo -e "${BLUE}2. 在宝塔面板中创建网站并配置反向代理：${NC}"
echo -e "   目标URL: http://127.0.0.1:$SERVICE_PORT"
echo -e "   参考配置: $PROJECT_DIR/nginx.conf.template"
echo -e ""
echo -e "${BLUE}3. 常用命令：${NC}"
echo -e "   查看服务状态: pm2 status"
echo -e "   查看日志: pm2 logs $PROJECT_NAME"
echo -e "   重启服务: pm2 restart $PROJECT_NAME"
echo -e "   停止服务: pm2 stop $PROJECT_NAME"
echo -e ""
echo -e "${BLUE}4. 测试服务：${NC}"
echo -e "   健康检查: curl http://127.0.0.1:$SERVICE_PORT/health"

echo -e "${BLUE}========================================${NC}"
