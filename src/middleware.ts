import { Request, Response, NextFunction } from 'express';
import { verifyAuthToken, extractTokenFromHeader } from './auth';
import { TencentCredentials } from './openapi/tencentClient';

// IP白名单中间件
export function ipWhitelistMiddleware(allowedIPs: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const forwardedIP = req.headers['x-forwarded-for'] as string;
    const realIP = req.headers['x-real-ip'] as string;
    
    // 获取真实IP（考虑代理情况）
    const actualIP = realIP || (forwardedIP ? forwardedIP.split(',')[0]?.trim() : clientIP);
    
    if (!actualIP) {
      res.status(403).json({ 
        error: 'IP_NOT_DETECTED', 
        message: '无法检测到客户端IP地址' 
      });
      return;
    }

    // 检查IP是否在白名单中
    const isAllowed = allowedIPs.some(allowedIP => {
      if (allowedIP.includes('/')) {
        // CIDR格式支持
        return isIPInCIDR(actualIP, allowedIP);
      }
      return actualIP === allowedIP;
    });

    if (!isAllowed) {
      console.log(`IP ${actualIP} 不在白名单中`);
      res.status(403).json({ 
        error: 'IP_NOT_ALLOWED', 
        message: `IP地址 ${actualIP} 不在允许列表中` 
      });
      return;
    }

    next();
  };
}

// 阿里云临时凭证验证中间件
export function tokenAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({
        error: 'AUTH_FAILED',
        message: 'Authorization header is required'
      });
      return;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res.status(401).json({
        error: 'AUTH_FAILED',
        message: 'Invalid authorization header format. Expected: Bearer <token>'
      });
      return;
    }

    const token = parts[1];
    if (!token) {
      res.status(401).json({
        error: 'AUTH_FAILED',
        message: 'Token is missing from authorization header'
      });
      return;
    }

    // 解析阿里云临时凭证JSON
    let credentials;
    try {
      credentials = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    } catch (parseError) {
      res.status(401).json({
        error: 'AUTH_FAILED',
        message: 'Invalid token format'
      });
      return;
    }

    // 验证必需字段
    if (!credentials.accessKeyId || !credentials.accessKeySecret) {
      res.status(401).json({
        error: 'AUTH_FAILED',
        message: 'Missing accessKeyId or accessKeySecret in token'
      });
      return;
    }

    // 将用户凭证添加到请求对象
    req.user = {
      accessKeyId: credentials.accessKeyId,
      accessKeySecret: credentials.accessKeySecret,
      securityToken: credentials.securityToken || undefined,
      regionId: credentials.regionId || undefined,
      endpoint: credentials.endpoint || undefined,
    };

    next();
  } catch (error: any) {
    res.status(401).json({
      error: 'AUTH_FAILED',
      message: error.message || '认证失败'
    });
  }
}

// 简单的CIDR检查函数
function isIPInCIDR(ip: string, cidr: string): boolean {
  try {
    const [network, prefixLength] = cidr.split('/');
    if (!network || !prefixLength) {
      return false;
    }
    const ipNum = ipToNumber(ip);
    const networkNum = ipToNumber(network);
    const mask = (0xffffffff << (32 - parseInt(prefixLength))) >>> 0;
    
    return (ipNum & mask) === (networkNum & mask);
  } catch {
    return false;
  }
}

function ipToNumber(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

// 腾讯云凭证验证中间件
export function tencentAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({
        error: 'AUTH_FAILED',
        message: 'Authorization header is required'
      });
      return;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res.status(401).json({
        error: 'AUTH_FAILED',
        message: 'Invalid authorization header format. Expected: Bearer <token>'
      });
      return;
    }

    const token = parts[1];
    if (!token) {
      res.status(401).json({
        error: 'AUTH_FAILED',
        message: 'Token is missing from authorization header'
      });
      return;
    }

    // 解析腾讯云凭证JSON
    let credentials: TencentCredentials;
    try {
      credentials = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    } catch (parseError) {
      res.status(401).json({
        error: 'AUTH_FAILED',
        message: 'Invalid token format'
      });
      return;
    }

    // 验证必需字段
    if (!credentials.secretId || !credentials.secretKey) {
      res.status(401).json({
        error: 'AUTH_FAILED',
        message: 'Missing secretId or secretKey in token'
      });
      return;
    }

    // 将腾讯云凭证添加到请求对象
    req.tencentUser = credentials;

    next();
  } catch (error: any) {
    res.status(401).json({
      error: 'AUTH_FAILED',
      message: error.message || '腾讯云认证失败'
    });
  }
}

// 扩展Request类型
declare global {
  namespace Express {
    interface Request {
      user?: {
        accessKeyId: string;
        accessKeySecret: string;
        securityToken?: string | undefined;
        regionId?: string | undefined;
        endpoint?: string | undefined;
      };
      tencentUser?: TencentCredentials;
    }
  }
}
