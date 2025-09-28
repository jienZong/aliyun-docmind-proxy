import express from 'express';
import { loadConfig } from './config';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { submitStructureByStream, submitStructureByUrl, getStructureResult, submitParserByUrl, submitParserByStream, queryParserStatus, getParserResult } from './openapi/docmindClient';
import { assumeRole } from './openapi/stsClient';
import { generateAuthToken } from './auth';
import { ipWhitelistMiddleware, tokenAuthMiddleware, tencentAuthMiddleware } from './middleware';
import { loadDefaultCredentials } from './openapi/credentials';
import { TencentCredentials, createTencentParserTask, getTencentParserResult } from './openapi/tencentClient';

// 精简错误日志函数
function logError(context: string, err: any) {
  if (err?.aliyun) {
    // 阿里云错误：只记录关键信息
    console.error(`${context}: [${err.code}] ${err.message} (RequestId: ${err.requestId})`);
  } else {
    // 其他错误：记录简要信息
    console.error(`${context}: ${err?.message || err?.toString() || 'Unknown error'}`);
  }
}

// 提取Markdown内容 - 直接组合markdownContent
function extractMarkdownFromParserResult(data: any): string {
  if (!data?.data?.layouts) return '';
  
  let markdown = '';
  const layouts = data.data.layouts;
  
  for (const layout of layouts) {
    // 直接使用markdownContent，如果没有则使用text
    if (layout.markdownContent) {
      markdown += layout.markdownContent + '\n\n';
    } else if (layout.text) {
      markdown += layout.text + '\n\n';
    }
  }
  
  return markdown.trim();
}

// 简化解析结果 - 保留核心信息
function simplifyParserResult(data: any): any {
  if (!data?.data?.layouts) return { layouts: [] };
  
  const simplifiedLayouts = data.data.layouts.map((layout: any) => {
    const simplified: any = {
      type: layout.type,
      subType: layout.subType,
      text: layout.text,
      markdownContent: layout.markdownContent,
      pageNum: layout.pageNum
    };
    
    // 如果是表格，保留关键信息
    if (layout.type === 'table') {
      simplified.tableInfo = {
        rows: layout.numRow,
        cols: layout.numCol,
        markdownContent: layout.markdownContent,
        llmResult: layout.llmResult
      };
    }
    
    // 如果是图片，保留图片信息
    if (layout.type === 'figure') {
      simplified.imageInfo = {
        markdownContent: layout.markdownContent,
        uniqueId: layout.uniqueId
      };
    }
    
    return simplified;
  });
  
  return {
    layouts: simplifiedLayouts,
    summary: {
      totalElements: simplifiedLayouts.length,
      titles: simplifiedLayouts.filter((l: any) => l.type === 'title').length,
      texts: simplifiedLayouts.filter((l: any) => l.type === 'text').length,
      tables: simplifiedLayouts.filter((l: any) => l.type === 'table').length,
      images: simplifiedLayouts.filter((l: any) => l.type === 'figure').length
    }
  };
}

const app = express();
app.use(express.json({ limit: '20mb' }));

// 统一JSON解析错误返回
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && err.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, code: 'INVALID_JSON', message: '请求体不是合法JSON，请检查引号、逗号、花括号是否正确', detail: err.message });
    return;
  }
  if (err instanceof SyntaxError && (err as any).status === 400) {
    res.status(400).json({ success: false, code: 'INVALID_JSON', message: '请求体不是合法JSON', detail: err.message });
    return;
  }
  next(err);
});

// 配置multer用于文件上传
const upload = multer({ dest: 'uploads/' });

// 从环境变量读取IP白名单
const allowedIPs = (process.env.ALLOWED_IPS || '127.0.0.1,::1').split(',').map(ip => ip.trim());

// 应用IP白名单中间件（除了健康检查）
app.use((req, res, next) => {
  if (req.path === '/health') {
    next();
  } else {
    ipWhitelistMiddleware(allowedIPs)(req, res, next);
  }
});

// 如果请求未携带我们定义的 Bearer token，则自动回退到阿里云默认凭证链（可通过环境开关禁用）
app.use((req, _res, next) => {
  if (!req.headers.authorization && !req.user) {
    try {
      const allowDefault = String(process.env.ALLOW_DEFAULT_CREDENTIALS || 'true') === 'true';
      if (allowDefault) {
        const cred = loadDefaultCredentials();
        req.user = {
          accessKeyId: cred.accessKeyId,
          accessKeySecret: cred.accessKeySecret,
          securityToken: cred.securityToken,
          regionId: process.env.ALIBABA_CLOUD_REGION_ID || 'cn-hangzhou',
          endpoint: process.env.DOCMIND_ENDPOINT || 'docmind-api.cn-hangzhou.aliyuncs.com',
        };
      }
    } catch {
      // 若无法从默认链获取凭证，保持为空，让后续中间件报鉴权错误或使用STS流程
    }
  }
  next();
});

// 鉴权API：获取访问token
app.post('/api/auth/token', async (req, res) => {
  try {
    const { accessKeyId, accessKeySecret, regionId, endpoint } = req.body;
    
    if (!accessKeyId || !accessKeySecret) {
      res.status(400).json({ 
        error: 'MISSING_CREDENTIALS', 
        message: 'accessKeyId 和 accessKeySecret 必填' 
      });
      return;
    }

    // 生成token
    const authResponse = generateAuthToken({
      accessKeyId,
      accessKeySecret,
      regionId,
      endpoint,
    });

    res.json({ 
      success: true, 
      data: authResponse 
    });
  } catch (err: any) {
    logError('生成token失败', err);
    res.status(500).json({ 
      error: 'TOKEN_GENERATION_FAILED', 
      message: err?.message || '生成token失败' 
    });
  }
});

// STS 鉴权：返回阿里云临时凭证（AK/SK/Token）
app.post('/api/auth/sts', async (req, res) => {
  try {
    const { accessKeyId, accessKeySecret, roleArn, roleSessionName, durationSeconds, endpoint, regionId } = req.body || {};
    if (!accessKeyId || !accessKeySecret || !roleArn || !roleSessionName) {
      res.status(400).json({
        error: 'MISSING_PARAMS',
        message: 'accessKeyId、accessKeySecret、roleArn、roleSessionName 必填'
      });
      return;
    }
    const creds = await assumeRole({
      accessKeyId,
      accessKeySecret,
      roleArn,
      roleSessionName,
      durationSeconds,
      endpoint,
      regionId,
    });

    // 构建完整的凭证对象
    const fullCredentials = {
      accessKeyId: creds.AccessKeyId,
      accessKeySecret: creds.AccessKeySecret,
      securityToken: creds.SecurityToken,
      expiration: creds.Expiration,
      regionId: regionId || 'cn-hangzhou',
      endpoint: endpoint || 'docmind-api.cn-hangzhou.aliyuncs.com'
    };

    // 生成base64编码的token供用户保存
    const token = Buffer.from(JSON.stringify(fullCredentials)).toString('base64');
    const nowTs = Date.now();
    const expiresAtIso = creds.Expiration;
    const expiresAtTs = Number.isFinite(Date.parse(expiresAtIso)) ? Date.parse(expiresAtIso) : undefined;

    res.json({ 
      success: true, 
      data: {
        token, // 用户需要保存这个token，后续API调用时使用
        credentials: fullCredentials, // 原始凭证信息（可选，用于调试）
        expiresAt: expiresAtIso,
        expiresAtTs, // 过期时间（时间戳，毫秒）
        serverTimeTs: nowTs // 服务器当前时间（时间戳，毫秒）
      }
    });
  } catch (err: any) {
    logError('STS AssumeRole 失败', err);
    res.status(500).json({ error: 'STS_FAILED', message: err?.message || 'AssumeRole 调用失败' });
  }
});

// 腾讯云认证：生成腾讯云访问token
app.post('/api/tencent/auth', async (req, res) => {
  try {
    const { secretId, secretKey, region, endpoint } = req.body;
    
    if (!secretId || !secretKey) {
      res.status(400).json({ 
        error: 'MISSING_CREDENTIALS', 
        message: 'secretId 和 secretKey 必填' 
      });
      return;
    }

    // 生成腾讯云凭证token
    const credentials: TencentCredentials = {
      secretId,
      secretKey,
      region: region || 'ap-guangzhou',
      endpoint: endpoint || 'docai.tencentcloudapi.com'
    };

    // 生成base64编码的token供用户保存
    const token = Buffer.from(JSON.stringify(credentials)).toString('base64');
    const nowTs = Date.now();

    res.json({ 
      success: true, 
      data: {
        token, // 用户需要保存这个token，后续API调用时使用
        credentials, // 原始凭证信息（可选，用于调试）
        serverTimeTs: nowTs // 服务器当前时间（时间戳，毫秒）
      }
    });
  } catch (err: any) {
    logError('生成腾讯云token失败', err);
    res.status(500).json({ 
      error: 'TENCENT_TOKEN_GENERATION_FAILED', 
      message: err?.message || '生成腾讯云token失败' 
    });
  }
});

// 通过URL提交文档结构化任务
app.post('/api/submit/url', tokenAuthMiddleware, async (req, res) => {
  try {
    const {
      fileUrl,
      fileName,
      imageStorage,
      enableSemantic,
      connectTimeout,
      readTimeout
    } = req.body;

    if (!fileUrl || !fileName) {
      res.status(400).json({
        error: 'MISSING_PARAMS',
        message: 'fileUrl 与 fileName 必填'
      });
      return;
    }

    // 使用用户提供的阿里云临时凭证
    const credentials: any = {
      accessKeyId: req.user!.accessKeyId,
      accessKeySecret: req.user!.accessKeySecret,
      regionId: req.user!.regionId,
      endpoint: req.user!.endpoint,
    };
    
    // 只有当securityToken存在时才添加
    if (req.user!.securityToken) {
      credentials.securityToken = req.user!.securityToken;
    }

    const options = {
      ...(imageStorage && { imageStorage }),
      ...(enableSemantic !== undefined && { enableSemantic }),
      ...(connectTimeout && { connectTimeout }),
      ...(readTimeout && { readTimeout }),
    };

    const data = await submitStructureByUrl(credentials, fileUrl, fileName, options);
    res.json({ success: true, data });
  } catch (err: any) {
    logError('URL提交任务失败', err);
    if (err?.aliyun) {
      res.status(err.statusCode || 500).json({ success: false, code: err.code, message: err.message, requestId: err.requestId });
    } else {
      res.status(500).json({ error: 'SUBMIT_FAILED', message: err?.message || '提交任务失败' });
    }
  }
});

// 通过文件上传提交文档结构化任务
app.post('/api/submit/upload', upload.single('file'), tokenAuthMiddleware, async (req, res) => {
  try {
    const { 
      fileName, 
      imageStorage, 
      enableSemantic, 
      connectTimeout, 
      readTimeout 
    } = req.body;
    const file = req.file;
    
    if (!file) {
      res.status(400).json({ 
        error: 'NO_FILE', 
        message: '请上传文件' 
      });
      return;
    }
    
          const credentials: any = {
            accessKeyId: req.user!.accessKeyId,
            accessKeySecret: req.user!.accessKeySecret,
            regionId: req.user!.regionId,
            endpoint: req.user!.endpoint,
          };
          
          // 只有当securityToken存在时才添加
          if (req.user!.securityToken) {
            credentials.securityToken = req.user!.securityToken;
          }
    
    const options = {
      ...(imageStorage && { imageStorage }),
      ...(enableSemantic !== undefined && { enableSemantic }),
      ...(connectTimeout && { connectTimeout }),
      ...(readTimeout && { readTimeout }),
    };
    
    const stream = fs.createReadStream(file.path);
    const data = await submitStructureByStream(credentials, stream, fileName || file.originalname, options);
    
    // 清理临时文件
    fs.unlinkSync(file.path);
    
    res.json({ success: true, data });
  } catch (err: any) {
    logError('文件上传任务失败', err);
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    if (err?.aliyun) {
      res.status(err.statusCode || 500).json({ success: false, code: err.code, message: err.message, requestId: err.requestId });
    } else {
      res.status(500).json({ error: 'SUBMIT_FAILED', message: err?.message || '提交任务失败' });
    }
  }
});

// 查询任务结果
app.post('/api/result', tokenAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      res.status(400).json({ 
        error: 'MISSING_PARAMS', 
        message: 'id 必填' 
      });
      return;
    }
    
          const credentials: any = {
            accessKeyId: req.user!.accessKeyId,
            accessKeySecret: req.user!.accessKeySecret,
            regionId: req.user!.regionId,
            endpoint: req.user!.endpoint,
          };
          
          // 只有当securityToken存在时才添加
          if (req.user!.securityToken) {
            credentials.securityToken = req.user!.securityToken;
          }
    
    const result = await getStructureResult(credentials, id);
    res.json({ success: true, data: result });
  } catch (err: any) {
    logError('查询结果失败', err);
    if (err?.aliyun) {
      res.status(err.statusCode || 500).json({ success: false, code: err.code, message: err.message, requestId: err.requestId });
    } else {
      res.status(500).json({ error: 'QUERY_FAILED', message: err?.message || '查询结果失败' });
    }
  }
});

// (已精简) 不提供结构化等待接口，保持纯异步

// ===================== Parser 路由 =====================

// 提交解析（URL）
app.post('/api/parser/submit/url', tokenAuthMiddleware, async (req, res) => {
  try {
    const { 
      fileUrl, 
      fileName, 
      connectTimeout, 
      readTimeout,
      formulaEnhancement,
      llmEnhancement,
      option,
      ossBucket,
      ossEndpoint,
      pageIndex,
      outputHtmlTable,
      multimediaParameters,
      vlParsePrompt
    } = req.body;
    if (!fileUrl || !fileName) {
      res.status(400).json({ error: 'MISSING_PARAMS', message: 'fileUrl 与 fileName 必填' });
      return;
    }
    const credentials: any = {
      accessKeyId: req.user!.accessKeyId,
      accessKeySecret: req.user!.accessKeySecret,
      regionId: req.user!.regionId,
      endpoint: req.user!.endpoint,
    };
    if (req.user!.securityToken) credentials.securityToken = req.user!.securityToken;
    const data = await submitParserByUrl(credentials, fileUrl, fileName, { 
      connectTimeout, 
      readTimeout,
      formulaEnhancement,
      llmEnhancement,
      option,
      ossBucket,
      ossEndpoint,
      pageIndex,
      outputHtmlTable,
      multimediaParameters,
      vlParsePrompt
    });
    res.json({ success: true, data });
  } catch (err: any) {
    logError('Parser URL提交任务失败', err);
    if (err?.aliyun) {
      res.status(err.statusCode || 500).json({ success: false, code: err.code, message: err.message, requestId: err.requestId });
    } else {
      res.status(500).json({ error: 'SUBMIT_PARSER_FAILED', message: err?.message || '提交解析任务失败' });
    }
  }
});

// 提交解析（文件上传）
app.post('/api/parser/submit/upload', upload.single('file'), tokenAuthMiddleware, async (req, res) => {
  try {
    const { 
      fileName, 
      connectTimeout, 
      readTimeout,
      formulaEnhancement,
      llmEnhancement,
      option,
      ossBucket,
      ossEndpoint,
      pageIndex,
      outputHtmlTable,
      multimediaParameters,
      vlParsePrompt
    } = req.body;
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'NO_FILE', message: '请上传文件' });
      return;
    }
    const credentials: any = {
      accessKeyId: req.user!.accessKeyId,
      accessKeySecret: req.user!.accessKeySecret,
      regionId: req.user!.regionId,
      endpoint: req.user!.endpoint,
    };
    if (req.user!.securityToken) credentials.securityToken = req.user!.securityToken;
    const stream = fs.createReadStream(file.path);
    const data = await submitParserByStream(credentials, stream, fileName || file.originalname, { 
      connectTimeout, 
      readTimeout,
      formulaEnhancement,
      llmEnhancement,
      option,
      ossBucket,
      ossEndpoint,
      pageIndex,
      outputHtmlTable,
      multimediaParameters,
      vlParsePrompt
    });
    fs.unlinkSync(file.path);
    res.json({ success: true, data });
  } catch (err: any) {
    logError('Parser 文件上传任务失败', err);
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch {} }
    if (err?.aliyun) {
      res.status(err.statusCode || 500).json({ success: false, code: err.code, message: err.message, requestId: err.requestId });
    } else {
      res.status(500).json({ error: 'SUBMIT_PARSER_FAILED', message: err?.message || '提交解析任务失败' });
    }
  }
});

// 查询解析状态
app.post('/api/parser/status', tokenAuthMiddleware, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      res.status(400).json({ error: 'MISSING_PARAMS', message: 'id 必填' });
      return;
    }
    const credentials: any = {
      accessKeyId: req.user!.accessKeyId,
      accessKeySecret: req.user!.accessKeySecret,
      regionId: req.user!.regionId,
      endpoint: req.user!.endpoint,
    };
    if (req.user!.securityToken) credentials.securityToken = req.user!.securityToken;
    const data = await queryParserStatus(credentials, id);
    res.json({ success: true, data });
  } catch (err: any) {
    logError('查询解析状态失败', err);
    if (err?.aliyun) {
      res.status(err.statusCode || 500).json({ success: false, code: err.code, message: err.message, requestId: err.requestId });
    } else {
      res.status(500).json({ error: 'QUERY_PARSER_STATUS_FAILED', message: err?.message || '查询解析状态失败' });
    }
  }
});

// 获取解析结果
app.post('/api/parser/result', tokenAuthMiddleware, async (req, res) => {
  try {
    const { id, layoutStepSize, layoutNum, format = 'json', getAllPages = false } = req.body;
    if (!id) {
      res.status(400).json({ error: 'MISSING_PARAMS', message: 'id 必填' });
      return;
    }
    const credentials: any = {
      accessKeyId: req.user!.accessKeyId,
      accessKeySecret: req.user!.accessKeySecret,
      regionId: req.user!.regionId,
      endpoint: req.user!.endpoint,
    };
    if (req.user!.securityToken) credentials.securityToken = req.user!.securityToken;
    
    let data;
    if (getAllPages) {
      // 如果要求获取所有页面，持续获取直到没有更多数据
      const statusData = await queryParserStatus(credentials, id);
      const allLayouts: any[] = [];
      const pageSize = layoutStepSize || 100; // 每页获取100个元素
      let pageNum = 0;
      let hasMoreData = true;
      
      // 持续获取数据直到没有更多内容
      while (hasMoreData) {
        const pageData = await getParserResult(credentials, id, { layoutStepSize: pageSize, layoutNum: pageNum });
        
        if (pageData.data?.layouts && pageData.data.layouts.length > 0) {
          allLayouts.push(...pageData.data.layouts);
          pageNum++;
        } else {
          hasMoreData = false;
        }
        
        // 防止无限循环，最多获取100页
        if (pageNum >= 100) {
          console.warn(`已获取${pageNum}页数据，可能存在数据丢失`);
          break;
        }
      }
      
      // 合并所有页面的数据
      data = {
        ...statusData,
        data: {
          ...statusData.data,
          layouts: allLayouts,
          totalPages: pageNum // 记录实际获取的页数
        }
      };
    } else {
      // 正常获取指定页面的数据
      data = await getParserResult(credentials, id, { layoutStepSize, layoutNum });
    }
    
    // 根据format参数返回不同格式的结果
    if (format === 'markdown') {
      const markdownContent = extractMarkdownFromParserResult(data);
      res.json({ 
        success: true, 
        data: {
          format: 'markdown',
          content: markdownContent,
          originalData: data // 保留原始数据供调试使用
        }
      });
    } else if (format === 'simplified') {
      const simplifiedData = simplifyParserResult(data);
      res.json({ 
        success: true, 
        data: {
          format: 'simplified',
          content: simplifiedData,
          originalData: data // 保留原始数据供调试使用
        }
      });
    } else {
      // 默认返回完整的JSON格式
      res.json({ success: true, data });
    }
  } catch (err: any) {
    logError('获取解析结果失败', err);
    if (err?.aliyun) {
      res.status(err.statusCode || 500).json({ success: false, code: err.code, message: err.message, requestId: err.requestId });
    } else {
      res.status(500).json({ error: 'GET_PARSER_RESULT_FAILED', message: err?.message || '获取解析结果失败' });
    }
  }
});

// ==================== 腾讯云文档解析接口 ====================

// 腾讯云文档解析：通过URL提交任务
app.post('/api/tencent/parser/submit/url', tencentAuthMiddleware, async (req, res) => {
  try {
    const {
      fileUrl,
      fileName,
      fileType,
      fileStartPageNumber,
      fileEndPageNumber,
      config
    } = req.body;

    if (!fileUrl) {
      res.status(400).json({
        error: 'MISSING_PARAMS',
        message: 'fileUrl 必填'
      });
      return;
    }

    // 使用腾讯云凭证
    const credentials = req.tencentUser!;

    // 创建解析任务
    const result = await createTencentParserTask(credentials, {
      fileType: fileType || 'PDF',
      fileUrl,
      fileStartPageNumber,
      fileEndPageNumber,
      config
    });

    res.json({
      success: true,
      data: {
        taskId: result.TaskId,
        fileName: fileName || 'document',
        fileUrl,
        fileType: fileType || 'PDF',
        status: 'processing',
        requestId: result.RequestId
      }
    });
  } catch (err: any) {
    logError('腾讯云文档解析任务提交失败', err);
    res.status(500).json({
      error: 'TENCENT_PARSER_SUBMIT_FAILED',
      message: err?.message || '腾讯云文档解析任务提交失败'
    });
  }
});

// 腾讯云文档解析：获取解析结果（包含状态查询）
app.post('/api/tencent/parser/result', tencentAuthMiddleware, async (req, res) => {
  try {
    const { taskId, format } = req.body;

    if (!taskId) {
      res.status(400).json({
        error: 'MISSING_PARAMS',
        message: 'taskId 必填'
      });
      return;
    }

    // 使用腾讯云凭证
    const credentials = req.tencentUser!;

    // 获取解析结果
    const result = await getTencentParserResult(credentials, taskId);

    // 根据format参数返回不同格式的结果
    if (format === 'markdown') {
      // 提取Markdown内容
      const markdownContent = extractMarkdownFromTencentResult(result);
      res.json({
        success: true,
        data: {
          format: 'markdown',
          content: markdownContent,
          originalData: result
        }
      });
    } else if (format === 'simplified') {
      // 简化结果
      const simplifiedData = simplifyTencentResult(result);
      res.json({
        success: true,
        data: {
          format: 'simplified',
          content: simplifiedData,
          originalData: result
        }
      });
    } else {
      // 默认返回完整的JSON格式
      res.json({ success: true, data: result });
    }
  } catch (err: any) {
    logError('获取腾讯云解析结果失败', err);
    res.status(500).json({
      error: 'TENCENT_PARSER_RESULT_FAILED',
      message: err?.message || '获取腾讯云解析结果失败'
    });
  }
});

// 提取腾讯云结果的Markdown内容
function extractMarkdownFromTencentResult(data: any): string {
  if (!data) return '';
  
  let markdown = '';
  
  // 根据腾讯云官方文档，结果是一个ZIP文件的下载链接
  // 这里返回下载链接信息，实际内容需要下载ZIP文件后解析
  if (data.DocumentRecognizeResultUrl) {
    markdown += `# 文档解析结果\n\n`;
    markdown += `**状态**: ${data.Status}\n\n`;
    markdown += `**下载链接**: ${data.DocumentRecognizeResultUrl}\n\n`;
    markdown += `**说明**: 解析结果已打包为ZIP文件，请下载后解压查看Markdown内容。\n\n`;
    
    if (data.Usage) {
      markdown += `**使用量信息**:\n`;
      markdown += `- 页数: ${data.Usage.PageNumber || 0}\n`;
      markdown += `- Token数: ${data.Usage.TotalTokens || 0}\n\n`;
    }
    
    if (data.FailedPages && data.FailedPages.length > 0) {
      markdown += `**失败页面**: ${data.FailedPages.map((page: any) => page.PageNumber).join(', ')}\n\n`;
    }
    
    if (data.Error) {
      markdown += `**错误信息**: ${data.Error.Message}\n\n`;
    }
  }
  
  return markdown.trim();
}

// 简化腾讯云结果
function simplifyTencentResult(data: any): any {
  if (!data) return {};
  
  return {
    status: data.Status || 'Unknown',
    downloadUrl: data.DocumentRecognizeResultUrl || '',
    failedPages: data.FailedPages || [],
    usage: data.Usage || {},
    error: data.Error || null,
    requestId: data.RequestId || '',
    summary: {
      status: data.Status || 'Unknown',
      hasDownloadUrl: !!data.DocumentRecognizeResultUrl,
      failedPageCount: data.FailedPages ? data.FailedPages.length : 0,
      pageNumber: data.Usage ? data.Usage.PageNumber : 0,
      totalTokens: data.Usage ? data.Usage.TotalTokens : 0,
      hasError: !!data.Error
    }
  };
}

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const cfg = loadConfig();
app.listen(cfg.port, '0.0.0.0', () => {
  console.log(`阿里云文档智能代理服务启动成功！`);
  console.log(`本地访问: http://localhost:${cfg.port}`);
  console.log(`健康检查: http://localhost:${cfg.port}/health`);
});


