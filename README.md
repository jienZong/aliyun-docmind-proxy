# 阿里云文档智能服务代理

基于官方 Node SDK 构建的**极简代理服务**，为无法直接使用SDK的应用（如Zion平台）提供HTTP API接口。

## 🎯 核心理念

**透明代理**：用户提供自己的AccessKey+Secret，我们代替用户调用阿里云SDK，返回处理结果。

## 特性

- 🔐 **IP白名单限制**：只允许指定IP访问
- 🎫 **Token鉴权**：用户自行管理AccessKey，服务不保存敏感信息
- 📁 **多种提交方式**：支持URL和文件上传
- 📄 **多格式输出**：支持完整JSON、简化JSON、Markdown三种格式
- ⏱️ **自动轮询**：支持等待任务完成
- 🛡️ **极简配置**：只需配置端口、JWT密钥、IP白名单
- 🚀 **无状态设计**：不存储用户数据，完全透明代理

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

**仅需配置3项**：
- `JWT_SECRET`: JWT签名密钥（生产环境必须修改）
- `ALLOWED_IPS`: 允许访问的IP列表（生产环境必须配置）
- `PORT`: 服务端口（默认3000）

**IP白名单格式**：
```
ALLOWED_IPS=127.0.0.1,::1,192.168.1.0/24
```

> 💡 **为什么配置这么简单？** 用户提供自己的AccessKey+Secret，我们只是透明代理，无需配置阿里云相关参数。

详细配置说明请参考：[配置文档](docs/configuration.md)

### 3. 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

## API 使用指南

### 1. 获取访问Token

首先需要获取访问token：

```bash
curl -X POST http://localhost:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "accessKeyId": "你的AccessKey ID",
    "accessKeySecret": "你的AccessKey Secret",
    "regionId": "cn-hangzhou",
    "endpoint": "docmind-api.cn-hangzhou.aliyuncs.com"
  }'
```

响应：
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400,
    "expiresAt": "2024-01-02T12:00:00.000Z"
  }
}
```

### 1.1 获取阿里云STS临时凭证（推荐）

**这是完整的代理流程：**

1. 用户提供长效AK/SK → 我们调用阿里云STS获取临时凭证 → 返回给用户保存
2. 后续用户调用我们的代理API时，提供这个临时凭证 → 我们用这个凭证调用阿里云DocMind API

```bash
curl -X POST http://localhost:3000/api/auth/sts \
  -H "Content-Type: application/json" \
  -d '{
    "accessKeyId": "你的长效AK",
    "accessKeySecret": "你的长效SK",
    "roleArn": "acs:ram::1234567890123456:role/YourAssumeRole",
    "roleSessionName": "your-session",
    "durationSeconds": 3600
  }'
```

**获取 AccessKey ID 和 AccessKey Secret：**
1. 登录 [阿里云控制台](https://ecs.console.aliyun.com/)
2. 点击右上角头像 → "AccessKey管理"
3. 创建 AccessKey 或使用现有 AccessKey
4. **重要：** 建议使用 RAM 用户的 AccessKey，而不是主账号 AccessKey

**获取 RoleArn：**
1. 打开 [RAM 控制台](https://ram.console.aliyun.com/)
2. 左侧导航选择 `角色` → 点击 `创建角色`
   - 可信实体类型：选择“阿里云账号”
   - 角色名称：例如 `DocMindRole`
3. 创建完成后，点击刚创建的角色进入“角色详情页”
4. 在详情页顶部即可看到“角色ARN”（即 roleArn），形如：
   - `acs:ram::<账号ID>:role/DocMindRole`
5. 进入“权限管理”为角色添加文档智能相关权限（可先使用 `AliyunDocMindFullAccess` 验证）
6. 如需跨账号扮演角色，请在“信任策略”中允许你的调用账号

响应：
```json
{
  "success": true,
  "data": {
    "token": "eyJhY2Nlc3NLZXlJZCI6IkFTSUEuLi4iLCJhY2Nlc3NLZXlTZWNyZXQiOiIuLi4iLCJzZWN1cml0eVRva2VuIjoiLi4uIiwiZXhwaXJhdGlvbiI6IjIwMjUtMDktMjVUMTA6MDA6MDBaIiwicmVnaW9uSWQiOiJjbi1oYW5nemhvdSIsImVuZHBvaW50IjoiZG9jbWluZC1hcGkuY24taGFuZ3pob3UuYWxpeXVuY3MuY29tIn0=",
    "credentials": {
      "accessKeyId": "ASIA...",
      "accessKeySecret": "...",
      "securityToken": "...",
      "expiration": "2025-09-25T10:00:00Z",
      "regionId": "cn-hangzhou",
      "endpoint": "docmind-api.cn-hangzhou.aliyuncs.com"
    },
    "expiresAt": "2025-09-25T10:00:00Z"
  }
}
```

**重要：** 用户需要保存返回的 `token` 字段，后续调用代理API时使用此token。

### 2. 提交文档处理任务

**使用步骤1.1获取的token进行调用：**

#### 方式一：通过URL提交

```bash
curl -X POST http://localhost:3000/api/submit/url \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_STS_TOKEN" \
  -d '{
    "fileUrl": "https://example.com/document.pdf",
    "fileName": "document.pdf",
    "imageStorage": "base64",
    "enableSemantic": true,
    "connectTimeout": 60000,
    "readTimeout": 60000
  }'
```

#### 方式二：文件上传

```bash
curl -X POST http://localhost:3000/api/submit/upload \
  -H "Authorization: Bearer YOUR_STS_TOKEN" \
  -F "file=@/path/to/document.pdf" \
  -F "fileName=document.pdf" \
  -F "imageStorage=base64" \
  -F "enableSemantic=true" \
  -F "connectTimeout=60000" \
  -F "readTimeout=60000"
```

**参数说明**：
- `fileUrl` (必填): 文档的URL地址，支持HTTP和HTTPS协议
- `fileName` (必填): 文档名称，包含文件扩展名
- `imageStorage` (可选): 图片存储方式，`base64`（默认）或 `url`
- `enableSemantic` (可选): 是否启用基于语义理解的层级结构提取功能，`true` 或 `false`（默认）
- `connectTimeout` (可选): 建立连接超时时间（毫秒），默认60000
- `readTimeout` (可选): 读取资源超时时间（毫秒），默认60000

响应：
```json
{
  "success": true,
  "data": {
    "requestId": "43A29C77-405E-4CC0-BC55-EE694AD0****",
    "data": {
      "id": "docmind-20220712-b15f****"
    }
  }
}
```

### 3. 解析（Parser）接口

#### 3.1 提交解析（URL）
```bash
curl -X POST http://localhost:3000/api/parser/submit/url \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_STS_TOKEN" \
  -d '{
    "fileUrl": "https://example.com/document.pdf",
    "fileName": "document.pdf"
  }'
```

#### 3.2 提交解析（文件上传）
```bash
curl -X POST http://localhost:3000/api/parser/submit/upload \
  -H "Authorization: Bearer YOUR_STS_TOKEN" \
  -F "file=@/path/to/document.pdf" \
  -F "fileName=document.pdf"
```

#### 3.3 查询解析状态
```bash
curl -X POST http://localhost:3000/api/parser/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_STS_TOKEN" \
  -d '{
    "id": "docmind-20220902-824b****"
  }'
```

#### 3.4 获取解析结果（多格式支持）

**获取Markdown格式（推荐用于AI处理）：**
```bash
curl -X POST http://localhost:3000/api/parser/result \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_STS_TOKEN" \
  -d '{
    "id": "docmind-20220902-824b****",
    "format": "markdown"
  }'
```

**获取简化JSON格式（推荐用于结构化处理）：**
```bash
curl -X POST http://localhost:3000/api/parser/result \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_STS_TOKEN" \
  -d '{
    "id": "docmind-20220902-824b****",
    "format": "simplified"
  }'
```

**获取完整JSON格式（默认，包含所有详细信息）：**
```bash
curl -X POST http://localhost:3000/api/parser/result \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_STS_TOKEN" \
  -d '{
    "id": "docmind-20220902-824b****",
    "layoutStepSize": 10,
    "layoutNum": 0
  }'
```

**格式说明：**
- `markdown`：返回纯Markdown文本，便于直接使用和AI处理
- `simplified`：返回简化的JSON结构，减少token消耗，便于结构化处理
- `json`（默认）：返回完整的解析结果，包含所有详细信息和样式数据

### 4. 可选：默认凭证回退

若请求未携带 `Authorization: Bearer <token>`，服务可尝试通过 `@alicloud/credentials` 的默认凭证链加载 AK/SK/STS（环境变量、~/.alibabacloud/credentials、RAM 角色等），并自动代用户鉴权。

- 环境开关：`ALLOW_DEFAULT_CREDENTIALS=true`（默认 true，设为 false 可禁用回退）
- 区域与端点可通过环境变量覆盖：`ALIBABA_CLOUD_REGION_ID`、`DOCMIND_ENDPOINT`

### 5. 更多用法

请参考：
- 使用说明与API映射：`docs/proxy-usage.md`
- RAM 快速上手与权限配置：`docs/ram-setup.md`

### 3. 查询任务结果

```bash
curl -X POST http://localhost:3000/api/result \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_STS_TOKEN" \
  -d '{
    "id": "docmind-20220712-b15f****"
  }'
```

### 4. 等待任务完成

```bash
curl -X POST http://localhost:3000/api/result/wait \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_STS_TOKEN" \
  -d '{
    "id": "docmind-20220712-b15f****",
    "intervalMs": 2000,
    "maxWaitMs": 120000
  }'
```

## 安全说明

### IP白名单

服务只允许白名单中的IP访问，支持以下格式：
- 单个IP：`127.0.0.1`
- IPv6：`::1`
- CIDR网段：`192.168.1.0/24`
- 多个IP：`127.0.0.1,::1,192.168.1.0/24`

### Token安全

- Token有效期为24小时
- 包含用户的AccessKey信息，请妥善保管
- 建议定期刷新token
- 生产环境请修改JWT_SECRET

## 错误码说明

| 错误码 | 说明 |
|--------|------|
| `IP_NOT_ALLOWED` | IP不在白名单中 |
| `AUTH_FAILED` | Token验证失败 |
| `MISSING_CREDENTIALS` | 缺少AccessKey信息 |
| `MISSING_PARAMS` | 缺少必要参数 |
| `SUBMIT_FAILED` | 任务提交失败 |
| `QUERY_FAILED` | 结果查询失败 |
| `WAIT_FAILED` | 等待结果失败 |

## 部署建议

### Docker部署

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
```

### 环境变量

生产环境必须设置：
- `JWT_SECRET`: 强随机密钥
- `ALLOWED_IPS`: 限制访问IP
- `PORT`: 服务端口

### 反向代理

建议使用Nginx等反向代理：
- 配置HTTPS
- 设置请求大小限制
- 配置日志记录

## 开发

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建
npm run build
```

### CLI工具

```bash
# 提交本地文件
npm run cli -- structure ./example.pdf --accessKeyId YOUR_AK --accessKeySecret YOUR_SK

# 通过URL提交
npm run cli -- structure-url https://example.com/doc.pdf document.pdf --accessKeyId YOUR_AK --accessKeySecret YOUR_SK

# 等待结果
npm run cli -- wait docmind-20220712-b15f**** --accessKeyId YOUR_AK --accessKeySecret YOUR_SK
```

## 部署指南

### 宝塔服务器部署

我们提供了完整的宝塔部署方案：

1. **详细部署文档**：[宝塔部署指南](docs/bt-deployment.md)
2. **快速部署指南**：[DEPLOY.md](DEPLOY.md)
3. **一键部署脚本**：`scripts/deploy-bt.sh`

### 部署步骤概览

```bash
# 1. 上传项目到服务器
cd /www/wwwroot/aliyun-docmind-proxy

# 2. 运行部署脚本
bash scripts/deploy-bt.sh

# 3. 配置环境变量
nano .env

# 4. 在宝塔面板配置反向代理
# 目标URL: http://127.0.0.1:3000
```

### 更多文档

- [详细使用指南](docs/proxy-usage.md) - API接口详细说明
- [RAM权限配置](docs/ram-setup.md) - 阿里云权限配置指南
- [配置文档](docs/configuration.md) - 环境配置说明

## 许可证

MIT License