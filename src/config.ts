import dotenv from 'dotenv';

dotenv.config();

export type AppConfig = {
  accessKeyId?: string | undefined;
  accessKeySecret?: string | undefined;
  regionId: string;
  endpoint: string;
  port: number;
};

export const loadConfig = (): AppConfig => {
  const regionId = process.env.ALIBABA_CLOUD_REGION_ID || 'cn-hangzhou';
  const endpoint = process.env.DOCMIND_ENDPOINT || 'docmind-api.cn-hangzhou.aliyuncs.com';
  const port = Number(process.env.PORT || 3000);
  return {
    accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    regionId,
    endpoint,
    port,
  };
};


