import Busboy from 'busboy';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const MAX_FILE = 10 * 1024 * 1024;
export const MAX_REQUEST = 55 * 1024 * 1024;
export class RequestError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const invalid = () => new RequestError('INVALID_REQUEST', 'Cấu trúc upload hoặc metadata không hợp lệ.');

export async function receiveMultipart(req, directory) {
  let parser;
  try { parser = Busboy({ headers: req.headers, limits: { files: 5, fields: 1, parts: 7, fileSize: MAX_FILE + 1, fieldSize: 8192, fieldNameSize: 100 } }); }
  catch { throw invalid(); }
  const files = [], writes = [], streams = [];
  let metadata, bad = false, requestBytes = 0, failure;
  parser.on('field', (name, value, info) => {
    if (name !== 'metadata' || metadata !== undefined || info.valueTruncated || info.nameTruncated) bad = true;
    else metadata = value;
  });
  parser.on('file', (name, stream) => {
    streams.push(stream);
    const index = files.length;
    const dir = join(directory, String(index));
    const item = { index, path: join(dir, 'input'), directory: dir, tooLarge: false };
    files.push(item);
    if (name !== 'photos') bad = true;
    stream.on('limit', () => { item.tooLarge = true; });
    let bytes = 0;
    const cap = new Transform({ transform(chunk, encoding, callback) {
      const remaining = Math.max(0, MAX_FILE - bytes);
      bytes += chunk.length;
      if (bytes > MAX_FILE) item.tooLarge = true;
      callback(null, chunk.subarray(0, remaining));
    } });
    const write = (async () => {
      await mkdir(dir, { recursive: true });
      await pipeline(stream, cap, createWriteStream(item.path, { flags: 'wx' }));
    })();
    // Attach a handler immediately while the rest of the multipart is received.
    writes.push(write.then(() => null, error => error));
  });
  for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit']) parser.on(event, () => { bad = true; });
  const counter = new Transform({ transform(chunk, encoding, callback) {
    requestBytes += chunk.length;
    if (requestBytes > MAX_REQUEST) return callback(new RequestError('REQUEST_TOO_LARGE', 'Request vượt quá 55 MiB.', 413));
    callback(null, chunk);
  } });
  const completed = new Promise(resolve => {
    const fail = error => { failure ||= error; for (const stream of streams) stream.destroy(); parser.destroy(); };
    counter.on('error', error => { req.unpipe(counter); req.resume(); fail(error); });
    req.on('aborted', () => fail(new RequestError('REQUEST_ABORTED', 'Request đã bị ngắt.')));
    req.on('error', fail);
    parser.on('error', error => { failure ||= error; for (const stream of streams) stream.destroy(); });
    parser.on('close', resolve);
  });
  req.pipe(counter).pipe(parser);
  await completed;
  const results = await Promise.all(writes);
  if (failure instanceof RequestError) throw failure;
  if (failure || results.some(Boolean)) throw invalid();
  let data;
  try { data = JSON.parse(metadata); } catch { throw invalid(); }
  if (bad || files.length < 1 || files.length > 5 || !Array.isArray(data) || data.length !== files.length || data.some(item => !item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).sort().join(',') !== 'alt,title' || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 160 || typeof item.alt !== 'string' || !item.alt.trim() || item.alt.length > 1000)) throw invalid();
  return { files, metadata: data };
}
