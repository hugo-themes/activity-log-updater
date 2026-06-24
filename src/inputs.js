const path = require("node:path");

const ACTIVITY_INPUTS = Object.freeze([
  { defaultEnabled: false, id: "opened-pr", input: "include-opened-pr" },
  { defaultEnabled: false, id: "merged-pr", input: "include-merged-pr" },
  { defaultEnabled: false, id: "repo-created", input: "include-repo-created" },
  { defaultEnabled: false, id: "release", input: "include-releases" },
]);

function readConfig(core = require("./core"), env = process.env) {
  const repositoryOwner = inferRepositoryOwner(env);
  const githubToken = core.getInput("github-token") || env.GITHUB_TOKEN;
  const githubUser = core.getInput("github-user") || repositoryOwner;
  const enabledActivities = ACTIVITY_INPUTS
    .filter(({ defaultEnabled, input }) => parseBoolean(core.getInput(input), input, defaultEnabled))
    .map(({ id }) => id);

  if (!githubToken) {
    throw new Error("github-token is required. Pass github-token or set GITHUB_TOKEN.");
  }

  if (!githubUser) {
    throw new Error("github-user is required when the repository owner cannot be inferred.");
  }

  if (enabledActivities.length === 0) {
    throw new Error("At least one activity type must be enabled.");
  }

  const workspace = env.GITHUB_WORKSPACE || process.cwd();
  const outputFileInput = core.getInput("output-file") || "data/home/activity-logs.yaml";
  const outputFile = path.resolve(workspace, outputFileInput);
  const gitPath = path.relative(workspace, outputFile);

  if (gitPath.startsWith("..") || path.isAbsolute(gitPath)) {
    throw new Error("output-file must resolve inside GITHUB_WORKSPACE.");
  }

  return {
    activityLimit: parsePositiveInteger(core.getInput("activity-limit"), "activity-limit", 15),
    commit: parseBoolean(core.getInput("commit"), "commit", true),
    enabledActivities,
    githubToken,
    githubUser,
    graphQlEndpoint: env.GITHUB_GRAPHQL_URL || "https://api.github.com/graphql",
    lookbackDays: parsePositiveInteger(core.getInput("lookback-days"), "lookback-days", 7),
    organizationLogins: parseList(core.getInput("organizations")),
    outputFile,
    outputFileInput,
    pullRequestLimit: parsePositiveInteger(core.getInput("pull-request-limit"), "pull-request-limit", 100, {
      max: 1000,
    }),
    push: parseBoolean(core.getInput("push"), "push", true),
    releaseLimit: parsePositiveInteger(core.getInput("release-limit"), "release-limit", 10, { max: 100 }),
    repositoryLimit: parsePositiveInteger(core.getInput("repository-limit"), "repository-limit", 100, {
      max: 1000,
    }),
    workspace,
  };
}

function inferRepositoryOwner(env) {
  if (env.GITHUB_REPOSITORY_OWNER) return env.GITHUB_REPOSITORY_OWNER;
  if (!env.GITHUB_REPOSITORY) return "";

  return env.GITHUB_REPOSITORY.split("/")[0] || "";
}

function parseList(value) {
  const seen = new Set();

  return String(value || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function parseBoolean(value, name, fallback) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;

  throw new Error(`${name} must be a boolean value: true or false.`);
}

function parsePositiveInteger(value, name, fallback, options = {}) {
  const raw = String(value || "").trim();

  if (!raw) return fallback;
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  const parsed = Number.parseInt(raw, 10);
  if (options.max && parsed > options.max) {
    throw new Error(`${name} must be less than or equal to ${options.max}.`);
  }

  return parsed;
}

module.exports = {
  ACTIVITY_INPUTS,
  parseBoolean,
  parseList,
  parsePositiveInteger,
  readConfig,
};
