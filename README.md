# Activity Log Updater

Generate a YAML activity log from GitHub activity and optionally commit the
updated file back to the repository.

The action can track:

- pull requests opened by a user
- pull requests authored by a user and later merged
- public repositories created by a user or organization
- public releases from repositories owned by a user or organization

## Usage

```yaml
name: Update activity log

on:
  workflow_dispatch:
  schedule:
    - cron: "17 3 * * *"

permissions:
  contents: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: hugo-themes/activity-log-updater@v1
        with:
          github-user: hossainemruz
          organizations: hugo-themes
          lookback-days: 7
          activity-limit: 15
          include-merged-pr: true
          include-releases: true
          output-file: data/home/activity-logs.yaml
```

## Enable or disable activity types

Each activity type is disabled by default. Enable exactly the activity types you
want in the generated log:

```yaml
- uses: hugo-themes/activity-log-updater@v1
  with:
    github-user: hossainemruz
    organizations: |
      hugo-themes
      example-org
    include-opened-pr: false
    include-merged-pr: true
    include-repo-created: true
    include-releases: true
```

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `github-token` | `${{ github.token }}` | Token used to read GitHub activity and push commits. |
| `github-user` | `${{ github.repository_owner }}` | User whose authored pull request activity is tracked. |
| `organizations` | empty | Comma, space, or newline-separated organization logins to include. |
| `lookback-days` | `7` | Number of days of activity to include. |
| `activity-limit` | `15` | Maximum number of activities to write. |
| `include-opened-pr` | `false` | Include pull requests opened by `github-user`. |
| `include-merged-pr` | `false` | Include pull requests authored by `github-user` that were merged. |
| `include-repo-created` | `false` | Include public repositories created by `github-user` or listed organizations. |
| `include-releases` | `false` | Include public releases from repositories owned by `github-user` or listed organizations. |
| `output-file` | `data/home/activity-logs.yaml` | Existing YAML file whose top-level `items` section will be replaced. |
| `commit` | `true` | Commit the updated output file when it changes. |
| `push` | `true` | Push the commit back to the workflow ref when `commit` is enabled. |
| `repository-limit` | `100` | Advanced: repositories inspected per owner. Maximum `1000`. |
| `pull-request-limit` | `100` | Advanced: authored pull requests inspected for `github-user`. Maximum `1000`. |
| `release-limit` | `10` | Advanced: releases inspected per repository. Maximum `100`. |

## Outputs

| Output | Description |
| --- | --- |
| `activity-count` | Number of activities written to the YAML file. |
| `changed` | Whether the output file content changed. |
| `committed` | Whether the action created a git commit. |
| `output-file` | Path to the updated YAML file. |

## Output file format

The output file must already exist and contain a top-level `items` section. The
action replaces only that `items` section and leaves the rest of the file as-is.

```yaml
id: "activity-logs"
type: "activity"
icon: "clock"
title: "Activity Log"
items:
  - date: "Today"
    active: true
    type: "merged-pr"
    info:
      number: 42
      repo: "https://github.com/hugo-themes/nerdy"
      title: "Improve activity section"
      url: "https://github.com/hugo-themes/nerdy/pull/42"
  - date: "Yesterday"
    type: "release"
    info:
      repo: "https://github.com/hugo-themes/nerdy"
      url: "https://github.com/hugo-themes/nerdy/releases/tag/v1.0.0"
      version: "v1.0.0"
```

Activity `type` values are `opened-pr`, `merged-pr`, `repo-created`, and
`release`.

`merged-pr` means an authored pull request that has been merged; it does not
mean a pull request merged by that user.

If your site renderer requires a template/partial per activity type, either add
templates for the enabled types or disable the unsupported activity inputs.

## Notes and limits

- At least one `include-*` activity input must be set to `true`.
- The configured `github-user` must exist and be accessible, otherwise the
  action fails.
- Inaccessible organizations are skipped with a warning so one unavailable
  organization does not block the rest of the log.
- Pull requests and repositories are fetched with GraphQL pagination up to the
  configured `pull-request-limit` and `repository-limit`.

## Development

This action uses Node.js 24 and has no runtime npm dependencies.

```bash
npm test
```
