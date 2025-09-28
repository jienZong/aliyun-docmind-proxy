import * as crypto from 'crypto';
import * as https from 'https';
import * as querystring from 'querystring';

// 腾讯云文档解析客户端
// 使用HTTP请求方式调用腾讯云API

export interface TencentCredentials {
  secretId: string;
  secretKey: string;
  region?: string;
  endpoint?: string;
}

export interface TencentParserOptions {
  fileType?: string;
  fileUrl?: string;
  fileBase64?: string;
  fileStartPageNumber?: number;
  fileEndPageNumber?: number;
  config?: any;
}

/**
 * 生成腾讯云API签名
 */
function generateTencentSignature(
  secretId: string,
  secretKey: string,
  service: string,
  action: string,
  region: string,
  version: string,
  payload: string,
  timestamp: number
): string {
  const date = new Date(timestamp * 1000).toISOString().substr(0, 10);
  const algorithm = 'TC3-HMAC-SHA256';
  
  // 1. 创建规范请求
  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:lkeap.tencentcloudapi.com\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const hashedRequestPayload = crypto.createHash('sha256').update(payload).digest('hex');
  
  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload
  ].join('\n');
  
  // 2. 创建待签名字符串
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;
  
  // 3. 计算签名
  const secretDate = crypto.createHmac('sha256', `TC3${secretKey}`).update(date).digest();
  const secretService = crypto.createHmac('sha256', secretDate).update(service).digest();
  const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
  
  return `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

/**
 * 发送腾讯云API请求
 */
function sendTencentRequest(
  credentials: TencentCredentials,
  action: string,
  payload: any
): Promise<any> {
  return new Promise((resolve, reject) => {
    const service = 'lkeap';
    const version = '2024-05-22';
    const region = credentials.region || 'ap-guangzhou';
    const endpoint = credentials.endpoint || 'lkeap.tencentcloudapi.com';
    
    const timestamp = Math.floor(Date.now() / 1000);
    const payloadStr = JSON.stringify(payload);
    
    const authorization = generateTencentSignature(
      credentials.secretId,
      credentials.secretKey,
      service,
      action,
      region,
      version,
      payloadStr,
      timestamp
    );
    
    const options = {
      hostname: endpoint,
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json; charset=utf-8',
        'Host': endpoint,
        'X-TC-Action': action,
        'X-TC-Version': version,
        'X-TC-Region': region,
        'X-TC-Timestamp': timestamp.toString(),
        'Content-Length': Buffer.byteLength(payloadStr)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.Response && response.Response.Error) {
            reject(new Error(`腾讯云API错误: ${response.Response.Error.Message}`));
          } else {
            resolve(response.Response);
          }
        } catch (error) {
          reject(new Error(`解析响应失败: ${error}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(payloadStr);
    req.end();
  });
}

/**
 * 创建腾讯云文档解析任务
 */
export async function createTencentParserTask(
  credentials: TencentCredentials,
  options: TencentParserOptions
): Promise<any> {
  const payload: any = {
    FileType: options.fileType || 'PDF'
  };
  
  // 文件URL或Base64必须提供一个
  if (options.fileUrl) {
    payload.FileUrl = options.fileUrl;
  } else if (options.fileBase64) {
    payload.FileBase64 = options.fileBase64;
  }
  
  // 可选参数
  if (options.fileStartPageNumber !== undefined) {
    payload.FileStartPageNumber = options.fileStartPageNumber;
  }
  if (options.fileEndPageNumber !== undefined) {
    payload.FileEndPageNumber = options.fileEndPageNumber;
  }
  if (options.config) {
    payload.Config = options.config;
  }
  
  return await sendTencentRequest(credentials, 'CreateReconstructDocumentFlow', payload);
}

/**
 * 获取腾讯云文档解析结果（包含状态查询）
 */
export async function getTencentParserResult(
  credentials: TencentCredentials,
  taskId: string
): Promise<any> {
  const payload = {
    TaskId: taskId
  };
  
  return await sendTencentRequest(credentials, 'GetReconstructDocumentResult', payload);
}

/**
 * 上传文件到腾讯云并创建解析任务
 */
export async function createTencentParserTaskWithUpload(
  credentials: TencentCredentials,
  fileBuffer: Buffer,
  fileName: string,
  options: TencentParserOptions
): Promise<any> {
  // 腾讯云文档解析主要支持URL方式，需要先上传到对象存储
  // 这里返回一个错误提示，建议使用URL方式
  throw new Error('腾讯云文档解析暂不支持直接上传文件，请使用文件URL方式');
}
