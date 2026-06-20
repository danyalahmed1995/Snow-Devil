pub const VIEWER_REPOS_QUERY: &str = r#"
query($first: Int!) {
  viewer {
    repositories(first: $first, ownerAffiliations: [OWNER, COLLABORATOR], orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        id
        nameWithOwner
        url
        isPrivate
        description
        primaryLanguage {
          name
        }
        updatedAt
        owner {
          login
        }
      }
    }
  }
}
"#;

pub const REPO_ISSUES_PRS_QUERY: &str = r#"
query($owner: String!, $name: String!, $first: Int!) {
  repository(owner: $owner, name: $name) {
    id
    issues(first: $first, states: [OPEN], orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        id
        number
        title
        state
        url
        updatedAt
        author {
          login
        }
      }
    }
    pullRequests(first: $first, states: [OPEN], orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        id
        number
        title
        state
        url
        updatedAt
        author {
          login
        }
      }
    }
  }
}
"#;
