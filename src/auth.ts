import jwt from 'jsonwebtoken';
import { loadConfig } from './config';

export interface AuthTokenPayload {
  accessKeyId: string;
  accessKeySecret: string;
  regionId?: string;
  endpoint?: string;
  iat: number;
  exp: number;
}

export interface AuthResponse {
  token: string;
  expiresIn: number;
  expiresAt: string;
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const TOKEN_EXPIRY = 24 * 60 * 60; // 24小时

export function generateAuthToken(credentials: {
  accessKeyId: string;
  accessKeySecret: string;
  regionId?: string;
  endpoint?: string;
}): AuthResponse {
  const now = Math.floor(Date.now() / 1000);
  const payload: AuthTokenPayload = {
    accessKeyId: credentials.accessKeyId,
    accessKeySecret: credentials.accessKeySecret,
    regionId: credentials.regionId || 'cn-hangzhou',
    endpoint: credentials.endpoint || 'docmind-api.cn-hangzhou.aliyuncs.com',
    iat: now,
    exp: now + TOKEN_EXPIRY,
  };

  const token = jwt.sign(payload, JWT_SECRET);
  const expiresAt = new Date((now + TOKEN_EXPIRY) * 1000).toISOString();

  return {
    token,
    expiresIn: TOKEN_EXPIRY,
    expiresAt,
  };
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
    return payload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

export function extractTokenFromHeader(authHeader?: string): string {
  if (!authHeader) {
    throw new Error('Authorization header is required');
  }
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new Error('Invalid authorization header format. Expected: Bearer <token>');
  }
  
  const token = parts[1];
  if (!token) {
    throw new Error('Token is missing from authorization header');
  }
  
  return token;
}
