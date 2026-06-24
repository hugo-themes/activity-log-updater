const assert = require("node:assert/strict");
const test = require("node:test");

const {
  collectActivities,
  collectCreatedRepositories,
  collectMergedPullRequests,
  collectOpenedPullRequests,
  collectReleases,
  finalizeActivities,
} = require("../src/activity");

const context = {
  activityLimit: 3,
  cutoff: new Date("2026-06-17T00:00:00Z"),
  ownerLogins: new Set(["octocat", "hugo-themes"]),
};

test("collectOpenedPullRequests keeps public repositories owned by selected owners", () => {
  const activities = collectOpenedPullRequests(
    [
      pullRequest({ createdAt: "2026-06-20T00:00:00Z", owner: "hugo-themes" }),
      pullRequest({ createdAt: "2026-06-20T00:00:00Z", owner: "private", isPrivate: true }),
      pullRequest({ createdAt: "2026-06-20T00:00:00Z", owner: "other" }),
    ],
    context,
  );

  assert.equal(activities.length, 1);
  assert.equal(activities[0].type, "opened-pr");
});

test("collectMergedPullRequests uses mergedAt timestamp", () => {
  const activities = collectMergedPullRequests(
    [pullRequest({ createdAt: "2026-06-18T00:00:00Z", mergedAt: "2026-06-21T00:00:00Z" })],
    context,
  );

  assert.equal(activities[0].timestamp, "2026-06-21T00:00:00Z");
  assert.equal(activities[0].type, "merged-pr");
});

test("collectCreatedRepositories and collectReleases produce stable activity shapes", () => {
  const repositories = [
    {
      createdAt: "2026-06-19T00:00:00Z",
      isPrivate: false,
      nameWithOwner: "hugo-themes/nerdy",
      owner: { login: "hugo-themes" },
      releases: {
        nodes: [
          { isDraft: false, publishedAt: "2026-06-20T00:00:00Z", tagName: "v1.0.0", url: "https://github.com/hugo-themes/nerdy/releases/tag/v1.0.0" },
          { isDraft: true, publishedAt: "2026-06-21T00:00:00Z", tagName: "draft", url: "https://github.com/hugo-themes/nerdy/releases/tag/draft" },
        ],
      },
      url: "https://github.com/hugo-themes/nerdy",
    },
  ];

  assert.deepEqual(collectCreatedRepositories(repositories)[0], {
    info: {
      name: "hugo-themes/nerdy",
      owner: "hugo-themes",
      url: "https://github.com/hugo-themes/nerdy",
    },
    key: "repo-created:https://github.com/hugo-themes/nerdy",
    timestamp: "2026-06-19T00:00:00Z",
    type: "repo-created",
  });

  const releases = collectReleases(repositories);
  assert.equal(releases.length, 1);
  assert.equal(releases[0].info.version, "v1.0.0");
});

test("finalizeActivities filters by lookback, sorts, deduplicates, and limits", () => {
  const activities = finalizeActivities(
    [
      activity("old", "release", "2026-06-01T00:00:00Z"),
      activity("newer", "release", "2026-06-20T00:00:00Z"),
      activity("duplicate", "release", "2026-06-19T00:00:00Z"),
      activity("duplicate", "release", "2026-06-18T00:00:00Z"),
      activity("newest", "release", "2026-06-21T00:00:00Z"),
    ],
    context,
  );

  assert.deepEqual(
    activities.map((item) => item.key),
    ["newest", "newer", "duplicate"],
  );
});

test("collectActivities paginates authored pull requests up to the configured limit", async () => {
  const pullRequests = Array.from({ length: 101 }, (_, index) =>
    pullRequest({
      createdAt: `2026-06-${String(20 - (index % 3)).padStart(2, "0")}T00:00:00Z`,
      owner: "octocat",
      number: index + 1,
    }),
  );
  const calls = [];
  const github = {
    async graphql(_query, variables) {
      calls.push(variables);
      const start = variables.cursor ? Number.parseInt(variables.cursor, 10) : 0;
      const end = start + variables.pageSize;

      return {
        user: {
          pullRequests: {
            nodes: pullRequests.slice(start, end),
            pageInfo: {
              endCursor: String(end),
              hasNextPage: end < pullRequests.length,
            },
          },
        },
      };
    },
  };

  const activities = await collectActivities({
    activityLimit: 101,
    enabledActivities: ["opened-pr"],
    github,
    githubUser: "octocat",
    lookbackDays: 7,
    now: new Date("2026-06-24T00:00:00Z"),
    organizationLogins: [],
    pullRequestLimit: 101,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].pageSize, 100);
  assert.deepEqual(calls[0].states, ["OPEN"]);
  assert.equal(calls[1].pageSize, 1);
  assert.equal(activities.length, 101);
});

function pullRequest({ createdAt, mergedAt = null, owner = "hugo-themes", isPrivate = false, number = 42 }) {
  return {
    createdAt,
    mergedAt,
    number,
    repository: {
      isPrivate,
      owner: { login: owner },
      url: `https://github.com/${owner}/repo`,
    },
    title: "Improve docs",
    url: `https://github.com/${owner}/repo/pull/${number}`,
  };
}

function activity(key, type, timestamp) {
  return { info: {}, key, timestamp, type };
}
