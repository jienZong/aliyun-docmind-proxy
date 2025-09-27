## 阿里云文档智能代理服务使用指南

本指南介绍如何使用本代理服务对接阿里云文档智能（DocMind）能力，并给出与官方 SDK/OpenAPI 的字段映射，以及官方参考文档链接。

### 鉴权获取临时凭证（STS）

- 接口：POST `/api/auth/sts`
- 入参：
  - accessKeyId, accessKeySecret（建议使用 RAM 用户）
  - roleArn, roleSessionName
  - durationSeconds（可选）
  - endpoint（可选，默认 `docmind-api.cn-hangzhou.aliyuncs.com`）
  - regionId（可选，默认 `cn-hangzhou`）
- 返回：`data.token`（base64，包含 AccessKeyId/AccessKeySecret/SecurityToken/expiration/regionId/endpoint）
- 用途：后续所有接口放置 `Authorization: Bearer <token>`

请求入参说明：

| 参数 | 必填 | 含义 | 示例 | 获取来源 |
| --- | --- | --- | --- | --- |
| accessKeyId | 是 | 阿里云访问密钥ID | `LTAI...` | RAM用户/主账号的AccessKey管理页 |
| accessKeySecret | 是 | 阿里云访问密钥Secret | `xxxx...` | 与accessKeyId成对生成 |
| roleArn | 是 | 要扮演的RAM角色ARN | `acs:ram::1234567890123456:role/DocMindRole` | RAM控制台→角色→角色详情页 |
| roleSessionName | 是 | 本次会话名称（便于审计区分来源） | `docmind-proxy-<projectId>` | 自定义（仅字母数字和+-=._:/@，≤64） |
| durationSeconds | 否 | 临时凭证有效期（秒） | `3600` | 自定义（900–43200） |
| endpoint | 否 | DocMind服务端点 | `docmind-api.cn-hangzhou.aliyuncs.com` | 默认即可/需IPv6用dualstack端点 |
| regionId | 否 | 区域ID | `cn-hangzhou` | 默认即可 |

响应出参说明：

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

示例请求：
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

**获取凭证步骤：**

1. **获取 AccessKey ID 和 AccessKey Secret：**
   - 登录 [阿里云控制台](https://ecs.console.aliyun.com/)
   - 点击右上角头像 → "AccessKey管理"
   - 创建 AccessKey 或使用现有 AccessKey
   - **重要：** 建议使用 RAM 用户的 AccessKey，而不是主账号 AccessKey

2. **获取 RoleArn：**
   - 在 [RAM 控制台](https://ram.console.aliyun.com/) 创建 RAM 角色
   - 为角色配置文档智能相关权限
   - RoleArn 格式：`acs:ram::<账号ID>:role/<角色名称>`

官方参考：
- STS 使用说明（AssumeRole）：`https://help.aliyun.com/zh/ram/developer-reference/use-the-sts-service`
- 创建 AccessKey：`https://help.aliyun.com/zh/ram/user-guide/create-an-accesskey-pair`
- RAM 角色管理：`https://help.aliyun.com/zh/ram/user-guide/create-a-ram-role`

### 结构化（Structure）

1) 提交结构化任务（URL）
- 接口：POST `/api/submit/url`
- Header：`Authorization: Bearer <token>`
- Body：
  - fileUrl, fileName
  - connectTimeout?, readTimeout?（毫秒；不传则可用环境默认 DEFAULT_CONNECT_TIMEOUT/DEFAULT_READ_TIMEOUT）
- 映射：SDK `SubmitDocStructureJobRequest`
- 官方参考：`https://next.api.aliyun.com/api/docmind/20220711/SubmitDocStructureJob`

2) 提交结构化任务（文件上传）
- 接口：POST `/api/submit/upload`
- Header：`Authorization: Bearer <token>`
- Form：
  - file=@/path/to/file
  - fileName=xxx
- 映射：SDK `SubmitDocStructureJobAdvanceRequest`
- 官方参考：同上

3) 查询结构化任务结果
- 接口：POST `/api/result`
- Header：`Authorization: Bearer <token>`
- Body：{ id }
- 返回：与官方一致（处理中/成功/失败；Completed/Status/Data 等）
- 映射：SDK `GetDocStructureResultRequest`
- 官方参考：`https://next.api.aliyun.com/api/docmind/20220711/GetDocStructureResult`

**完整参数示例（医疗就诊报告结构化）**：
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

**文件上传方式（医疗报告结构化）**：
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

说明：不提供"等待完成"接口，保持异步；如需轮询请在客户端侧按需调用 `/api/result`。

### 解析（Parser）

1) 提交解析（URL）
- 接口：POST `/api/parser/submit/url`
- Header：`Authorization: Bearer <token>`
- Body：{ 
  - fileUrl, fileName（必填）
  - connectTimeout?, readTimeout?（超时设置）
  - formulaEnhancement?（公式识别增强）
  - llmEnhancement?（大模型增强）
  - option?（音视频解析选项：base/advance）
  - ossBucket?, ossEndpoint?（OSS托管）
  - pageIndex?（解析页数：1-5；不传则解析所有页面）
  - outputHtmlTable?（返回HTML表格）
  - multimediaParameters?（音视频参数）
  - vlParsePrompt?（帧解析prompt）
}
- 映射：SDK `SubmitDocParserJobRequest`
- 官方参考：`https://next.api.aliyun.com/api/docmind/20220711/SubmitDocParserJob`

示例（URL + 大模型增强 + HTML表格，不传pageIndex解析所有页面）：
```bash
curl -X POST http://localhost:3000/api/parser/submit/url \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "fileUrl": "https://example.com/document.pdf",
    "fileName": "document.pdf",
    "llmEnhancement": true,
    "formulaEnhancement": true,
    "outputHtmlTable": true
  }'
```

示例（指定解析页数范围）：
```bash
curl -X POST http://localhost:3000/api/parser/submit/url \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "fileUrl": "https://example.com/document.pdf",
    "fileName": "document.pdf",
    "pageIndex": "1-5",
    "llmEnhancement": true
  }'
```

**完整参数示例（医疗就诊报告解析）**：
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
    "vlParsePrompt": "请提取报告中的关键医疗信息，包括：患者姓名、诊断结果、检查项目、用药建议、注意事项等"
  }'
```

**文件上传方式（医疗报告）**：
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
  -F "vlParsePrompt=请提取报告中的关键医疗信息，包括：患者姓名、诊断结果、检查项目、用药建议、注意事项等"
```

2) 提交解析（文件上传）
- 接口：POST `/api/parser/submit/upload`
- Header：`Authorization: Bearer <token>`
- Form：file=@..., fileName=...（必填）
- Body（可选）：同URL接口的所有可选参数
- 映射：SDK `SubmitDocParserJobAdvanceRequest`
- 官方参考：同上

示例（上传 + 音视频高级识别 + 帧prompt）：
```bash
curl -X POST http://localhost:3000/api/parser/submit/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/video.mp4" \
  -F "fileName=video.mp4" \
  -F "option=advance" \
  -F "vlParsePrompt=请简要概括本帧画面中的关键信息"
```

3) 查询解析状态
- 接口：POST `/api/parser/status`
- Header：`Authorization: Bearer <token>`
- Body：{ id }
- 映射：SDK `QueryDocParserStatusRequest`
- 官方参考：`https://next.api.aliyun.com/api/docmind/20220711/QueryDocParserStatus`

示例：
```bash
curl -X POST http://localhost:3000/api/parser/status \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "id": "docmind-20240712-b15f****" }'
```

4) 获取解析结果
- 接口：POST `/api/parser/result`
- Header：`Authorization: Bearer <token>`
- Body：{ id, layoutStepSize?, layoutNum? }
- 映射：SDK `GetDocParserResultRequest`
- 官方参考：`https://next.api.aliyun.com/api/docmind/20220711/GetDocParserResult`

示例（分页获取结果 0-99）：
```bash
curl -X POST http://localhost:3000/api/parser/result \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "id": "docmind-20240712-b15f****", "layoutStepSize": 100, "layoutNum": 0 }'
```

### 默认凭证回退（可选）

当请求未携带 `Authorization: Bearer <token>` 时，服务可尝试使用 `@alicloud/credentials` 默认凭证链（环境变量、~/.alibabacloud/credentials、RAM 角色、ECS 元数据等）自动鉴权。

- 环境开关：`ALLOW_DEFAULT_CREDENTIALS=true`（默认 true）
- 区域与端点覆盖：`ALIBABA_CLOUD_REGION_ID`、`DOCMIND_ENDPOINT`
- 官方 Credentials 文档：`https://help.aliyun.com/zh/sdk/developer-reference/obtain-credentials-automatically`

### 错误处理策略

- 阿里云错误：透传 `code/message/requestId`，并使用阿里云 HTTP 状态码。
- 本服务错误：返回本地错误码（如 SUBMIT_FAILED/QUERY_FAILED等）与 500 状态。

### 超时设置

- 请求体可传：connectTimeout/readTimeout（毫秒）。
- 全局默认：环境变量 `DEFAULT_CONNECT_TIMEOUT`、`DEFAULT_READ_TIMEOUT`。


