function createGraphqlClient({ endpoint, token }) {
  return {
    async graphql(query, variables = {}) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "activity-log-updater-action",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ query, variables }),
      });

      const body = await response.text();
      const payload = parseJsonResponse(body);

      if (!response.ok) {
        throw new Error(`GitHub GraphQL request failed with ${response.status}: ${formatPayload(payload)}`);
      }

      if (payload.errors && payload.errors.length > 0) {
        throw new Error(`GitHub GraphQL error: ${payload.errors.map((error) => error.message).join("; ")}`);
      }

      return payload.data;
    },
  };
}

function parseJsonResponse(body) {
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`GitHub returned a non-JSON response: ${body.slice(0, 200)}`);
  }
}

function formatPayload(payload) {
  if (payload && payload.message) return payload.message;
  return JSON.stringify(payload);
}

module.exports = {
  createGraphqlClient,
};
