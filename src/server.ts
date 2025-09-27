import express from 'express';
import { loadConfig } from './config';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { submitStructureByStream, submitStructureByUrl, getStructureResult, submitParserByUrl, submitParserByStream, queryParserStatus, getParserResult } from './openapi/docmindClient';
import { assumeRole } from './openapi/stsClient';
import { generateAuthToken } from './auth';
import { ipWhitelistMiddleware, tokenAuthMiddleware } from './middleware';
import { loadDefaultCredentials } from './openapi/credentials';

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

// 提取Markdown内容 - 完整保留所有医疗信息
function extractMarkdownFromParserResult(data: any): string {
  if (!data?.data?.layouts) return '';
  
  let markdown = '';
  const layouts = data.data.layouts;
  
  for (const layout of layouts) {
    // 优先使用markdownContent，如果没有则使用text
    if (layout.markdownContent) {
      markdown += layout.markdownContent + '\n\n';
    } else if (layout.text) {
      // 根据类型添加适当的格式
      if (layout.type === 'title') {
        markdown += `# ${layout.text.trim()}\n\n`;
      } else if (layout.type === 'table') {
        // 表格内容保持原样
        markdown += layout.text + '\n\n';
      } else {
        markdown += layout.text + '\n\n';
      }
    }
    
    // 对于表格类型，额外提取结构化数据
    if (layout.type === 'table' && layout.llmResult && layout.llmResult !== layout.markdownContent) {
      markdown += '## 结构化表格数据\n' + layout.llmResult + '\n\n';
    }
    
    // 对于表格，也提取cells中的详细信息
    if (layout.type === 'table' && layout.cells && layout.cells.length > 0) {
      markdown += '## 表格详细数据\n';
      for (const cell of layout.cells) {
        if (cell.layouts && cell.layouts.length > 0) {
          for (const cellLayout of cell.layouts) {
            if (cellLayout.text && cellLayout.text.trim()) {
              markdown += `- ${cellLayout.text.trim()}\n`;
            }
          }
        }
      }
      markdown += '\n';
    }
  }
  
  return markdown.trim();
}

// 简化解析结果 - 完整保留所有医疗信息
function simplifyParserResult(data: any): any {
  if (!data?.data?.layouts) return { layouts: [] };
  
  const simplifiedLayouts = data.data.layouts.map((layout: any) => {
    const simplified: any = {
      type: layout.type,
      subType: layout.subType,
      level: layout.level,
      text: layout.text,
      markdownContent: layout.markdownContent,
      pageNum: layout.pageNum
    };
    
    // 保留所有表格信息
    if (layout.type === 'table') {
      simplified.tableInfo = {
        rows: layout.numRow,
        cols: layout.numCol,
        markdownContent: layout.markdownContent,
        llmResult: layout.llmResult
      };
      
      // 保留完整的表格数据
      if (layout.cells && layout.cells.length > 0) {
        simplified.tableData = layout.cells.map((cell: any) => {
          if (cell.layouts && cell.layouts.length > 0) {
            return cell.layouts.map((cellLayout: any) => ({
              text: cellLayout.text,
              type: cellLayout.type,
              alignment: cellLayout.alignment
            })).filter((item: any) => item.text);
          }
          return [];
        }).flat();
      }
    }
    
    // 保留图片信息
    if (layout.type === 'figure') {
      simplified.imageInfo = {
        markdownContent: layout.markdownContent,
        uniqueId: layout.uniqueId
      };
    }
    
    // 保留所有文本内容，不进行过滤
    if (layout.type === 'text' && layout.text) {
      simplified.medicalContent = true; // 标记为医疗内容
      simplified.originalText = layout.text;
    }
    
    // 保留所有blocks信息（用于详细文本分析）
    if (layout.blocks && layout.blocks.length > 0) {
      simplified.blocks = layout.blocks.map((block: any) => ({
        text: block.text,
        style: block.style
      }));
    }
    
    return simplified;
  });
  
  // 提取完整的医疗信息摘要
  const medicalInfo = {
    patientInfo: [] as string[],
    testResults: [] as string[],
    medications: [] as string[],
    recommendations: [] as string[],
    allText: [] as string[] // 保留所有文本内容
  };
  
  // 分析所有内容，提取医疗信息
  simplifiedLayouts.forEach((layout: any) => {
    if (layout.text) {
      medicalInfo.allText.push(layout.text.trim());
      
      const text = layout.text;
      
      // 提取患者信息
      if (text.includes('姓名') || text.includes('性别') || text.includes('年龄') || text.includes('身份证')) {
        medicalInfo.patientInfo.push(text.trim());
      }
      
      // 提取检查结果
      if (text.includes('血压') || text.includes('心率') || text.includes('正常') || text.includes('异常')) {
        medicalInfo.testResults.push(text.trim());
      }
      
      // 提取用药信息
      if (text.includes('用药') || text.includes('处方') || text.includes('剂量')) {
        medicalInfo.medications.push(text.trim());
      }
      
      // 提取建议
      if (text.includes('建议') || text.includes('注意事项') || text.includes('复查')) {
        medicalInfo.recommendations.push(text.trim());
      }
    }
  });
  
  return {
    layouts: simplifiedLayouts,
    medicalInfo: medicalInfo,
    summary: {
      totalElements: simplifiedLayouts.length,
      titles: simplifiedLayouts.filter((l: any) => l.type === 'title').length,
      texts: simplifiedLayouts.filter((l: any) => l.type === 'text').length,
      tables: simplifiedLayouts.filter((l: any) => l.type === 'table').length,
      images: simplifiedLayouts.filter((l: any) => l.type === 'figure').length,
      medicalContent: simplifiedLayouts.filter((l: any) => l.medicalContent).length
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
    const { id, layoutStepSize, layoutNum, format = 'json' } = req.body;
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
    const data = await getParserResult(credentials, id, { layoutStepSize, layoutNum });
    
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


