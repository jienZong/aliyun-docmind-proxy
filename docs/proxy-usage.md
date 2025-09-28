# 阿里云文档智能代理服务使用指南

本指南介绍如何使用本代理服务对接阿里云文档智能（DocMind）能力，并给出与官方 SDK/OpenAPI 的字段映射，以及官方参考文档链接。

## 目录

- [1. 鉴权获取临时凭证（STS）](#1-鉴权获取临时凭证sts)
- [2. 结构化（Structure）API](#2-结构化structure-api)
- [3. 解析（Parser）API](#3-解析parser-api)
- [4. 默认凭证回退（可选）](#4-默认凭证回退可选)
- [5. 错误处理策略](#5-错误处理策略)
- [6. 超时设置](#6-超时设置)

---

## 1. 鉴权获取临时凭证（STS）

### 接口信息
- **接口**：`POST /api/auth/sts`
- **用途**：获取阿里云临时凭证，用于后续API调用
- **返回**：`data.token`（base64编码，包含临时凭证信息）

### 请求入参

| 参数 | 必填 | 类型 | 含义 | 示例 | 获取来源 |
| --- | --- | --- | --- | --- | --- |
| accessKeyId | 是 | string | 阿里云访问密钥ID | `LTAI...` | RAM用户/主账号的AccessKey管理页 |
| accessKeySecret | 是 | string | 阿里云访问密钥Secret | `xxxx...` | 与accessKeyId成对生成 |
| roleArn | 是 | string | 要扮演的RAM角色ARN | `acs:ram::1234567890123456:role/DocMindRole` | RAM控制台→角色→角色详情页 |
| roleSessionName | 是 | string | 本次会话名称（便于审计区分来源） | `docmind-proxy-<projectId>` | 自定义（仅字母数字和+-=._:/@，≤64） |
| durationSeconds | 否 | number | 临时凭证有效期（秒） | `3600` | 自定义（900–43200） |
| endpoint | 否 | string | DocMind服务端点 | `docmind-api.cn-hangzhou.aliyuncs.com` | 默认即可/需IPv6用dualstack端点 |
| regionId | 否 | string | 区域ID | `cn-hangzhou` | 默认即可 |

### 响应出参

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| success | boolean | 是否成功 |
| data.token | string | Base64 凭证包。后续 API 放在 `Authorization: Bearer <token>` |
| data.credentials.accessKeyId | string | STS 下发的临时 AK（调试可见，正常仅用 token） |
| data.credentials.accessKeySecret | string | STS 下发的临时 SK（调试可见） |
| data.credentials.securityToken | string | STS 下发的安全令牌（调试可见） |
| data.credentials.expiration | string | 过期时间（ISO 字符串） |
| data.credentials.regionId | string | 区域 ID |
| data.credentials.endpoint | string | DocMind 端点 |
| data.expiresAt | string | 同上（ISO），冗余便于使用 |
| data.expiresAtTs | number | 过期时间戳（毫秒）|
| data.serverTimeTs | number | 服务器当前时间戳（毫秒），可用于本地校准 |

### 请求示例

```bash
curl -X POST http://localhost:3000/api/auth/sts \
  -H "Content-Type: application/json" \
  -d '{
    "accessKeyId": "LTAI...",
    "accessKeySecret": "xxxx...",
    "roleArn": "acs:ram::1234567890123456:role/DocMindRole",
    "roleSessionName": "docmind-proxy-12345",
    "durationSeconds": 3600
  }'
```

### 响应示例

```json
{
  "success": true,
  "data": {
    "token": "eyJhY2Nlc3NLZXlJZCI6IkxUQUkuLi4iLCJhY2Nlc3NLZXlTZWNyZXQiOiJ4eHh4Li4uIiwic2VjdXJpdHlUb2tlbiI6IkZEU0EuLi4iLCJleHBpcmF0aW9uIjoiMjAyNC0xMi0wMVQxMjowMDowMFoiLCJyZWdpb25JZCI6ImNuLWhhbmd6aG91IiwiZW5kcG9pbnQiOiJkb2NtaW5kLWFwaS5jbi1oYW5nemhvdS5hbGl5dW5jcy5jb20ifQ==",
    "credentials": {
      "accessKeyId": "STS.NT...",
      "accessKeySecret": "xxxx...",
      "securityToken": "FDSa...",
      "expiration": "2024-12-01T12:00:00Z",
      "regionId": "cn-hangzhou",
      "endpoint": "docmind-api.cn-hangzhou.aliyuncs.com"
    },
    "expiresAt": "2024-12-01T12:00:00Z",
    "expiresAtTs": 1733040000000,
    "serverTimeTs": 1733036400000
  }
}
```

### 获取凭证步骤

1. **获取 AccessKey ID 和 AccessKey Secret：**
   - 登录 [阿里云控制台](https://ecs.console.aliyun.com/)
   - 点击右上角头像 → "AccessKey管理"
   - 创建 AccessKey 或使用现有 AccessKey
   - **重要：** 建议使用 RAM 用户的 AccessKey，而不是主账号 AccessKey

2. **获取 RoleArn：**
   - 在 [RAM 控制台](https://ram.console.aliyun.com/) 创建 RAM 角色
   - 为角色配置文档智能相关权限
   - RoleArn 格式：`acs:ram::<账号ID>:role/<角色名称>`

### 官方参考
- STS 使用说明（AssumeRole）：`https://help.aliyun.com/zh/ram/developer-reference/use-the-sts-service`
- 创建 AccessKey：`https://help.aliyun.com/zh/ram/user-guide/create-an-accesskey-pair`
- RAM 角色管理：`https://help.aliyun.com/zh/ram/user-guide/create-a-ram-role`

---

## 2. 结构化（Structure）API

### 2.1 提交结构化任务（URL）

#### 接口信息
- **接口**：`POST /api/submit/url`
- **Header**：`Authorization: Bearer <token>`
- **映射**：SDK `SubmitDocStructureJobRequest`
- **官方参考**：`https://next.api.aliyun.com/api/docmind/20220711/SubmitDocStructureJob`

#### 请求入参

| 参数 | 必填 | 类型 | 含义 | 示例 |
| --- | --- | --- | --- | --- |
| fileUrl | 是 | string | 可公网访问的文件URL | `https://example.com/document.pdf` |
| fileName | 是 | string | 文件名（带后缀） | `document.pdf` |
| connectTimeout | 否 | number | 建立连接超时时间（毫秒） | `30000` |
| readTimeout | 否 | number | 读取资源超时时间（毫秒） | `60000` |
| imageStorage | 否 | string | 图片存储方式 | `base64` 或 `url` |
| enableSemantic | 否 | boolean | 是否启用语义理解 | `true` |

#### 响应出参

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| success | boolean | 是否成功 |
| data.requestId | string | 请求ID |
| data.data.id | string | 任务ID，用于后续查询结果 |

#### 请求示例

```bash
curl -X POST http://localhost:3000/api/submit/url \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "fileUrl": "https://hospital.example.com/reports/patient_20241201_001.pdf",
    "fileName": "医疗就诊报告_张三_20241201.pdf",
    "connectTimeout": 30000,
    "readTimeout": 60000,
    "imageStorage": "base64",
    "enableSemantic": true
  }'
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "requestId": "43A29C77-405E-4CC0-BC55-EE694AD0****",
    "data": {
      "id": "docmind-20241201-b15f****"
    }
  }
}
```

### 2.2 提交结构化任务（文件上传）

#### 接口信息
- **接口**：`POST /api/submit/upload`
- **Header**：`Authorization: Bearer <token>`
- **Content-Type**：`multipart/form-data`
- **映射**：SDK `SubmitDocStructureJobAdvanceRequest`
- **官方参考**：同上

#### 请求入参

| 参数 | 必填 | 类型 | 含义 | 示例 |
| --- | --- | --- | --- | --- |
| file | 是 | file | 上传的文件 | `@/path/to/file.pdf` |
| fileName | 是 | string | 文件名（带后缀） | `document.pdf` |
| connectTimeout | 否 | string | 建立连接超时时间（毫秒） | `30000` |
| readTimeout | 否 | string | 读取资源超时时间（毫秒） | `60000` |
| imageStorage | 否 | string | 图片存储方式 | `base64` 或 `url` |
| enableSemantic | 否 | string | 是否启用语义理解 | `true` |

#### 请求示例

```bash
curl -X POST http://localhost:3000/api/submit/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/medical_report.pdf" \
  -F "fileName=医疗就诊报告_李四_20241201.pdf" \
  -F "connectTimeout=30000" \
  -F "readTimeout=60000" \
  -F "imageStorage=base64" \
  -F "enableSemantic=true"
```

### 2.3 查询结构化任务结果

#### 接口信息
- **接口**：`POST /api/result`
- **Header**：`Authorization: Bearer <token>`
- **映射**：SDK `GetDocStructureResultRequest`
- **官方参考**：`https://next.api.aliyun.com/api/docmind/20220711/GetDocStructureResult`

#### 请求入参

| 参数 | 必填 | 类型 | 含义 | 示例 |
| --- | --- | --- | --- | --- |
| id | 是 | string | 任务ID | `docmind-20241201-b15f****` |

#### 响应出参

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| success | boolean | 是否成功 |
| data.requestId | string | 请求ID |
| data.data.completed | boolean | 是否完成 |
| data.data.status | string | 任务状态：Processing/Success/Failed |
| data.data.data | object | 结构化结果数据（成功时） |
| data.data.errorMessage | string | 错误信息（失败时） |

#### 请求示例

```bash
curl -X POST http://localhost:3000/api/result \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "docmind-20241201-b15f****"
  }'
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "requestId": "43A29C77-405E-4CC0-BC55-EE694AD0****",
    "data": {
      "completed": true,
      "status": "Success",
      "data": {
        "pages": [
          {
            "pageIndex": 1,
            "elements": [
              {
                "type": "text",
                "content": "医疗就诊报告",
                "position": {
                  "x": 100,
                  "y": 50,
                  "width": 200,
                  "height": 30
                }
              }
            ]
          }
        ]
      }
    }
  }
}
```

---

## 3. 解析（Parser）API

### 3.1 提交解析（URL）

#### 接口信息
- **接口**：`POST /api/parser/submit/url`
- **Header**：`Authorization: Bearer <token>`
- **映射**：SDK `SubmitDocParserJobRequest`
- **官方参考**：`https://next.api.aliyun.com/api/docmind/20220711/SubmitDocParserJob`

#### 请求入参

| 参数 | 必填 | 类型 | 含义 | 示例 |
| --- | --- | --- | --- | --- |
| fileUrl | 是 | string | 可公网访问的文件URL | `https://example.com/document.pdf` |
| fileName | 是 | string | 文件名（带后缀） | `document.pdf` |
| connectTimeout | 否 | number | 建立连接超时时间（毫秒） | `30000` |
| readTimeout | 否 | number | 读取资源超时时间（毫秒） | `60000` |
| formulaEnhancement | 否 | boolean | 公式识别增强 | `true` |
| llmEnhancement | 否 | boolean | 大模型增强 | `true` |
| option | 否 | string | 音视频解析选项 | `base` 或 `advance` |
| ossBucket | 否 | string | OSS存储桶名 | `my-bucket` |
| ossEndpoint | 否 | string | OSS端点 | `oss-cn-hangzhou.aliyuncs.com` |
| pageIndex | 否 | string | 解析页数范围 | `1-5` 或不传（解析所有页面） |
| outputHtmlTable | 否 | boolean | 返回HTML表格 | `true` |
| multimediaParameters | 否 | object | 音视频参数 | `{"frameRate": 1}` |
| vlParsePrompt | 否 | string | 帧解析prompt | `请提取关键信息` |

#### 请求示例

```bash
curl -X POST http://localhost:3000/api/parser/submit/url \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "fileUrl": "https://hospital.example.com/reports/patient_20241201_001.pdf",
    "fileName": "医疗就诊报告_张三_20241201.pdf",
    "connectTimeout": 30000,
    "readTimeout": 60000,
    "formulaEnhancement": true,
    "llmEnhancement": true,
    "outputHtmlTable": true,
    "vlParsePrompt": "请完整解析文档内容，保留所有重要信息"
  }'
```

#### 响应出参

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| success | boolean | 是否成功 |
| data.requestId | string | 请求ID |
| data.data.id | string | 任务ID，用于后续查询结果 |

#### 响应示例

```json
{
  "success": true,
  "data": {
    "requestId": "43A29C77-405E-4CC0-BC55-EE694AD0****",
    "data": {
      "id": "docmind-20241201-b15f****"
    }
  }
}
```

### 3.2 提交解析（文件上传）

#### 接口信息
- **接口**：`POST /api/parser/submit/upload`
- **Header**：`Authorization: Bearer <token>`
- **Content-Type**：`multipart/form-data`
- **映射**：SDK `SubmitDocParserJobAdvanceRequest`
- **官方参考**：同上

#### 请求入参

| 参数 | 必填 | 类型 | 含义 | 示例 |
| --- | --- | --- | --- | --- |
| file | 是 | file | 上传的文件 | `@/path/to/file.pdf` |
| fileName | 是 | string | 文件名（带后缀） | `document.pdf` |
| connectTimeout | 否 | string | 建立连接超时时间（毫秒） | `30000` |
| readTimeout | 否 | string | 读取资源超时时间（毫秒） | `60000` |
| formulaEnhancement | 否 | string | 公式识别增强 | `true` |
| llmEnhancement | 否 | string | 大模型增强 | `true` |
| option | 否 | string | 音视频解析选项 | `advance` |
| pageIndex | 否 | string | 解析页数范围 | `1-5` |
| outputHtmlTable | 否 | string | 返回HTML表格 | `true` |
| vlParsePrompt | 否 | string | 帧解析prompt | `请提取关键信息` |

#### 请求示例

```bash
curl -X POST http://localhost:3000/api/parser/submit/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/medical_report.pdf" \
  -F "fileName=医疗就诊报告_李四_20241201.pdf" \
  -F "connectTimeout=30000" \
  -F "readTimeout=60000" \
  -F "formulaEnhancement=true" \
  -F "llmEnhancement=true" \
  -F "outputHtmlTable=true" \
  -F "vlParsePrompt=请完整解析文档内容，保留所有重要信息"
```

#### 响应出参

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| success | boolean | 是否成功 |
| data.requestId | string | 请求ID |
| data.data.id | string | 任务ID，用于后续查询结果 |

```json
{
  "success": true,
  "data": {
    "requestId": "43A29C77-405E-4CC0-BC55-EE694AD0****",
    "data": {
      "id": "docmind-20241201-b15f****"
    }
  }
}
```

### 3.3 查询解析状态

#### 接口信息
- **接口**：`POST /api/parser/status`
- **Header**：`Authorization: Bearer <token>`
- **映射**：SDK `QueryDocParserStatusRequest`
- **官方参考**：`https://next.api.aliyun.com/api/docmind/20220711/QueryDocParserStatus`

#### 请求入参

| 参数 | 必填 | 类型 | 含义 | 示例 |
| --- | --- | --- | --- | --- |
| id | 是 | string | 任务ID | `docmind-20241201-b15f****` |

#### 响应出参

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| success | boolean | 是否成功 |
| data.requestId | string | 请求ID |
| data.data.status | string | 任务状态：Processing/Success/Failed |
| data.data.errorMessage | string | 错误信息（失败时） |

#### 请求示例

```bash
curl -X POST http://localhost:3000/api/parser/status \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "id": "docmind-20241201-b15f****" }'
```

#### 响应字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| success | boolean | 请求是否成功 |
| data.requestId | string | 请求ID |
| data.data.status | string | 任务状态：`processing`（处理中）/`success`（成功）/`failed`（失败） |
| data.data.processing | number | 处理进度百分比（0-100） |
| data.data.pageCountEstimate | number | 预估页数 |
| data.data.paragraphCount | number | 段落数量 |
| data.data.tableCount | number | 表格数量 |
| data.data.imageCount | number | 图片数量 |
| data.data.numberOfSuccessfulParsing | number | 成功解析的元素数量 |
| data.data.tokens | number | Token数量 |

#### 响应示例

```json
{
    "success": true,
    "data": {
        "data": {
            "imageCount": 6,
            "numberOfSuccessfulParsing": 39,
            "pageCountEstimate": 3,
            "paragraphCount": 24,
            "processing": 100,
            "status": "success",
            "tableCount": 9,
            "tokens": 2898
        },
        "requestId": "2C5246B3-3C65-5F9B-B150-AF19A6FE343D"
    }
}
```

### 3.4 获取解析结果

#### 接口信息
- **接口**：`POST /api/parser/result`
- **Header**：`Authorization: Bearer <token>`
- **映射**：SDK `GetDocParserResultRequest`
- **官方参考**：`https://next.api.aliyun.com/api/docmind/20220711/GetDocParserResult`

#### 请求入参

| 参数 | 必填 | 类型 | 含义 | 示例 |
| --- | --- | --- | --- | --- |
| id | 是 | string | 任务ID | `docmind-20241201-b15f****` |
| layoutStepSize | 否 | number | 分页大小 | `100` |
| layoutNum | 否 | number | 分页页码（从0开始） | `0` |
| getAllPages | 否 | boolean | 是否获取所有页面内容（自动获取完整PDF内容） | `true` |
| format | 否 | string | 返回格式：`json`（完整结构）、`simplified`（简化结构）、`markdown`（Markdown文本） | `markdown` |

**重要说明：**
- 当 `getAllPages=true` 时，系统会自动持续获取PDF的所有页面内容，直到没有更多数据为止
- 当 `getAllPages=false` 或不设置时，只获取指定页面的内容（通过 `layoutNum` 参数指定）
- 系统会自动记录实际获取的页数，在响应中返回 `totalPages` 字段
- 建议对于重要文档使用 `getAllPages=true` 以确保完整性
- 为防止无限循环，系统最多获取100页数据

#### 响应出参

根据 `format` 参数返回不同格式的结果：

##### format: "json"（默认）
返回完整的解析结果结构，包含所有详细信息和样式数据。

##### format: "simplified"
返回简化的结构，便于AI处理：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| success | boolean | 是否成功 |
| data.format | string | 返回格式：`simplified` |
| data.content.layouts | array | 简化的布局元素数组 |
| data.content.summary | object | 统计信息 |
| data.originalData | object | 原始完整数据（供调试使用） |

简化布局元素结构：
| 字段 | 类型 | 说明 |
| --- | --- | --- |
| type | string | 元素类型：`title`、`text`、`table`、`figure` |
| subType | string | 子类型 |
| level | number | 层级 |
| text | string | 文本内容 |
| pageNum | number | 页码 |
| tableInfo | object | 表格信息（仅表格类型） |
| imageInfo | object | 图片信息（仅图片类型） |

##### format: "markdown"
返回纯Markdown文本，便于直接使用：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| success | boolean | 是否成功 |
| data.format | string | 返回格式：`markdown` |
| data.content | string | Markdown格式的文档内容 |
| data.originalData | object | 原始完整数据（供调试使用） |

#### 请求示例

##### 获取完整PDF的Markdown格式（推荐用于AI处理）
```bash
curl -X POST http://localhost:3000/api/parser/result \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ 
    "id": "docmind-20241201-b15f****", 
    "getAllPages": true,
    "format": "markdown"
  }'
```

##### 获取简化JSON格式（推荐用于结构化处理）
```bash
curl -X POST http://localhost:3000/api/parser/result \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ 
    "id": "docmind-20241201-b15f****", 
    "format": "simplified"
  }'
```

##### 获取完整JSON格式（默认，包含所有详细信息）
```bash
curl -X POST http://localhost:3000/api/parser/result \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ 
    "id": "docmind-20241201-b15f****"
  }'
```

#### 响应示例

##### Markdown格式响应
```json
{
  "success": true,
  "data": {
    "format": "markdown",
    "content": "# 上海市浦东新区周浦医院\n\n![图片](http://example.com/image.png)\n\n# 健康体检表\n\n体检编号：20124228\n\n体检日期：2020年12月10日\n\n| 姓名 | 性别 | 年龄 |\n| --- | --- | --- |\n| 魏宇峰 | 男 | 38 |",
    "originalData": { /* 原始完整数据 */ }
  }
}
```

##### 简化格式响应
```json
{
  "success": true,
  "data": {
    "format": "simplified",
    "content": {
      "layouts": [
        {
          "type": "title",
          "subType": "doc_title",
          "level": 0,
          "text": "上海市浦东新区周浦医院",
          "pageNum": 0
        },
        {
          "type": "table",
          "subType": "none",
          "level": 1,
          "text": "姓名：魏宇峰 性别：男 年龄：38",
          "pageNum": 0,
          "tableInfo": {
            "rows": 1,
            "cols": 16,
            "markdownContent": "| 姓名 | 性别 | 年龄 |\n| --- | --- | --- |",
            "llmResult": "<table>...</table>"
          }
        }
      ],
      "summary": {
        "totalElements": 2,
        "titles": 1,
        "texts": 0,
        "tables": 1,
        "images": 0
      }
    },
    "originalData": { /* 原始完整数据 */ }
  }
}
```

---

## 4. 默认凭证回退（可选）

当请求未携带 `Authorization: Bearer <token>` 时，服务可尝试使用 `@alicloud/credentials` 默认凭证链（环境变量、~/.alibabacloud/credentials、RAM 角色、ECS 元数据等）自动鉴权。

- 环境开关：`ALLOW_DEFAULT_CREDENTIALS=true`（默认 true）
- 区域与端点覆盖：`ALIBABA_CLOUD_REGION_ID`、`DOCMIND_ENDPOINT`
- 官方 Credentials 文档：`https://help.aliyun.com/zh/sdk/developer-reference/obtain-credentials-automatically`

## 5. 错误处理策略

- 阿里云错误：透传 `code/message/requestId`，并使用阿里云 HTTP 状态码。
- 本服务错误：返回本地错误码（如 SUBMIT_FAILED/QUERY_FAILED等）与 500 状态。

## 6. 超时设置

- 请求体可传：connectTimeout/readTimeout（毫秒）。
- 全局默认：环境变量 `DEFAULT_CONNECT_TIMEOUT`、`DEFAULT_READ_TIMEOUT`。

---

# 腾讯云文档解析服务

## 1. 腾讯云认证

### 1.1 获取访问Token

#### 接口信息
- **接口**：`POST /api/tencent/auth`
- **功能**：生成腾讯云访问token

#### 请求入参

| 参数名 | 必填 | 类型 | 说明 | 示例值 |
|--------|------|------|------|--------|
| secretId | 是 | string | 腾讯云SecretId | `AKIDxxxxx` |
| secretKey | 是 | string | 腾讯云SecretKey | `xxxxx` |
| region | 否 | string | 地域 | `ap-guangzhou` |
| endpoint | 否 | string | 服务端点 | `docai.tencentcloudapi.com` |

#### 响应出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| success | boolean | 是否成功 |
| data.token | string | 访问token（需要保存，后续API调用使用） |
| data.credentials | object | 原始凭证信息 |
| data.serverTimeTs | number | 服务器当前时间（时间戳，毫秒） |

#### 请求示例

```bash
curl -X POST http://localhost:3000/api/tencent/auth \
  -H "Content-Type: application/json" \
  -d '{
    "secretId": "AKIDxxxxx",
    "secretKey": "xxxxx",
    "region": "ap-guangzhou"
  }'
```

## 2. 腾讯云文档解析

### 2.1 提交解析任务

#### 接口信息
- **接口**：`POST /api/tencent/parser/submit/url`
- **功能**：通过URL提交文档解析任务

#### 请求入参

| 参数名 | 必填 | 类型 | 说明 | 示例值 |
|--------|------|------|------|--------|
| fileUrl | 是 | string | 文档URL | `https://example.com/doc.pdf` |
| fileName | 否 | string | 文件名 | `报告.pdf` |
| fileType | 否 | string | 文件类型（支持PDF、DOC、DOCX、XLS、XLSX、PPT、PPTX、MD、TXT、PNG、JPG、JPEG、CSV、HTML、EPUB等） | `PDF` |
| fileStartPageNumber | 否 | number | 起始页码 | `1` |
| fileEndPageNumber | 否 | number | 结束页码 | `100` |
| config | 否 | object | 解析配置 | `{}` |

#### 响应出参

| 参数名 | 类型 | 说明 |
|--------|------|------|
| success | boolean | 是否成功 |
| data.taskId | string | 任务ID |
| data.fileName | string | 文件名 |
| data.fileUrl | string | 文件URL |
| data.fileType | string | 文件类型 |
| data.status | string | 任务状态 |
| data.requestId | string | 请求ID |

#### 请求示例

```bash
curl -X POST http://localhost:3000/api/tencent/parser/submit/url \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "fileUrl": "https://example.com/doc.pdf",
    "fileName": "报告.pdf",
    "fileType": "PDF",
    "fileStartPageNumber": 1,
    "fileEndPageNumber": 10
  }'
```

### 2.2 获取解析结果

#### 接口信息
- **接口**：`POST /api/tencent/parser/result`
- **功能**：获取文档解析结果（包含状态查询）

#### 请求入参

| 参数名 | 必填 | 类型 | 说明 | 示例值 |
|--------|------|------|------|--------|
| taskId | 是 | string | 任务ID | `task-123` |
| format | 否 | string | 返回格式：`json`（完整结构）、`simplified`（简化结构）、`markdown`（Markdown文本） | `markdown` |

#### 响应出参

根据 `format` 参数返回不同格式的结果：

**format=markdown**
| 参数名 | 类型 | 说明 |
|--------|------|------|
| success | boolean | 是否成功 |
| data.format | string | 格式类型 |
| data.content | string | Markdown文本内容 |
| data.originalData | object | 原始数据 |

**format=simplified**
| 参数名 | 类型 | 说明 |
|--------|------|------|
| success | boolean | 是否成功 |
| data.format | string | 格式类型 |
| data.content | object | 简化的结构化数据 |
| data.originalData | object | 原始数据 |

**format=json（默认）**
| 参数名 | 类型 | 说明 |
|--------|------|------|
| success | boolean | 是否成功 |
| data | object | 腾讯云API返回的完整结果 |

#### 请求示例

```bash
# 获取Markdown格式结果
curl -X POST http://localhost:3000/api/tencent/parser/result \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task-123",
    "format": "markdown"
  }'
```

## 3. 腾讯云与阿里云对比

| 功能 | 阿里云DocMind | 腾讯云DocAI |
|------|---------------|-------------|
| 认证方式 | AK/SK + STS临时凭证 | SecretId/SecretKey |
| 文档类型 | PDF、DOC、DOCX、图片等 | PDF、DOC、DOCX、XLS、XLSX、PPT、PPTX、MD、TXT、CSV、HTML、EPUB等 |
| 解析能力 | 结构化解析、大模型增强 | 文档重构、Markdown转换 |
| 结果格式 | 支持Markdown、简化JSON | 支持Markdown、简化JSON |
| 文件上传 | 支持URL和直接上传 | 支持URL和Base64 |
| 页数处理 | 支持获取所有页面 | 支持指定页码范围 |
| 结果获取 | 直接返回解析内容 | 返回ZIP文件下载链接 |

## 4. 使用建议

1. **选择服务商**：
   - 阿里云DocMind：功能更全面，支持大模型增强
   - 腾讯云DocAI：接口相对简单，适合基础文档解析

2. **认证管理**：
   - 阿里云：建议使用STS临时凭证，更安全
   - 腾讯云：直接使用SecretId/SecretKey

3. **结果处理**：
   - 两种服务都支持Markdown格式输出
   - 可根据需要选择简化JSON或完整JSON格式