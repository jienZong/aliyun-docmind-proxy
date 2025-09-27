# API 使用示例

## 完整的API调用流程

### 1. 获取访问Token

```bash
curl -X POST http://localhost:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "accessKeyId": "你的AccessKey ID",
    "accessKeySecret": "你的AccessKey Secret",
    "regionId": "cn-hangzhou",
    "endpoint": "docmind-api.cn-hangzhou.aliyuncs.com"
  }'
```

### 2. 提交文档处理任务（URL方式）

```bash
curl -X POST http://localhost:3000/api/submit/url \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "fileUrl": "https://example.com/sample.pdf",
    "fileName": "sample.pdf",
    "imageStorage": "base64",
    "enableSemantic": true,
    "connectTimeout": 60000,
    "readTimeout": 60000
  }'
```

### 3. 提交文档处理任务（文件上传方式）

```bash
curl -X POST http://localhost:3000/api/submit/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@./sample.pdf" \
  -F "fileName=sample.pdf" \
  -F "imageStorage=base64" \
  -F "enableSemantic=true" \
  -F "connectTimeout=60000" \
  -F "readTimeout=60000"
```

### 4. 查询任务结果

```bash
curl -X POST http://localhost:3000/api/result \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "id": "docmind-20220712-b15f****"
  }'
```

### 5. 等待任务完成

```bash
curl -X POST http://localhost:3000/api/result/wait \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "id": "docmind-20220712-b15f****",
    "intervalMs": 2000,
    "maxWaitMs": 120000
  }'
```

## JavaScript/Node.js 示例

```javascript
const axios = require('axios');

class DocMindClient {
  constructor(baseURL = 'http://localhost:3000') {
    this.baseURL = baseURL;
    this.token = null;
  }

  // 获取访问token
  async getToken(accessKeyId, accessKeySecret, regionId = 'cn-hangzhou', endpoint = 'docmind-api.cn-hangzhou.aliyuncs.com') {
    const response = await axios.post(`${this.baseURL}/api/auth/token`, {
      accessKeyId,
      accessKeySecret,
      regionId,
      endpoint
    });
    
    this.token = response.data.data.token;
    return this.token;
  }

  // 通过URL提交任务
  async submitByUrl(fileUrl, fileName, options = {}) {
    const response = await axios.post(`${this.baseURL}/api/submit/url`, {
      fileUrl,
      fileName,
      imageStorage: options.imageStorage || 'base64',
      enableSemantic: options.enableSemantic || false,
      connectTimeout: options.connectTimeout || 60000,
      readTimeout: options.readTimeout || 60000
    }, {
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });
    
    return response.data;
  }

  // 查询结果
  async getResult(taskId) {
    const response = await axios.post(`${this.baseURL}/api/result`, {
      id: taskId
    }, {
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });
    
    return response.data;
  }

  // 等待任务完成
  async waitForResult(taskId, options = {}) {
    const response = await axios.post(`${this.baseURL}/api/result/wait`, {
      id: taskId,
      intervalMs: options.intervalMs || 2000,
      maxWaitMs: options.maxWaitMs || 120000
    }, {
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });
    
    return response.data;
  }
}

// 使用示例
async function example() {
  const client = new DocMindClient();
  
  try {
    // 1. 获取token
    await client.getToken('你的AccessKey ID', '你的AccessKey Secret');
    
    // 2. 提交任务
    const submitResult = await client.submitByUrl(
      'https://example.com/sample.pdf',
      'sample.pdf',
      {
        imageStorage: 'base64',
        enableSemantic: true
      }
    );
    
    console.log('任务提交成功:', submitResult);
    const taskId = submitResult.data.data.id;
    
    // 3. 等待结果
    const result = await client.waitForResult(taskId);
    console.log('处理结果:', result);
    
  } catch (error) {
    console.error('处理失败:', error.response?.data || error.message);
  }
}

example();
```

## Python 示例

```python
import requests
import time

class DocMindClient:
    def __init__(self, base_url='http://localhost:3000'):
        self.base_url = base_url
        self.token = None
    
    def get_token(self, access_key_id, access_key_secret, region_id='cn-hangzhou', endpoint='docmind-api.cn-hangzhou.aliyuncs.com'):
        response = requests.post(f'{self.base_url}/api/auth/token', json={
            'accessKeyId': access_key_id,
            'accessKeySecret': access_key_secret,
            'regionId': region_id,
            'endpoint': endpoint
        })
        response.raise_for_status()
        
        self.token = response.json()['data']['token']
        return self.token
    
    def submit_by_url(self, file_url, file_name, **options):
        headers = {'Authorization': f'Bearer {self.token}'}
        data = {
            'fileUrl': file_url,
            'fileName': file_name,
            'imageStorage': options.get('imageStorage', 'base64'),
            'enableSemantic': options.get('enableSemantic', False),
            'connectTimeout': options.get('connectTimeout', 60000),
            'readTimeout': options.get('readTimeout', 60000)
        }
        
        response = requests.post(f'{self.base_url}/api/submit/url', json=data, headers=headers)
        response.raise_for_status()
        return response.json()
    
    def get_result(self, task_id):
        headers = {'Authorization': f'Bearer {self.token}'}
        response = requests.post(f'{self.base_url}/api/result', json={'id': task_id}, headers=headers)
        response.raise_for_status()
        return response.json()
    
    def wait_for_result(self, task_id, interval_ms=2000, max_wait_ms=120000):
        headers = {'Authorization': f'Bearer {self.token}'}
        data = {
            'id': task_id,
            'intervalMs': interval_ms,
            'maxWaitMs': max_wait_ms
        }
        
        response = requests.post(f'{self.base_url}/api/result/wait', json=data, headers=headers)
        response.raise_for_status()
        return response.json()

# 使用示例
def example():
    client = DocMindClient()
    
    try:
        # 1. 获取token
        client.get_token('你的AccessKey ID', '你的AccessKey Secret')
        
        # 2. 提交任务
        submit_result = client.submit_by_url(
            'https://example.com/sample.pdf',
            'sample.pdf',
            imageStorage='base64',
            enableSemantic=True
        )
        
        print('任务提交成功:', submit_result)
        task_id = submit_result['data']['data']['id']
        
        # 3. 等待结果
        result = client.wait_for_result(task_id)
        print('处理结果:', result)
        
    except Exception as e:
        print('处理失败:', str(e))

if __name__ == '__main__':
    example()
```

## 支持的文档格式

- PDF (.pdf)
- Word (.doc, .docx)
- PowerPoint (.ppt, .pptx)
- 文本文件 (.txt)
- HTML (.html)

## 注意事项

1. **文件大小限制**: 建议单个文件不超过100MB
2. **URL要求**: 文件URL必须公网可访问，无跨域限制
3. **Token有效期**: 24小时，过期后需要重新获取
4. **IP白名单**: 确保客户端IP在服务端白名单中
5. **超时设置**: 大文件建议设置较长的connectTimeout和readTimeout
