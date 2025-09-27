const Credentials = require('@alicloud/credentials');

export type ResolvedCredentials = {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken?: string;
};

// 通过阿里云 Credentials 提供链自动解析凭证（环境变量、配置文件、RAM 角色、ECS 元数据等）
export function loadDefaultCredentials(): ResolvedCredentials {
  const credClient = new Credentials.default();
  const cred = credClient.credential;
  if (!cred || !cred.accessKeyId || !cred.accessKeySecret) {
    throw new Error('无法通过 @alicloud/credentials 加载到有效凭证');
  }
  return {
    accessKeyId: cred.accessKeyId,
    accessKeySecret: cred.accessKeySecret,
    securityToken: cred.securityToken,
  };
}


