#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env --allow-run
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { exists } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { join, dirname, basename } from "https://deno.land/std@0.224.0/path/mod.ts";
import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts";

function passwdHome(user: string): string | null {
  if (Deno.build.os === "windows") return null;
  try {
    const passwd = Deno.readTextFileSync("/etc/passwd");
    for (const line of passwd.split("\n")) {
      const parts = line.split(":");
      if (parts[0] === user && parts[5]) return parts[5];
    }
  } catch {
    return null;
  }
  return null;
}

function scoopixUserHome(): string {
  const home = Deno.env.get("HOME") ?? ".";
  const sudoUser = Deno.env.get("SUDO_USER");
  if (sudoUser && home === "/root") {
    return passwdHome(sudoUser) ?? home;
  }
  return home;
}

const USER_HOME = scoopixUserHome();
const SCOOPIX_HOME = join(USER_HOME, ".scoopix");
const APPS_DIR = join(SCOOPIX_HOME, "apps");
const BIN_DIR = join(SCOOPIX_HOME, "bin");
const DEFAULT_BIN_DIR = join(USER_HOME, "bin");
const CACHE_DIR = join(SCOOPIX_HOME, "cache");
const TEMP_DIR = join(SCOOPIX_HOME, "temp");
const ARTIFACTS_DIR = join(SCOOPIX_HOME, "artifacts");
const STATE_DIR = join(SCOOPIX_HOME, "state");
const LOCKS_DIR = join(SCOOPIX_HOME, "locks");
const SCOOPIX_SYSTEM_COMMAND = "sudo scoopix";
const SCOOPIX_EXPORT_LINE = `export PATH="$HOME/.scoopix/bin:$PATH"\nexport MANPATH="$HOME/.scoopix/share/man:$MANPATH"`;
const DEFAULT_MAIN_BUCKET_URL = "https://github.com/raisercostin/scoopix/raw/refs/heads/main/scoopix-main.json";
const LEGACY_MAIN_BUCKET_URLS = [
  "https://raw.githubusercontent.com/raisercostin/scoopix/main/scoopix-main.json",
];

let VERBOSITY = 1
let QUIET = 0
let firstTime = true;
function error(msg: string) { logAt(0, "ERROR", msg); }
function warn(msg: string) { logAt(1, "WARN", msg); }
function status(msg: string) { logAt(1, "STATUS", msg); }
function info(msg: string) { logAt(2, "INFO", msg); }
function debug(msg: string) { logAt(3, "DEBUG", msg); }
function trace(msg: string) { logAt(4, "TRACE", msg); }
function log(level: number, msg: string) {
  const prefix = ["ERROR", "WARN", "INFO", "DEBUG", "TRACE", "TRACE5"][level] ?? "LOG";
  logAt(level, prefix, msg);
}
function logAt(level: number, prefix: string, msg: string) {
  if (firstTime) {
    firstTime = false;
    info(`Scoopix home directory: ${SCOOPIX_HOME}`);
    info(`Scoopix default bin directory: ${DEFAULT_BIN_DIR}`);
    debug(`Scoopix verbosity level: ${VERBOSITY - QUIET}`);
  }
  if (level <= VERBOSITY - QUIET) {
    console.error(`[${prefix}] ${msg}`);
  }
}

function safeStateName(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "_");
}

type BucketAppBinary = {
  version?: string;
  url: string;
  type?: "bin";
  bin?: string;
};

type BucketAppSource = {
  version: string;
  url: string;
  type: "src";
  vars?: Record<string, string | number | boolean>;
  docker: {
    image: string;
    commands: string[];
    output: string;
  };
};

type BucketApp = BucketAppBinary | BucketAppSource;

type BucketManifest = {
  [app: string]: BucketApp;
};

export type ScoopixBinary = string | string[];

export interface ScoopixArchEntry {
  url: string;
  extract?: "zip" | "tar.gz" | "tgz";
  bin: ScoopixBinary;
  man?: string; // optional path to a man page inside archive
}
export interface ScoopixDocker {
  image: string;
  commands: string[];
  output: string;
}

export interface ScoopixVersionSource {
  url: string;
  type?: "github-releases" | "text";
  versionRegex: string;
  includePrerelease?: boolean;
}

export interface ScoopixApp {
  version: string;
  description?: string;
  provides?: string[];
  homepage?: string;
  license?: string;
  vars?: Record<string, string | number | boolean>;
  scripts?: Record<string, string | string[]>;
  depends?: string[];
  type?: "bin" | "src" | "meta";
  url?: string;
  urls?: string[];
  extract?: "zip" | "tar.gz" | "tgz";
  bin?: ScoopixBinary;
  shim?: string;
  versionSource?: ScoopixVersionSource;
  arch?: Record<string, ScoopixArchEntry>;
  docker?: ScoopixDocker;
}

export type ScoopixManifest = Record<string, ScoopixApp>;

async function listBuckets(): Promise<{ name: string, path: string }[]> {
  info(`Listing buckets from ${SCOOPIX_HOME}`);
  const cfgPath = join(SCOOPIX_HOME, "config.json");
  if (!(await exists(cfgPath))) return [];
  const cfg = JSON.parse(await Deno.readTextFile(cfgPath));
  return Object.entries(cfg.buckets ?? {}).map(([name, path]) => ({ name, path }));
}

async function ensureDefaultMainBucket(): Promise<void> {
  await ensureDir(SCOOPIX_HOME);
  await chownToSudoUser(SCOOPIX_HOME);
  const cfgPath = join(SCOOPIX_HOME, "config.json");
  let cfg = { buckets: {} as Record<string, string> };
  if (await exists(cfgPath)) {
    cfg = JSON.parse(await Deno.readTextFile(cfgPath));
    cfg.buckets ??= {};
  }
  if (cfg.buckets.main && !LEGACY_MAIN_BUCKET_URLS.includes(cfg.buckets.main)) return;
  const action = cfg.buckets.main ? "Updated" : "Configured";
  cfg.buckets.main = DEFAULT_MAIN_BUCKET_URL;
  await Deno.writeTextFile(cfgPath, JSON.stringify(cfg, null, 2));
  await chownToSudoUser(cfgPath);
  status(`${action} default bucket 'main' -> ${DEFAULT_MAIN_BUCKET_URL}`);
}

async function addBucket(url: string, name?: string) {
  await ensureDir(SCOOPIX_HOME);
  const cfgPath = join(SCOOPIX_HOME, "config.json");
  let cfg = { buckets: {} as Record<string, string> };
  if (await exists(cfgPath)) {
    cfg = JSON.parse(await Deno.readTextFile(cfgPath));
  }

  const bucketName = name || url.split("/").pop()?.replace(/\.json$/, "") || "bucket";
  const absPath = url.startsWith("http://") || url.startsWith("https://")
    ? url
    : join(Deno.cwd(), url);

  cfg.buckets[bucketName] = absPath;
  await Deno.writeTextFile(cfgPath, JSON.stringify(cfg, null, 2));
  console.log(`Added bucket '${bucketName}' -> ${absPath}`);
}

async function listApps(full: boolean) {
  info(`listApps called with full=${full}`);

  const buckets = await loadAllBuckets();
  if (buckets.size === 0) {
    info("listApps: no buckets loaded");
    console.log("No apps available");
    return;
  }
  for (const [bucket, manifest] of buckets) {
    for (const [app, meta] of Object.entries(manifest)) {
      const appName = full ? `${bucket}/${app}` : `${bucket}/${app}`;
      const description = meta.description ?? "";
      const provides = meta.provides?.length ? ` (provides: ${meta.provides.join(", ")})` : "";
      if (description) {
        console.log(`${appName} - ${description}${provides}`);
      } else {
        console.log(`${appName}${provides}`);
      }
    }
  }

  info("listApps completed");
}
async function loadBucket(name: string, path: string): Promise<BucketManifest | null> {
  const manifest: BucketManifest = {};

  try {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      // Remote single-file bucket
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const text = await res.text();
      const parsed: BucketManifest = JSON.parse(text);
      Object.assign(manifest, parsed);
      info(`Loaded remote bucket '${name}' with ${Object.keys(parsed).length} apps`);
    } else {
      const stat = await Deno.stat(path);
      if (stat.isFile && path.endsWith(".json")) {
        // Local single-file bucket
        const text = await Deno.readTextFile(path);
        const parsed: BucketManifest = JSON.parse(text);
        Object.assign(manifest, parsed);
        info(`Loaded single-file bucket '${name}' with ${Object.keys(parsed).length} apps`);
      } else if (stat.isDirectory) {
        // Local directory bucket
        for await (const file of Deno.readDir(path)) {
          if (file.isFile && file.name.endsWith(".json")) {
            const appName = file.name.replace(/\.json$/, "");
            const text = await Deno.readTextFile(join(path, file.name));
            try {
              manifest[appName] = JSON.parse(text);
              info(`Loaded app '${appName}' from bucket '${name}'`);
            } catch (err) {
              warn(`Failed to parse ${file.name} in bucket '${name}': ${err}`);
            }
          }
        }
        info(`Loaded directory bucket '${name}' with ${Object.keys(manifest).length} apps`);
      }
    }

    return manifest;
  } catch (err) {
    error(`Failed to load bucket '${name}' from ${path}: ${err}`);
    return null;
  }
}

async function loadAllBuckets(): Promise<Map<string, BucketManifest>> {
  info(`Loading buckets from config in ${SCOOPIX_HOME}`);
  const buckets = new Map<string, BucketManifest>();
  await ensureDefaultMainBucket();
  const entries = await listBuckets();

  if (entries.length === 0) {
    info("No buckets registered");
  }

  for (const { name, path } of entries) {
    info(`Reading bucket '${name}' at ${path}`);
    const manifest = await loadBucket(name, path);
    if (manifest) {
      buckets.set(name, manifest);
    }
  }

  return buckets;
}

async function findApp(app: string): Promise<{ bucket: string; info: any } | null> {
  const buckets = await loadAllBuckets();

  // case: user specified bucket/app
  if (app.includes("/")) {
    const [bucketName, appName] = app.split("/", 2);
    const manifest = buckets.get(bucketName);
    if (manifest && manifest[appName]) {
      return { bucket: bucketName, info: manifest[appName] };
    }
    return null;
  }

  // case: search across all buckets
  for (const [bucket, manifest] of buckets) {
    if (manifest[app]) return { bucket, info: manifest[app] };
  }

  return null;
}

function compareVersionStrings(a: string, b: string): number {
  const left = a.split(/[.-]/).map(part => Number.parseInt(part, 10));
  const right = b.split(/[.-]/).map(part => Number.parseInt(part, 10));
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    const av = Number.isFinite(left[i]) ? left[i] : 0;
    const bv = Number.isFinite(right[i]) ? right[i] : 0;
    if (av !== bv) return av - bv;
  }
  return a.localeCompare(b);
}

function collectVersionsFromText(text: string, regexText: string): string[] {
  const regex = new RegExp(regexText, "gm");
  const versions = new Set<string>();
  for (const match of text.matchAll(regex)) {
    versions.add(match[1] ?? match[0]);
  }
  return [...versions].sort((a, b) => compareVersionStrings(b, a));
}

async function discoverVersions(appId: string, infoObj: ScoopixApp): Promise<string[]> {
  const source = infoObj.versionSource;
  if (!source) {
    error(`versions: '${appId}' has no versionSource in the loaded manifest`);
    console.error("Add versionSource to the bucket manifest, or refresh/use a bucket that contains it.");
    Deno.exit(1);
  }

  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`versionSource fetch failed: HTTP ${response.status} ${response.statusText}`);
  const text = await response.text();

  if ((source.type ?? "text") === "github-releases") {
    const releases = JSON.parse(text);
    const tags = Array.isArray(releases)
      ? releases
        .filter(release => source.includePrerelease || (!release.draft && !release.prerelease))
        .map(release => String(release.tag_name ?? ""))
      : [String(releases.tag_name ?? "")];
    return collectVersionsFromText(tags.filter(Boolean).join("\n"), source.versionRegex);
  }

  return collectVersionsFromText(text, source.versionRegex);
}

async function printVersions(app: string) {
  const { appName, version, info: infoObj, bucket } = await resolveAppInfo(app);
  const appId = `${bucket}/${appName}`;
  const versions = await discoverVersions(appId, infoObj);
  console.log(appId);
  console.log(`manifest: ${version}`);
  console.log(`latest:   ${versions[0] ?? "<none>"}`);
  console.log(`versions: ${versions.join(", ")}`);
}

async function checkVersion(app: string) {
  const { appName, version, info: infoObj, bucket } = await resolveAppInfo(app);
  const appId = `${bucket}/${appName}`;
  const versions = await discoverVersions(appId, infoObj);
  const latest = versions[0];
  if (!latest) {
    console.log(`${appId}: no upstream versions found`);
    return;
  }
  const cmp = compareVersionStrings(latest, version);
  const status = cmp > 0 ? "outdated" : cmp === 0 ? "current" : "ahead";
  console.log(`${appId}: ${status}`);
  console.log(`manifest: ${version}`);
  console.log(`latest:   ${latest}`);
}
async function downloadAndInstall(
  url: string,
  dest: string,
  extract?: "zip" | "tar.gz" | "tgz",
  bin?: string,
  opts: { keepTemp?: boolean; man?: string; appName?: string } = {}
) {
  const appName = opts.appName ?? basename(dest);
  const versionPart = dest.split("/").slice(-3, -2)[0];
  const ext = extract === "zip" ? "zip" : "tar.gz";
  const cacheFile = join(CACHE_DIR, `${appName}#${versionPart}.${ext}`);
  const tempDir = join(TEMP_DIR, appName);

  info(`downloadAndInstall: preparing cache at ${cacheFile}`);
  await ensureDir(CACHE_DIR);
  await ensureDir(TEMP_DIR);

  // download if not cached
  try {
    await Deno.stat(cacheFile);
    info(`downloadAndInstall: using cached file ${cacheFile}`);
  } catch {
    info(`downloadAndInstall: downloading ${url} -> ${cacheFile}`);
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Failed to download: ${resp.status} ${resp.statusText}`);
    }
    const file = await Deno.open(cacheFile, {
      write: true,
      create: true,
      truncate: true,
    });
    await resp.body?.pipeTo(file.writable);
  }

  if (extract) {
    info(`downloadAndInstall: extracting ${extract} archive into ${tempDir}`);
    await Deno.remove(tempDir, { recursive: true }).catch(() => { });
    await ensureDir(tempDir);

    if (extract === "tar.gz" || extract === "tgz") {
      const cmd = new Deno.Command("tar", {
        args: ["-xzf", cacheFile, "-C", tempDir],
      });
      const { code } = await cmd.output();
      if (code !== 0) throw new Error(`tar extraction failed for ${url}`);
    } else if (extract === "zip") {
      const cmd = new Deno.Command("unzip", {
        args: ["-o", cacheFile, "-d", tempDir],
      });
      const { code } = await cmd.output();
      if (code !== 0) throw new Error(`unzip extraction failed for ${url}`);
    }

    if (!bin) throw new Error(`Archive from ${url} requires a 'bin' field`);
    const src = join(tempDir, bin);
    await ensureDir(dirname(dest));
    await Deno.copyFile(src, dest);

    if (opts.man) {
      const manTargetDir = join(SCOOPIX_HOME, "share", "man", "man1");
      await ensureDir(manTargetDir);
      const manDest = join(manTargetDir, `${appName}.1`);
      await Deno.copyFile(join(tempDir, opts.man), manDest);
      info(`downloadAndInstall: installed man page -> ${manDest}`);
    }

    if (!opts.keepTemp) {
      await Deno.remove(tempDir, { recursive: true }).catch(() => { });
      info(`downloadAndInstall: cleaned temp dir ${tempDir}`);
    } else {
      warn(`downloadAndInstall: kept temp dir for debugging: ${tempDir}`);
    }
  } else {
    info(`downloadAndInstall: copying cached binary ${cacheFile} -> ${dest}`);
    await ensureDir(dirname(dest));
    await Deno.copyFile(cacheFile, dest);
  }

  await Deno.chmod(dest, 0o755);
  info(`downloadAndInstall: saved to ${dest}`);
}
async function resolveAppInfo(app: string): Promise<{ appName: string; version: string; info: ScoopixApp; bucket: string }> {
  const found = await findApp(app);
  if (!found) {
    error(`installApp: app '${app}' not found`);
    console.error(`App '${app}' not found in any bucket.`);
    Deno.exit(1);
  }

  const appInfo = found.info;
  const appName = app.includes("/") ? app.split("/").pop()! : app;
  const version = appInfo.version ?? "unknown";
  const archKeys = await detectHostArchKeys();
  const archLabel = archKeys.join(", ");

  info(`installApp: detected host keys '${archLabel}'`);
  const archObj = archKeys.map(key => appInfo.arch?.[key]).find(Boolean);
  if (appInfo.arch && !archObj) {
    error(`installApp: '${appName}' is not available for this host (host keys=${archLabel})`);
    console.error(`Available arch keys: ${Object.keys(appInfo.arch).join(", ")}`);
    Deno.exit(1);
  }

  // --- base fallback logic ---
  const merged = {
    ...appInfo,
    ...(appInfo.base ?? {}),
    ...(archObj ?? {}),
    vars: {
      ...(appInfo.vars ?? {}),
      ...(appInfo.base?.vars ?? {}),
      ...(archObj?.vars ?? {}),
    },
  };

  if (merged.type !== "src" && merged.type !== "meta" && !merged.url && !merged.commands) {
    error(`installApp: no URL or commands found for '${appName}' (host keys=${archLabel})`);
    Deno.exit(1);
  }

  return { appName, version, info: merged, bucket: found.bucket };
}

async function prepareAppDirectories(appName: string, version: string, binName: string) {
  const appDir = join(APPS_DIR, appName, version, "bin");
  await ensureDir(appDir);
  const dest = join(appDir, binName);
  return { appDir, dest };
}

async function installFromBinary(infoObj: ScoopixApp, dest: string, opts: any) {
  info(`installApp: downloading binary from ${infoObj.url} -> ${dest}`);
  await downloadAndInstall(
    infoObj.url!,
    dest,
    infoObj.extract,
    infoObj.bin,
    { keepTemp: opts.keepTemp, man: infoObj.man, appName: infoObj.bin?.toString() ?? basename(dest) }
  );
}

async function installFromDelegated(infoObj: ScoopixApp, appName: string) {
  info(`installApp: delegated install (commands) for '${appName}'`);
  const workDir = join(TEMP_DIR, appName);
  await Deno.remove(workDir, { recursive: true }).catch(() => {});
  await ensureDir(workDir);

  for (const cmd of infoObj.commands ?? []) {
    const expanded = expandPlaceholders(cmd, { ...infoObj, ...(infoObj.vars ?? {}), app: appName });
    await runCommandWithLogs("bash", ["-c", expanded], `delegated ${appName}`, workDir);
  }
}

async function linkAppBinaries(appName: string, version: string, binName: string, shimName = appName) {
  const currentLink = join(APPS_DIR, appName, "current");
  try { await Deno.remove(currentLink, { recursive: true }); } catch { }
  await Deno.symlink(join(APPS_DIR, appName, version), currentLink, { type: "dir" });

  await ensureDir(BIN_DIR);
  const binPath = join(BIN_DIR, shimName);
  try { await Deno.remove(binPath); } catch { }
  const shimTarget = join(currentLink, "bin", binName);
  await Deno.symlink(shimTarget, binPath, { type: "file" });

  console.log(`Installed '${appName}' -> ${binPath} (-> ${shimTarget})`);
}

async function isAppLinked(appName: string, version: string, binName: string, shimName = appName): Promise<boolean> {
  const binPath = join(BIN_DIR, shimName);
  const shimTarget = join(APPS_DIR, appName, "current", "bin", binName);
  try {
    return await Deno.realPath(binPath) === await Deno.realPath(shimTarget);
  } catch {
    return false;
  }
}

async function verifyEnvPaths() {
  await ensureScoopixInitialized();
}

async function installApp(app: string, opts: any = {}) {
  info(`installApp called with app='${app}'`);
  const installOpts = { ...opts, requestedApp: opts.requestedApp ?? app };

  const { appName, version, info: infoObj, bucket } = await resolveAppInfo(app);
  const stack = installOpts.stack ?? [];
  if (stack.includes(appName)) {
    throw new Error(`Dependency cycle detected: ${[...stack, appName].join(" -> ")}`);
  }

  for (const dependency of infoObj.depends ?? []) {
    const dependencyApp = dependency.includes("/") ? dependency : `${bucket}/${dependency}`;
    await installApp(dependencyApp, { ...installOpts, stack: [...stack, appName], suppressOutput: true });
  }

  if ((infoObj as any).type === "meta") {
    if (!installOpts.suppressOutput) {
      const description = infoObj.description ? ` - ${infoObj.description}` : "";
      console.log(`Already installed: ${bucket}/${appName}:${version}${description}`);
    }
    info(`installApp: completed meta package '${appName}'`);
    return;
  }

  if ((infoObj as any).type === "artifact") {
    await installArtifact(appName, version, infoObj as any, installOpts);
    info(`installApp: completed artifact build of '${appName}'`);
    return;
  }

  const binName = infoObj.bin?.toString() ?? appName;
  const shimName = infoObj.shim ?? appName;
  const { dest } = await prepareAppDirectories(appName, version, binName);
  const canUseInstalled = !installOpts.ignoreBuildCache && !installOpts.ignoreDownloadCache;

  if (canUseInstalled && await exists(dest)) {
    if (await isAppLinked(appName, version, binName, shimName)) {
      if (!installOpts.suppressOutput) {
        console.log(`Already installed: ${appName} ${version}.`);
        await verifyEnvPaths();
      }
      return;
    }
    await linkAppBinaries(appName, version, binName, shimName);
    if (!installOpts.suppressOutput) {
      console.log(`Relinked existing: ${appName} ${version}.`);
      await verifyEnvPaths();
    }
    return;
  }

  if (infoObj.commands) {
    await installFromDelegated(infoObj, appName);
  } else if (infoObj.type === "src") {
    info(`installApp: source build requested for '${appName}'`);
    await buildFromSource(appName, infoObj as any, dest, opts);
  } else {
    await installFromBinary(infoObj, dest, opts);
  }

  await linkAppBinaries(appName, version, binName, shimName);
  if (!installOpts.suppressOutput) {
    await verifyEnvPaths();
  }

  info(`installApp: completed installation of '${appName}'`);
}

async function detectArch(): Promise<string> {
  const sysArch = Deno.build.arch; // coarse value
  try {
    const p = Deno.run({ cmd: ["uname", "-m"], stdout: "piped" });
    const raw = new TextDecoder().decode(await p.output()).trim();
    await p.status();
    switch (raw) {
      case "x86_64":
      case "amd64":
        return "x86_64";
      case "aarch64":
      case "arm64":
        return "aarch64";
      case "armv7l":
      case "armhf":
      case "arm":
        return "armv7";
      default:
        return sysArch; // fallback to Deno's
    }
  } catch {
    return sysArch;
  }
}

async function detectHostArchKeys(): Promise<string[]> {
  const keys: string[] = [];
  const uname = await captureCommand("uname", ["-a"]);
  const synologyPlatform = uname.code === 0 ? uname.stdout.match(/synology_([^\s]+)/)?.[1] : undefined;
  if (synologyPlatform) {
    const packageArch = synologyPlatform.split("_")[0];
    keys.push(`synology-${synologyPlatform}`);
    keys.push(`synology-${packageArch}`);
    keys.push("synology");
  }
  keys.push(await detectArch());
  return [...new Set(keys)];
}

async function pathExistsNoFollow(path: string): Promise<boolean> {
  try {
    await Deno.lstat(path);
    return true;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return false;
    throw err;
  }
}

async function removeIfPresent(path: string, opts: { recursive?: boolean } = {}): Promise<boolean> {
  if (!(await pathExistsNoFollow(path))) return false;
  await Deno.remove(path, { recursive: opts.recursive ?? false });
  return true;
}

async function uninstallApp(app: string) {
  const appName = app.includes("/") ? app.split("/").pop()! : app;
  const found = await findApp(app);
  const shimName = found?.info?.shim ?? appName;
  const candidates = [...new Set([
    join(BIN_DIR, shimName),
    join(BIN_DIR, appName),
    join(DEFAULT_BIN_DIR, shimName),
    join(DEFAULT_BIN_DIR, appName),
  ])];
  const removed: string[] = [];

  for (const candidate of candidates) {
    if (await removeIfPresent(candidate)) removed.push(candidate);
  }

  const appDir = join(APPS_DIR, appName);
  if (await removeIfPresent(appDir, { recursive: true })) removed.push(appDir);

  if (removed.length === 0) {
    console.error(`'${app}' is not installed.`);
    return;
  }

  console.log(`Uninstalled '${app}':`);
  for (const path of removed) console.log(`  removed ${path}`);
}
async function buildFromSource(
  app: string,
  infoObj: BucketAppSource,
  dest: string,
  opts: { ignoreBuildCache?: boolean; ignoreDownloadCache?: boolean } = {},
) {
  info(`=== buildFromSource: START for '${app}' ===`);
  const version = infoObj.version ?? "unknown";
  const imageTag = `scoopix/${app}:${version}`;
  const cacheDir = join(SCOOPIX_HOME, "cache");
  const dockerPath = await dockerCommandPath();
  if (!dockerPath) {
    throw new Error("Docker not found. Install Docker/Container Manager or add docker to PATH.");
  }
  await ensureDir(cacheDir);

  // -------------------------------
  // PHASE 1: download source
  // -------------------------------
  let tarName: string | undefined;
  let tarPath: string | undefined;
  if (infoObj.url) {
    tarName = `${app}#${version}.tar.gz`;
    tarPath = join(cacheDir, tarName);
    if (opts.ignoreDownloadCache || !(await exists(tarPath))) {
      info(`[download] curl -L ${infoObj.url} -o ${tarPath}`);
      const resp = await fetch(infoObj.url);
      if (!resp.ok) throw new Error(`Failed to download source: ${resp.status} ${resp.statusText}`);
      const file = await Deno.open(tarPath, { write: true, create: true, truncate: true });
      await resp.body?.pipeTo(file.writable);
      info(`[download] done`);
    } else {
      info(`[download] using cached source tarball: ${tarPath}`);
    }
  } else {
    info(`[download] no source URL specified`);
  }

  // -------------------------------
  // PHASE 2: build docker image
  // -------------------------------
  let reuseImage = !opts.ignoreBuildCache;
  if (reuseImage) {
    const check = new Deno.Command(dockerPath, {
      args: ["images", "-q", imageTag],
      stdout: "piped",
      stderr: "null",
    });
    const out = await check.output();
    reuseImage = out.stdout.length > 0;
  }

  if (reuseImage) {
    info(`[build] reusing existing docker image ${imageTag}`);
  } else {
    const runSteps = infoObj.docker.commands
      .map(c => expandPlaceholders(c, { ...infoObj, ...(infoObj.vars ?? {}), app, version }))
      .join(" && ");

    const dockerfile = [
      `FROM ${infoObj.docker.image}`,
      `WORKDIR /build`,
      tarName ? `COPY ${tarName} /build/` : "",
      `RUN echo '[docker] Running build commands:' && echo '${runSteps}' && ${runSteps}`,
      `CMD ["cp", "-rv", "/out/.", "/out-final/"]`,
    ].filter(Boolean).join("\n");

    const tmpDir = await Deno.makeTempDir();
    const dockerfilePath = join(tmpDir, "Dockerfile");
    await Deno.writeTextFile(dockerfilePath, dockerfile);
    if (tarPath) await Deno.copyFile(tarPath, join(tmpDir, tarName!));

    info(`[build] context dir: ${tmpDir}`);
    info(`[build] dockerfile:\n${dockerfile}`);
    const dockerBuildCmd = `${dockerPath} build -t ${imageTag} ${tmpDir}`;
    info(`[build] running: ${dockerBuildCmd}`);
    await runCommandWithLogs(dockerPath, ["build", "-t", imageTag, tmpDir], `docker build for '${app}'`);
  }

  // -------------------------------
  // PHASE 3: docker run
  // -------------------------------
  const tmpOut = await Deno.makeTempDir();
  const volumeSpec = `${normalizeDockerPath(tmpOut)}:/out-final`;
  const dockerRunCmd = `${dockerPath} run --rm -v ${volumeSpec} ${imageTag}`;
  status(`[run] will execute: ${dockerRunCmd}`);
  status(`[run] container will copy /out -> host ${tmpOut}`);
  await runCommandWithLogs(dockerPath, ["run", "--rm", "-v", volumeSpec, imageTag], `docker run for '${app}'`);

  // -------------------------------
  // PHASE 4: extract binary
  // -------------------------------
  const builtBin = join(tmpOut, infoObj.docker.output.replace("/out/", ""));
  info(`[extract] expecting: ${builtBin}`);
  info(`[extract] verifying existence...`);

  if (!(await exists(builtBin))) {
    error(`[extract] expected binary not found: ${builtBin}`);
    console.error("--- DEBUG INFO ---");
    console.error(`Docker image tag: ${imageTag}`);
    console.error(`Expected docker output: ${infoObj.docker.output}`);
    console.error(`Temp output dir: ${tmpOut}`);
    console.error(`Try manually:\n  docker run -it ${imageTag} sh\n  ls -l /out\n`);
    console.error(`Or rerun manually the extraction command:\n  ${dockerRunCmd}`);
    for await (const f of Deno.readDir(tmpOut)) console.error(" ", f.name);
    Deno.exit(1);
  }

  await ensureDir(dirname(dest));
  const copyCmd = `cp ${builtBin} ${dest}`;
  info(`[extract] running: ${copyCmd}`);
  await Deno.copyFile(builtBin, dest);
  await Deno.chmod(dest, 0o755);

  info(`=== buildFromSource: DONE for '${app}' ===`);
}

function normalizeDockerPath(p: string): string {
  if (Deno.build.os !== "windows") return p;
  return p.replace(/^([A-Za-z]):\\/, (_, d) => `/${d.toLowerCase()}/`).replaceAll("\\", "/");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function formatCommand(cmd: string, args: string[]): string {
  return [cmd, ...args].map(shellQuote).join(" ");
}

function displayPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function formatStream(value: string): string {
  const trimmed = value.trimEnd();
  return trimmed.length > 0 ? trimmed : "<empty>";
}

async function runCommandWithLogs(
  cmd: string,
  args: string[],
  context: string,
  cwd?: string,
  opts: { briefFailure?: boolean } = {},
): Promise<void> {
  const showChildOutput = VERBOSITY - QUIET > 0;
  const showCommandTranscript = !opts.briefFailure || VERBOSITY - QUIET >= 2;
  const prefix = `[${context}] `;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const dockerEnv = (Deno.build.os === "windows" && cmd === "docker")
    ? { ...Deno.env.toObject(), MSYS_NO_PATHCONV: "1" }
    : undefined;

  const formattedCommand = formatCommand(cmd, args);
  if (showCommandTranscript) {
    status(`# ${context}`);
    status(`# cwd: ${displayPath(cwd ?? Deno.cwd())}`);
    status(formattedCommand);
    if (cmd === "bash" && args[0] === "-c" && args[1]) {
      status("# bash script:");
      status(args[1]);
    }
  }

  const process = new Deno.Command(cmd, {
    args,
    cwd,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
    env: dockerEnv,
  }).spawn();

  let stdoutText = "";
  let stderrText = "";

  const pump = async (stream: ReadableStream<Uint8Array> | null, isErr: boolean) => {
    if (!stream) return;
    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      if (isErr) {
        stderrText += chunk;
        if (showChildOutput) Deno.stderr.writeSync(encoder.encode(prefix + chunk));
      } else {
        stdoutText += chunk;
        if (showChildOutput) Deno.stdout.writeSync(encoder.encode(prefix + chunk));
      }
    }
  };

  const [commandStatus] = await Promise.all([
    process.status,
    pump(process.stdout, false),
    pump(process.stderr, true),
  ]);

  const durationMs = Date.now() - startedAt;
  if (!commandStatus.success) {
    if (opts.briefFailure) {
      throw new Error(`${context} failed with exit code ${commandStatus.code}`);
    }
    error(`${context} failed`);
    console.error(`Command: ${formattedCommand}`);
    console.error(`Workdir: ${displayPath(cwd ?? Deno.cwd())}`);
    console.error(`Exit code: ${commandStatus.code}`);
    console.error(`Duration: ${durationMs} ms`);
    console.error(`stdout/stderr policy: captured separately; streamed while running when not quiet`);
    if (dockerEnv) console.error(`Environment overrides:`, dockerEnv);
    console.error("---- STDOUT ----\n" + formatStream(stdoutText));
    console.error("---- STDERR ----\n" + formatStream(stderrText));
    throw new Error(`${context} failed with exit code ${commandStatus.code}`);
  }

  debug(`# ${context} completed; exit code 0; duration ${durationMs} ms`);
}


function placeholderValue(obj: Record<string, any>, path: string): unknown {
  return path.split(".").reduce((value, key) => {
    if (value && typeof value === "object" && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj as unknown);
}

function expandPlaceholders(cmd: string, obj: Record<string, any>): string {
  return cmd.replace(/\{([\w.]+)\}/g, (_, key) => {
    const value = placeholderValue(obj, key);
    return value === undefined || value === null ? "" : String(value);
  });
}

async function downloadFile(url: string, dest: string, opts: { force?: boolean; label?: string } = {}) {
  if (!opts.force && await exists(dest)) {
    status(`[download] using cached file ${dest}`);
    return;
  }

  await ensureDir(dirname(dest));
  const tempDest = `${dest}.part`;
  await Deno.remove(tempDest, { recursive: true }).catch(() => {});

  status(`[download] ${url} -> ${dest}`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to download ${url}: ${resp.status} ${resp.statusText}`);

  const total = Number(resp.headers.get("content-length") ?? "0");
  const file = await Deno.open(tempDest, { write: true, create: true, truncate: true });
  const reader = resp.body?.getReader();
  if (!reader) {
    file.close();
    throw new Error(`Download response has no body: ${url}`);
  }

  let downloaded = 0;
  let lastPrinted = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await file.write(value);
      downloaded += value.length;
      const now = Date.now();
      if (now - lastPrinted > 1000) {
        lastPrinted = now;
        if (total > 0) {
          const pct = ((downloaded / total) * 100).toFixed(1);
          status(`[download] ${opts.label ?? basename(dest)} ${pct}% (${downloaded}/${total} bytes)`);
        } else {
          status(`[download] ${opts.label ?? basename(dest)} ${downloaded} bytes`);
        }
      }
    }
  } finally {
    file.close();
  }

  await Deno.remove(dest).catch(() => {});
  await Deno.rename(tempDest, dest);
  status(`[download] completed ${dest}`);
}

async function copyTree(src: string, dest: string) {
  const stat = await Deno.stat(src);
  if (stat.isDirectory) {
    await ensureDir(dest);
    for await (const entry of Deno.readDir(src)) {
      await copyTree(join(src, entry.name), join(dest, entry.name));
    }
  } else {
    await ensureDir(dirname(dest));
    await Deno.copyFile(src, dest);
  }
}

async function copyMatchingFiles(src: string, dest: string, pattern: RegExp) {
  const stat = await Deno.stat(src);
  if (stat.isDirectory) {
    for await (const entry of Deno.readDir(src)) {
      await copyMatchingFiles(join(src, entry.name), dest, pattern);
    }
  } else if (pattern.test(basename(src))) {
    await ensureDir(dest);
    await Deno.copyFile(src, join(dest, basename(src)));
  }
}

async function removeTree(path: string, label: string) {
  try {
    await Deno.remove(path, { recursive: true });
  } catch (err) {
    warn(`${label}: could not remove ${path}: ${err}`);
  }
}

async function hasDirectoryEntries(path: string): Promise<boolean> {
  try {
    for await (const _entry of Deno.readDir(path)) return true;
  } catch {
    return false;
  }
  return false;
}

async function isRootUser(): Promise<boolean> {
  if (Deno.build.os === "windows") return false;
  const id = await captureCommand("id", ["-u"]);
  return id.code === 0 && id.stdout.trim() === "0";
}

async function writeInstallState(app: string, statusValue: "installed" | "failed", detail: Record<string, unknown> = {}) {
  await ensureDir(STATE_DIR);
  const statePath = join(STATE_DIR, `${safeStateName(app)}.json`);
  await Deno.writeTextFile(statePath, JSON.stringify({
    app,
    status: statusValue,
    updatedAt: new Date().toISOString(),
    ...detail,
  }, null, 2));
}

async function readInstallState(app: string): Promise<any | null> {
  try {
    return JSON.parse(await Deno.readTextFile(join(STATE_DIR, `${safeStateName(app)}.json`)));
  } catch {
    return null;
  }
}

async function withInstallLock<T>(app: string, fn: () => Promise<T>): Promise<T> {
  await ensureDir(LOCKS_DIR);
  const lockDir = join(LOCKS_DIR, `${safeStateName(app)}.lock`);
  try {
    await Deno.mkdir(lockDir);
    await Deno.writeTextFile(join(lockDir, "owner.json"), JSON.stringify({
      app,
      pid: Deno.pid,
      startedAt: new Date().toISOString(),
    }, null, 2));
  } catch {
    const ownerPath = join(lockDir, "owner.json");
    let detail = lockDir;
    try {
      detail = await Deno.readTextFile(ownerPath);
    } catch {
      // Keep the lock path as the diagnostic.
    }
    throw new Error(`another install is already running or a previous install left a lock: ${detail}`);
  }

  try {
    return await fn();
  } finally {
    await Deno.remove(lockDir, { recursive: true }).catch(() => {});
  }
}

async function runManifestCommands(
  commands: string[] | undefined,
  placeholders: Record<string, any>,
  context: string,
  cwd: string,
  opts: { briefFailure?: boolean } = {},
) {
  for (const cmd of commands ?? []) {
    const expanded = expandPlaceholders(cmd, placeholders);
    await runCommandWithLogs("bash", ["-c", expanded], context, cwd, opts);
  }
}

function commandList(commandOrCommands: string | string[] | undefined): string[] {
  if (!commandOrCommands) return [];
  return Array.isArray(commandOrCommands) ? commandOrCommands : [commandOrCommands];
}

async function runPackageScriptAction(app: string, scriptName: string) {
  try {
    await runPackageScript(app, scriptName);
  } catch (err) {
    error(`Script failed: ${app} ${scriptName}`);
    console.error(`Reason: ${err instanceof Error ? err.message : String(err)}`);
    if (VERBOSITY - QUIET >= 2 && err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    Deno.exit(1);
  }
}

async function runPackageScript(app: string, scriptName: string) {
  const { appName, version, info: infoObj, bucket } = await resolveAppInfo(app);
  const script = infoObj.scripts?.[scriptName];
  if (!script) {
    error(`script '${scriptName}' not found for '${bucket}/${appName}'`);
    const names = Object.keys(infoObj.scripts ?? {});
    console.error(names.length ? `Available scripts: ${names.join(", ")}` : "This package defines no scripts.");
    Deno.exit(1);
  }

  const vars = await resolveVars(infoObj.vars ?? {});
  const workDir = join(TEMP_DIR, appName, "scripts", scriptName);
  await ensureDir(workDir);
  const placeholders = {
    ...infoObj,
    ...vars,
    vars,
    app: appName,
    bucket,
    version,
    scoopixHome: SCOOPIX_HOME,
    binDir: BIN_DIR,
    tempDir: TEMP_DIR,
    workDir,
  };

  console.log(`Running: ${bucket}/${appName}:${version} ${scriptName}`);
  await runManifestCommands(commandList(script), placeholders, `script ${bucket}/${appName}:${scriptName}`, workDir, { briefFailure: true });
  console.log(`Script complete: ${bucket}/${appName}:${version} ${scriptName}`);
}

async function manifestCommandsPass(
  commands: string[] | undefined,
  placeholders: Record<string, any>,
  cwd: string,
): Promise<boolean> {
  if (!commands?.length) return false;
  await ensureDir(cwd);
  for (const cmd of commands) {
    const expanded = expandPlaceholders(cmd, placeholders);
    const result = await new Deno.Command("bash", {
      args: ["-c", expanded],
      cwd,
      stdout: "null",
      stderr: "null",
    }).output();
    if (result.code !== 0) return false;
  }
  return true;
}

async function installArtifact(appName: string, version: string, infoObj: any, opts: any = {}) {
  const workDir = join(TEMP_DIR, appName);
  const outputRel = infoObj.output ?? "artifacts";
  const outputDir = join(workDir, outputRel);
  const artifactDir = join(ARTIFACTS_DIR, appName, version);
  const artifactCacheDir = join(CACHE_DIR, appName);
  const vars = await resolveVars(infoObj.vars ?? {});
  const placeholders = {
    ...infoObj,
    ...vars,
    vars,
    app: appName,
    version,
    workDir,
    outputDir,
    artifactDir,
    cacheDir: CACHE_DIR,
    artifactCacheDir,
  };

  const runSystemPhase = async () => {
    const requestedApp = opts.requestedApp ?? appName;
    info(`installArtifact: ${appName} has ${(infoObj.systemInstalledTests ?? []).length} system-installed tests`);
    if (opts.system) {
      if (!(await isRootUser())) {
        error(`installArtifact: --system requires root for '${appName}'`);
        console.error("To install system-wide, start the command with sudo:");
        console.error(`  ${SCOOPIX_SYSTEM_COMMAND} install ${requestedApp} --system`);
        Deno.exit(1);
      }
      await runManifestCommands(infoObj.systemCommands, placeholders, `system ${appName}`, workDir);
      await runManifestCommands(infoObj.postInstallTests, placeholders, `post-install-test ${appName}`, workDir);
      if (!opts.suppressOutput) {
        console.log(`Installed and verified: ${placeholders.systemName ?? appName}.`);
      }
    } else if (infoObj.systemCommands?.length) {
      if (await manifestCommandsPass(infoObj.systemPresentTests, placeholders, workDir)) {
        if (!opts.suppressOutput) {
          console.log(`Already installed: ${placeholders.systemName ?? appName}.`);
        }
        return;
      }
      if (!opts.suppressOutput) {
        warn(`installArtifact: '${appName}' was built only; system install commands were not run.`);
        console.log("To install system-wide, run:");
        console.log(`  ${SCOOPIX_SYSTEM_COMMAND} install ${requestedApp} --system`);
      }
    } else {
      if (!opts.suppressOutput) {
        console.log("Install manually or with a future --system command. For Synology SPKs, use DSM Package Center or synopkg.");
      }
    }
  };

  if (!opts.forceArtifactBuild && await hasDirectoryEntries(artifactDir)) {
    info(`installArtifact: using cached artifact '${appName}' ${version} -> ${artifactDir}`);
    if (opts.system) {
      await ensureDir(workDir);
    }
    await runSystemPhase();
    if (opts.system && !opts.keepTemp) {
      await removeTree(workDir, "installArtifact cleanup after cached artifact");
    }
    return;
  }

  if (opts.system && await isRootUser()) {
    warn("installArtifact: building as root because --system was requested; cache/temp/artifact files under HOME may become root-owned.");
    warn("installArtifact: to avoid that, build once without --system as the normal user, then rerun --system to reuse the cached artifact.");
  }

  status(`installArtifact: building artifact '${appName}' ${version}`);
  await removeTree(workDir, "installArtifact cleanup before build");
  await ensureDir(workDir);
  await ensureDir(artifactCacheDir);

  const urls = [infoObj.url, ...(infoObj.urls ?? [])].filter((url): url is string => typeof url === "string" && url.length > 0);
  for (const entry of urls) {
    const url = expandPlaceholders(entry, placeholders);
    const dest = join(artifactCacheDir, basename(new URL(url).pathname));
    await downloadFile(url, dest, {
      force: opts.ignoreDownloadCache,
      label: `${appName}/${basename(dest)}`,
    });
  }

  await runManifestCommands(infoObj.commands, placeholders, `artifact ${appName}`, workDir);

  if (!(await exists(outputDir))) {
    error(`installArtifact: expected output directory not found: ${outputDir}`);
    Deno.exit(1);
  }

  await removeTree(artifactDir, "installArtifact cleanup before copy");
  if (infoObj.flattenOutput) {
    await copyMatchingFiles(outputDir, artifactDir, new RegExp(infoObj.flattenOutput));
  } else {
    await copyTree(outputDir, artifactDir);
  }
  if (!opts.suppressOutput) {
    console.log(`Compiled: ${placeholders.systemName ?? appName} artifact ${version}.`);
  } else {
    info(`Compiled artifact '${appName}' ${version} -> ${artifactDir}`);
  }

  await runSystemPhase();

  if (!opts.keepTemp) {
    await removeTree(workDir, "installArtifact cleanup after build");
  } else {
    warn(`installArtifact: kept temp dir for debugging: ${workDir}`);
  }
}

const SHELL_RC_MAP: Record<string, string[]> = {
  bash: [".bashrc", ".bash_profile", ".profile"],
  zsh: [".zshrc", ".zprofile"],
  ksh: [".kshrc", ".profile"],
  sh: [".profile"],
  ash: [".profile"],
  dash: [".profile"],
  csh: [".cshrc"],
  tcsh: [".tcshrc"],
  fish: [".config/fish/config.fish"],
};
type ShellInitSuggestion = {
  shell: string;
  recommended: string;
  alternates: string[];
};

async function detectShellInits(): Promise<ShellInitSuggestion[]> {
  const home = USER_HOME;
  const results: ShellInitSuggestion[] = [];

  for (const [shell, files] of Object.entries(SHELL_RC_MAP)) {
    const existing: string[] = [];
    for (const rel of files) {
      if (await exists(join(home, rel))) {
        existing.push(rel);
      }
    }
    if (existing.length > 0) {
      const recommended = existing.find(f => f.includes("rc")) ?? existing[0];
      const alternates = existing.filter(f => f !== recommended);
      results.push({ shell, recommended, alternates });
    }
  }

  if (results.length === 0) {
    results.push({ shell: "sh", recommended: ".profile", alternates: [] });
  }

  return results;
}
function formatShellInits(suggestions: ShellInitSuggestion[]): string[] {
  return suggestions.map(s => {
    const note = s.alternates.length > 0
      ? `recommended (${s.recommended}), other candidates: ${s.alternates.join(", ")}`
      : `recommended (${s.recommended})`;
    return `  scoopix init ${s.shell}   # ${note}`;
  });
}

async function chownToSudoUser(path: string) {
  const uid = Deno.env.get("SUDO_UID");
  const gid = Deno.env.get("SUDO_GID");
  if (!uid || !gid || !(await isRootUser())) return;
  try {
    await Deno.chown(path, Number(uid), Number(gid));
  } catch (err) {
    warn(`Could not restore ownership of ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function initShell(shellArg?: string, opts: { quietAlready?: boolean; auto?: boolean } = {}) {
  let shell = shellArg;
  if (!shell) {
    // fallback to current shell from $SHELL
    const envShell = Deno.env.get("SHELL");
    if (envShell) {
      shell = envShell.split("/").pop() ?? "sh";
      info(`initShell: auto-detected current shell as '${shell}' from SHELL=${envShell}`);
    } else {
      shell = "sh"; // final fallback
      warn("initShell: could not detect current shell, defaulting to 'sh'");
    }
  } else {
    info(`initShell: shell argument provided: '${shell}'`);
  }

  const home = USER_HOME;
  const suggestions = await detectShellInits();
  const found = suggestions.find(s => s.shell === shell);

  if (!found) {
    if (opts.auto && suggestions.length > 0) {
      shell = suggestions[0].shell;
      info(`initShell: using detected shell '${shell}' for automatic initialization`);
    } else {
      error(`Unsupported or undetected shell: ${shell}`);
      console.error(`Supported shells: ${Object.keys(SHELL_RC_MAP).join(", ")}`);
      Deno.exit(1);
    }
  }

  const selected = suggestions.find(s => s.shell === shell)!;
  const rcFile = join(home, selected.recommended);

  await ensureDir(dirname(rcFile));

  let already = false;
  try {
    const contents = await Deno.readTextFile(rcFile);
    if (contents.includes(SCOOPIX_EXPORT_LINE)) already = true;
  } catch {
    // file may not exist yet
  }

  if (already) {
    info(`PATH already configured in ${rcFile}`);
    if (!opts.quietAlready) {
      console.log(`Scoopix is already initialized for ${shell} (see ${rcFile})`);
    }
  } else {
    await Deno.writeTextFile(rcFile, `\n# Added by Scoopix\n${SCOOPIX_EXPORT_LINE}\n`, { append: true });
    await chownToSudoUser(rcFile);
    info(`Appended PATH export to ${rcFile}`);
    console.log(`Configured Scoopix for ${shell}. Modified ${rcFile}:\n  ${SCOOPIX_EXPORT_LINE}`);
    if (selected.alternates.length > 0) {
      console.log(`Note: other candidate files also exist: ${selected.alternates.join(", ")}`);
    }
    console.log(`Run 'source ${rcFile}' or restart your shell to activate.`);
  }
}

async function ensureScoopixInitialized() {
  const currentPath = Deno.env.get("PATH") ?? "";
  const currentManpath = Deno.env.get("MANPATH") ?? "";
  const pathOk = currentPath.split(":").includes(BIN_DIR);
  const manOk = currentManpath.split(":").includes(join(SCOOPIX_HOME, "share", "man"));
  if (pathOk && manOk) return;
  await initShell(undefined, { quietAlready: true, auto: true });
}

type DoctorCheck = {
  name: string;
  status: "ok" | "warn" | "fail" | "info";
  detail: string;
};

function printDoctorCheck(check: DoctorCheck) {
  const marker = {
    ok: "OK",
    warn: "WARN",
    fail: "FAIL",
    info: "INFO",
  }[check.status];
  console.log(`[${marker}] ${check.name}: ${check.detail}`);
}

async function captureCommand(
  cmd: string,
  args: string[] = [],
): Promise<{ code: number; stdout: string; stderr: string; missing: boolean }> {
  try {
    const result = await new Deno.Command(cmd, {
      args,
      stdout: "piped",
      stderr: "piped",
    }).output();
    return {
      code: result.code,
      stdout: new TextDecoder().decode(result.stdout).trim(),
      stderr: new TextDecoder().decode(result.stderr).trim(),
      missing: false,
    };
  } catch (err) {
    return { code: 127, stdout: "", stderr: String(err), missing: true };
  }
}

async function commandPath(cmd: string): Promise<string | null> {
  const found = Deno.build.os === "windows"
    ? await captureCommand("where", [cmd])
    : await captureCommand("sh", ["-c", `command -v ${cmd}`]);
  if (found.code !== 0 || !found.stdout) return null;
  return found.stdout.split(/\r?\n/)[0];
}

async function firstExisting(paths: string[]): Promise<string | null> {
  for (const path of paths) {
    if (await exists(path)) return path;
  }
  return null;
}

async function dockerCommandPath(): Promise<string | null> {
  return await commandPath("docker") ?? await firstExisting([
    "/usr/local/bin/docker",
    "/usr/bin/docker",
    "/var/packages/ContainerManager/target/usr/bin/docker",
    "/var/packages/Docker/target/usr/bin/docker",
  ]);
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(path);
  } catch {
    return null;
  }
}

function parseSynologyVersion(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([a-zA-Z0-9_]+)="?([^"]*)"?$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

async function detectSynologyPackageArch(): Promise<string | null> {
  const uname = await captureCommand("uname", ["-a"]);
  if (uname.code !== 0) return null;
  const platform = uname.stdout.match(/synology_([^\s]+)/)?.[1];
  return platform?.split("_")[0] ?? null;
}

async function detectSynologyDsmVersion(): Promise<string | null> {
  const versionText = await readIfExists("/etc.defaults/VERSION");
  if (!versionText) return null;
  return parseSynologyVersion(versionText).productversion ?? null;
}

function synologyToolkitDsmVersion(productVersion: string): string {
  const majorMinor = productVersion.match(/^(\d+)\.(\d+)/);
  if (!majorMinor) return productVersion;
  const major = Number(majorMinor[1]);
  const minor = Number(majorMinor[2]);
  if (major === 7 && minor >= 2) return "7.2";
  return `${major}.${minor}`;
}

async function detectSynologyToolkitDsmVersion(): Promise<string | null> {
  const productVersion = await detectSynologyDsmVersion();
  return productVersion ? synologyToolkitDsmVersion(productVersion) : null;
}

async function resolveVars(rawVars: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const resolved: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(rawVars)) {
    if (value === "auto:synology-package-arch") {
      const detected = await detectSynologyPackageArch();
      if (!detected) throw new Error(`Could not auto-detect vars.${name}: Synology package arch not found in uname`);
      resolved[name] = detected;
    } else if (value === "auto:synology-dsm-version") {
      const detected = await detectSynologyDsmVersion();
      if (!detected) throw new Error(`Could not auto-detect vars.${name}: /etc.defaults/VERSION is unavailable`);
      resolved[name] = detected;
    } else if (value === "auto:synology-dsm-major-minor") {
      const detected = await detectSynologyDsmVersion();
      const majorMinor = detected?.match(/^\d+\.\d+/)?.[0];
      if (!majorMinor) throw new Error(`Could not auto-detect vars.${name}: DSM major.minor version is unavailable`);
      resolved[name] = majorMinor;
    } else if (value === "auto:synology-toolkit-dsm-version") {
      const detected = await detectSynologyToolkitDsmVersion();
      if (!detected) throw new Error(`Could not auto-detect vars.${name}: Synology toolkit DSM version is unavailable`);
      resolved[name] = detected;
    } else {
      resolved[name] = value;
    }
  }
  return resolved;
}

async function doctorHost() {
  console.log("Scoopix doctor: host");

  const installerPackageArch = await detectSynologyPackageArch();
  const installedDsmVersion = await detectSynologyDsmVersion();
  const installerDsmVer = await detectSynologyToolkitDsmVersion();
  if (installerPackageArch || installerDsmVer || installedDsmVersion) {
    console.log("Installer variables:");
    printDoctorCheck({
      name: "vars.packageArch",
      status: installerPackageArch ? "ok" : "warn",
      detail: installerPackageArch ?? "not detected",
    });
    printDoctorCheck({
      name: "vars.dsmVer",
      status: installerDsmVer ? "ok" : "warn",
      detail: installerDsmVer
        ? `${installerDsmVer}${installedDsmVersion && installedDsmVersion !== installerDsmVer ? ` (from DSM ${installedDsmVersion})` : ""}`
        : "not detected",
    });
  }

  const versionText = await readIfExists("/etc.defaults/VERSION");
  if (versionText) {
    const version = parseSynologyVersion(versionText);
    const label = [
      version.os_name ?? "DSM",
      version.productversion,
      version.buildnumber ? `build ${version.buildnumber}` : undefined,
      version.smallfixnumber ? `update ${version.smallfixnumber}` : undefined,
    ].filter(Boolean).join(" ");
    printDoctorCheck({ name: "DSM version", status: "ok", detail: label });
  } else {
    printDoctorCheck({ name: "DSM version", status: "info", detail: "not Synology DSM or /etc.defaults/VERSION is unreadable" });
  }

  const uname = await captureCommand("uname", ["-a"]);
  if (uname.code === 0) {
    printDoctorCheck({ name: "Kernel", status: "ok", detail: uname.stdout });
    const platform = uname.stdout.match(/synology_([^\s]+)/)?.[1];
    printDoctorCheck({
      name: "Synology platform",
      status: platform ? "ok" : "warn",
      detail: platform ?? "could not detect synology_<platform> from uname",
    });
  } else {
    printDoctorCheck({ name: "Kernel", status: "fail", detail: uname.stderr || "uname failed" });
  }

  const lsmod = await captureCommand("lsmod");
  if (lsmod.code === 0) {
    const moduleCount = lsmod.stdout.split(/\r?\n/).filter(Boolean).length;
    printDoctorCheck({ name: "Kernel modules", status: "ok", detail: `${moduleCount} modules listed` });
  } else {
    printDoctorCheck({ name: "Kernel modules", status: "warn", detail: lsmod.stderr || "lsmod unavailable" });
  }

  const ipPath = await commandPath("ip");
  printDoctorCheck({
    name: "iproute2",
    status: ipPath ? "ok" : "warn",
    detail: ipPath ?? "ip command not found",
  });

  const dockerPath = await dockerCommandPath();
  if (dockerPath) {
    const docker = await captureCommand(dockerPath, ["version"]);
    printDoctorCheck({
      name: "Docker",
      status: docker.code === 0 ? "ok" : "warn",
      detail: docker.code === 0 ? dockerPath : `${dockerPath} exists but daemon check failed: ${docker.stderr || docker.stdout}`,
    });
  } else {
    printDoctorCheck({ name: "Docker", status: "warn", detail: "docker not found on PATH; SPK artifact builds require Docker or Container Manager" });
  }

  const gitPath = await commandPath("git") ?? await firstExisting([
    "/opt/bin/git",
    "/usr/local/bin/git",
    "/usr/bin/git",
    "/bin/git",
  ]);
  printDoctorCheck({
    name: "git",
    status: gitPath ? "ok" : "warn",
    detail: gitPath ?? "git not found on PATH; source-based SPK builds need git or a source archive",
  });
}

async function doctor(topic?: string) {
  const selected = topic ?? "host";
  if (selected === "host" || selected === "all") {
    await doctorHost();
    return;
  }
  console.error(`Unknown doctor topic '${selected}'. Available topics: host`);
  Deno.exit(1);
}

await new Command()
  .name("scoopix")
  .version("0.1.0")
  .description("Scoop like installer for Linux - user space, buckets, user light contributions")
  .arguments("[app:string] [script:string]")
  .action(async function (_opts, app, script) {
    if (app && script) {
      await runPackageScriptAction(app, script);
      return;
    }
    this.showHelp();
  })
  .globalOption("-v, --verbose", "Increase verbosity", { collect: true, value: () => { VERBOSITY++; return VERBOSITY; } })
  .globalOption("-q, --quiet", "Decrease verbosity", { collect: true, value: () => { QUIET++; return QUIET; } })
  .command("install <app:string>", "Install an app from all buckets")
  .option("--ignore-build-cache", "Force rebuild from source, ignoring cached Docker image")
  .option("--ignore-download-cache", "Force re-download even if cached")
  .option("--force-artifact-build", "Force rebuilding artifact outputs even if cached")
  .option("--keep-temp", "Keep extracted files in ~/.scoopix/temp/<app>")
  .option("--system", "Run system install commands after building, requires root")
  .action(async (opts, app) => {
    try {
      await withInstallLock(app, async () => {
        const previous = await readInstallState(app);
        if (previous?.status === "failed") {
          warn(`Previous install failed for '${app}' at ${previous.updatedAt}. Retrying now.`);
        }
        if (opts.system && !(await isRootUser())) {
          error(`install: --system requires root for '${app}'`);
          console.error("To install system-wide, start the command with sudo:");
          console.error(`  ${SCOOPIX_SYSTEM_COMMAND} install ${app} --system`);
          Deno.exit(1);
        }
        await installApp(app, {
          ignoreBuildCache: opts.ignoreBuildCache,
          ignoreDownloadCache: opts.ignoreDownloadCache,
          forceArtifactBuild: opts.forceArtifactBuild,
          keepTemp: opts.keepTemp,
          system: opts.system,
        });
        await ensureScoopixInitialized();
        await writeInstallState(app, "installed", { system: Boolean(opts.system) });
      });
      if (opts.system) {
        console.log(`System install complete for '${app}'.`);
      }
    } catch (err) {
      await writeInstallState(app, "failed", { reason: err instanceof Error ? err.message : String(err) }).catch(() => {});
      error(`Install failed: ${app}`);
      console.error(`Reason: ${err instanceof Error ? err.message : String(err)}`);
      if (VERBOSITY - QUIET >= 2 && err instanceof Error && err.stack) {
        console.error(err.stack);
      }
      Deno.exit(1);
    }
  })
  .command("uninstall <app:string>", "Uninstall an app")
  .action(async (_opts, app) => { await uninstallApp(app); })
  .command("run <app:string> <script:string>", "Run a package script")
  .action(async (_opts, app, script) => { await runPackageScriptAction(app, script); })
  .command("bucket", new Command()
    .description("Manage buckets")
    .action(function () { this.showHelp(); })
    .command("add <url:string> [name:string]", "Add a bucket manifest from url")
    .action(async (_opts, url, name) => { await addBucket(url, name); })
    .command("list", "List available buckets")
    .action(async () => {
      await ensureDefaultMainBucket();
      const buckets = await listBuckets();
      for (const b of buckets) console.log(b);
    })
  )
  .command("list", "List all apps in all buckets")
  .option("--full", "Show full bucket path")
  .action(async (cliOpts) => {
    await listApps(cliOpts.full ?? false);
  })
  .command("versions <app:string>", "List upstream versions for an app")
  .action(async (_opts, app) => {
    await printVersions(app);
  })
  .command("checkver <app:string>", "Check whether an app manifest is current")
  .action(async (_opts, app) => {
    await checkVersion(app);
  })
  .command("init [shell:string]", "Configure PATH in shell rc file")
  .action(async (_opts, shell) => {
    await initShell(shell);
  })
  .command("system-info", "Show system architecture and distribution")
  .action(async () => {
    console.log("Platform:", Deno.build.os);
    console.log("Arch:", Deno.build.arch);

    try {
      const uname = new Deno.Command("uname", { args: ["-a"] });
      const { stdout } = await uname.output();
      console.log("Uname:", new TextDecoder().decode(stdout).trim());
    } catch {
      console.log("Uname: not available");
    }
  })
  .command("doctor [topic:string]", "Check host compatibility for Scoopix packages")
  .description("Available topics: host")
  .action(async (_opts, topic) => {
    await doctor(topic);
  })
  .parse(Deno.args);
