import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
const github = JSON.parse(await readFile(join(root, 'marketing/github-metadata.json'), 'utf8'));
assert.equal(manifest.version, lock.version);
assert.equal(manifest.version, lock.packages[''].version);
assert.equal(`${manifest.publisher}.${manifest.name}`, 'itstushar.timemachine');
assert.equal(manifest.scripts.vsix, `vsce package --out releases/timemachine-${manifest.version}.vsix`);
assert.ok(manifest.keywords.length <= 30 && new Set(manifest.keywords).size === manifest.keywords.length);
assert.ok(github.topics.length <= 20 && github.topics.every(topic => /^[a-z0-9-]{1,50}$/.test(topic)));
assert.ok(!github.topics.includes('open-source'));

async function checkMarkdown(file) {
  const markdown = await readFile(file, 'utf8');
  for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!link || /^[a-z]+:/i.test(link)) continue;
    await access(resolve(dirname(file), link));
  }
}
for (const name of ['README.md', 'PUBLISHING.md', 'SUPPORT.md', 'CHANGELOG.md', 'releases/README.md']) await checkMarkdown(join(root, name));
for (const directory of ['docs', 'marketing']) {
  for (const name of await readdir(join(root, directory))) if (name.endsWith('.md')) await checkMarkdown(join(root, directory, name));
}
for (const [path, width, height] of [
  ['media/screenshots/activity-graph.png', 1440, 1100],
  ['media/screenshots/command-history.png', 1440, 1000],
  ['media/screenshots/coding-time.png', 380, 620],
  ['marketing/github-social-preview.png', 1280, 640],
]) {
  const image = await readFile(join(root, path));
  assert.equal(image.subarray(1, 4).toString(), 'PNG');
  assert.equal(image.readUInt32BE(16), width); assert.equal(image.readUInt32BE(20), height);
  if (path === github.socialPreview) assert.ok(image.length < 1000000, 'GitHub social image must be smaller than 1 MB');
}
console.log(`Release ${manifest.version}: identity, versions, listing fields, topic limits, local document links, and images verified.`);
