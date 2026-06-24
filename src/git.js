const { execFile } = require("node:child_process");

const DEFAULT_COMMIT_MESSAGE = "chore: update activity log";
const DEFAULT_COMMIT_USER_EMAIL = "41898282+github-actions[bot]@users.noreply.github.com";
const DEFAULT_COMMIT_USER_NAME = "github-actions[bot]";

async function commitFile(options) {
  const status = await git(["status", "--porcelain", "--", options.gitPath], options.workspace);

  if (!status.stdout.trim()) {
    return { committed: false, pushed: false };
  }

  await git(["config", "user.name", DEFAULT_COMMIT_USER_NAME], options.workspace);
  await git(["config", "user.email", DEFAULT_COMMIT_USER_EMAIL], options.workspace);
  await git(["add", "--", options.gitPath], options.workspace);
  await git(["commit", "-m", DEFAULT_COMMIT_MESSAGE], options.workspace);

  if (options.push) {
    const refSpec = await resolvePushRef(options.workspace);
    await git(["push", "origin", refSpec], options.workspace);
  }

  return { committed: true, pushed: Boolean(options.push) };
}

async function resolvePushRef(workspace) {
  if (process.env.GITHUB_REF_NAME) {
    return `HEAD:${process.env.GITHUB_REF_NAME}`;
  }

  const branch = (await git(["rev-parse", "--abbrev-ref", "HEAD"], workspace)).stdout.trim();

  if (!branch || branch === "HEAD") {
    throw new Error("Cannot determine a branch to push. Set GITHUB_REF_NAME or disable push.");
  }

  return `HEAD:${branch}`;
}

function git(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        const command = `git ${args.join(" ")}`;
        const details = (stderr || stdout || error.message).trim();
        reject(new Error(`${command} failed${details ? `: ${details}` : ""}`));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

module.exports = {
  commitFile,
  resolvePushRef,
};
