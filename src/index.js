const fs = require("node:fs/promises");
const path = require("node:path");

const core = require("./core");
const { collectActivities } = require("./activity");
const { createGraphqlClient } = require("./github-client");
const { commitFile } = require("./git");
const { readConfig } = require("./inputs");
const { replaceActivityItems } = require("./render");

async function run() {
  const config = readConfig(core);
  const github = createGraphqlClient({ endpoint: config.graphQlEndpoint, token: config.githubToken });

  const activities = await collectActivities({
    activityLimit: config.activityLimit,
    enabledActivities: config.enabledActivities,
    github,
    githubUser: config.githubUser,
    logger: core,
    lookbackDays: config.lookbackDays,
    organizationLogins: config.organizationLogins,
    pullRequestLimit: config.pullRequestLimit,
    releaseLimit: config.releaseLimit,
    repositoryLimit: config.repositoryLimit,
  });

  const changed = await updateFileIfChanged(config.outputFile, activities);
  let committed = false;

  if (changed && config.commit) {
    const result = await commitFile({
      gitPath: path.relative(config.workspace, config.outputFile),
      push: config.push,
      workspace: config.workspace,
    });
    committed = result.committed;
  }

  core.setOutput("activity-count", activities.length);
  core.setOutput("changed", changed);
  core.setOutput("committed", committed);
  core.setOutput("output-file", config.outputFileInput);

  core.info(
    `Updated ${config.outputFileInput} with ${activities.length} activities. changed=${changed} committed=${committed}`,
  );
}

async function updateFileIfChanged(filePath, activities) {
  const previous = await readExistingFile(filePath);
  const content = replaceActivityItems(previous, activities);

  if (previous === content) return false;

  await fs.writeFile(filePath, content, "utf8");
  return true;
}

async function readExistingFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`output-file does not exist: ${filePath}`);
    }

    throw error;
  }
}

run().catch((error) => {
  core.setFailed(error instanceof Error ? error.stack || error.message : String(error));
});

module.exports = {
  updateFileIfChanged,
};
