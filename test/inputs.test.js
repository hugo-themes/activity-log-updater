const assert = require("node:assert/strict");
const test = require("node:test");

const { parseBoolean, parseList, parsePositiveInteger, readConfig } = require("../src/inputs");

test("parseList accepts comma, whitespace, and newline separated values", () => {
  assert.deepEqual(parseList("hugo-themes, example\nHugo-Themes docs"), ["hugo-themes", "example", "docs"]);
});

test("parseBoolean accepts common true and false values", () => {
  assert.equal(parseBoolean("yes", "enabled", false), true);
  assert.equal(parseBoolean("off", "enabled", true), false);
  assert.equal(parseBoolean("", "enabled", true), true);
});

test("parsePositiveInteger validates positive integer input", () => {
  assert.equal(parsePositiveInteger("42", "limit", 15), 42);
  assert.equal(parsePositiveInteger("", "limit", 15), 15);
  assert.throws(() => parsePositiveInteger("0", "limit", 15), /positive integer/);
  assert.throws(() => parsePositiveInteger("101", "limit", 15, { max: 100 }), /less than or equal to 100/);
});

test("readConfig requires users to enable at least one activity type", () => {
  assert.throws(() => readConfig(fakeCore(), {
    GITHUB_REPOSITORY_OWNER: "octocat",
    GITHUB_TOKEN: "token",
    GITHUB_WORKSPACE: process.cwd(),
  }), /At least one activity type/);
});

test("readConfig lets each activity type be enabled or disabled", () => {
  const config = readConfig(
    fakeCore({
      "include-merged-pr": "true",
      "include-opened-pr": "true",
      "include-releases": "false",
      "include-repo-created": "true",
    }),
    {
      GITHUB_REPOSITORY_OWNER: "octocat",
      GITHUB_TOKEN: "token",
      GITHUB_WORKSPACE: process.cwd(),
    },
  );

  assert.deepEqual(config.enabledActivities, ["opened-pr", "merged-pr", "repo-created"]);
});

function fakeCore(inputs = {}) {
  return {
    getInput(name) {
      return inputs[name] || "";
    },
  };
}
