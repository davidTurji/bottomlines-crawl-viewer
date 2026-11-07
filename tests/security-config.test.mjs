import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const configuration = readFileSync(new URL('../nginx.conf.template', import.meta.url), 'utf8');
// Walk nginx's server/location scopes: adding even a cache header in a location
// stops inheriting ALL server add_header directives. Guard every such branch.
const scopes = [];
let current;
for (const line of configuration.split('\n')) {
  if (/^server \{/.test(line)) {
    current = { name: 'server', headers: [], lines: [] };
    scopes.push(current);
  } else if (/^    location .*\{/.test(line)) {
    current = { name: line.trim(), headers: [], lines: [] };
    scopes.push(current);
  } else if (/^    \}/.test(line)) {
    current = scopes[0];
  }
  if (!current) continue;
  current.lines.push(line);
  if (/^\s*add_header /.test(line)) current.headers.push(line.trim());
}
for (const scope of scopes) {
  test(`browser protections survive header inheritance in ${scope.name}`, () => {
    const effective = scope.headers.length ? scope.headers : scopes[0].headers;
    const get = (name) => effective.filter(h => h.startsWith(`add_header ${name} `));
    assert.equal(get('X-Frame-Options').length, 1);
    assert.match(get('X-Frame-Options')[0], /"DENY" always;/);
    assert.equal(get('X-Content-Type-Options').length, 1);
    assert.match(get('X-Content-Type-Options')[0], /"nosniff" always;/);
    assert.equal(get('Content-Security-Policy').length, 1);
    assert.match(get('Content-Security-Policy')[0], /frame-ancestors 'none'/);
    assert.match(get('Content-Security-Policy')[0], /always;/);
    assert.equal(get('Referrer-Policy').length, 1);
    assert.match(get('Referrer-Policy')[0], /"no-referrer" always;/);
  });
}

for (const scope of scopes.filter(s => s.lines.some(l => l.includes('proxy_pass ')))) {
  test(`upstream TLS is authenticated in ${scope.name}`, () => {
    const directives = scope.lines.join('\n');
    assert.match(directives, /proxy_ssl_server_name on;/);
    assert.match(directives, /proxy_ssl_verify on;/);
    assert.match(directives, /proxy_ssl_trusted_certificate \/etc\/ssl\/certs\/ca-certificates.crt;/);
    assert.match(directives, /proxy_ssl_verify_depth 3;/);
  });
}
test('report downloads retain the restricted sandbox policy', () => {
  const scope = scopes.find(s => s.name.includes('/crawler/report-files/'));
  assert.match(scope.headers.join('\n'), /default-src 'none'; frame-ancestors 'none'; sandbox/);
});

test('demo flood budget cannot be reset with forged forwarding headers or bypassed via index', () => {
  assert.match(configuration, /limit_req_zone \$server_name zone=demo_flood:1m rate=500r\/s;/);
  assert.doesNotMatch(configuration, /map \$http_x_forwarded_for/);
  assert.match(scopes[0].lines.join('\n'), /limit_req zone=demo_flood burst=1000 nodelay;/);
});
