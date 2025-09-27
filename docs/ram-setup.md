## RAM 快速上手：为文档解析代理创建最小权限

目标：创建可被 AssumeRole 的 RAM 角色（用于 STS 临时凭证），并为其授予调用文档智能（DocMind）所需的权限；给调用方 RAM 用户授予“扮演角色”权限。

### 一、准备信息
- 账号ID（AccountId）：阿里云控制台右上角可查看
- 地域与端点：`cn-hangzhou` / `docmind-api.cn-hangzhou.aliyuncs.com`

### 二、创建 RAM 角色（可被扮演）
1. 进入 RAM 控制台 → 左侧“角色” → “创建角色”
2. 可信实体类型：选择“阿里云账号”
3. 角色名称：例如 `DocMindRole`
4. 创建完成后进入“角色详情页”，复制“角色ARN”（roleArn），形如：`acs:ram::<AccountId>:role/DocMindRole`
5. （可选）标签：仅使用英文 Key/Value，例如：`service=docmind`、`purpose=document-parsing`

### 三、授予角色访问 DocMind 的权限
最简方式（便于联调）：
- 在“权限管理”中添加系统策略：`AliyunDocMindFullAccess`

最小权限（推荐）示例（自定义策略）：
```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "docmind:SubmitDocStructureJob",
        "docmind:GetDocStructureResult",
        "docmind:SubmitDocParserJob",
        "docmind:QueryDocParserStatus",
        "docmind:GetDocParserResult"
      ],
      "Resource": "*"
    }
  ]
}
```

> 也可根据业务限定 `Resource` 为具体实例或加上条件限制。

### 四、（跨账号才需要）设置信任策略
同账号扮演通常默认即可；跨账号需要在角色“信任策略”中允许源账号扮演：
```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "RAM": [ "acs:ram::<SourceAccountId>:root" ] },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

### 五、授予调用方“扮演角色”权限
给发起调用的 RAM 用户（或其用户组）绑定系统策略：`AliyunSTSAssumeRoleAccess`（或等效允许 `sts:AssumeRole` 的自定义策略）。

### 六、在代理服务中使用
1. 用调用方 RAM 用户的 AK/SK 调用 `/api/auth/sts`
2. `roleArn` 使用第三步拿到的角色 ARN
3. 成功后返回 base64 token，后续代理 API 带上 `Authorization: Bearer <token>` 即可

### 常见报错排查
- 403 NoPermission：
  - 传入的 `roleArn` 指向服务关联角色（例如 `aliyunservicerole...`），不可被 AssumeRole → 请改为自建角色
  - 调用方缺少 `sts:AssumeRole` 权限 → 给调用方加 `AliyunSTSAssumeRoleAccess`
  - 角色缺少 DocMind 权限 → 给角色加 `AliyunDocMindFullAccess` 或自定义最小权限
- InvalidParameter.TagKey：
  - 标签 Key 不能用中文；仅允许字母数字和 `+-=._:/@`，且不能以 `aliyun/`、`acs:`、`http(s)://` 开头

### 参考文档
- 创建 AccessKey：`https://help.aliyun.com/zh/ram/user-guide/create-an-accesskey-pair`
- RAM 角色管理：`https://help.aliyun.com/zh/ram/user-guide/create-a-ram-role`
- STS 使用说明：`https://help.aliyun.com/zh/ram/developer-reference/use-the-sts-service`

