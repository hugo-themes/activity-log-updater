function renderActivityItems(activities) {
  if (activities.length === 0) {
    return "items: []\n";
  }

  const lines = ["items:"];

  activities.forEach((activity, index) => {
    lines.push(`  - date: ${yamlString(relativeDate(activity.timestamp))}`);
    if (index === 0) lines.push("    active: true");
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

function relativeDate(timestamp, now = new Date()) {
  const activityDate = new Date(timestamp);
  const rawDiffDays = Math.floor((startOfUtcDay(now) - startOfUtcDay(activityDate)) / (24 * 60 * 60 * 1000));
  const diffDays = Math.max(0, rawDiffDays);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} Days Ago`;

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(activityDate);
}

function startOfUtcDay(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

module.exports = {
  relativeDate,
  renderActivityItems,
  replaceActivityItems,
};
