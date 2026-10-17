#!/usr/bin/env node
// Plans Swan releases, which follow upstream Paseo stable releases only.
//
//   v<stable>-v<N>-beta<M>  beta M of our release N on upstream <stable>; a GitHub prerelease
//   v<stable>-v<N>          release N promoted to stable
//
// <stable> is the newest upstream release merged into the branch. While that is an upstream
// beta, nothing is released unless `--upstream-beta` asks for a one-off on it, tagged
// v<upstream-beta>-v<N>-beta<M>, or v<upstream-beta>-v<N> once promoted.
//
//   node scripts/custom-release.mjs sync    name a newer upstream stable release to merge
//   node scripts/custom-release.mjs beta    release the branch as the next beta
//   node scripts/custom-release.mjs beta --upstream-beta   the same, on an upstream beta
//   node scripts/custom-release.mjs stable  promote the latest beta to stable
//   node scripts/custom-release.mjs stable --upstream-beta   the same, on an upstream beta
//   node scripts/custom-release.mjs prune <tag> <feed files...>   list the prereleases <tag>
//                                                                 supersedes, one per line
//
// Prints key=value lines for $GITHUB_OUTPUT: merge, backend, tag, from, reason, prerelease,
// version (the semver the in-app updater compares).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isMainModule } from "./is-main-module.mjs";
import { parseReleaseVersion } from "./release-version-utils.mjs";

const releasePattern =
  /^(?<backend>v\d+\.\d+\.\d+(?:-beta\.\d+)?)-v(?<release>\d+)(?:-beta(?<beta>\d+))?$/;

function parseUpstreamTag(tag) {
  if (!tag.startsWith("v")) return null;
  try {
    return parseReleaseVersion(tag.slice(1));
  } catch {
    return null;
  }
}

function compareKeys(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function versionKey(version) {
  return [version.major, version.minor, version.patch, version.betaNumber ?? Infinity];
}

export function compareUpstreamTags(a, b) {
  return compareKeys(versionKey(parseUpstreamTag(a)), versionKey(parseUpstreamTag(b)));
}

export function newestUpstreamTag(tags, { stableOnly = false } = {}) {
  return (
    tags
      .filter((tag) => {
        const version = parseUpstreamTag(tag);
        return version && !(stableOnly && version.isPrerelease);
      })
      .sort(compareUpstreamTags)
      .at(-1) ?? null
  );
}

/** Our newest release on a backend; a release's betas come before its stable tag. */
export function latestRelease(backend, tags) {
  const key = (release) => [release.number, release.beta ?? Infinity];
  return (
    tags
      .map((tag) => ({ tag, match: releasePattern.exec(tag) }))
      .filter(({ match }) => match?.groups.backend === backend)
      .map(({ tag, match }) => ({
        tag,
        number: Number(match.groups.release),
        beta: match.groups.beta ? Number(match.groups.beta) : null,
      }))
      .sort((a, b) => compareKeys(key(a), key(b)))
      .at(-1) ?? null
  );
}

export function nextBetaTag(backend, tags) {
  const latest = latestRelease(backend, tags);
  if (!latest) return `${backend}-v1-beta1`;
  if (latest.beta === null) return `${backend}-v${latest.number + 1}-beta1`;
  return `${backend}-v${latest.number}-beta${latest.beta + 1}`;
}

/**
 * The semver the in-app updater compares for a release tag. The app version stays upstream's to
 * match the bundled daemon, so updates need their own order: betas numerically, all betas of a
 * release before its stable tag ("beta" sorts before "stable"), then the next release. One-offs
 * on an upstream beta join with a dot so its number compares numerically, and sort before
 * every release on the stable version ("beta" sorts before "custom").
 */
export function updateVersion(tag) {
  const { backend, release, beta } = releasePattern.exec(tag).groups;
  const base = backend.slice(1);
  const separator = base.includes("-") ? "." : "-";
  return `${base}${separator}custom.${release}.${beta ? `beta.${beta}` : "stable"}`;
}

export function planRelease({
  mode,
  current,
  upstreamStable,
  tags,
  latestIsHead,
  upstreamBeta = false,
}) {
  if (!current) throw new Error("No upstream release tag is merged into this branch");
  const skip = (reason) => ({ merge: "", backend: current, tag: "", from: "", reason });
  if (mode === "sync") {
    if (!upstreamStable || compareUpstreamTags(upstreamStable, current) <= 0) {
      return skip(`no upstream stable release is newer than ${current}`);
    }
    return { merge: upstreamStable, backend: upstreamStable, tag: "", from: "", reason: "" };
  }
  if (mode !== "beta" && mode !== "stable") {
    throw new Error(`Unknown mode "${mode}"; use sync, beta or stable`);
  }
  if (parseUpstreamTag(current).isPrerelease && !upstreamBeta) {
    return skip(`the branch is on upstream beta ${current}; wait for an upstream stable release`);
  }
  if (mode === "beta") {
    if (latestIsHead) return skip("no changes since the last release");
    return {
      merge: "",
      backend: current,
      tag: nextBetaTag(current, tags),
      from: "HEAD",
      reason: "",
    };
  }
  const latest = latestRelease(current, tags);
  if (!latest || latest.beta === null) return skip(`no beta on ${current} to promote`);
  // Stable ships the commit its last beta was tested on.
  return {
    merge: "",
    backend: current,
    tag: `${current}-v${latest.number}`,
    from: latest.tag,
    reason: "",
  };
}

/**
 * Prereleases a published release supersedes: betas on an older upstream release. Stable releases
 * stay, and so do betas on the current one, whose latest is what stable promotes, and every
 * release the update feed names. The planner only reads tags on the current upstream release.
 */
export function obsoletePrereleases(published, releases, feedTags) {
  const { backend } = releasePattern.exec(published).groups;
  return releases
    .filter(({ tagName, isPrerelease, isDraft }) => {
      const match = releasePattern.exec(tagName);
      return (
        isPrerelease &&
        !isDraft &&
        match?.groups.beta &&
        !feedTags.includes(tagName) &&
        compareUpstreamTags(match.groups.backend, backend) < 0
      );
    })
    .map(({ tagName }) => tagName);
}

function prune(published, feedFiles) {
  const releases = JSON.parse(
    execFileSync(
      "gh",
      ["release", "list", "--limit", "1000", "--json", "tagName,isPrerelease,isDraft"],
      { encoding: "utf8" },
    ),
  );
  const feedTags = feedFiles.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/\/releases\/download\/([^/]+)\//g)].map(
      (match) => match[1],
    ),
  );
  for (const tag of obsoletePrereleases(published, releases, feedTags)) console.log(tag);
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function main([mode, flag, ...rest]) {
  if (mode === "prune") return prune(flag, rest);
  const tags = git("tag", "--list").split("\n").filter(Boolean);
  const current = newestUpstreamTag(git("tag", "--merged", "HEAD").split("\n").filter(Boolean));
  const latest = current ? latestRelease(current, tags) : null;
  const plan = planRelease({
    mode,
    current,
    upstreamStable: newestUpstreamTag(tags, { stableOnly: true }),
    tags,
    latestIsHead:
      Boolean(latest) && git("rev-parse", `${latest.tag}^{commit}`) === git("rev-parse", "HEAD"),
    upstreamBeta: flag === "--upstream-beta",
  });
  const prerelease = String(/-beta\d+$/.test(plan.tag));
  const version = plan.tag ? updateVersion(plan.tag) : "";
  for (const [key, value] of Object.entries({ ...plan, prerelease, version })) {
    console.log(`${key}=${value}`);
  }
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2));
}
