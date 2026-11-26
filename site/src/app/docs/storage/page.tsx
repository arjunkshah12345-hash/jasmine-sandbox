import type { Metadata } from "next";
import { Prose, DocTitle } from "@/components/docs/prose";
import { Code } from "@/components/docs/kit";

export const metadata: Metadata = {
  title: "S3 mounts: buckets as folders in AI agent sandboxes · Jasmine",
  description: "Mount S3, R2, GCS, MinIO or Tigris buckets inside a sandbox with one call: prefix, read-only and anonymous mounts, with nothing to install in your image.",
  alternates: { canonical: "/docs/storage/" },
};

export default function Storage() {
  return (
    <>
      <DocTitle kicker="Build" title="S3 mounts">
        Mount an S3 bucket, or any S3-compatible store, as a folder in a running sandbox. It works in every template without installing anything.
      </DocTitle>
      <Prose>
        <h2 id="mount">Mount a bucket</h2>
        <Code lang="typescript">{`const path = await sbx.mountS3({
  bucket: "datasets",
  prefix: "train",                   // optional
  endpoint: "https://<account>.r2.cloudflarestorage.com",   // omit for AWS S3
  accessKeyId, secretAccessKey,      // omit both for a public bucket
  readOnly: true,
});                                   // "/mnt/datasets" unless you pass path
await sbx.unmount(path);`}</Code>
        <Code lang="python">{`path = sbx.mount_s3("datasets", prefix="train", access_key_id=key, secret_access_key=secret, read_only=True)
sbx.unmount(path)`}</Code>

        <h2 id="how">How it works</h2>
        <ul>
          <li>The sandbox&apos;s init process doubles as FUSE&apos;s mount helper (<code>fusermount</code>), so slim images need no FUSE packages.</li>
          <li>The daemon copies a pinned, checksum-verified rclone into the sandbox on its first mount, so templates stay small.</li>
          <li>Credentials go in the mount process&apos;s environment, never on a command line.</li>
          <li>Writes are uploaded about a second after a file is closed.</li>
        </ul>

        <h2 id="self-hosted">Self-hosted requirements</h2>
        <p>
          Mounts need FUSE in the guest kernel. <code>setup-host.sh</code> installs Jasmine&apos;s guest kernel (Firecracker&apos;s config plus FUSE) and rclone.
          Hosts set up before v0.1.2 keep their old kernel: remove <code>/var/lib/jasmine/vmlinux</code>, rerun setup, and rebuild templates.
        </p>
        <p>HTTP: <code>POST /v1/sandboxes/&#123;id&#125;/mounts</code> and <code>DELETE /v1/sandboxes/&#123;id&#125;/mounts?path=</code>.</p>
      </Prose>
    </>
  );
}
