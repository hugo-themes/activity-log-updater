const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ACTIVITY_LIMIT = 15;
const DEFAULT_LOOKBACK_DAYS = 7;
const DEFAULT_PULL_REQUEST_LIMIT = 100;
const DEFAULT_RELEASE_LIMIT = 10;
const DEFAULT_REPOSITORY_LIMIT = 100;
const PAGE_SIZE = 100;

const PAGE_INFO_FIELDS = `
  pageInfo {
    endCursor
    hasNextPage
  }
`;

const REPOSITORY_ACTIVITY_FRAGMENT = `
  fragment RepositoryActivity on Repository {
    createdAt
    isPrivate
    nameWithOwner
    url
    owner {
      login
    }
  }
`;

const REPOSITORY_RELEASE_ACTIVITY_FRAGMENT = `
  fragment RepositoryReleaseActivity on Repository {
    ...RepositoryActivity
    releases(first: $releaseLimit, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes {
        isDraft
        publishedAt
        tagName
        url
      }
    }
  }
`;

const PULL_REQUESTS_QUERY = `
  query ActivityPullRequests($login: String!, $pageSize: Int!, $cursor: String, $states: [PullRequestState!]!) {
    user(login: $login) {
      pullRequests(first: $pageSize, after: $cursor, states: $states, orderBy: { field: UPDATED_AT, direction: DESC }) {
        nodes {
          createdAt
          mergedAt
          number
          title
          url
          repository {
            isPrivate
            nameWithOwner
            url
            owner {
              login
            }
          }
        }
        ${PAGE_INFO_FIELDS}
      }
    }
  }
`;

const OWNER_REPOSITORY_QUERIES = Object.freeze({
  organization: Object.freeze({
    created: `
      query OrganizationCreatedRepositories($login: String!, $pageSize: Int!, $cursor: String) {
        organization(login: $login) {
          repositories(first: $pageSize, after: $cursor, privacy: PUBLIC, orderBy: { field: CREATED_AT, direction: DESC }) {
            nodes {
              ...RepositoryActivity
            }
            ${PAGE_INFO_FIELDS}
          }
        }
      }

      ${REPOSITORY_ACTIVITY_FRAGMENT}
    `,
    release: `
      query OrganizationReleaseRepositories($login: String!, $pageSize: Int!, $cursor: String, $releaseLimit: Int!) {
        organization(login: $login) {
          repositories(first: $pageSize, after: $cursor, privacy: PUBLIC, orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes {
              ...RepositoryReleaseActivity
            }
            ${PAGE_INFO_FIELDS}
          }
        }
      }

      ${REPOSITORY_ACTIVITY_FRAGMENT}
      ${REPOSITORY_RELEASE_ACTIVITY_FRAGMENT}
    `,
  }),
  user: Object.freeze({
    created: `
      query UserCreatedRepositories($login: String!, $pageSize: Int!, $cursor: String) {
        user(login: $login) {
          repositories(first: $pageSize, after: $cursor, ownerAffiliations: OWNER, privacy: PUBLIC, orderBy: { field: CREATED_AT, direction: DESC }) {
            nodes {
              ...RepositoryActivity
            }
            ${PAGE_INFO_FIELDS}
          }
        }
      }

      ${REPOSITORY_ACTIVITY_FRAGMENT}
    `,
    release: `
      query UserReleaseRepositories($login: String!, $pageSize: Int!, $cursor: String, $releaseLimit: Int!) {
        user(login: $login) {
          repositories(first: $pageSize, after: $cursor, ownerAffiliations: OWNER, privacy: PUBLIC, orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes {
              ...RepositoryReleaseActivity
            }
            ${PAGE_INFO_FIELDS}
          }
        }
      }

      ${REPOSITORY_ACTIVITY_FRAGMENT}
      ${REPOSITORY_RELEASE_ACTIVITY_FRAGMENT}
    `,
  }),
});

async function collectActivities(options) {
  const context = buildCollectionContext(options);
  const data = await fetchRequiredData(context);
  const activities = [];

  if (context.enabledActivities.has("opened-pr")) {
    activities.push(...collectOpenedPullRequests(data.pullRequests, context));
  }

  if (context.enabledActivities.has("merged-pr")) {
    activities.push(...collectMergedPullRequests(data.pullRequests, context));
  }

  if (context.enabledActivities.has("repo-created")) {
    activities.push(...collectCreatedRepositories(data.createdRepositories));
  }

  if (context.enabledActivities.has("release")) {
    activities.push(...collectReleases(data.releaseRepositories));
  }

  return finalizeActivities(activities, context);
}

function buildCollectionContext(options) {
  const organizationLogins = options.organizationLogins || [];

  return {
    activityLimit: options.activityLimit || DEFAULT_ACTIVITY_LIMIT,
    cutoff: new Date(
      (options.now || new Date()).getTime() - (options.lookbackDays || DEFAULT_LOOKBACK_DAYS) * DAY_IN_MS,
    ),
    enabledActivities: new Set(options.enabledActivities),
    github: options.github,
    githubUser: options.githubUser,
    logger: normalizeLogger(options.logger),
    missingOwnerWarnings: new Set(),
    organizationLogins,
    ownerLogins: new Set([options.githubUser, ...organizationLogins].map((login) => login.toLowerCase())),
    pullRequestLimit: options.pullRequestLimit || DEFAULT_PULL_REQUEST_LIMIT,
    pullRequestStates: pullRequestStates(options.enabledActivities),
    releaseLimit: options.releaseLimit || DEFAULT_RELEASE_LIMIT,
    repositoryLimit: options.repositoryLimit || DEFAULT_REPOSITORY_LIMIT,
  };
}

function pullRequestStates(enabledActivities) {
  const enabled = new Set(enabledActivities);
  const states = [];

  if (enabled.has("opened-pr")) states.push("OPEN");
  if (enabled.has("merged-pr")) states.push("MERGED");

  return states;
}

function normalizeLogger(logger) {
  if (logger?.warning) return logger;

  return {
    info: logger?.info || console.log,
    warning: logger?.warn || console.warn,
  };
}

async function fetchRequiredData(context) {
  const needsPullRequests =
    context.enabledActivities.has("opened-pr") || context.enabledActivities.has("merged-pr");
  const needsCreatedRepositories = context.enabledActivities.has("repo-created");
  const needsReleaseRepositories = context.enabledActivities.has("release");

  const [pullRequests, repositories] = await Promise.all([
    needsPullRequests ? fetchAuthoredPullRequests(context) : Promise.resolve([]),
    needsCreatedRepositories || needsReleaseRepositories
      ? fetchOwnerRepositories(context, {
          includeCreated: needsCreatedRepositories,
          includeReleases: needsReleaseRepositories,
        })
      : Promise.resolve({ createdRepositories: [], releaseRepositories: [] }),
  ]);

  return {
    createdRepositories: repositories.createdRepositories,
    pullRequests,
    releaseRepositories: repositories.releaseRepositories,
  };
}

async function fetchAuthoredPullRequests(context) {
  return fetchPaginatedNodes({
    limit: context.pullRequestLimit,
    requestPage: async (pageSize, cursor) => {
      const data = await context.github.graphql(PULL_REQUESTS_QUERY, {
        cursor,
        login: context.githubUser,
        pageSize,
        states: context.pullRequestStates,
      });

      if (!data.user) {
        throw new Error(`GitHub user not found or inaccessible: ${context.githubUser}`);
      }

      return data.user.pullRequests;
    },
  });
}

async function fetchOwnerRepositories(context, flags) {
  const owners = [
    { kind: "user", login: context.githubUser, required: true },
    ...context.organizationLogins.map((login) => ({ kind: "organization", login, required: false })),
  ];
  const groups = await Promise.all(owners.map((owner) => fetchOwnerRepositoryGroup(context, owner, flags)));

  return {
    createdRepositories: groups.flatMap((group) => group.createdRepositories),
    releaseRepositories: groups.flatMap((group) => group.releaseRepositories),
  };
}

async function fetchOwnerRepositoryGroup(context, owner, flags) {
  const [createdRepositories, releaseRepositories] = await Promise.all([
    flags.includeCreated ? fetchRepositoryConnection(context, owner, "created") : Promise.resolve([]),
    flags.includeReleases ? fetchRepositoryConnection(context, owner, "release") : Promise.resolve([]),
  ]);

  return { createdRepositories, releaseRepositories };
}

async function fetchRepositoryConnection(context, owner, connectionType) {
  const query = OWNER_REPOSITORY_QUERIES[owner.kind][connectionType];

  return fetchPaginatedNodes({
    limit: context.repositoryLimit,
    requestPage: async (pageSize, cursor) => {
      const variables = { cursor, login: owner.login, pageSize };
      if (connectionType === "release") variables.releaseLimit = context.releaseLimit;

      const data = await context.github.graphql(query, variables);
      const ownerData = data[owner.kind];

      if (!ownerData) {
        handleMissingOwner(context, owner);
        return null;
      }

      return ownerData.repositories;
    },
  });
}

async function fetchPaginatedNodes({ limit, requestPage }) {
  const nodes = [];
  let cursor = null;
  let hasNextPage = true;

  while (nodes.length < limit && hasNextPage) {
    const pageSize = Math.min(PAGE_SIZE, limit - nodes.length);
    const connection = await requestPage(pageSize, cursor);

    if (!connection) break;

    nodes.push(...(connection.nodes || []));
    hasNextPage = Boolean(connection.pageInfo?.hasNextPage && connection.pageInfo?.endCursor);
    cursor = connection.pageInfo?.endCursor || null;
  }

  return nodes;
}

function handleMissingOwner(context, owner) {
  if (owner.required) {
    throw new Error(`GitHub user not found or inaccessible: ${owner.login}`);
  }

  const warningKey = `${owner.kind}:${owner.login.toLowerCase()}`;
  if (context.missingOwnerWarnings.has(warningKey)) return;

  context.missingOwnerWarnings.add(warningKey);
  context.logger.warning(`Organization not found or inaccessible: ${owner.login}`);
}

function collectOpenedPullRequests(pullRequests, context) {
  return pullRequests
    .filter((pullRequest) => isPublicSelectedRepository(pullRequest.repository, context))
    .filter((pullRequest) => pullRequest.createdAt)
    .map((pullRequest) => pullRequestActivity("opened-pr", pullRequest, pullRequest.createdAt));
}

function collectMergedPullRequests(pullRequests, context) {
  return pullRequests
    .filter((pullRequest) => isPublicSelectedRepository(pullRequest.repository, context))
    .filter((pullRequest) => pullRequest.mergedAt)
    .map((pullRequest) => pullRequestActivity("merged-pr", pullRequest, pullRequest.mergedAt));
}

function pullRequestActivity(type, pullRequest, timestamp) {
  return {
    info: {
      number: pullRequest.number,
      repo: pullRequest.repository.url,
      title: pullRequest.title,
      url: pullRequest.url,
    },
    key: `${type}:${pullRequest.url}`,
    timestamp,
    type,
  };
}

function collectCreatedRepositories(repositories) {
  return repositories
    .filter((repository) => repository && !repository.isPrivate && repository.createdAt)
    .map((repository) => ({
      info: {
        name: repository.nameWithOwner,
        owner: repository.owner?.login || "",
        url: repository.url,
      },
      key: `repo-created:${repository.url}`,
      timestamp: repository.createdAt,
      type: "repo-created",
    }));
}

function collectReleases(repositories) {
  return repositories
    .filter((repository) => repository && !repository.isPrivate)
    .flatMap((repository) =>
      (repository.releases?.nodes || [])
        .filter((release) => release && !release.isDraft && release.publishedAt)
        .map((release) => ({
          info: {
            repo: repository.url,
            url: release.url,
            version: release.tagName,
          },
          key: `release:${release.url}`,
          timestamp: release.publishedAt,
          type: "release",
        })),
    );
}

function isPublicSelectedRepository(repository, context) {
  const ownerLogin = repository?.owner?.login?.toLowerCase();

  return Boolean(repository && !repository.isPrivate && context.ownerLogins.has(ownerLogin));
}

function finalizeActivities(activities, context) {
  const seen = new Set();

  return activities
    .filter((activity) => Number.isFinite(Date.parse(activity.timestamp)))
    .filter((activity) => new Date(activity.timestamp) >= context.cutoff)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .filter((activity) => {
      if (seen.has(activity.key)) return false;
      seen.add(activity.key);
      return true;
    })
    .slice(0, context.activityLimit);
}

module.exports = {
  collectActivities,
  collectCreatedRepositories,
  collectMergedPullRequests,
  collectOpenedPullRequests,
  collectReleases,
  finalizeActivities,
};
