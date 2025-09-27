import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import path from 'path';
import { submitStructureByStream, submitStructureByUrl, waitForResult, DocmindClientOptions } from './openapi/docmindClient';

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .command('structure <file>', '提交文档结构化任务（本地文件）', (y) =>
      y
        .positional('file', { type: 'string', describe: '本地文件路径' })
        .option('accessKeyId', { type: 'string', describe: '阿里云AccessKey ID', demandOption: true })
        .option('accessKeySecret', { type: 'string', describe: '阿里云AccessKey Secret', demandOption: true })
        .option('regionId', { type: 'string', describe: '地域ID', default: 'cn-hangzhou' })
        .option('endpoint', { type: 'string', describe: '服务端点', default: 'docmind-api.cn-hangzhou.aliyuncs.com' })
    )
    .command('structure-url <url> <name>', '通过 URL 提交任务', (y) =>
      y
        .positional('url', { type: 'string', describe: '可公网访问的文件 URL' })
        .positional('name', { type: 'string', describe: '文件名（带后缀）' })
        .option('accessKeyId', { type: 'string', describe: '阿里云AccessKey ID', demandOption: true })
        .option('accessKeySecret', { type: 'string', describe: '阿里云AccessKey Secret', demandOption: true })
        .option('regionId', { type: 'string', describe: '地域ID', default: 'cn-hangzhou' })
        .option('endpoint', { type: 'string', describe: '服务端点', default: 'docmind-api.cn-hangzhou.aliyuncs.com' })
    )
    .command('wait <id>', '轮询等待任务完成并输出结果', (y) =>
      y
        .positional('id', { type: 'string', describe: '任务ID' })
        .option('accessKeyId', { type: 'string', describe: '阿里云AccessKey ID', demandOption: true })
        .option('accessKeySecret', { type: 'string', describe: '阿里云AccessKey Secret', demandOption: true })
        .option('regionId', { type: 'string', describe: '地域ID', default: 'cn-hangzhou' })
        .option('endpoint', { type: 'string', describe: '服务端点', default: 'docmind-api.cn-hangzhou.aliyuncs.com' })
        .option('intervalMs', { type: 'number', describe: '轮询间隔（毫秒）', default: 2000 })
        .option('maxWaitMs', { type: 'number', describe: '最大等待时间（毫秒）', default: 120000 })
    )
    .demandCommand(1)
    .help()
    .strict()
    .parse();

  const [cmd] = argv._;
  const credentials: DocmindClientOptions = {
    accessKeyId: argv.accessKeyId as string,
    accessKeySecret: argv.accessKeySecret as string,
    regionId: argv.regionId as string,
    endpoint: argv.endpoint as string,
  };

  if (cmd === 'structure') {
    const file = argv.file as string;
    const abs = path.resolve(process.cwd(), file);
    if (!fs.existsSync(abs)) {
      console.error('文件不存在: ' + abs);
      process.exit(1);
    }
    const stream = fs.createReadStream(abs);
    const res = await submitStructureByStream(credentials, stream, path.basename(abs));
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'structure-url') {
    const url = argv.url as string;
    const name = argv.name as string;
    const res = await submitStructureByUrl(credentials, url, name);
    console.log(JSON.stringify(res, null, 2));
  } else if (cmd === 'wait') {
    const id = argv.id as string;
    const res = await waitForResult(credentials, id, { 
      intervalMs: argv.intervalMs as number, 
      maxWaitMs: argv.maxWaitMs as number 
    });
    console.log(JSON.stringify(res, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


