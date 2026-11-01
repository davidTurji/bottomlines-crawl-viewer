import { expect, test } from '@playwright/test';
import { TOKEN } from './fakeApi';

// The link preview WhatsApp paints for a report link. Its crawler reads the
// FIRST HTML response and never runs JavaScript, so these tests read the raw
// response the way it does, never a rendered page. See index.html.
const IMAGE = 'https://pathfinder.bottomlines.ai/assets/images/link-preview-weekly-report-v1.png';
const EXPECTED: Record<string, string> = {
  'og:type': 'website',
  'og:title': 'Pathfinder | Your weekly report',
  'og:description': 'Your latest inventory insights, changes, and discoveries.',
  'og:image': IMAGE,
  'og:image:type': 'image/png',
  'og:image:width': '800',
  'og:image:height': '800',
};

const ogTags = (html: string) => Object.fromEntries(
  [...html.matchAll(/<meta\s+property="(og:[^"]+)"\s+content="([^"]*)"/g)].map(m => [m[1], m[2]]));

for (const path of [`/crawl-report/${TOKEN}`, '/local-qa/1101-1119']) {
  test(`${path}: first HTML response carries the weekly report preview`, async ({request}) => {
    const res = await request.get(path, {headers: {'User-Agent': 'WhatsApp/2.23.20.0 A'}});
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(ogTags(html)).toEqual(EXPECTED);
    expect(html).not.toContain(TOKEN);
  });
}

test('preview image is public, PNG, the declared size and under WhatsApp\'s 300 KB cap', async ({request}) => {
  const res = await request.get(new URL(IMAGE).pathname, {headers: {'User-Agent': 'WhatsApp/2.23.20.0 A'}});
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/png');
  const png = await res.body();
  expect(png.length).toBeLessThan(300_000);
  // IHDR: width and height are the big-endian words at bytes 16 and 20.
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
  expect(String(png.readUInt32BE(16))).toBe(EXPECTED['og:image:width']);
  expect(String(png.readUInt32BE(20))).toBe(EXPECTED['og:image:height']);
});
