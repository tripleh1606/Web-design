import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createReadStream } from 'node:fs';

// The bucket must already exist and be private. Never expose this client to browsers.
export function createS3Storage({ endpoint, region, bucket, forcePathStyle, credentials }) {
  if (!endpoint || !region || !bucket || !credentials?.accessKeyId || !credentials?.secretAccessKey || typeof forcePathStyle !== 'boolean') {
    throw new TypeError('Incomplete S3 configuration');
  }
  const client = new S3Client({ endpoint, region, forcePathStyle, credentials });
  return {
    async put(key, variant) {
      const body = createReadStream(variant.path);
      try {
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'image/webp', ContentLength: variant.bytes }));
      } finally {
        body.destroy();
      }
    },
    async get(key) {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return { body: result.Body, length: result.ContentLength, etag: result.ETag, contentType: result.ContentType };
    },
    async head(key) {
      const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { length: result.ContentLength, etag: result.ETag, contentType: result.ContentType };
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    close() { client.destroy(); },
  };
}
