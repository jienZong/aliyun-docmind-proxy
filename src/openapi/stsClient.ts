const STS = require('@alicloud/sts20150401');
const Util = require('@alicloud/tea-util');

export type AssumeRoleParams = {
  accessKeyId: string;
  accessKeySecret: string;
  roleArn: string;
  roleSessionName: string;
  durationSeconds?: number; // 900-43200
  endpoint?: string; // sts.cn-hangzhou.aliyuncs.com （默认）
  regionId?: string; // cn-hangzhou（默认）
};

export async function assumeRole(params: AssumeRoleParams) {
  const client = new STS.default({
    accessKeyId: params.accessKeyId,
    accessKeySecret: params.accessKeySecret,
    endpoint: params.endpoint || 'sts.cn-hangzhou.aliyuncs.com',
    regionId: params.regionId || 'cn-hangzhou',
  });

  const req = new STS.AssumeRoleRequest({
    roleArn: params.roleArn,
    roleSessionName: params.roleSessionName,
    durationSeconds: params.durationSeconds,
  });

  const runtime = new Util.RuntimeOptions({});
  const resp = await client.assumeRoleWithOptions(req, runtime);
  // 兼容不同字段风格：Credentials / credentials
  const body: any = resp?.body || {};
  const c: any = body.Credentials || body.credentials;
  if (!c) {
    const code = body?.code || body?.Code;
    const message = body?.message || body?.Message || 'AssumeRole 无返回凭证';
    const requestId = body?.requestId || body?.RequestId;
    const err: any = new Error(message);
    err.aliyun = true;
    err.code = code || 'AliyunSTSError';
    err.requestId = requestId;
    throw err;
  }
  return {
    AccessKeyId: c.AccessKeyId || c.accessKeyId,
    AccessKeySecret: c.AccessKeySecret || c.accessKeySecret,
    SecurityToken: c.SecurityToken || c.securityToken,
    Expiration: c.Expiration || c.expiration,
  } as any;
}


