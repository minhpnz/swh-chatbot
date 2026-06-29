import { config } from 'dotenv';
import pg from 'pg';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { resolve, extname, basename } from 'node:path';
import { createHash } from 'node:crypto';

config({ path: '.env.local' });

// Ingestion job (MVP): turn every file in swh_data into text the bot's DB can hold.
//   - CSV / text  -> stored as-is
//   - PNG / JPG   -> OCR'd to Vietnamese markdown by a vision LLM (Groq llama-4-scout)
// Output: writes ./swh/ingested/<file>.md for inspection + upserts swh_kb_documents.
// The structured tables (courses, teachers, ...) are curated from this raw layer.
// FUTURE: replace this with a Google Sheet -> DB transform job.

const DATA_DIR = process.env.SWH_DATA_DIR ?? resolve('..', 'swh_data');
const OUT_DIR = resolve('swh/ingested');
const VISION_MODEL = process.env.SWH_VISION_MODEL ?? 'meta-llama/llama-4-scout-17b-16e-instruct';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const TEXT_EXT = new Set(['.csv', '.txt', '.md', '.tsv']);

const OCR_PROMPT =
  'Bạn là công cụ OCR chính xác. Trích xuất TOÀN BỘ nội dung trong ảnh thành markdown tiếng Việt có cấu trúc. '
  + 'Bảng phải giữ dạng bảng markdown. Giữ nguyên 100% mọi tên giáo viên, mã lớp, ngày khai giảng, giờ học, '
  + 'số buổi, sĩ số và học phí (con số chính xác). TUYỆT ĐỐI không suy diễn, không thêm thông tin. '
  + 'Nếu chỗ nào không đọc được thì ghi [không rõ]. Chỉ trả về nội dung, không lời dẫn.';

function sha256(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

function mimeOf(ext: string): string {
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ocrImage(path: string, ext: string, attempt = 0): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Missing GROQ_API_KEY (needed for image OCR)');
  const b64 = readFileSync(path).toString('base64');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      // Groq is behind Cloudflare; the default Node UA gets 403/1010.
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      temperature: 0,
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: OCR_PROMPT },
          { type: 'image_url', image_url: { url: `data:${mimeOf(ext)};base64,${b64}` } },
        ],
      }],
    }),
  });
  if (res.status === 429 && attempt < 3) {
    const wait = Number(res.headers.get('retry-after')) * 1000 || 30_000;
    console.log(`        rate-limited, waiting ${Math.round(wait / 1000)}s then retrying…`);
    await sleep(wait);
    return ocrImage(path, ext, attempt + 1);
  }
  if (!res.ok) throw new Error(`Groq vision ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

interface Doc { source_file: string; kind: 'csv' | 'image' | 'text'; content: string; content_hash: string }

async function extractAll(alreadyImaged: Set<string>): Promise<Doc[]> {
  const files = readdirSync(DATA_DIR)
    .filter((f) => !f.startsWith('.'))
    .filter((f) => statSync(resolve(DATA_DIR, f)).isFile())
    .sort();

  const docs: Doc[] = [];
  const ocrCache = new Map<string, string>(); // raw-bytes hash -> OCR text (dedupes copies)
  const force = process.env.SWH_INGEST_FORCE === '1';

  for (const file of files) {
    const path = resolve(DATA_DIR, file);
    const ext = extname(file).toLowerCase();
    try {
      if (TEXT_EXT.has(ext)) {
        const content = readFileSync(path, 'utf8');
        docs.push({ source_file: file, kind: ext === '.csv' || ext === '.tsv' ? 'csv' : 'text', content, content_hash: sha256(content) });
        console.log(`  text  ${file} (${content.length} chars)`);
      } else if (IMAGE_EXT.has(ext) && alreadyImaged.has(file) && !force) {
        console.log(`  ocr   ${file} (already ingested — skipped, set SWH_INGEST_FORCE=1 to redo)`);
      } else if (IMAGE_EXT.has(ext)) {
        const bytesHash = sha256(readFileSync(path));
        let content = ocrCache.get(bytesHash);
        if (content === undefined) {
          content = await ocrImage(path, ext);
          ocrCache.set(bytesHash, content);
          console.log(`  ocr   ${file} (${content.length} chars)`);
        } else {
          console.log(`  ocr   ${file} (duplicate bytes — reused)`);
        }
        docs.push({ source_file: file, kind: 'image', content, content_hash: sha256(content) });
      } else {
        console.log(`  skip  ${file} (unsupported ${ext})`);
      }
    } catch (e) {
      console.error(`  FAIL  ${file}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return docs;
}

// ---- Sendable images: upload to public Storage + upsert swh_assets ----------
// Images from swh_data that the bot may SEND to customers (not just OCR for text).
// Re-running ingest re-uploads + re-upserts, keeping the DB sendable-image in sync.
const STORAGE_BUCKET = 'swh-public';
const SENDABLE_IMAGES: { file: string; key: string; label: string; when_to_use: string; storagePath: string }[] = [
  {
    file: 'Screenshot 2026-06-27 at 00.42.16.png',
    key: 'img_schedule',
    label: 'Lịch khai giảng các lớp',
    when_to_use: 'Khách hỏi lịch khai giảng / lịch học / học phí / sĩ số / tư vấn các lớp đang mở',
    storagePath: 'lich-khai-giang.png',
  },
];

function supaEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (needed to upload images)');
  return { url: url.replace(/\/$/, ''), key };
}

async function ensureBucket(): Promise<void> {
  const { url, key } = supaEnv();
  const res = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({ id: STORAGE_BUCKET, name: STORAGE_BUCKET, public: true }),
  });
  // 200 created; 400/409 = already exists.
  if (!res.ok && res.status !== 400 && res.status !== 409) {
    throw new Error(`create bucket ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

async function uploadPublic(path: string, bytes: Buffer, contentType: string): Promise<string> {
  const { url, key } = supaEnv();
  const res = await fetch(`${url}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, apikey: key, 'content-type': contentType, 'x-upsert': 'true' },
    body: bytes,
  });
  if (!res.ok) throw new Error(`upload ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return `${url}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

async function syncSendableImages(client: pg.Client): Promise<void> {
  const present = SENDABLE_IMAGES.filter((s) => existsSync(resolve(DATA_DIR, s.file)));
  if (present.length === 0) { console.log('  (no sendable images found in data dir)'); return; }
  await ensureBucket();
  for (const s of present) {
    const ext = extname(s.file).toLowerCase();
    const publicUrl = await uploadPublic(s.storagePath, readFileSync(resolve(DATA_DIR, s.file)), mimeOf(ext));
    await client.query(
      `insert into swh_assets (type,key,label,value,when_to_use,status)
       values ('image',$1,$2,$3,$4,'active')
       on conflict (key) do update set type='image', label=excluded.label, value=excluded.value,
         when_to_use=excluded.when_to_use, status='active', updated_at=now()`,
      [s.key, s.label, publicUrl, s.when_to_use],
    );
    console.log(`  asset ${s.key} -> ${publicUrl}`);
  }
}

function pgUrl(): string {
  const raw = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
  if (!raw) throw new Error('Missing POSTGRES_URL_NON_POOLING / POSTGRES_URL');
  return raw.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
}

async function main() {
  console.log(`Ingesting from ${DATA_DIR}`);
  const client = new pg.Client({ connectionString: pgUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  // Images already ingested are skipped (OCR is the slow/rate-limited step).
  const existing = await client.query<{ source_file: string }>(
    "select source_file from swh_kb_documents where kind='image'",
  );
  const alreadyImaged = new Set(existing.rows.map((r) => r.source_file));

  const docs = await extractAll(alreadyImaged);

  // Write a local markdown copy of each freshly-extracted doc for inspection.
  mkdirSync(OUT_DIR, { recursive: true });
  for (const d of docs) {
    const safe = basename(d.source_file).replace(/[^\p{L}\p{N}._-]+/gu, '_');
    writeFileSync(resolve(OUT_DIR, `${safe}.md`), `<!-- source: ${d.source_file} (${d.kind}) -->\n\n${d.content}\n`);
  }
  writeFileSync(resolve(OUT_DIR, 'index.json'), JSON.stringify(docs.map((d) => ({ source_file: d.source_file, kind: d.kind, chars: d.content.length })), null, 2));

  // Upsert into swh_kb_documents.
  for (const d of docs) {
    await client.query(
      `insert into swh_kb_documents (source_file,kind,content,content_hash)
       values ($1,$2,$3,$4)
       on conflict (source_file) do update set kind=excluded.kind, content=excluded.content,
         content_hash=excluded.content_hash, status='active', updated_at=now()`,
      [d.source_file, d.kind, d.content, d.content_hash],
    );
  }
  // Sync sendable images -> Storage + swh_assets (so the bot can attach them).
  console.log('Syncing sendable images -> Storage + swh_assets…');
  await syncSendableImages(client);

  await client.end();
  console.log(`\nUpserted ${docs.length} -> swh_kb_documents; wrote ${docs.length} files to swh/ingested/`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
