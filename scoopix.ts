#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env --allow-run
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";
import { exists } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { join, dirname, basename, isAbsolute, relative } from "https://deno.land/std@0.224.0/path/mod.ts";
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

let USER_HOME = scoopixUserHome();
let SCOOPIX_HOME = join(USER_HOME, ".scoopix");
let APPS_DIR = join(SCOOPIX_HOME, "apps");
let BIN_DIR = join(SCOOPIX_HOME, "bin");
let DEFAULT_BIN_DIR = join(USER_HOME, "bin");
let CACHE_DIR = join(SCOOPIX_HOME, "cache");
let TEMP_DIR = join(SCOOPIX_HOME, "temp");
let ARTIFACTS_DIR = join(SCOOPIX_HOME, "artifacts");
let STATE_DIR = join(SCOOPIX_HOME, "state");
let SAVED_VERSIONS_FILE = join(SCOOPIX_HOME, "saved-versions.json");
let APPS_STATE_DIR = join(STATE_DIR, "apps");
let SHIMS_STATE_DIR = join(STATE_DIR, "shims");
let LOCKS_DIR = join(SCOOPIX_HOME, "locks");
const SCOOPIX_SYSTEM_COMMAND = "sudo scoopix";

function configureScoopixHome(home: string) {
  USER_HOME = home;
  SCOOPIX_HOME = join(USER_HOME, ".scoopix");
  APPS_DIR = join(SCOOPIX_HOME, "apps");
  BIN_DIR = join(SCOOPIX_HOME, "bin");
  DEFAULT_BIN_DIR = join(USER_HOME, "bin");
  CACHE_DIR = join(SCOOPIX_HOME, "cache");
  TEMP_DIR = join(SCOOPIX_HOME, "temp");
  ARTIFACTS_DIR = join(SCOOPIX_HOME, "artifacts");
  STATE_DIR = join(SCOOPIX_HOME, "state");
  SAVED_VERSIONS_FILE = join(SCOOPIX_HOME, "saved-versions.json");
  APPS_STATE_DIR = join(STATE_DIR, "apps");
  SHIMS_STATE_DIR = join(STATE_DIR, "shims");
  LOCKS_DIR = join(SCOOPIX_HOME, "locks");
}
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

export interface ScoopixHealthcheck {
  command?: string;
  args?: string[];
  match?: string;
  stream?: "stdout" | "stderr" | "combined";
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
  healthcheck?: ScoopixHealthcheck;
  arch?: Record<string, ScoopixArchEntry>;
  docker?: ScoopixDocker;
}

export type ScoopixManifest = Record<string, ScoopixApp>;

type ScoopixConfig = { buckets: Record<string, string> };

type ShimState = {
  name: string;
  owner: string;
  version: string;
  target: string;
  updatedAt: string;
};

type AppState = {
  name: string;
  owner: string;
  version: string;
  updatedAt: string;
};

type SavedVersion = {
  version: string;
  reason?: string;
  savedAt: string;
};

type SavedVersionsFile = {
  version: 1;
  apps: Record<string, SavedVersion[]>;
};

async function readConfig(): Promise<ScoopixConfig> {
  const cfgPath = join(SCOOPIX_HOME, "config.json");
  if (!(await exists(cfgPath))) return { buckets: {} };
  const cfg = JSON.parse(await Deno.readTextFile(cfgPath));
  cfg.buckets ??= {};
  return cfg;
}

async function writeConfig(cfg: ScoopixConfig) {
  await ensureDir(SCOOPIX_HOME);
  await chownToSudoUser(SCOOPIX_HOME);
  const cfgPath = join(SCOOPIX_HOME, "config.json");
  await Deno.writeTextFile(cfgPath, JSON.stringify(cfg, null, 2));
  await chownToSudoUser(cfgPath);
}

async function listBuckets(): Promise<{ name: string, path: string }[]> {
  info(`Listing buckets from ${SCOOPIX_HOME}`);
  const cfg = await readConfig();
  return Object.entries(cfg.buckets ?? {}).map(([name, path]) => ({ name, path }));
}

async function ensureDefaultMainBucket(): Promise<void> {
  const cfg = await readConfig();
  if (cfg.buckets.main && !LEGACY_MAIN_BUCKET_URLS.includes(cfg.buckets.main)) return;
  const action = cfg.buckets.main ? "Updated" : "Configured";
  cfg.buckets.main = DEFAULT_MAIN_BUCKET_URL;
  await writeConfig(cfg);
  status(`${action} default bucket 'main' -> ${DEFAULT_MAIN_BUCKET_URL}`);
}

async function addBucket(url: string, name?: string) {
  const cfg = await readConfig();

  const bucketName = name || url.split("/").pop()?.replace(/\.json$/, "") || "bucket";
  const absPath = url.startsWith("http://") || url.startsWith("https://")
    ? url
    : isAbsolute(url) ? url : join(Deno.cwd(), url);

  cfg.buckets[bucketName] = absPath;
  await writeConfig(cfg);
  console.log(`Added bucket '${bucketName}' -> ${absPath}`);
}

async function removeBucket(name: string) {
  const cfg = await readConfig();
  const existing = cfg.buckets[name];
  if (!existing) {
    console.error(`Bucket '${name}' is not configured.`);
    Deno.exit(1);
  }
  delete cfg.buckets[name];
  await writeConfig(cfg);
  console.log(`Removed bucket '${name}' -> ${existing}`);
}

async function readSavedVersions(): Promise<SavedVersionsFile> {
  if (!(await exists(SAVED_VERSIONS_FILE))) return { version: 1, apps: {} };
  const parsed = JSON.parse(await Deno.readTextFile(SAVED_VERSIONS_FILE));
  parsed.version ??= 1;
  parsed.apps ??= {};
  return parsed;
}

async function writeSavedVersions(saved: SavedVersionsFile) {
  await ensureDir(SCOOPIX_HOME);
  await Deno.writeTextFile(SAVED_VERSIONS_FILE, JSON.stringify(saved, null, 2) + "\n");
  await chownToSudoUser(SAVED_VERSIONS_FILE);
}

async function saveVersion(app: string, version?: string, reason?: string) {
  const parsed = parseVersionedAppSpec(app);
  const requestedVersion = version || parsed.version;
  if (!requestedVersion) throw new Error("save requires a version, for example: save micro@2.0.15");
  const { appName, bucket } = await resolveAppMetadata(parsed.app);
  const appId = `${bucket}/${appName}`;
  const saved = await readSavedVersions();
  const entries = saved.apps[appId] ?? [];
  const existing = entries.find((entry) => entry.version === requestedVersion);
  if (existing) {
    existing.reason = reason ?? existing.reason;
    existing.savedAt = new Date().toISOString();
  } else {
    entries.push({ version: requestedVersion, reason, savedAt: new Date().toISOString() });
  }
  saved.apps[appId] = uniqueSortedVersions(entries.map((entry) => entry.version))
    .map((entryVersion) => entries.find((entry) => entry.version === entryVersion)!);
  await writeSavedVersions(saved);
  console.log(`Saved ${appId}@${requestedVersion}${reason ? ` - ${reason}` : ""}`);
}

async function unsaveVersion(app: string, version?: string) {
  const parsed = parseVersionedAppSpec(app);
  const requestedVersion = version || parsed.version;
  if (!requestedVersion) throw new Error("unsave requires a version, for example: unsave micro@2.0.15");
  const { appName, bucket } = await resolveAppMetadata(parsed.app);
  const appId = `${bucket}/${appName}`;
  const saved = await readSavedVersions();
  const before = saved.apps[appId] ?? [];
  const after = before.filter((entry) => entry.version !== requestedVersion);
  if (after.length === before.length) {
    console.error(`${appId}@${requestedVersion} is not saved.`);
    Deno.exit(1);
  }
  if (after.length) saved.apps[appId] = after;
  else delete saved.apps[appId];
  await writeSavedVersions(saved);
  console.log(`Removed saved version ${appId}@${requestedVersion}`);
}

function formatSavedEntry(appId: string, entry: SavedVersion): string {
  return `${appId}@${entry.version}${entry.reason ? ` - ${entry.reason}` : ""}`;
}

async function savedVersionEntries(appId?: string): Promise<string[]> {
  const saved = await readSavedVersions();
  const lines: string[] = [];
  const entries = appId ? [[appId, saved.apps[appId] ?? []] as const] : Object.entries(saved.apps);
  for (const [savedApp, versions] of entries) {
    for (const entry of versions) lines.push(formatSavedEntry(savedApp, entry));
  }
  return lines;
}

async function printSavedVersions(app?: string) {
  let appId: string | undefined;
  if (app) {
    const parsed = parseVersionedAppSpec(app);
    const { appName, bucket } = await resolveAppMetadata(parsed.app);
    appId = `${bucket}/${appName}`;
  }
  const lines = await savedVersionEntries(appId);
  if (lines.length === 0) {
    console.log("No saved versions.");
    return;
  }
  for (const line of lines) console.log(line);
}

async function formatAppLine(bucket: string, app: string, meta: ScoopixApp, installed: string | null, full = true): Promise<string> {
  const appName = full ? `${bucket}/${app}` : `${bucket}/${app}`;
  const description = meta.description ?? "";
  const provides = meta.provides?.length ? ` (provides: ${meta.provides.join(", ")})` : "";
  const installedText = installed ? ` [installed: ${installed}]` : "";
  return description
    ? `${appName} - ${description}${provides}${installedText}`
    : `${appName}${provides}${installedText}`;
}

async function listApps(full: boolean, installedOnly = false) {
  info(`listApps called with full=${full}`);

  if (installedOnly) {
    await listInstalledApps(full);
    return;
  }

  const buckets = await loadAllBuckets();
  if (buckets.size === 0) {
    info("listApps: no buckets loaded");
    console.log("No apps available");
    return;
  }
  for (const [bucket, manifest] of buckets) {
    for (const [app, meta] of Object.entries(manifest)) {
      const installed = await installedVersion(app);
      console.log(await formatAppLine(bucket, app, meta, installed, full));
    }
  }

  info("listApps completed");
}

async function installedAppLines(full: boolean): Promise<string[]> {
  if (!(await pathExistsNoFollow(APPS_DIR))) {
    return [];
  }

  const lines: string[] = [];
  for await (const entry of Deno.readDir(APPS_DIR)) {
    if (!entry.isDirectory) continue;
    const app = entry.name;
    const installed = await installedVersion(app);
    if (!installed) continue;

    const found = await findApp(app, { allowInstalledOwnerStub: true });
    lines.push(await formatAppLine(
      found?.bucket ?? "<unknown>",
      app,
      found?.info ?? { version: installed },
      installed,
      full,
    ));
  }
  return lines;
}

async function listInstalledApps(full: boolean) {
  const lines = await installedAppLines(full);
  if (lines.length === 0) {
    console.log("No installed apps found.");
    return;
  }
  for (const line of lines) console.log(line);
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

async function loadConfiguredBucket(name: string): Promise<BucketManifest | null> {
  await ensureDefaultMainBucket();
  const entries = await listBuckets();
  const entry = entries.find((candidate) => candidate.name === name);
  return entry ? await loadBucket(entry.name, entry.path) : null;
}

async function findApp(
  app: string,
  opts: { allowInstalledOwnerStub?: boolean } = {},
): Promise<{ bucket: string; appName: string; info: ScoopixApp } | null> {
  const parsed = parseVersionedAppSpec(app);
  app = parsed.app;

  // case: user specified bucket/app
  if (app.includes("/")) {
    const buckets = await loadAllBuckets();
    const [bucketName, appName] = app.split("/", 2);
    const manifest = buckets.get(bucketName);
    if (manifest && manifest[appName]) {
      return { bucket: bucketName, appName, info: manifest[appName] };
    }
    return null;
  }

  // case: already installed app; keep following the bucket that owns it
  const appState = await readAppState(app);
  const owner = appState?.owner;
  if (owner?.includes("/")) {
    const [bucketName, appName] = owner.split("/", 2);
    const manifest = await loadConfiguredBucket(bucketName);
    if (appName === app && manifest?.[appName]) {
      return { bucket: bucketName, appName, info: manifest[appName] };
    }
    if (appName === app) {
      if (opts.allowInstalledOwnerStub) {
        return { bucket: bucketName, appName, info: { version: appState.version } };
      }
      throw new Error(
        `installed app '${app}' is owned by ${owner}, but bucket '${bucketName}' is not loaded or no longer contains '${appName}'`,
      );
    }
  }

  // case: search across all buckets for a fresh install
  const buckets = await loadAllBuckets();
  const matches: { bucket: string; appName: string; info: ScoopixApp }[] = [];
  for (const [bucket, manifest] of buckets) {
    if (manifest[app]) matches.push({ bucket, appName: app, info: manifest[app] });
  }
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new Error(
      `There are multiple '${app}' packages: ${matches.map((match) => `${match.bucket}/${match.appName}`).join(", ")}. Specify which one.`,
    );
  }

  return null;
}

async function findAppMatches(app: string): Promise<{ bucket: string; appName: string; info: ScoopixApp }[]> {
  const parsed = parseVersionedAppSpec(app);
  const baseApp = parsed.app;
  if (baseApp.includes("/")) {
    const found = await findApp(baseApp);
    return found ? [found] : [];
  }

  const appState = await readAppState(baseApp);
  if (appState?.owner) {
    const found = await findApp(baseApp);
    return found ? [found] : [];
  }

  const buckets = await loadAllBuckets();
  const matches: { bucket: string; appName: string; info: ScoopixApp }[] = [];
  for (const [bucket, manifest] of buckets) {
    if (manifest[baseApp]) matches.push({ bucket, appName: baseApp, info: manifest[baseApp] });
  }
  return matches;
}

function parseVersionedAppSpec(app: string): { app: string; version?: string } {
  const slash = app.lastIndexOf("/");
  const at = app.lastIndexOf("@");
  if (at > slash) {
    return { app: app.slice(0, at), version: app.slice(at + 1) };
  }
  return { app };
}

async function resolveAppMetadata(app: string): Promise<{ appName: string; version: string; info: ScoopixApp; bucket: string }> {
  const found = await findApp(app);
  if (!found) {
    error(`app '${app}' not found`);
    console.error(`App '${app}' not found in any bucket.`);
    Deno.exit(1);
  }
  return {
    appName: found.appName,
    version: found.info.version ?? "unknown",
    info: found.info,
    bucket: found.bucket,
  };
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

function uniqueSortedVersions(versions: string[]): string[] {
  return [...new Set(versions.filter(Boolean))].sort((a, b) => compareVersionStrings(b, a));
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

function replaceVersionInValue(value: unknown, oldVersion: string, newVersion: string): unknown {
  if (typeof value === "string") return value.split(oldVersion).join(newVersion);
  if (Array.isArray(value)) return value.map((item) => replaceVersionInValue(item, oldVersion, newVersion));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === "versionSource") {
        result[key] = child;
        continue;
      }
      result[key] = replaceVersionInValue(child, oldVersion, newVersion);
    }
    return result;
  }
  return value;
}

async function updateManifestAppVersion(app: string, requestedVersion: string) {
  if (!requestedVersion) throw new Error("update requires a version, for example: update micro 2.0.15");
  await ensureDefaultMainBucket();
  const entries = await listBuckets();
  const requestedBucket = app.includes("/") ? app.split("/", 2)[0] : null;
  const appName = app.includes("/") ? app.split("/", 2)[1] : app;

  for (const { name: bucket, path } of entries) {
    if (requestedBucket && bucket !== requestedBucket) continue;
    const manifest = await loadBucket(bucket, path);
    if (!manifest?.[appName]) continue;

    const infoObj = manifest[appName] as ScoopixApp;
    const appId = `${bucket}/${appName}`;
    const oldVersion = infoObj.version ?? "unknown";
    const versions = await discoverVersions(appId, infoObj);
    if (!versions.includes(requestedVersion)) {
      throw new Error(
        `${appId}: version ${requestedVersion} was not found in versionSource. Available: ${versions.join(", ")}`,
      );
    }
    if (oldVersion === requestedVersion) {
      console.log(`${appId}: already at manifest version ${requestedVersion}`);
      return;
    }
    if (path.startsWith("http://") || path.startsWith("https://")) {
      throw new Error(`${appId}: bucket '${bucket}' is remote and cannot be updated in place: ${path}`);
    }

    const updatedApp = replaceVersionInValue(infoObj, oldVersion, requestedVersion) as ScoopixApp;
    updatedApp.version = requestedVersion;
    const stat = await Deno.stat(path);
    if (stat.isFile && path.endsWith(".json")) {
      const parsed: BucketManifest = JSON.parse(await Deno.readTextFile(path));
      parsed[appName] = updatedApp;
      await Deno.writeTextFile(path, JSON.stringify(parsed, null, 2) + "\n");
      console.log(`${appId}: updated manifest ${oldVersion} -> ${requestedVersion} in ${path}`);
      return;
    }
    if (stat.isDirectory) {
      const appPath = join(path, `${appName}.json`);
      await Deno.writeTextFile(appPath, JSON.stringify(updatedApp, null, 2) + "\n");
      console.log(`${appId}: updated manifest ${oldVersion} -> ${requestedVersion} in ${appPath}`);
      return;
    }
    throw new Error(`${appId}: bucket path is not a writable JSON file or directory: ${path}`);
  }

  throw new Error(`App '${app}' not found in configured buckets.`);
}

async function bucketPath(bucket: string): Promise<string | null> {
  const entries = await listBuckets();
  return entries.find((entry) => entry.name === bucket)?.path ?? null;
}

async function installedVersions(appName: string): Promise<string[]> {
  const appDir = join(APPS_DIR, appName);
  if (!(await pathExistsNoFollow(appDir))) return [];
  const versions: string[] = [];
  for await (const entry of Deno.readDir(appDir)) {
    if (entry.name === "current") continue;
    if (entry.isDirectory || entry.isSymlink) versions.push(entry.name);
  }
  return uniqueSortedVersions(versions);
}

async function bucketVersionHistory(bucket: string, appName: string, currentVersion: string): Promise<string[]> {
  const path = await bucketPath(bucket);
  if (!path || path.startsWith("http://") || path.startsWith("https://")) {
    return uniqueSortedVersions([currentVersion]);
  }

  const root = await gitRootForBucketPath(path);
  if (!root) {
    return uniqueSortedVersions([currentVersion]);
  }

  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(path);
  } catch {
    return uniqueSortedVersions([currentVersion]);
  }
  const historyFile = stat.isDirectory ? join(path, `${appName}.json`) : path;
  const relPath = relative(root, historyFile).replaceAll("\\", "/");
  const commits = await captureCommand("git", ["-C", root, "log", "--format=%H", "--", relPath]);
  if (commits.code !== 0 || !commits.stdout) {
    return uniqueSortedVersions([currentVersion]);
  }

  const versions = [currentVersion];
  for (const hash of commits.stdout.split(/\r?\n/).filter(Boolean).slice(0, 100)) {
    const fileAtCommit = await captureCommand("git", ["-C", root, "show", `${hash}:${relPath}`]);
    if (fileAtCommit.code !== 0 || !fileAtCommit.stdout) continue;
    try {
      const parsed = JSON.parse(fileAtCommit.stdout);
      const version = stat.isDirectory ? parsed.version : parsed[appName]?.version;
      if (version) versions.push(String(version));
    } catch {
      // Ignore historical manifest revisions that are not parseable as JSON.
    }
  }

  return uniqueSortedVersions(versions);
}

async function gitRootForBucketPath(path: string): Promise<string | null> {
  if (path.startsWith("http://") || path.startsWith("https://")) return null;
  let dir = path;
  try {
    const stat = await Deno.stat(path);
    if (stat.isFile) dir = dirname(path);
  } catch {
    return null;
  }
  const result = await captureCommand("git", ["-C", dir, "rev-parse", "--show-toplevel"]);
  return result.code === 0 ? result.stdout.trim() : null;
}

async function forceBucketUpdate(app?: string) {
  await ensureDefaultMainBucket();
  const entries = await listBuckets();
  const parsed = app ? parseVersionedAppSpec(app) : undefined;
  const requestedBucket = parsed?.app.includes("/") ? parsed.app.split("/", 2)[0] : null;
  const touched = new Set<string>();

  for (const { name, path } of entries) {
    if (requestedBucket && name !== requestedBucket) continue;
    const root = await gitRootForBucketPath(path);
    if (!root || touched.has(root)) continue;
    touched.add(root);
    status(`Updating bucket '${name}' via git pull in ${root}`);
    await runCommandWithLogs("git", ["-C", root, "pull", "--ff-only"], `bucket update ${name}`, root, { briefFailure: true });
  }
  if (touched.size === 0) {
    status("No git-backed local buckets to update.");
  }
}

async function resolveUpgradeTarget(app: string, opts: any = {}): Promise<{
  app: string;
  appName: string;
  bucket: string;
  bucketVersion: string;
  targetVersion: string;
  info: ScoopixApp;
  source: "bucket" | "source";
}> {
  const parsed = parseVersionedAppSpec(app);
  const requestedVersion = opts.version ?? parsed.version;
  const baseApp = parsed.app;
  const { appName, version: bucketVersion, info: infoObj, bucket } = await resolveAppInfo(baseApp);

  if (opts.fromBucket && requestedVersion) {
    throw new Error("--from-bucket cannot be combined with an explicit version");
  }

  if (opts.fromBucket || (!requestedVersion && !infoObj.versionSource)) {
    return { app: baseApp, appName, bucket, bucketVersion, targetVersion: bucketVersion, info: infoObj, source: "bucket" };
  }

  const appId = `${bucket}/${appName}`;
  const versions = await discoverVersions(appId, infoObj);
  const targetVersion = requestedVersion ?? versions[0] ?? bucketVersion;
  if (requestedVersion && !versions.includes(requestedVersion)) {
    throw new Error(`${appId}: version ${requestedVersion} was not found in versionSource. Available: ${versions.join(", ")}`);
  }
  if (targetVersion === bucketVersion) {
    return { app: baseApp, appName, bucket, bucketVersion, targetVersion, info: infoObj, source: "bucket" };
  }

  const resolvedInfo = replaceVersionInValue(infoObj, bucketVersion, targetVersion) as ScoopixApp;
  resolvedInfo.version = targetVersion;
  return { app: baseApp, appName, bucket, bucketVersion, targetVersion, info: resolvedInfo, source: "source" };
}

async function printVersions(app: string) {
  const matches = await findAppMatches(app);
  if (matches.length === 0) {
    error(`app '${app}' not found`);
    console.error(`App '${app}' not found in any bucket.`);
    Deno.exit(1);
  }
  const saved = await readSavedVersions();
  for (const [index, { appName, info: infoObj, bucket }] of matches.entries()) {
    const version = infoObj.version ?? "unknown";
    const appId = `${bucket}/${appName}`;
    const sourceVersions = infoObj.versionSource ? await discoverVersions(appId, infoObj) : [];
    const bucketHistory = await bucketVersionHistory(bucket, appName, version);
    const current = await installedVersion(appName);
    const installed = await installedVersions(appName);
    const savedEntries = saved.apps[appId] ?? [];
    if (index > 0) console.log("");
    console.log(appId);
    console.log(`current: ${current ?? "<none>"}`);
    console.log(`installed versions: ${installed.length ? installed.join(", ") : "<none>"}`);
    console.log(`saved: ${savedEntries.length ? savedEntries.map((entry) => `${entry.version}${entry.reason ? ` (${entry.reason})` : ""}`).join(", ") : "<none>"}`);
    console.log(`bucket: ${bucketHistory.join(", ") || "<none>"}`);
    console.log(`source: ${sourceVersions.join(", ") || "<none>"}`);
  }
}

async function checkVersion(app: string) {
  const { appName, version, info: infoObj, bucket } = await resolveAppMetadata(app);
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

async function installedVersion(appName: string): Promise<string | null> {
  const current = join(APPS_DIR, appName, "current");
  if (!(await pathExistsNoFollow(current))) return null;
  try {
    return basename(await Deno.readLink(current));
  } catch {
    // current may be a normal directory or a symlink type unsupported by the platform.
  }
  try {
    const version = basename(await Deno.realPath(current));
    return version === "current" ? null : version;
  } catch {
    return null;
  }
}

async function upgradeApp(app: string, opts: any = {}): Promise<boolean> {
  const target = await resolveUpgradeTarget(app, opts);
  const { appName, bucket, targetVersion: version } = target;
  const installed = await installedVersion(appName);
  const appId = `${bucket}/${appName}`;
  const installOpts = {
    ...opts,
    resolvedInfo: target.info,
    resolvedVersion: target.targetVersion,
  };

  if (!installed) {
    console.log(`${appId}: not installed; installing ${version} (${target.source})`);
    await installApp(target.app, installOpts);
    if (opts.updateBucketManifest && target.source === "source") {
      await updateManifestAppVersion(target.app, target.targetVersion);
    }
    return true;
  }

  const cmp = compareVersionStrings(version, installed);
  const exactRequested = Boolean(opts.version ?? parseVersionedAppSpec(app).version);
  const forceInstall = Boolean(opts.ignoreBuildCache || opts.ignoreDownloadCache || opts.forceArtifactBuild);
  if ((cmp === 0 && !forceInstall) || (!exactRequested && cmp < 0)) {
    console.log(`${appId}: already current (${installed})`);
    return false;
  }

  const verb = cmp < 0 ? "downgrading" : cmp === 0 ? "reinstalling" : "upgrading";
  console.log(`${appId}: ${verb} ${installed} -> ${version} (${target.source})`);
  await installApp(target.app, installOpts);
  if (opts.updateBucketManifest && target.source === "source") {
    await updateManifestAppVersion(target.app, target.targetVersion);
  }
  return true;
}

async function upgradeApps(app?: string, opts: any = {}) {
  if (opts.fromBucket && opts.fromSource) {
    throw new Error("--from-bucket and --from-source cannot be combined");
  }
  if (opts.forceBucketUpdate) {
    await forceBucketUpdate(app);
  }
  if (app) {
    const changed = await upgradeApp(app, opts);
    if (changed) {
      await writeInstallState(app, "installed", { upgraded: true });
    }
    return;
  }

  if (!(await pathExistsNoFollow(APPS_DIR))) {
    console.log("No installed apps found.");
    return;
  }

  let changed = false;
  for await (const entry of Deno.readDir(APPS_DIR)) {
    if (!entry.isDirectory) continue;
    changed = await upgradeApp(entry.name, opts) || changed;
  }
}
async function downloadAndInstall(
  url: string,
  dest: string,
  extract?: "zip" | "tar.gz" | "tgz",
  bin?: string,
  opts: { keepTemp?: boolean; man?: string; appName?: string; version?: string } = {}
) {
  const appName = opts.appName ?? basename(dest);
  const versionPart = opts.version ?? basename(dirname(dirname(dest)));
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
        args: ["-xzf", normalizeToolPath(cacheFile), "-C", normalizeToolPath(tempDir)],
      });
      const { code } = await cmd.output();
      if (code !== 0) throw new Error(`tar extraction failed for ${url}`);
    } else if (extract === "zip") {
      const cmd = new Deno.Command("unzip", {
        args: ["-o", normalizeToolPath(cacheFile), "-d", normalizeToolPath(tempDir)],
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
  const appName = found.appName;
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
    { keepTemp: opts.keepTemp, man: infoObj.man, appName: opts.appName, version: opts.version }
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

async function runHealthcheck(
  packageId: string,
  version: string,
  healthcheck: ScoopixHealthcheck | undefined,
  placeholders: Record<string, unknown>,
) {
  if (!healthcheck) return;
  const command = expandPlaceholders(healthcheck.command ?? "{target}", placeholders);
  const args = (healthcheck.args ?? []).map((arg) => expandPlaceholders(arg, placeholders));
  const result = await new Deno.Command(command, {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const stdout = new TextDecoder().decode(result.stdout).trim();
  const stderr = new TextDecoder().decode(result.stderr).trim();
  const stream = healthcheck.stream ?? "stdout";
  const text = stream === "stderr" ? stderr : stream === "combined" ? `${stdout}\n${stderr}`.trim() : stdout;

  if (!result.success) {
    throw new Error(`healthcheck failed for ${packageId}:${version}; exit code ${result.code}; output: ${formatStream(text)}`);
  }
  if (healthcheck.match && !new RegExp(expandPlaceholders(healthcheck.match, placeholders)).test(text)) {
    throw new Error(`healthcheck failed for ${packageId}:${version}; expected ${healthcheck.match}; output: ${formatStream(text)}`);
  }
  console.log(`Healthcheck passed: ${packageId}:${version}${text ? ` - ${text.split(/\r?\n/)[0]}` : ""}`);
}

async function linkAppBinaries(packageId: string, appName: string, version: string, binName: string, shimName = appName) {
  const currentLink = join(APPS_DIR, appName, "current");
  const versionDir = join(APPS_DIR, appName, version);
  await ensureDir(BIN_DIR);
  const binPath = join(BIN_DIR, shimName);
  const shimTarget = join(currentLink, "bin", binName);
  await assertShimAvailable(shimName, binPath, packageId, version, appName, join(versionDir, "bin", binName));

  try { await Deno.remove(currentLink, { recursive: true }); } catch { }
  await Deno.symlink(versionDir, currentLink, { type: "dir" });
  try { await Deno.remove(binPath); } catch { }
  await Deno.symlink(shimTarget, binPath, { type: "file" });
  await writeAppState(appName, packageId, version);
  await writeShimState(shimName, packageId, version, shimTarget);

  console.log(`Installed '${packageId}:${version}' -> ${binPath}`);
}

async function isAppLinked(appName: string, version: string, binName: string, shimName = appName): Promise<boolean> {
  const binPath = join(BIN_DIR, shimName);
  const shimTarget = join(APPS_DIR, appName, version, "bin", binName);
  try {
    return await Deno.realPath(binPath) === await Deno.realPath(shimTarget);
  } catch {
    return false;
  }
}

async function postInstallVerify(
  packageId: string,
  appName: string,
  version: string,
  infoObj: ScoopixApp,
  binName: string,
  shimName: string,
) {
  const target = join(APPS_DIR, appName, "current", "bin", binName);
  await runHealthcheck(packageId, version, infoObj.healthcheck, {
    ...infoObj,
    ...(infoObj.vars ?? {}),
    app: appName,
    packageId,
    version,
    target,
    shim: shimName,
    shimPath: join(BIN_DIR, shimName),
    binDir: BIN_DIR,
    scoopixHome: SCOOPIX_HOME,
  });
}

async function installApp(app: string, opts: any = {}) {
  info(`installApp called with app='${app}'`);
  const installOpts = { ...opts, requestedApp: opts.requestedApp ?? app };

  const resolved = await resolveAppInfo(app);
  const appName = resolved.appName;
  const version = installOpts.resolvedVersion ?? resolved.version;
  const infoObj = installOpts.resolvedInfo ?? resolved.info;
  const bucket = resolved.bucket;
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
  const packageId = `${bucket}/${appName}`;
  await assertAppAvailable(appName, packageId, version);
  const { dest } = await prepareAppDirectories(appName, version, binName);
  const canUseInstalled = !installOpts.ignoreBuildCache && !installOpts.ignoreDownloadCache;

  if (canUseInstalled && await exists(dest)) {
    if (await isAppLinked(appName, version, binName, shimName)) {
      const shimTarget = join(APPS_DIR, appName, "current", "bin", binName);
      await assertShimAvailable(shimName, join(BIN_DIR, shimName), packageId, version, appName, shimTarget);
      await writeAppState(appName, packageId, version);
      await writeShimState(shimName, packageId, version, shimTarget);
      if (!installOpts.suppressOutput) {
        console.log(`Already installed: ${packageId}:${version}.`);
        await postInstallVerify(packageId, appName, version, infoObj, binName, shimName);
      }
      return;
    }
    await linkAppBinaries(packageId, appName, version, binName, shimName);
    if (!installOpts.suppressOutput) {
      console.log(`Relinked existing: ${packageId}:${version}.`);
      await postInstallVerify(packageId, appName, version, infoObj, binName, shimName);
    }
    return;
  }

  if (infoObj.commands) {
    await installFromDelegated(infoObj, appName);
  } else if (infoObj.type === "src") {
    info(`installApp: source build requested for '${appName}'`);
    await buildFromSource(appName, infoObj as any, dest, opts);
  } else {
    await installFromBinary(infoObj, dest, { ...opts, appName, version });
  }

  await linkAppBinaries(packageId, appName, version, binName, shimName);
  if (!installOpts.suppressOutput) {
    await postInstallVerify(packageId, appName, version, infoObj, binName, shimName);
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
  const arch = await detectArch();
  keys.push(`${Deno.build.os}-${arch}`);
  const uname = await captureCommand("uname", ["-a"]);
  const synologyPlatform = uname.code === 0 ? uname.stdout.match(/synology_([^\s]+)/)?.[1] : undefined;
  if (synologyPlatform) {
    const packageArch = synologyPlatform.split("_")[0];
    keys.push(`synology-${synologyPlatform}`);
    keys.push(`synology-${packageArch}`);
    keys.push("synology");
  }
  if (Deno.build.os !== "windows") keys.push(arch);
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

function shimStatePath(shimName: string): string {
  return join(SHIMS_STATE_DIR, `${safeStateName(shimName)}.json`);
}

function appStatePath(appName: string): string {
  return join(APPS_STATE_DIR, `${safeStateName(appName)}.json`);
}

async function readAppState(appName: string): Promise<AppState | null> {
  try {
    return JSON.parse(await Deno.readTextFile(appStatePath(appName)));
  } catch {
    return null;
  }
}

async function writeAppState(appName: string, owner: string, version: string) {
  await ensureDir(APPS_STATE_DIR);
  await Deno.writeTextFile(appStatePath(appName), JSON.stringify({
    name: appName,
    owner,
    version,
    updatedAt: new Date().toISOString(),
  }, null, 2));
}

async function removeAppState(appName: string) {
  await Deno.remove(appStatePath(appName)).catch(() => {});
}

async function assertAppAvailable(appName: string, requestedOwner: string, version: string) {
  const state = await readAppState(appName);
  if (state && state.owner !== requestedOwner) {
    throw new Error(
      `package collision: app directory '${appName}' is already owned by ${state.owner}:${state.version}; requested by ${requestedOwner}:${version}`,
    );
  }

  const appDir = join(APPS_DIR, appName);
  if (await pathExistsNoFollow(appDir) && !state) {
    warn(`App directory '${appName}' exists without ownership metadata; adopting it for ${requestedOwner}.`);
  }
}

async function readShimState(shimName: string): Promise<ShimState | null> {
  try {
    return JSON.parse(await Deno.readTextFile(shimStatePath(shimName)));
  } catch {
    return null;
  }
}

async function writeShimState(shimName: string, owner: string, version: string, target: string) {
  await ensureDir(SHIMS_STATE_DIR);
  await Deno.writeTextFile(shimStatePath(shimName), JSON.stringify({
    name: shimName,
    owner,
    version,
    target,
    updatedAt: new Date().toISOString(),
  }, null, 2));
}

async function removeShimState(shimName: string) {
  await Deno.remove(shimStatePath(shimName)).catch(() => {});
}

async function realPathOrNull(path: string): Promise<string | null> {
  try {
    return await Deno.realPath(path);
  } catch {
    return null;
  }
}

async function assertShimAvailable(
  shimName: string,
  binPath: string,
  requestedOwner: string,
  version: string,
  appName: string,
  requestedTarget: string,
) {
  const state = await readShimState(shimName);
  if (state && state.owner !== requestedOwner) {
    throw new Error(
      `executable collision: '${shimName}' is already owned by ${state.owner}:${state.version}; requested by ${requestedOwner}:${version}`,
    );
  }

  if (!(await pathExistsNoFollow(binPath))) return;
  if (state?.owner === requestedOwner) return;

  const existingRealPath = await realPathOrNull(binPath);
  const appRoot = await realPathOrNull(join(APPS_DIR, appName));
  if (existingRealPath && appRoot && existingRealPath.startsWith(appRoot)) {
    warn(`Adopting existing untracked shim '${shimName}' for ${requestedOwner}.`);
    return;
  }

  throw new Error(
    `executable collision: '${shimName}' already exists at ${binPath} and is not owned by Scoopix; requested by ${requestedOwner}:${version}`,
  );
}

async function removeOwnedShim(candidate: string, requestedOwner: string | null): Promise<boolean> {
  const shimName = basename(candidate);
  const state = await readShimState(shimName);
  if (state && requestedOwner && state.owner !== requestedOwner) {
    warn(`Skipping '${candidate}'; owned by ${state.owner}.`);
    return false;
  }
  if (!(await removeIfPresent(candidate))) return false;
  if (!state || !requestedOwner || state.owner === requestedOwner) {
    await removeShimState(shimName);
  }
  return true;
}

async function uninstallApp(app: string, opts: { all?: boolean } = {}) {
  const parsed = parseVersionedAppSpec(app);
  const appSpec = parsed.app;
  const appName = appSpec.includes("/") ? appSpec.split("/").pop()! : appSpec;
  const found = await findApp(appSpec, { allowInstalledOwnerStub: true });
  const owner = found ? `${found.bucket}/${appName}` : null;
  const shimName = found?.info?.shim ?? appName;
  const versions = await installedVersions(appName);
  const current = await installedVersion(appName);
  if (!opts.all && !parsed.version && versions.length > 1) {
    throw new Error(
      `There are multiple installed versions of '${appName}': ${versions.join(", ")}. Specify which one, or use --all.`,
    );
  }

  const candidates = [...new Set([
    join(BIN_DIR, shimName),
    join(BIN_DIR, appName),
    join(DEFAULT_BIN_DIR, shimName),
    join(DEFAULT_BIN_DIR, appName),
  ])];
  const removed: string[] = [];

  const removeActiveLinks = opts.all || !parsed.version || parsed.version === current;
  if (removeActiveLinks) {
    for (const candidate of candidates) {
      if (await removeOwnedShim(candidate, owner)) removed.push(candidate);
    }
  }

  const appDir = join(APPS_DIR, appName);
  const appState = await readAppState(appName);
  const targetDir = parsed.version ? join(appDir, parsed.version) : appDir;
  if (appState && owner && appState.owner !== owner) {
    warn(`Skipping '${appDir}'; owned by ${appState.owner}.`);
  } else if (await removeIfPresent(targetDir, { recursive: true })) {
    removed.push(targetDir);
    if (removeActiveLinks) {
      await removeIfPresent(join(appDir, "current"), { recursive: true });
    }
    const remainingVersions = await installedVersions(appName);
    if (opts.all || remainingVersions.length === 0) {
      await removeIfPresent(appDir, { recursive: true });
      if (!appState || !owner || appState.owner === owner) await removeAppState(appName);
    } else if (removeActiveLinks && (!appState || !owner || appState.owner === owner)) {
      await removeAppState(appName);
    }
  }

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

function normalizeToolPath(p: string): string {
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

function normalizePathForCompare(path: string): string {
  let normalized = path.replaceAll("\\", "/");
  if (Deno.build.os === "windows") {
    normalized = normalized.replace(/^([A-Za-z]):\//, (_, drive) => `/${drive.toLowerCase()}/`);
  }
  return normalized.replace(/\/+$/, "").toLowerCase();
}

function pathEntries(value: string): string[] {
  if (!value) return [];
  if (Deno.build.os !== "windows") return value.split(":");
  return value.includes(";") ? value.split(";") : value.split(":");
}

function pathListContains(value: string, expected: string): boolean {
  const normalizedExpected = normalizePathForCompare(expected);
  return pathEntries(value).some((entry) => normalizePathForCompare(entry) === normalizedExpected);
}

function autotestReadFileHealthcheck(): ScoopixHealthcheck {
  return Deno.build.os === "windows"
    ? { command: "cmd", args: ["/c", "type", "{target}"], match: "alpha-1.0" }
    : { command: "cat", args: ["{target}"], match: "alpha-1.0" };
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
  } catch (err) {
    if (!(err instanceof Deno.errors.AlreadyExists)) {
      throw new Error(`could not create install lock '${lockDir}': ${err instanceof Error ? err.message : String(err)}`);
    }
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
    return `  scoopix config path ${s.shell}   # ${note}`;
  });
}

function currentShellName(shellArg?: string): string {
  if (shellArg) return shellArg;
  const envShell = Deno.env.get("SHELL");
  if (envShell) return envShell.split("/").pop() ?? "sh";
  if (Deno.build.os === "windows" && Deno.env.get("MSYSTEM")) return "bash";
  const comspec = Deno.env.get("ComSpec") ?? "";
  if (Deno.build.os === "windows" && comspec.toLowerCase().includes("cmd.exe")) return "cmd";
  return "sh";
}

function printCurrentShellActivationHint(shellArg?: string) {
  const shell = currentShellName(shellArg).toLowerCase();
  if (shell === "bash") {
    console.log("Now run: source ~/.bashrc && hash -r");
    return;
  }
  if (shell === "zsh") {
    console.log("Now run: source ~/.zshrc && hash -r");
    return;
  }
  if (["sh", "ksh", "ash", "dash"].includes(shell)) {
    console.log("Now run: . ~/.profile");
    return;
  }
  if (["pwsh", "powershell"].includes(shell)) {
    console.log(`Now run: $env:Path = "$env:USERPROFILE\\.scoopix\\bin;$env:Path"`);
    return;
  }
  if (shell === "cmd") {
    console.log(`Now run: set PATH=%USERPROFILE%\\.scoopix\\bin;%PATH%`);
    return;
  }
  console.log("Open a new terminal, or add ~/.scoopix/bin to PATH in this shell.");
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

async function initShell(
  shellArg?: string,
  opts: { quietAlready?: boolean; quietChanged?: boolean; auto?: boolean } = {},
): Promise<boolean> {
  let shell = shellArg;
  if (!shell) {
    // fallback to current shell from $SHELL
    const envShell = Deno.env.get("SHELL");
    if (envShell) {
      shell = envShell.split("/").pop() ?? "sh";
      info(`initShell: auto-detected current shell as '${shell}' from SHELL=${envShell}`);
    } else if (Deno.build.os === "windows" && Deno.env.get("MSYSTEM")) {
      shell = "bash";
      info(`initShell: auto-detected Git Bash/MSYS shell from MSYSTEM=${Deno.env.get("MSYSTEM")}`);
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
      console.log(`Already configured: ${shell} PATH`);
    }
    return false;
  } else {
    await Deno.writeTextFile(rcFile, `\n# Added by Scoopix\n${SCOOPIX_EXPORT_LINE}\n`, { append: true });
    await chownToSudoUser(rcFile);
    info(`Appended PATH export to ${rcFile}`);
    if (!opts.quietChanged) console.log(`Configured ${shell} PATH: ${rcFile}`);
    if (selected.alternates.length > 0) {
      info(`Other candidate files also exist: ${selected.alternates.join(", ")}`);
    }
    return true;
  }
}

async function removeShellPath(
  shellArg?: string,
  opts: { quietAlready?: boolean; quietChanged?: boolean; auto?: boolean } = {},
): Promise<boolean> {
  let shell = shellArg;
  if (!shell) {
    const envShell = Deno.env.get("SHELL");
    if (envShell) shell = envShell.split("/").pop() ?? "sh";
    else if (Deno.build.os === "windows" && Deno.env.get("MSYSTEM")) shell = "bash";
    else shell = "sh";
  }

  const suggestions = await detectShellInits();
  const found = suggestions.find(s => s.shell === shell);
  if (!found) {
    if (opts.auto && suggestions.length > 0) shell = suggestions[0].shell;
    else throw new Error(`Unsupported or undetected shell: ${shell}`);
  }

  const selected = suggestions.find(s => s.shell === shell)!;
  const rcFile = join(USER_HOME, selected.recommended);
  let contents: string;
  try {
    contents = await Deno.readTextFile(rcFile);
  } catch {
    if (!opts.quietAlready) console.log(`Scoopix PATH block not found for ${shell} (${rcFile})`);
    return false;
  }

  const block = `\n# Added by Scoopix\n${SCOOPIX_EXPORT_LINE}\n`;
  if (!contents.includes(block) && !contents.includes(SCOOPIX_EXPORT_LINE)) {
    if (!opts.quietAlready) console.log(`Scoopix PATH block not found for ${shell} (${rcFile})`);
    return false;
  }
  const updated = contents.replace(block, "\n").replace(SCOOPIX_EXPORT_LINE, "").replace(/\n{3,}/g, "\n\n");
  await Deno.writeTextFile(rcFile, updated);
  await chownToSudoUser(rcFile);
  if (!opts.quietChanged) console.log(`Removed Scoopix PATH block from ${rcFile}`);
  return true;
}

async function windowsUserPath(): Promise<string> {
  if (Deno.build.os !== "windows") return "";
  const result = await captureCommand("reg", ["query", "HKCU\\Environment", "/v", "Path"]);
  if (result.code !== 0 || !result.stdout) return "";
  const line = result.stdout.split(/\r?\n/).find((entry) => /\sPath\s+REG_/.test(entry));
  return line?.replace(/^\s*Path\s+REG_(?:EXPAND_)?SZ\s+/, "").trim() ?? "";
}

async function writeWindowsUserPath(value: string) {
  const result = await captureCommand(
    "reg",
    ["add", "HKCU\\Environment", "/v", "Path", "/t", "REG_EXPAND_SZ", "/d", value, "/f"],
  );
  if (result.code !== 0) {
    throw new Error(`reg add HKCU\\Environment Path failed: ${result.stderr || result.stdout}`);
  }
  info(`reg add HKCU\\Environment Path: ${result.stdout || result.stderr}`);
}

async function configureWindowsUserPath(opts: { quietAlready?: boolean; quietChanged?: boolean } = {}): Promise<boolean> {
  if (Deno.build.os !== "windows") return false;
  const current = await windowsUserPath();
  if (current.endsWith("\\") || /[A-Za-z]:\\[A-Za-z]{1,2}$/.test(current)) {
    throw new Error(`Windows user PATH looks truncated; refusing to modify it: ${current}`);
  }
  if (pathListContains(current, BIN_DIR)) {
    if (!opts.quietAlready) console.log("Already configured: Windows user PATH");
    return false;
  }
  const updated = current ? `${BIN_DIR};${current}` : BIN_DIR;
  await writeWindowsUserPath(updated);
  if (!opts.quietChanged) console.log("Configured Windows user PATH.");
  return true;
}

async function removeWindowsUserPath(opts: { quietAlready?: boolean; quietChanged?: boolean } = {}): Promise<boolean> {
  if (Deno.build.os !== "windows") return false;
  const current = await windowsUserPath();
  const entries = pathEntries(current);
  const filtered = entries.filter((entry) => normalizePathForCompare(entry) !== normalizePathForCompare(BIN_DIR));
  if (filtered.length === entries.length) {
    if (!opts.quietAlready) console.log(`Windows user PATH does not contain ${BIN_DIR}`);
    return false;
  }
  await writeWindowsUserPath(filtered.join(";"));
  if (!opts.quietChanged) console.log(`Removed ${BIN_DIR} from Windows user PATH.`);
  return true;
}

async function configurePath(
  shell?: string,
  opts: { shellOnly?: boolean; quietAlready?: boolean; remove?: boolean } = {},
): Promise<boolean> {
  const shellChanged = opts.remove
    ? await removeShellPath(shell, { quietAlready: true, quietChanged: true })
    : await initShell(shell, { quietAlready: true, quietChanged: true });
  const windowsChanged = opts.shellOnly
    ? false
    : opts.remove
    ? await removeWindowsUserPath({ quietAlready: true, quietChanged: true })
    : await configureWindowsUserPath({ quietAlready: true, quietChanged: true });
  if (!opts.quietAlready) {
    const changed = [
      shellChanged ? `${currentShellName(shell)} shell` : undefined,
      windowsChanged ? "Windows user" : undefined,
    ].filter(Boolean);
    const verb = opts.remove ? "Removed from" : "Configured";
    const already = opts.remove ? "Already removed from" : "Already configured";
    console.log(changed.length ? `${verb} PATH: ${changed.join(", ")}` : `${already}: PATH`);
  }
  return shellChanged || windowsChanged;
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

function assertIncludes(haystack: string, needle: string, message: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`${message}\nExpected to include: ${needle}\nActual:\n${haystack}`);
  }
}

function assertNotIncludes(haystack: string, needle: string, message: string) {
  if (haystack.includes(needle)) {
    throw new Error(`${message}\nExpected not to include: ${needle}\nActual:\n${haystack}`);
  }
}

async function runAutotest() {
  status("Starting autotest");
  const root = join(Deno.cwd(), `.scoopix-autotest-${Date.now()}-${Deno.pid}`);
  const home = join(root, "home");
  const originalHome = USER_HOME;
  try {
    await ensureDir(root);
    configureScoopixHome(home);
    const emptyBucket = join(root, "empty.json");
    const alphaBucket = join(root, "alpha.json");
    const duplicateBucket = join(root, "duplicate.json");
    const betaBucket = join(root, "beta.json");

    await Deno.writeTextFile(emptyBucket, "{}");
    await Deno.writeTextFile(alphaBucket, JSON.stringify({
      same: {
        version: "1.0",
        url: "data:text/plain,alpha-1.0",
        bin: "same",
        description: "alpha source",
        versionSource: {
          url: "data:text/plain,2.0%0A1.0",
          versionRegex: "^(\\d+\\.\\d+)$",
        },
      },
      multi: {
        version: "1.0",
        url: "data:text/plain,alpha-multi",
        bin: "multi",
        description: "alpha duplicate-name candidate",
      },
    }));
    await Deno.writeTextFile(duplicateBucket, JSON.stringify({
      same: {
        version: "1.0",
        url: "data:text/plain,alpha",
        bin: "same",
        description: "duplicate source",
      },
      multi: {
        version: "1.0",
        url: "data:text/plain,duplicate-multi",
        bin: "multi",
        description: "duplicate duplicate-name candidate",
      },
    }));
    await Deno.writeTextFile(betaBucket, JSON.stringify({
      same: {
        version: "2.0",
        url: "data:text/plain,beta",
        bin: "same",
        description: "beta source",
      },
    }));

    status("autotest: configure isolated local buckets");
    await addBucket(emptyBucket, "main");
    await addBucket(alphaBucket, "alpha");
    await addBucket(duplicateBucket, "duplicate");
    await addBucket(betaBucket, "beta");

    status("autotest: install first provider");
    await installApp("alpha/same");

    status("autotest: installed listing is deduped and source-qualified");
    const installed = (await installedAppLines(false)).join("\n");
    assertIncludes(installed, "alpha/same - alpha source [installed: 1.0]", "installed listing should show the owner");
    assertNotIncludes(installed, "duplicate/same", "installed listing should not repeat duplicate bucket entries");
    const installedLines = installed.split(/\r?\n/).filter((line) => line.includes("/same"));
    if (installedLines.length !== 1) {
      throw new Error(`installed listing should contain one /same line, got ${installedLines.length}\n${installed}`);
    }

    status("autotest: list --installed uses the same deduped owner view");
    const listInstalled = (await installedAppLines(false)).join("\n");
    assertIncludes(listInstalled, "alpha/same - alpha source [installed: 1.0]", "list --installed should show the owner");
    assertNotIncludes(listInstalled, "duplicate/same", "list --installed should not repeat duplicate bucket entries");

    status("autotest: upgrade --from-bucket does not use versionSource");
    await upgradeApps("alpha/same", { fromBucket: true });
    const strictBucketVersion = await installedVersion("same");
    if (strictBucketVersion !== "1.0") {
      throw new Error(`upgrade --from-bucket should keep bucket version 1.0, got ${strictBucketVersion}`);
    }

    status("autotest: unqualified installed app follows the installed owner bucket");
    await upgradeApps("same", { fromBucket: true });
    const unqualifiedInstalledVersion = await installedVersion("same");
    if (unqualifiedInstalledVersion !== "1.0") {
      throw new Error(`unqualified installed upgrade should keep alpha/same at 1.0, got ${unqualifiedInstalledVersion}`);
    }

    status("autotest: unqualified fresh app is rejected when multiple buckets provide it");
    let ambiguousMessage = "";
    try {
      await resolveAppInfo("multi");
    } catch (err) {
      ambiguousMessage = err instanceof Error ? err.message : String(err);
    }
    assertIncludes(ambiguousMessage, "There are multiple 'multi' packages: alpha/multi, duplicate/multi. Specify which one.", "ambiguous app should require bucket/app");

    status("autotest: versions reports installed, bucket, and source lanes");
    const sourceVersions = await discoverVersions("alpha/same", (await resolveAppInfo("alpha/same")).info);
    const bucketHistory = await bucketVersionHistory("alpha", "same", "1.0");
    const installedLane = await installedVersions("same");
    assertIncludes(installedLane.join(", "), "1.0", "installed lane should include installed version");
    assertIncludes(bucketHistory.join(", "), "1.0", "bucket lane should include current manifest version");
    assertIncludes(sourceVersions.join(", "), "2.0", "source lane should include realtime source version");

    status("autotest: saved versions are portable and allow multiple pins");
    await saveVersion("alpha/same@1.0", "", "stable baseline");
    await saveVersion("alpha/same@2.0", "", "new toolchain");
    const savedLines = (await savedVersionEntries("alpha/same")).join("\n");
    assertIncludes(savedLines, "alpha/same@1.0 - stable baseline", "saved list should include first saved version");
    assertIncludes(savedLines, "alpha/same@2.0 - new toolchain", "saved list should include second saved version");
    const savedFile = JSON.parse(await Deno.readTextFile(SAVED_VERSIONS_FILE));
    if (!savedFile.apps["alpha/same"] || savedFile.apps["alpha/same"].length !== 2) {
      throw new Error(`saved versions file should contain two pins\n${JSON.stringify(savedFile, null, 2)}`);
    }
    await unsaveVersion("alpha/same@1.0", "");
    const savedAfterRemove = (await savedVersionEntries("alpha/same")).join("\n");
    assertNotIncludes(savedAfterRemove, "alpha/same@1.0", "unsave should remove one saved version");

    const alphaManifestBeforeUpgrade = JSON.parse(await Deno.readTextFile(alphaBucket));
    delete alphaManifestBeforeUpgrade.same.healthcheck;
    await Deno.writeTextFile(alphaBucket, JSON.stringify(alphaManifestBeforeUpgrade));

    status("autotest: upgrade supports app@version for exact source-resolved versions");
    await upgradeApps("alpha/same@2.0", {});
    const exactVersion = await installedVersion("same");
    if (exactVersion !== "2.0") {
      throw new Error(`upgrade app@version should install 2.0, got ${exactVersion}`);
    }

    status("autotest: conflicting provider fails without replacing owner");
    let collisionMessage = "";
    try {
      await installApp("beta/same");
    } catch (err) {
      collisionMessage = err instanceof Error ? err.message : String(err);
    }
    if (!collisionMessage) {
      throw new Error("collision install unexpectedly succeeded");
    }
    assertIncludes(collisionMessage, "package collision: app directory 'same' is already owned by alpha/same:2.0", "collision should identify the current owner");
    const afterCollision = (await installedAppLines(false)).join("\n");
    assertIncludes(afterCollision, "alpha/same - alpha source [installed: 2.0]", "owner should remain installed after collision");
    assertNotIncludes(afterCollision, "beta/same", "failed collision should not appear installed");

    status("autotest: update rewrites a local bucket manifest to a requested version");
    await updateManifestAppVersion("alpha/same", "2.0");
    const updatedManifest = JSON.parse(await Deno.readTextFile(alphaBucket));
    if (updatedManifest.same.version !== "2.0") {
      throw new Error(`update should rewrite manifest version to 2.0\n${JSON.stringify(updatedManifest, null, 2)}`);
    }
    assertIncludes(updatedManifest.same.url, "2.0", "update should rewrite versioned strings");

    status("autotest: upgrade --version can downgrade to an exact discovered version");
    await upgradeApps("alpha/same", { version: "1.0" });
    const downgradedVersion = await installedVersion("same");
    if (downgradedVersion !== "1.0") {
      throw new Error(`upgrade --version should downgrade to 1.0, got ${downgradedVersion}`);
    }

    status("autotest: uninstall requires a version when multiple versions are installed");
    let uninstallMessage = "";
    try {
      await uninstallApp("same");
    } catch (err) {
      uninstallMessage = err instanceof Error ? err.message : String(err);
    }
    assertIncludes(uninstallMessage, "There are multiple installed versions of 'same': 2.0, 1.0. Specify which one, or use --all.", "uninstall should require a version when multiple versions exist");
    await uninstallApp("same@2.0");
    const afterSpecificUninstall = await installedVersions("same");
    if (afterSpecificUninstall.join(", ") !== "1.0") {
      throw new Error(`uninstall app@version should leave only 1.0, got ${afterSpecificUninstall.join(", ")}`);
    }
    await uninstallApp("same", { all: true });
    const afterUninstallAll = await installedVersions("same");
    if (afterUninstallAll.length !== 0) {
      throw new Error(`uninstall --all should remove every version, got ${afterUninstallAll.join(", ")}`);
    }

    console.log("autotest passed");
  } finally {
    configureScoopixHome(originalHome);
    await Deno.remove(root, { recursive: true }).catch(() => {});
  }
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
  .command("autotest [test:string]", "Run built-in tests")
  .action(async (_opts, test) => {
    if (test && test !== "all") {
      console.error(`Unknown autotest '${test}'. Available: all`);
      Deno.exit(1);
    }
    await runAutotest();
  })
  .command("install <app:string>", "Install an app from all buckets")
  .option("--ignore-build-cache", "Force rebuild from source, ignoring cached Docker image")
  .option("--ignore-download-cache", "Force re-download even if cached")
  .option("--force-artifact-build", "Force rebuilding artifact outputs even if cached")
  .option("--keep-temp", "Keep extracted files in ~/.scoopix/temp/<app>")
  .option("--system", "Run system install commands after building, requires root")
  .option("--no-autoconfig", "Do not configure ~/.scoopix/bin on PATH after install")
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
        if (!opts.autoconfig) {
          await configurePath(undefined, { quietAlready: true });
        }
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
  .command("upgrade [app:string]", "Upgrade one installed app, or all installed apps")
  .option("--version <version:string>", "Install this exact discovered version")
  .option("--from-bucket", "Use only the bucket manifest version")
  .option("--from-source", "Use versionSource when available (default)")
  .option("--update-bucket-manifest", "Persist the resolved version back to the local bucket manifest")
  .option("--force-bucket-update", "Run git pull --ff-only for matching local git-backed buckets before resolving")
  .option("--ignore-build-cache", "Force rebuild from source, ignoring cached Docker image")
  .option("--ignore-download-cache", "Force re-download even if cached")
  .option("--force-artifact-build", "Force rebuilding artifact outputs even if cached")
  .option("--keep-temp", "Keep extracted files in ~/.scoopix/temp/<app>")
  .option("--system", "Run system install commands after building, requires root")
  .action(async (opts, app) => {
    try {
      if (!app && opts.version) {
        throw new Error("--version requires an app");
      }
      if (opts.system && !(await isRootUser())) {
        error(`upgrade: --system requires root`);
        console.error("To upgrade system-wide, start the command with sudo:");
        console.error(`  ${SCOOPIX_SYSTEM_COMMAND} upgrade${app ? ` ${app}` : ""} --system`);
        Deno.exit(1);
      }
      await upgradeApps(app, {
        ignoreBuildCache: opts.ignoreBuildCache,
        ignoreDownloadCache: opts.ignoreDownloadCache,
        forceArtifactBuild: opts.forceArtifactBuild,
        keepTemp: opts.keepTemp,
        system: opts.system,
        version: opts.version,
        fromBucket: opts.fromBucket,
        fromSource: opts.fromSource,
        updateBucketManifest: opts.updateBucketManifest,
        forceBucketUpdate: opts.forceBucketUpdate,
      });
    } catch (err) {
      error(`Upgrade failed${app ? `: ${app}` : ""}`);
      console.error(`Reason: ${err instanceof Error ? err.message : String(err)}`);
      if (VERBOSITY - QUIET >= 2 && err instanceof Error && err.stack) {
        console.error(err.stack);
      }
      Deno.exit(1);
    }
  })
  .command("update <app:string> <version:string>", "Update a local bucket manifest entry to a specific discovered version")
  .action(async (_opts, app, version) => {
    try {
      await updateManifestAppVersion(app, version);
    } catch (err) {
      error(`Update failed: ${app}`);
      console.error(`Reason: ${err instanceof Error ? err.message : String(err)}`);
      if (VERBOSITY - QUIET >= 2 && err instanceof Error && err.stack) {
        console.error(err.stack);
      }
      Deno.exit(1);
    }
  })
  .command("save <app:string>", "Save a preferred app version outside buckets")
  .option("--version <version:string>", "Version to save, alternative to app@version")
  .option("--reason <reason:string>", "Why this version is saved")
  .action(async (opts, app) => {
    try {
      await saveVersion(app, opts.version, opts.reason);
    } catch (err) {
      error(`Save failed: ${app}`);
      console.error(`Reason: ${err instanceof Error ? err.message : String(err)}`);
      Deno.exit(1);
    }
  })
  .command("unsave <app:string>", "Remove a saved preferred app version")
  .option("--version <version:string>", "Version to remove, alternative to app@version")
  .action(async (opts, app) => {
    try {
      await unsaveVersion(app, opts.version);
    } catch (err) {
      error(`Unsave failed: ${app}`);
      console.error(`Reason: ${err instanceof Error ? err.message : String(err)}`);
      Deno.exit(1);
    }
  })
  .command("saved [app:string]", "List saved preferred app versions")
  .action(async (_opts, app) => {
    await printSavedVersions(app);
  })
  .command("uninstall <app:string>", "Uninstall an app")
  .option("--all", "Remove all installed versions for the app")
  .action(async (opts, app) => {
    try {
      await uninstallApp(app, { all: opts.all });
    } catch (err) {
      error(`Uninstall failed: ${app}`);
      console.error(`Reason: ${err instanceof Error ? err.message : String(err)}`);
      Deno.exit(1);
    }
  })
  .command("run <app:string> <script:string>", "Run a package script")
  .action(async (_opts, app, script) => { await runPackageScriptAction(app, script); })
  .command("bucket", new Command()
    .description("Manage buckets")
    .action(function () { this.showHelp(); })
    .command("add <url:string> [name:string]", "Add a bucket manifest from url")
    .action(async (_opts, url, name) => { await addBucket(url, name); })
    .command("rm <name:string>", "Remove a configured bucket")
    .action(async (_opts, name) => { await removeBucket(name); })
    .command("list", "List available buckets")
    .action(async () => {
      await ensureDefaultMainBucket();
      const buckets = await listBuckets();
      for (const b of buckets) console.log(b);
    })
  )
  .command("list", "List all apps in all buckets")
  .option("--full", "Show full bucket path")
  .option("--installed", "Show only installed apps")
  .action(async (cliOpts) => {
    await listApps(cliOpts.full ?? false, cliOpts.installed ?? false);
  })
  .command("ls", "Alias for list")
  .option("--full", "Show full bucket path")
  .option("--installed", "Show only installed apps")
  .action(async (cliOpts) => {
    await listApps(cliOpts.full ?? false, cliOpts.installed ?? false);
  })
  .command("installed", "List installed apps")
  .option("--full", "Show full bucket path")
  .action(async (cliOpts) => {
    await listApps(cliOpts.full ?? false, true);
  })
  .command("versions <app:string>", "List installed, saved, bucket, and source versions for an app")
  .action(async (_opts, app) => {
    try {
      await printVersions(app);
    } catch (err) {
      error(`Versions failed: ${app}`);
      console.error(`Reason: ${err instanceof Error ? err.message : String(err)}`);
      Deno.exit(1);
    }
  })
  .command("checkver <app:string>", "Check whether an app manifest is current")
  .action(async (_opts, app) => {
    await checkVersion(app);
  })
  .command("config", new Command()
    .description("Configure Scoopix")
    .action(function () { this.showHelp(); })
    .command("path [shell:string]", "Configure Scoopix app commands on PATH")
    .option("--remove", "Remove Scoopix app commands from PATH")
    .option("--shell-only", "Only configure shell startup files; on Windows, do not update the Windows user PATH")
    .action(async (opts, shell) => {
      try {
        await configurePath(shell, { shellOnly: opts.shellOnly, remove: opts.remove });
        if (!opts.remove) printCurrentShellActivationHint(shell);
      } catch (err) {
        error("Config path failed");
        console.error(`Reason: ${err instanceof Error ? err.message : String(err)}`);
        Deno.exit(1);
      }
    })
  )
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
