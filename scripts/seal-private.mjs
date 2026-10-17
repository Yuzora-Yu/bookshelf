import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, createCipheriv, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [input, id, secretFile] = process.argv.slice(2);
if (!input || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id || '') || !secretFile) {
  throw new Error('Usage: node scripts/seal-private.mjs <private-dist> <book-id> <secret-json-file>');
}
const source = path.resolve(input);
if (source === root || source.startsWith(root + path.sep)) throw new Error('Private sources must be outside this repository');
const credentials = JSON.parse(await fs.readFile(secretFile, 'utf8'));
const key = Buffer.from(credentials.PRIVATE_BOOK_KEY || '', 'base64');
if (key.length !== 32) throw new Error('A 256-bit private-book key is required');
const prefix = '/bookshelf';
const manifestPath = path.join(root, 'worker/private-books.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
if (manifest.formatVersion !== 1) throw new Error('Unsupported private-book manifest format');
const entries = [];
async function collect(directory, relative) {
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    const sub = relative + '/' + item.name;
    if (item.isDirectory()) await collect(path.join(directory, item.name), sub);
    else if (item.isFile()) entries.push({ file: path.join(directory, item.name), route: sub.endsWith('/index.html') ? sub.slice(0, -10) : sub });
    else throw new Error('Private assets must be regular files');
  }
}
await collect(path.join(source, 'books', id), `/books/${id}`);
await collect(path.join(source, 'assets/books', id), `/assets/books/${id}`);
entries.push({ file: path.join(source, 'assets/catalog.json'), route: `/books/${id}/catalog.json` });
const types = { '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const routes = {};
const output = path.join(root, 'public/_sealed', id);
await fs.mkdir(output, { recursive: true });
for (const item of entries) {
  const type = types[path.extname(item.file)];
  if (!type) throw new Error('Unsupported private asset type');
  let clear = await fs.readFile(item.file);
  if (type.startsWith('text/html')) {
    let html = clear.toString('utf8');
    html = html.replace(/<meta (?:name|property)="(?:robots|og:[^"]+|twitter:[^"]+)"[^>]*>/g, '');
    html = html.replace(/<link rel="canonical"[^>]*>/g, '');
    html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
    html = html.replace('<head>', '<head><meta name="robots" content="noindex,noarchive">');
    html = html.replace(`data-base="${prefix}/"`, `data-base="${prefix}/" data-catalog="${prefix}/books/${id}/catalog.json"`);
    const exit = `<form class="archive-lock" method="post" action="${prefix}/private-access/${id}/logout"><button type="submit">閲覧を終了する</button></form>`;
    html = html.replace('</main>', exit + '</main>');
    clear = Buffer.from(html);
  }
  if (clear.length > 2_000_000) throw new Error('Private asset exceeds the serving limit');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(item.route));
  const encrypted = Buffer.concat([Buffer.from([1]), iv, cipher.update(clear), cipher.final(), cipher.getAuthTag()]);
  const name = createHash('sha256').update(item.route).digest('hex') + '.bin';
  await fs.writeFile(path.join(output, name), encrypted);
  routes[item.route] = { asset: `/_sealed/${id}/${name}`, contentType: type, bytes: clear.length };
}
manifest.books[id] = { routes };
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Sealed ${entries.length} private assets. Plaintext remains outside the repository.`);
