// S3 mounts end to end against an S3-compatible server: read an object the
// host put there, write one from the sandbox and see it land in the bucket, then unmount.
// Env: S3_ENDPOINT, S3_KEY, S3_SECRET, S3_BUCKET (the bucket holds hello.txt = "hello from s3").
// CI serves it with `rclone serve s3`; the aws CLI checks writes from the host side.
import { execFileSync } from "node:child_process";
import { Jasmine } from "./typescript/dist/index.js";

const { S3_ENDPOINT, S3_KEY, S3_SECRET } = process.env;
const BUCKET = process.env.S3_BUCKET ?? "jasmine-test";
const aws = (...a) =>
  execFileSync("aws", ["--endpoint-url", S3_ENDPOINT, ...a], {
    env: { ...process.env, AWS_ACCESS_KEY_ID: S3_KEY, AWS_SECRET_ACCESS_KEY: S3_SECRET, AWS_DEFAULT_REGION: "us-east-1" },
  }).toString();

const sbx = await new Jasmine().create();
try {
  const t0 = performance.now();
  const path = await sbx.mountS3({ bucket: BUCKET, endpoint: S3_ENDPOINT, accessKeyId: S3_KEY, secretAccessKey: S3_SECRET });
  const mountMs = Math.round(performance.now() - t0);
  if (path !== `/mnt/${BUCKET}`) throw new Error(`unexpected mount path ${path}`);

  const read = await sbx.exec(`cat ${path}/hello.txt`);
  if (read.stdout.trim() !== "hello from s3") throw new Error(`read through the mount failed: ${JSON.stringify(read)}`);

  const write = await sbx.exec(`echo written by a sandbox > ${path}/from-sandbox.txt && ls ${path}`);
  if (write.exitCode !== 0) throw new Error(`write through the mount failed: ${JSON.stringify(write)}`);
  let landed = "";
  for (let i = 0; i < 40 && !landed; i++) {
    try {
      landed = aws("s3", "cp", `s3://${BUCKET}/from-sandbox.txt`, "-").trim();
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (landed !== "written by a sandbox") throw new Error(`write never reached the bucket (got ${JSON.stringify(landed)})`);

  // A second mount, read-only and scoped to a prefix.
  execFileSync("sh", ["-c", `echo team > /tmp/notes.txt`]);
  aws("s3", "cp", "/tmp/notes.txt", `s3://${BUCKET}/team/notes.txt`);
  const ro = await sbx.mountS3({ bucket: BUCKET, path: "/data/team", prefix: "team", endpoint: S3_ENDPOINT, accessKeyId: S3_KEY, secretAccessKey: S3_SECRET, readOnly: true });
  const roWrite = await sbx.exec(`touch ${ro}/nope 2>&1`);
  if (roWrite.exitCode === 0) throw new Error("read-only mount accepted a write");

  await sbx.unmount(path);
  const gone = await sbx.exec(`grep -c " ${path} " /proc/mounts || true`);
  if (gone.stdout.trim() !== "0") throw new Error(`still mounted after unmount: ${gone.stdout}`);
  console.log(JSON.stringify({ ok: true, mount_ms: mountMs, read: true, write: true, read_only: true, unmount: true }));
} finally {
  await sbx.delete();
}
