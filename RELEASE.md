# Release Process

Releases in this repo are mostly automated with [release-plan](https://github.com/embroider-build/release-plan/).
Once you label all your PRs correctly (see below), a PR is generated for you.
That PR updates CHANGELOG.md and `.release-plan.json`. Merging it prepares the release.

## Preparation

Most of the release process is automated. The remaining tasks before a release are:

- label **all** pull requests merged since the last release
- update pull request titles so they make sense to our users

[keepachangelog.com](https://keepachangelog.com/en/1.1.0/) explains why this matters.
The guiding principle: changelogs are for humans, not machines.

When reviewing merged PRs, use these labels:

- breaking: the PR is a breaking change
- enhancement: the PR adds a new feature or enhancement
- bug: the PR fixes a bug included in a previous release
- documentation: the PR adds or updates documentation
- internal: internal changes, or anything that fits no other category

**Note:** `release-plan` requires that **all** PRs are labeled. If a PR fits no category, label it `internal`.

## Release

Once the prep work is done, the release itself is one step: merge the open [Plan Release](https://github.com/NullVoxPopuli/ember.nvp/pulls?q=is%3Apr+is%3Aopen+%22Prepare+Release%22+in%3Atitle) PR.
