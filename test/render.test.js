const assert = require("node:assert/strict");
const test = require("node:test");

const { activityDate, renderActivityItems, replaceActivityItems } = require("../src/render");

test("renderActivityItems writes supported activity info", () => {
  const yaml = renderActivityItems([
    {
      info: {
        number: 7,
        repo: "https://github.com/hugo-themes/nerdy",
        title: "Add activity log",
        url: "https://github.com/hugo-themes/nerdy/pull/7",
      },
      timestamp: "2026-06-24T15:30:00Z",
      type: "merged-pr",
    },
    {
      info: {
        name: "hugo-themes/nerdy",
        owner: "hugo-themes",
        url: "https://github.com/hugo-themes/nerdy",
      },
      timestamp: "2026-06-21T00:00:00Z",
      type: "repo-created",
    },
  ]);

  assert.match(yaml, /^items:/);
  assert.match(yaml, /activityDate: 2026-06-24/);
  assert.doesNotMatch(yaml, /active: true/);
  assert.match(yaml, /type: "merged-pr"/);
  assert.match(yaml, /number: 7/);
  assert.match(yaml, /activityDate: 2026-06-21/);
  assert.match(yaml, /type: "repo-created"/);
  assert.match(yaml, /name: "hugo-themes\/nerdy"/);
});

test("renderActivityItems writes an empty item list", () => {
  const yaml = renderActivityItems([]);

  assert.equal(yaml, "items: []\n");
});

test("replaceActivityItems preserves metadata around the top-level items section", () => {
  const updated = replaceActivityItems(
    [
      "id: activity-logs",
      "type: activity",
      "icon: clock",
      "title: Activity Log",
      "items:",
      "  - date: Old",
      "    type: release",
      "footer: keep-me",
      "",
    ].join("\n"),
    [
      {
        info: { version: "v1.0.0", url: "https://github.com/hugo-themes/nerdy/releases/tag/v1.0.0" },
        timestamp: new Date().toISOString(),
        type: "release",
      },
    ],
  );

  assert.match(updated, /^id: activity-logs\ntype: activity\nicon: clock\ntitle: Activity Log\nitems:/);
  assert.match(updated, /activityDate:/);
  assert.match(updated, /type: "release"/);
  assert.match(updated, /footer: keep-me\n$/);
  assert.doesNotMatch(updated, /Old/);
});

test("replaceActivityItems requires an existing top-level items section", () => {
  assert.throws(() => replaceActivityItems("id: activity-logs\n", []), /top-level items section/);
});

test("activityDate formats timestamps as UTC dates", () => {
  assert.equal(activityDate("2026-06-24T23:30:00Z"), "2026-06-24");
  assert.equal(activityDate("2026-06-24"), "2026-06-24");
  assert.throws(() => activityDate("not-a-date"), /valid date/);
});
