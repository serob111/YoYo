import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { beforeAll, describe, expect, it } from "vitest";
import { StorageClient } from "../storage-client";

// Runs against the real MinIO container from docker-compose.yml (dev) /
// docker-compose.test.yml (CI) - presign is pure local computation, but
// put/get/delete round-trip a real S3-compatible backend, same "use the real
// thing, not a mock" convention as the Postgres/Redis integration tests.
const CONFIG = {
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: process.env.S3_REGION ?? "us-east-1",
  bucket: process.env.S3_BUCKET ?? "yoyo-local",
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "yoyo",
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "yoyo12345",
  forcePathStyle: true
};

describe("StorageClient", () => {
  beforeAll(async () => {
    const client = new S3Client({
      region: CONFIG.region,
      endpoint: CONFIG.endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: CONFIG.accessKeyId, secretAccessKey: CONFIG.secretAccessKey }
    });
    try {
      await client.send(new CreateBucketCommand({ Bucket: CONFIG.bucket }));
    } catch (error) {
      const code = (error as { name?: string }).name;
      if (code !== "BucketAlreadyOwnedByYou" && code !== "BucketAlreadyExists") {
        throw error;
      }
    }
  });

  it("round-trips an object through put/get/delete", async () => {
    const storage = new StorageClient(CONFIG);
    const key = `test/${crypto.randomUUID()}.txt`;
    const body = Buffer.from("hello from storage-client test");

    await storage.putObject(key, body, "text/plain");
    const fetched = await storage.getObject(key);
    expect(fetched.toString("utf8")).toBe(body.toString("utf8"));

    await storage.deleteObject(key);
    await expect(storage.getObject(key)).rejects.toThrow();
  });

  it("generates presigned upload and download URLs without a network call", async () => {
    const storage = new StorageClient(CONFIG);
    const uploadUrl = await storage.getPresignedUploadUrl("test/presign.txt", "text/plain");
    const downloadUrl = await storage.getPresignedDownloadUrl("test/presign.txt");

    expect(uploadUrl).toContain(CONFIG.bucket);
    expect(downloadUrl).toContain(CONFIG.bucket);
  });
});
