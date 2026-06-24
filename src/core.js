const fs = require("node:fs");

let warnedMissingOutputFile = false;

function getInput(name, options = {}) {
  const key = `INPUT_${name.replace(/ /g, "_").toUpperCase()}`;
  const value = (process.env[key] || "").trim();

  if (options.required && value.length === 0) {
    throw new Error(`Input required and not supplied: ${name}`);
  }

  return value;
}

function setOutput(name, value) {
  const output = String(value);

  if (process.env.GITHUB_OUTPUT) {
    const delimiter = `activity_log_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `${name}<<${delimiter}\n${output}\n${delimiter}\n`,
      "utf8",
    );
    return;
  }

  if (!warnedMissingOutputFile) {
    warnedMissingOutputFile = true;
    warning("GITHUB_OUTPUT is not set; step outputs cannot be recorded.");
  }
}

function setFailed(message) {
  const output = message instanceof Error ? message.message : String(message);

  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error::${escapeWorkflowCommand(output)}`);
  } else {
    console.error(output);
  }

  process.exitCode = 1;
}

function info(message) {
  console.log(String(message));
}

function warning(message) {
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::warning::${escapeWorkflowCommand(message)}`);
    return;
  }

  console.warn(`Warning: ${message}`);
}

function escapeWorkflowCommand(value) {
  return String(value)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

module.exports = {
  getInput,
  info,
  setFailed,
  setOutput,
  warning,
};
