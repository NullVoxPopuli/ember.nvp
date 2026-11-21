import { describe, it, expect } from "vitest";
import { getLatest } from "#utils/npm.js";

describe("getLatest", () => {
  it("resolves a range where every version is deprecated", async () => {
    // ESLint deprecated all of 9.x once 10 was out
    const { eslint } = await getLatest({ eslint: "^9.39.2" });

    expect(eslint).toMatch(/^\^9\.39\.\d+$/);
  });

  it("still prefers versions that are not deprecated", async () => {
    const { eslint } = await getLatest({ eslint: "^10.0.0" });

    expect(eslint).toMatch(/^\^10\.\d+\.\d+$/);
  });

  it("bumps a range without changing its kind", async () => {
    const result = await getLatest({
      "@ember/test-helpers": "^5.4.1",
      "ember-source": "~7.2.0",
      "@embroider/macros": "1.20.2",
      "@ember/test-waiters": ">= 4.1.0",
      "ember-modifier": "^4.2.0 || ^5.0.0",
      "decorator-transforms": "latest",
      typescript: "npm:@typescript/typescript6@^6.0.2",
    });

    expect(result).toEqual({
      "@ember/test-helpers": expect.stringMatching(/^\^5\.\d+\.\d+$/),
      "ember-source": expect.stringMatching(/^~7\.2\.\d+$/),
      "@embroider/macros": "1.20.2",
      "@ember/test-waiters": ">= 4.1.0",
      "ember-modifier": "^4.2.0 || ^5.0.0",
      "decorator-transforms": expect.stringMatching(/^\d+\.\d+\.\d+$/),
      typescript: expect.stringMatching(/^npm:@typescript\/typescript6@\^6\.\d+\.\d+$/),
    });
  });

  it("keeps specs that do not come from the registry", async () => {
    const specs = {
      "@embroider/try": "github:NullVoxPopuli/try#768631a",
      "my-local": "file:../my-local",
      "my-linked": "link:../my-linked",
      "my-tarball": "https://example.com/my-tarball.tgz",
      "my-catalog": "catalog:",
      /**
       * From rust-lang/crates.io: a package of the app's own pnpm workspace, which is not on npm.
       */
      "@crates-io/msw": "workspace:*",
      "my-workspace-range": "workspace:^1.0.0",
    };

    expect(await getLatest(specs)).toEqual(specs);
  });
});
