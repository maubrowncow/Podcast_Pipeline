import { NextRequest, NextResponse } from "next/server";
import busboy from "busboy";
import { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { jobs } from "@/lib/db/schema";

export const runtime = "nodejs";

const ALLOWED_EXTENSIONS = new Set([
  "mp3",
  "wav",
  "m4a",
  "flac",
  "ogg",
  "webm",
]);

export async function POST(req: NextRequest) {
  const uploadDir = process.env.UPLOAD_DIR || "data/uploads";
  fs.mkdirSync(uploadDir, { recursive: true });

  return new Promise<NextResponse>((resolve) => {
    const bb = busboy({
      headers: Object.fromEntries(req.headers),
      limits: { fileSize: 2 * 1024 * 1024 * 1024 },
    });

    const results: { jobId: number; filename: string }[] = [];
    let fileCount = 0;
    let processedCount = 0;
    let hasError = false;
    let whisperModel = "small";
    let numSpeakers: number | undefined;

    bb.on("field", (name, value) => {
      if (name === "whisperModel") whisperModel = value;
      if (name === "numSpeakers") {
        const n = parseInt(value, 10);
        if (!isNaN(n) && n > 0) numSpeakers = n;
      }
    });

    bb.on("file", (_fieldname, fileStream, info) => {
      fileCount++;
      const ext = path.extname(info.filename).toLowerCase().slice(1);

      if (!ALLOWED_EXTENSIONS.has(ext)) {
        fileStream.resume();
        hasError = true;
        resolve(
          NextResponse.json(
            {
              error: `Unsupported file type: .${ext}. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
            },
            { status: 400 }
          )
        );
        return;
      }

      const fileId = uuidv4();
      const savePath = path.join(uploadDir, `${fileId}.${ext}`);
      const writeStream = fs.createWriteStream(savePath);
      let fileSize = 0;

      fileStream.on("data", (chunk: Buffer) => {
        fileSize += chunk.length;
      });

      fileStream.pipe(writeStream);

      writeStream.on("finish", () => {
        if (hasError) return;

        const job = db
          .insert(jobs)
          .values({
            originalFilename: info.filename,
            filePath: savePath,
            fileSizeBytes: fileSize,
            whisperModel,
            numSpeakers,
          })
          .returning()
          .get();

        results.push({ jobId: job.id, filename: info.filename });
        processedCount++;

        if (processedCount === fileCount) {
          resolve(
            NextResponse.json({ jobs: results }, { status: 201 })
          );
        }
      });

      writeStream.on("error", (err) => {
        if (hasError) return;
        hasError = true;
        fs.unlink(savePath, () => {});
        resolve(
          NextResponse.json(
            { error: `Upload failed: ${err.message}` },
            { status: 500 }
          )
        );
      });
    });

    bb.on("close", () => {
      if (fileCount === 0 && !hasError) {
        resolve(
          NextResponse.json({ error: "No file provided" }, { status: 400 })
        );
      }
    });

    bb.on("error", (err: Error) => {
      if (!hasError) {
        hasError = true;
        resolve(
          NextResponse.json(
            { error: `Upload error: ${err.message}` },
            { status: 500 }
          )
        );
      }
    });

    const nodeStream = Readable.fromWeb(req.body as never);
    nodeStream.pipe(bb);
  });
}
