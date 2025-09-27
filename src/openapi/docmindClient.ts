const Docmind = require('@alicloud/docmind-api20220711');
const Util = require('@alicloud/tea-util');
import { ReadStream } from 'fs';

function normalizeAliyunError(error: any) {
  const statusCode = error?.statusCode || error?.status || undefined;
  const code = error?.data?.code || error?.code || 'AliyunError';
  const message = error?.data?.message || error?.message || '阿里云请求失败';
  const requestId = error?.data?.requestId || error?.requestId;
  return { aliyun: true, statusCode, code, message, requestId };
}

export type DocmindClientOptions = {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken?: string;
  regionId?: string | undefined;
  endpoint?: string | undefined;
};

export function createDocmindClient(opts: DocmindClientOptions) {
  try {
    const clientConfig: any = {
      accessKeyId: opts.accessKeyId,
      accessKeySecret: opts.accessKeySecret,
      regionId: opts.regionId || 'cn-hangzhou',
      endpoint: opts.endpoint || 'docmind-api.cn-hangzhou.aliyuncs.com',
    };

    // 如果有SecurityToken，添加到配置中
    if (opts.securityToken) {
      clientConfig.securityToken = opts.securityToken;
    }

    const client = new Docmind.default(clientConfig);
    return client;
  } catch (error) {
    console.error('创建DocMind客户端失败:', error);
    throw new Error(`SDK初始化失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

export async function submitStructureByStream(
  credentials: DocmindClientOptions,
  fileStream: ReadStream, 
  fileName: string,
  options?: {
    imageStorage?: 'base64' | 'url';
    enableSemantic?: boolean;
    connectTimeout?: number;
    readTimeout?: number;
  }
) {
  try {
    const client = createDocmindClient(credentials);
    
    // 构建请求参数，只包含SDK实际支持的参数
    const requestParams: any = {
      fileUrlObject: fileStream,
      fileName,
    };
    
    // 根据官方文档，这些参数可能不是所有版本都支持，先注释掉
    // ...(options?.imageStorage && { imageStorage: options.imageStorage }),
    // ...(options?.enableSemantic !== undefined && { enableSemantic: options.enableSemantic }),
    
    const req = new Docmind.SubmitDocStructureJobAdvanceRequest(requestParams);
    
    const runtime = new Util.RuntimeOptions({
      connectTimeout: options?.connectTimeout ?? (process.env.DEFAULT_CONNECT_TIMEOUT ? Number(process.env.DEFAULT_CONNECT_TIMEOUT) : undefined),
      readTimeout: options?.readTimeout ?? (process.env.DEFAULT_READ_TIMEOUT ? Number(process.env.DEFAULT_READ_TIMEOUT) : undefined),
    });
    
    console.log('提交文档结构化任务 (Stream):', { fileName, options });
    const resp = await client.submitDocStructureJobAdvance(req, runtime);
    console.log('任务提交成功:', resp.body);
    
    return resp.body;
  } catch (error) {
    console.error('提交文档结构化任务失败 (Stream):', error);
    throw normalizeAliyunError(error);
  }
}

export async function submitStructureByUrl(
  credentials: DocmindClientOptions,
  fileUrl: string, 
  fileName: string,
  options?: {
    imageStorage?: 'base64' | 'url';
    enableSemantic?: boolean;
    connectTimeout?: number;
    readTimeout?: number;
  }
) {
  try {
    const client = createDocmindClient(credentials);
    
    // 构建请求参数，只包含SDK实际支持的参数
    const requestParams: any = {
      fileUrl,
      fileName,
    };
    
    // 根据官方文档，这些参数可能不是所有版本都支持，先注释掉
    // ...(options?.imageStorage && { imageStorage: options.imageStorage }),
    // ...(options?.enableSemantic !== undefined && { enableSemantic: options.enableSemantic }),
    
    const req = new Docmind.SubmitDocStructureJobRequest(requestParams);
    
    const runtime = new Util.RuntimeOptions({
      connectTimeout: options?.connectTimeout ?? (process.env.DEFAULT_CONNECT_TIMEOUT ? Number(process.env.DEFAULT_CONNECT_TIMEOUT) : undefined),
      readTimeout: options?.readTimeout ?? (process.env.DEFAULT_READ_TIMEOUT ? Number(process.env.DEFAULT_READ_TIMEOUT) : undefined),
    });
    
    console.log('提交文档结构化任务 (URL):', { fileUrl, fileName, options });
    const resp = await client.submitDocStructureJob(req, runtime);
    console.log('任务提交成功:', resp.body);
    
    return resp.body;
  } catch (error) {
    console.error('提交文档结构化任务失败 (URL):', error);
    throw normalizeAliyunError(error);
  }
}

export async function getStructureResult(
  credentials: DocmindClientOptions,
  id: string
) {
  try {
    const client = createDocmindClient(credentials);
    const req = new Docmind.GetDocStructureResultRequest({ id });
    
    console.log('查询文档结构化结果:', { id });
    const resp = await client.getDocStructureResult(req);
    console.log('查询结果:', resp.body);
    
    return resp.body as any;
  } catch (error) {
    console.error('查询文档结构化结果失败:', error);
    throw normalizeAliyunError(error);
  }
}

export async function waitForResult(
  credentials: DocmindClientOptions,
  id: string, 
  options?: { intervalMs?: number; maxWaitMs?: number }
) {
  const intervalMs = options?.intervalMs ?? 2000;
  const maxWaitMs = options?.maxWaitMs ?? 120000;
  const start = Date.now();
  // 轮询直到 Completed 为 true 或超时
  // 参考官方文档的返回结构
  // https://help.aliyun.com/zh/document-mind/developer-reference/user-guide-of-sdk-for-node-js
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res: any = await getStructureResult(credentials, id);
    if (res?.Completed === true || res?.completed === true) {
      return res;
    }
    if (Date.now() - start > maxWaitMs) {
      throw new Error(`等待结果超时: ${id}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ===================== Parser 系列 =====================

export async function submitParserByUrl(
  credentials: DocmindClientOptions,
  fileUrl: string,
  fileName: string,
  options?: { 
    connectTimeout?: number; 
    readTimeout?: number;
    formulaEnhancement?: boolean;
    llmEnhancement?: boolean;
    option?: string;
    ossBucket?: string;
    ossEndpoint?: string;
    pageIndex?: string;
    outputHtmlTable?: boolean;
    multimediaParameters?: any;
    vlParsePrompt?: string;
  }
) {
  try {
    const client = createDocmindClient(credentials);
    const requestParams: any = { 
      fileUrl, 
      fileName,
      ...(options?.formulaEnhancement !== undefined && { formulaEnhancement: options.formulaEnhancement }),
      ...(options?.llmEnhancement !== undefined && { llmEnhancement: options.llmEnhancement }),
      ...(options?.option && { option: options.option }),
      ...(options?.ossBucket && { ossBucket: options.ossBucket }),
      ...(options?.ossEndpoint && { ossEndpoint: options.ossEndpoint }),
      ...(options?.pageIndex && { pageIndex: options.pageIndex }),
      ...(options?.outputHtmlTable !== undefined && { outputHtmlTable: options.outputHtmlTable }),
      ...(options?.multimediaParameters && { multimediaParameters: options.multimediaParameters }),
      ...(options?.vlParsePrompt && { vlParsePrompt: options.vlParsePrompt }),
    };
    const req = new Docmind.SubmitDocParserJobRequest(requestParams);
    const runtime = new Util.RuntimeOptions({
      connectTimeout: options?.connectTimeout ?? (process.env.DEFAULT_CONNECT_TIMEOUT ? Number(process.env.DEFAULT_CONNECT_TIMEOUT) : undefined),
      readTimeout: options?.readTimeout ?? (process.env.DEFAULT_READ_TIMEOUT ? Number(process.env.DEFAULT_READ_TIMEOUT) : undefined),
    });
    const resp = await client.submitDocParserJob(req, runtime);
    return resp.body;
  } catch (error) {
    console.error('提交文档解析任务失败 (URL):', error);
    throw normalizeAliyunError(error);
  }
}

export async function submitParserByStream(
  credentials: DocmindClientOptions,
  fileStream: ReadStream,
  fileName: string,
  options?: { 
    connectTimeout?: number; 
    readTimeout?: number;
    formulaEnhancement?: boolean;
    llmEnhancement?: boolean;
    option?: string;
    ossBucket?: string;
    ossEndpoint?: string;
    pageIndex?: string;
    outputHtmlTable?: boolean;
    multimediaParameters?: any;
    vlParsePrompt?: string;
  }
) {
  try {
    const client = createDocmindClient(credentials);
    const requestParams: any = { 
      fileUrlObject: fileStream, 
      fileName,
      ...(options?.formulaEnhancement !== undefined && { formulaEnhancement: options.formulaEnhancement }),
      ...(options?.llmEnhancement !== undefined && { llmEnhancement: options.llmEnhancement }),
      ...(options?.option && { option: options.option }),
      ...(options?.ossBucket && { ossBucket: options.ossBucket }),
      ...(options?.ossEndpoint && { ossEndpoint: options.ossEndpoint }),
      ...(options?.pageIndex && { pageIndex: options.pageIndex }),
      ...(options?.outputHtmlTable !== undefined && { outputHtmlTable: options.outputHtmlTable }),
      ...(options?.multimediaParameters && { multimediaParameters: options.multimediaParameters }),
      ...(options?.vlParsePrompt && { vlParsePrompt: options.vlParsePrompt }),
    };
    const req = new Docmind.SubmitDocParserJobAdvanceRequest(requestParams);
    const runtime = new Util.RuntimeOptions({
      connectTimeout: options?.connectTimeout ?? (process.env.DEFAULT_CONNECT_TIMEOUT ? Number(process.env.DEFAULT_CONNECT_TIMEOUT) : undefined),
      readTimeout: options?.readTimeout ?? (process.env.DEFAULT_READ_TIMEOUT ? Number(process.env.DEFAULT_READ_TIMEOUT) : undefined),
    });
    const resp = await client.submitDocParserJobAdvance(req, runtime);
    return resp.body;
  } catch (error) {
    console.error('提交文档解析任务失败 (Stream):', error);
    throw normalizeAliyunError(error);
  }
}

export async function queryParserStatus(
  credentials: DocmindClientOptions,
  id: string
) {
  try {
    const client = createDocmindClient(credentials);
    const req = new Docmind.QueryDocParserStatusRequest({ id });
    const resp = await client.queryDocParserStatus(req);
    return resp.body as any;
  } catch (error) {
    console.error('查询文档解析状态失败:', error);
    throw normalizeAliyunError(error);
  }
}

export async function getParserResult(
  credentials: DocmindClientOptions,
  id: string,
  opts?: { layoutStepSize?: number; layoutNum?: number }
) {
  try {
    const client = createDocmindClient(credentials);
    const req = new Docmind.GetDocParserResultRequest({
      id,
      ...(opts?.layoutStepSize !== undefined && { layoutStepSize: opts.layoutStepSize }),
      ...(opts?.layoutNum !== undefined && { layoutNum: opts.layoutNum }),
    });
    const resp = await client.getDocParserResult(req);
    return resp.body as any;
  } catch (error) {
    console.error('获取文档解析结果失败:', error);
    throw normalizeAliyunError(error);
  }
}


