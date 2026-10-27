#!/usr/bin/env node
/**
 * REAL-USER QA (David, 2026-10-27): the click-everything walk
 * (e2e/clickEverything.spec.ts, its live mode) on every report link in a
 * list, one after another, and one verdict for the lot.
 *
 *   node e2e/realUserQa.mjs            the live links (REAL_USER_QA_LINKS)
 *   node e2e/realUserQa.mjs --dry-run  a local build (dist/, npm run build
 *                                      first) with the fake API behind the
 *                                      live sign-in: one clean link that
 *                                      must pass, one whose Matched
 *                                      publishers tile is one off its list,
 *                                      which must fail. Tests this runner
 *                                      and the workflow end to end.
 *
 * REAL_USER_QA_LINKS is JSON, one entry per link:
 *   [{"name": "qa-nightly", "token": "<share token>", "signin": "<#signin= value>"}]
 * and optionally per link "base" (default REAL_USER_QA_BASE, else
 * https://pathfinder.bottomlines.ai), "on" (the triggers it runs on, any of
 * viewer, crawler, nightly, manual; default all) and "viewport" (desktop or
 * phone; default both).
 *
 * Exit 1 on any finding: a crash, an error panel, "Could not load", a list
 * that never lands, a count that is not its rows, a link that does not
 * sign in, a walk that does not finish. The job summary says which link,
 * which screen, which step.
 *
 * SECRETS NEVER REACH THE OUTPUT. Each link's token and sign-in (as given,
 * URL-encoded and decoded) are masked for the Actions log before anything
 * runs and cut from every line the walk prints. Nothing of a live page is
 * kept: no screenshot, no trace (this repository's runs are public). Names
 * are printed: keep them neutral labels, never a customer's name.
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const DRY = process.argv.includes("--dry-run");
const DEFAULT_BASE = "https://pathfinder.bottomlines.ai";
// Outside test-results/, which every Playwright run empties first.
const OUT = "real-user-qa-results";
const TRIGGERS = ["viewer", "crawler", "nightly", "manual"];
const TRIGGER = process.env.REAL_USER_QA_TRIGGER || (DRY ? "dry run" : "manual");
const CONTEXT = process.env.REAL_USER_QA_CONTEXT || "";
const ONLY = (process.env.REAL_USER_QA_ONLY || "").trim();
/** A walk that has not finished in this long is stopped (the spec's own
 *  timeout is 30 minutes; this is the backstop). */
const WALK_LIMIT_MS = 40 * 60_000;

/** One structured line per event (always-add-logging), secrets cut. */
const log = (event, fields = {}) => console.log(redact(JSON.stringify({ at: new Date().toISOString(), event, ...fields })));

/* ── Secrets: every form, masked and cut. ── */
let SECRETS = [];
function secretForms(link) {
  const out = [link.token, link.signin, encodeURIComponent(link.signin)];
  const plain = Buffer.from(link.signin, "base64url").toString("utf8");
  const colon = plain.indexOf(":");
  if (colon > 0) out.push(plain, plain.slice(colon + 1), plain.slice(0, colon));
  return out.filter((v) => typeof v === "string" && v.length >= 4);
}
function redact(text) {
  return SECRETS.reduce((acc, v) => acc.split(v).join("<SECRET>"), String(text));
}
function protect(links) {
  const forms = new Set(links.flatMap(secretForms));
  // Longest first, so a part never leaves the rest of a longer form.
  SECRETS = [...forms].sort((a, b) => b.length - a.length);
  if (process.env.GITHUB_ACTIONS === "true") for (const v of SECRETS) process.stdout.write(`::add-mask::${v}\n`);
}

/* ── The links. ── */
function liveLinks() {
  const raw = (process.env.REAL_USER_QA_LINKS || "").trim();
  if (!raw) return { links: [], problems: ["REAL_USER_QA_LINKS is not set: no link was walked."] };
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    return { links: [], problems: ["REAL_USER_QA_LINKS is not valid JSON: no link was walked."] };
  }
  if (!Array.isArray(list) || list.length === 0)
    return { links: [], problems: ["REAL_USER_QA_LINKS must be a JSON list of links: no link was walked."] };
  const links = [];
  const problems = [];
  const fallback = (process.env.REAL_USER_QA_BASE || DEFAULT_BASE).replace(/\/+$/, "");
  // Mask what is there before saying anything about any entry.
  protect(list.filter((l) => l && typeof l.token === "string" && typeof l.signin === "string"));
  list.forEach((l, i) => {
    const label = typeof l?.name === "string" && /^[\w .-]{1,40}$/.test(l.name) ? l.name : `link ${i + 1}`;
    if (!l || typeof l.token !== "string" || l.token.length < 8) return problems.push(`${label}: no token.`);
    if (typeof l.signin !== "string" || !l.signin) return problems.push(`${label}: no signin.`);
    const base = (typeof l.base === "string" && l.base ? l.base : fallback).replace(/\/+$/, "");
    // A sign-in never travels in the clear.
    if (!/^https:\/\/[^/]+$/.test(base)) return problems.push(`${label}: base must be an https origin.`);
    const on = Array.isArray(l.on) ? l.on.filter((t) => TRIGGERS.includes(t)) : TRIGGERS;
    const viewport = l.viewport === "desktop" || l.viewport === "phone" ? l.viewport : "";
    links.push({ name: label, token: l.token, signin: l.signin, base, on, viewport });
  });
  return { links, problems };
}

function dryLinks(base) {
  const signin = Buffer.from("reader:any-password").toString("base64url");
  return [
    { name: "dry run, clean", token: "e2e-token", signin, base, on: TRIGGERS, viewport: "", fake: "clean", expect: "pass" },
    { name: "dry run, tile off by one", token: "e2e-token", signin, base, on: TRIGGERS, viewport: "desktop", fake: "count-mismatch", expect: "fail" },
  ];
}

/* ── The local build, for the dry run. ── */
async function serve(port) {
  if (!existsSync("dist/index.html")) throw new Error("no dist/: run npm run build first");
  const server = spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  started.add(server);
  server.stdout.on("data", () => {});
  server.stderr.on("data", (d) => process.stderr.write(d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) return { base, stop: () => stopTree(server) };
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  stopTree(server);
  throw new Error(`the local build did not answer on ${base}`);
}
function stopTree(child) {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
}
/** Everything this runner started, stopped if it is stopped itself: no
 *  walk and no server outlives it. */
const started = new Set();
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => {
    for (const child of started) stopTree(child);
    process.exit(130);
  });

/* ── One link's walk. ── */
function walk(link, i) {
  const result = join(OUT, `link-${i + 1}.json`);
  rmSync(result, { force: true });
  const env = {
    ...process.env,
    VIEWER_SMOKE_BASE: link.base,
    VIEWER_SMOKE_TOKEN: link.token,
    VIEWER_SMOKE_SIGNIN: link.signin,
    REAL_USER_QA_RESULT: result,
    REAL_USER_QA_SHOT_DIR: join(OUT, `link-${i + 1}`),
  };
  // Never handed on: the list itself, and a fake answer to a real link.
  delete env.REAL_USER_QA_LINKS;
  delete env.VIEWER_SMOKE_FAKE;
  if (link.fake) env.VIEWER_SMOKE_FAKE = link.fake;
  if (link.viewport) env.SMOKE_VIEWPORT = link.viewport;
  else delete env.SMOKE_VIEWPORT;
  const args = ["playwright", "test", "e2e/clickEverything.spec.ts", "--project=desktop", "--workers=1", "--retries=0", "--reporter=line"];
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn("npx", args, { env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    started.add(child);
    const relay = (stream, to) => {
      let rest = "";
      stream.on("data", (d) => {
        const lines = (rest + d.toString()).split("\n");
        rest = lines.pop() ?? "";
        for (const line of lines) to.write(`  ${redact(line)}\n`);
      });
      stream.on("end", () => rest && to.write(`  ${redact(rest)}\n`));
    };
    relay(child.stdout, process.stdout);
    relay(child.stderr, process.stderr);
    let timedOut = false;
    const limit = setTimeout(() => {
      timedOut = true;
      stopTree(child);
    }, WALK_LIMIT_MS);
    child.on("close", (code) => {
      clearTimeout(limit);
      started.delete(child);
      let walked = null;
      try {
        walked = JSON.parse(readFileSync(result, "utf8")).viewports;
      } catch {}
      const findings = (walked ?? []).flatMap((v) => [...v.failures, ...v.counts]).map(redact);
      if (timedOut) findings.push(`the walk did not finish in ${WALK_LIMIT_MS / 60_000} minutes`);
      else if (!walked) findings.push(`the walk ended without a result (exit ${code})`);
      else if (code !== 0 && findings.length === 0) findings.push(`the walk failed (exit ${code}) without naming why: see the log`);
      resolve({ link, code, walked: walked ?? [], findings, seconds: Math.round((Date.now() - t0) / 1000) });
    });
  });
}

/* ── The verdict. ── */
function viewportCell(walked, name) {
  const v = walked.find((w) => w.viewport === name);
  if (!v) return "not walked";
  const bad = v.failures.length + v.counts.length;
  return `${bad ? `**${bad} found**` : "ok"}, ${v.steps} steps, ${v.countChecks} counts, ${v.seconds} s`;
}

function summarise(runs, problems, skipped) {
  const failed = runs.filter((r) => (DRY ? !r.asExpected : r.findings.length > 0));
  const lines = [];
  const title = DRY ? "Real-user QA, dry run" : "Real-user QA";
  const verdict = problems.length || failed.length ? "FAILED" : "passed";
  lines.push(`## ${title}: ${verdict}`, "");
  lines.push(`Started by: ${TRIGGER}${CONTEXT ? ` (${CONTEXT})` : ""}. ${runs.length} ${runs.length === 1 ? "link" : "links"} walked, ${failed.length} failed.`, "");
  for (const p of problems) lines.push(`- **${p}**`);
  if (problems.length) lines.push("");
  if (runs.length) {
    lines.push(DRY ? "| Link | Expected | Result | Desktop | Phone |" : "| Link | Result | Desktop | Phone |");
    lines.push(DRY ? "|---|---|---|---|---|" : "|---|---|---|---|");
    for (const r of runs) {
      const result = r.findings.length ? `${r.findings.length} ${r.findings.length === 1 ? "finding" : "findings"}` : "pass";
      const cells = [r.link.name, ...(DRY ? [r.link.expect, `${result}${r.asExpected ? "" : " (NOT as expected)"}`] : [result])];
      lines.push(`| ${[...cells, viewportCell(r.walked, "desktop"), viewportCell(r.walked, "phone")].join(" | ")} |`);
    }
    lines.push("");
  }
  for (const r of runs.filter((x) => x.findings.length)) {
    lines.push(`### ${r.link.name}`, "");
    for (const f of r.findings.slice(0, 40)) lines.push(`- ${f.replace(/\|/g, "/")}`);
    if (r.findings.length > 40) lines.push(`- and ${r.findings.length - 40} more (see the log)`);
    lines.push("");
  }
  if (skipped.length) lines.push(`Not on this trigger: ${skipped.join(", ")}.`, "");
  const md = redact(lines.join("\n"));
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
  return problems.length === 0 && failed.length === 0;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  let server = null;
  let links;
  let problems = [];
  try {
    if (DRY) {
      server = await serve(Number(process.env.REAL_USER_QA_DRY_PORT || 4188));
      links = dryLinks(server.base);
      protect(links);
    } else {
      ({ links, problems } = liveLinks());
    }
    const skipped = [];
    const chosen = links.filter((l) => {
      if (ONLY && l.name !== ONLY) return false;
      // A run by hand walks every link (or the one asked for).
      if (TRIGGER === "manual" || DRY || l.on.includes(TRIGGER)) return true;
      skipped.push(l.name);
      return false;
    });
    if (ONLY && chosen.length === 0) problems.push(`no link is named "${ONLY}".`);
    if (!DRY && links.length > 0 && chosen.length === 0 && !ONLY) log("nothing on this trigger", { trigger: TRIGGER });
    const runs = [];
    // One link at a time, one reader at a time: light on the API.
    for (const [i, link] of chosen.entries()) {
      log("walk start", { link: link.name, viewports: link.viewport || "desktop, phone", ...(DRY ? { fake: link.fake } : {}) });
      const r = await walk(link, i);
      if (DRY) {
        const failedAsCounted = r.findings.some((f) => /count mismatch: the Matched publishers tile says/.test(f));
        r.asExpected = link.expect === "pass" ? r.findings.length === 0 : failedAsCounted;
      }
      log("walk end", { link: link.name, findings: r.findings.length, seconds: r.seconds, exit: r.code });
      runs.push(r);
    }
    process.exitCode = summarise(runs, problems, skipped) ? 0 : 1;
  } catch (e) {
    console.error(redact(`real-user QA could not run: ${e?.message ?? e}`));
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, redact(`## Real-user QA: FAILED\n\nIt could not run: ${e?.message ?? e}\n`));
    process.exitCode = 1;
  } finally {
    server?.stop();
  }
}

await main();
