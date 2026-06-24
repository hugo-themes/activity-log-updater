function renderActivityItems(activities) {
  if (activities.length === 0) {
    return "items: []\n";
  }

  const lines = ["items:"];

  activities.forEach((activity) => {
    lines.push(`  - activityDate: ${activityDate(activity.timestamp)}`);
    lines.push(`    type: ${yamlString(activity.type)}`);
    lines.push("    info:");

    renderInfo(activity.info).forEach(([key, value]) => {
      lines.push(`      ${key}: ${renderValue(value)}`);
    });
  });

  return `${lines.join("\n")}\n`;
}

function replaceActivityItems(existingContent, activities) {
  const lines = existingContent.split("\n");
  const itemsStart = lines.findIndex((line) => /^items:\s*(?:\[\])?\s*(?:#.*)?$/.test(line));

  if (itemsStart === -1) {
    throw new Error("output-file must contain a top-level items section.");
  }

  const itemsEnd = findItemsEnd(lines, itemsStart + 1);
  const replacement = renderActivityItems(activities).trimEnd().split("\n");
  const updatedLines = [...lines.slice(0, itemsStart), ...replacement, ...lines.slice(itemsEnd)];

  return `${updatedLines.join("\n").replace(/\n*$/, "")}\n`;
}

function findItemsEnd(lines, startIndex) {
  let trailingBlankStart = null;

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];

    if (line === "") {
      if (trailingBlankStart === null) trailingBlankStart = index;
      continue;
    }

    if (line && !/^\s/.test(line)) {
      return trailingBlankStart ?? index;
    }

    trailingBlankStart = null;
  }

  return trailingBlankStart ?? lines.length;
}

function renderInfo(info) {
  return Object.entries(info).filter(([, value]) => value !== undefined && value !== null && value !== "");
}

function renderValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";

  return yamlString(value);
}

function activityDate(timestamp) {
  const date = new Date(timestamp);

  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Activity timestamp must be a valid date: ${timestamp}`);
  }

  return date.toISOString().slice(0, 10);
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

module.exports = {
  activityDate,
  renderActivityItems,
  replaceActivityItems,
};
