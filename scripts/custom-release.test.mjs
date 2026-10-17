import assert from "node:assert/strict";
import test from "node:test";
import semver from "semver";
import {
  newestUpstreamTag,
  nextBetaTag,
  obsoletePrereleases,
  planRelease,
  updateVersion,
} from "./custom-release.mjs";

test("the newest upstream tag orders betas before their release and ignores our tags", () => {
  const tags = ["v0.10.3", "v0.11.0-beta.2", "v0.11.0-beta.10", "v0.10.3-v4", "v0.10.3-v5-beta1"];
  assert.equal(newestUpstreamTag(tags), "v0.11.0-beta.10");
  assert.equal(newestUpstreamTag(tags, { stableOnly: true }), "v0.10.3");
  assert.equal(newestUpstreamTag(["v0.11.0-beta.3", "v0.11.0", "desktop-v0.12.0"]), "v0.11.0");
});

test("betas count up within a release, and a stable release starts the next one", () => {
  assert.equal(nextBetaTag("v0.10.3", ["v0.10.3", "v0.11.0-v1-beta1"]), "v0.10.3-v1-beta1");
  assert.equal(
    nextBetaTag("v0.10.3", ["v0.10.3-v1-beta1", "v0.10.3-v1-beta2"]),
    "v0.10.3-v1-beta3",
  );
  assert.equal(nextBetaTag("v0.10.3", ["v0.10.3-v1-beta2", "v0.10.3-v1"]), "v0.10.3-v2-beta1");
});

test("sync names only a newer upstream stable release and releases nothing", () => {
  const tags = ["v0.10.3", "v0.11.0-beta.1", "v0.11.0"];
  assert.deepEqual(
    planRelease({ mode: "sync", current: "v0.11.0-beta.1", upstreamStable: "v0.11.0", tags }),
    { merge: "v0.11.0", backend: "v0.11.0", tag: "", from: "", reason: "" },
  );
  const onBeta = { mode: "sync", current: "v0.11.0-beta.1", upstreamStable: "v0.10.3", tags };
  assert.equal(planRelease(onBeta).merge, "");
});

test("nothing is released while the branch is on an upstream beta", () => {
  for (const mode of ["beta", "stable"]) {
    assert.equal(planRelease({ mode, current: "v0.11.0-beta.1", tags: [] }).tag, "");
  }
});

test("a one-off beta on an upstream beta is numbered apart from the stable releases", () => {
  const tags = ["v0.11.0-beta.1-v1-beta1", "v0.11.0-beta.3-v1-beta1"];
  const current = "v0.11.0-beta.3";
  const oneOff = planRelease({ mode: "beta", current, tags, upstreamBeta: true });
  assert.equal(oneOff.tag, "v0.11.0-beta.3-v1-beta2");
  assert.equal(oneOff.from, "HEAD");
  assert.equal(planRelease({ mode: "stable", current, tags }).tag, "");
  const stable = planRelease({ mode: "stable", current, tags, upstreamBeta: true });
  assert.equal(stable.tag, "v0.11.0-beta.3-v1");
  assert.equal(stable.from, "v0.11.0-beta.3-v1-beta1");
  assert.equal(nextBetaTag("v0.11.0", tags), "v0.11.0-v1-beta1");
});

test("a beta release needs changes, and stable promotes the latest beta's commit", () => {
  const tags = ["v0.11.0", "v0.11.0-v1-beta1", "v0.11.0-v1-beta2"];
  const current = "v0.11.0";
  assert.equal(planRelease({ mode: "beta", current, tags }).tag, "v0.11.0-v1-beta3");
  assert.equal(planRelease({ mode: "beta", current, tags, latestIsHead: true }).tag, "");
  const stable = planRelease({ mode: "stable", current, tags });
  assert.equal(stable.tag, "v0.11.0-v1");
  assert.equal(stable.from, "v0.11.0-v1-beta2");
  assert.equal(planRelease({ mode: "stable", current, tags: [...tags, "v0.11.0-v1"] }).tag, "");
});

test("update versions order betas, then their stable release, then the next release", () => {
  const tags = [
    "v0.11.0-v1-beta2",
    "v0.11.0-v1-beta10",
    "v0.11.0-v1",
    "v0.11.0-v2-beta1",
    "v0.11.1-v1-beta1",
  ];
  const versions = tags.map(updateVersion);
  assert.equal(versions[0], "0.11.0-custom.1.beta.2");
  assert.equal(versions[2], "0.11.0-custom.1.stable");
  assert.equal(updateVersion("v0.11.0-beta.3-v1"), "0.11.0-beta.3.custom.1.stable");
  assert.deepEqual([...versions].sort(semver.compare), versions);
  assert.ok(semver.gt(versions[0], "0.11.0-beta.3"));
  const oneOffs = ["v0.11.0-beta.3-v1-beta2", "v0.11.0-beta.10-v1-beta1"].map(updateVersion);
  assert.equal(oneOffs[0], "0.11.0-beta.3.custom.1.beta.2");
  assert.ok(semver.lt(oneOffs[0], oneOffs[1]));
  assert.ok(semver.lt(oneOffs[1], updateVersion("v0.11.0-v1-beta1")));
});

test("a release deletes betas on older upstream releases and keeps what planning and updates read", () => {
  const stable = ["v0.11.0-beta.3-v1", "v0.11.0-beta.3-v2"];
  const obsolete = [
    "v0.11.0-beta.1-v1-beta1",
    "v0.11.0-beta.3-v1-beta1",
    "v0.11.0-beta.3-v1-beta17",
    "v0.11.0-beta.3-v2-beta1",
    "v0.11.1-v1-beta2",
    "v0.11.2-v1-beta3",
  ];
  const tags = [...stable, ...obsolete, "v0.11.4-v1-beta1", "v0.11.4-v1-beta2"];
  const releases = [
    ...tags.map((tagName) => ({
      tagName,
      isPrerelease: /-beta\d+$/.test(tagName),
      isDraft: false,
    })),
    { tagName: "v0.11.2-v1-beta4", isPrerelease: true, isDraft: true },
    { tagName: "v0.11.3-v1-beta1", isPrerelease: true, isDraft: false },
  ];
  assert.deepEqual(
    obsoletePrereleases("v0.11.4-v1-beta2", releases, ["v0.11.3-v1-beta1"]),
    obsolete,
  );
  assert.deepEqual(obsoletePrereleases("v0.11.4-v1", releases, []), [
    ...obsolete,
    "v0.11.3-v1-beta1",
  ]);

  // Deleting their tags leaves the next plans unchanged.
  const remaining = tags.filter((tag) => !obsolete.includes(tag));
  for (const mode of ["beta", "stable"]) {
    const input = { mode, current: "v0.11.4", upstreamStable: "v0.11.4" };
    assert.deepEqual(planRelease({ ...input, tags: remaining }), planRelease({ ...input, tags }));
  }
});
