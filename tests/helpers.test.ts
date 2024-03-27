import { describe, test } from "@jest/globals";
import { server } from "../mocks/node";
import {
  DEVPOOL_OWNER_NAME,
  DEVPOOL_REPO_NAME,
  forceCloseMissingIssues,
  getAllIssues,
  getDevpoolIssueLabels,
  getIssueByLabel,
  getIssueLabelValue,
  getIssuePriceLabel,
  getRepoCredentials,
  getRepoUrls,
  getSocialMediaText,
  GitHubIssue,
} from "../helpers/github";
import cfg from "../mocks/issue-devpool-template.json";
import { drop } from "@mswjs/data";
import { db } from "../mocks/db";

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("GitHub items", () => {
  const githubDevpoolIssueTemplate = cfg as GitHubIssue;

  beforeEach(() => {
    drop(db);
  });

  test("Get owner and repo values", () => {
    const [ownerName, repoName] = getRepoCredentials("https://github.com/owner/repo");
    expect(ownerName).toBe("owner");
    expect(repoName).toBe("repo");
  });

  test("Throw error on missing owner or repo", () => {
    expect(() => getRepoCredentials("https://github.com")).toThrow();
  });

  test("Get social media text", () => {
    const res = getSocialMediaText(githubDevpoolIssueTemplate);
    expect(res).toEqual("200 USD for 1h\n\nhttps://github.com/ubiquity/test-repo/issues/1");
  });

  test("Get issue price label", () => {
    let res = getIssuePriceLabel(githubDevpoolIssueTemplate);
    expect(res).toEqual("Pricing: 200 USD");
    res = getIssuePriceLabel({
      ...githubDevpoolIssueTemplate,
      labels: [],
    });
    expect(res).toEqual("Pricing: not set");
    res = getIssuePriceLabel(githubDevpoolIssueTemplate);
    expect(res).toEqual("Pricing: 200 USD");
  });

  test("Get issue label value", () => {
    let res = getIssueLabelValue(githubDevpoolIssueTemplate, "Pricing");
    expect(res).toEqual("200 USD");
    res = getIssueLabelValue(githubDevpoolIssueTemplate, "Notfound");
    expect(res).toBeNull();
  });

  test("Get issue by label", () => {
    let res = getIssueByLabel([githubDevpoolIssueTemplate], "Pricing: 200 USD");
    expect(res).toMatchObject(githubDevpoolIssueTemplate);
    res = getIssueByLabel([githubDevpoolIssueTemplate], "Notfound");
    expect(res).toBeNull();
  });

  test("Get DevPool labels", () => {
    const res = getDevpoolIssueLabels(
      {
        ...githubDevpoolIssueTemplate,
        html_url: "https://github.com/owner/repo",
        node_id: "2",
      },
      "https://github.com/owner/repo"
    );
    expect(res).toMatchObject(["Pricing: 200 USD", "Partner: owner/repo", "id: 2", "Time: 1h"]);
  });

  test("Get repo urls", async () => {
    db.repo.create({
      id: 1,
      name: "repo",
      owner: "owner",
      html_url: "https://github.com/owner/repo",
    });
    db.repo.create({
      id: 2,
      name: "test-repo",
      owner: DEVPOOL_OWNER_NAME,
      html_url: "https://github.com/ubiquity/test-repo",
    });
    db.repo.create({
      id: 3,
      name: DEVPOOL_REPO_NAME,
      owner: DEVPOOL_OWNER_NAME,
      html_url: "https://github.com/ubiquity/devpool-directory",
    });
    let res = await getRepoUrls("owner/repo");
    expect(res).toMatchObject(["https://github.com/owner/repo"]);
    res = await getRepoUrls(DEVPOOL_OWNER_NAME);
    expect(res).toMatchObject(["https://github.com/ubiquity/test-repo", "https://github.com/ubiquity/devpool-directory"]);
  });

  test("Get all issues", async () => {
    db.issue.create({ ...githubDevpoolIssueTemplate, repo: DEVPOOL_REPO_NAME, owner: DEVPOOL_OWNER_NAME });
    const issues = await getAllIssues(DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME);
    expect(issues).toMatchObject([githubDevpoolIssueTemplate]);
  });

  test("Close missing issues", async () => {
    const newOpenIssue = { ...githubDevpoolIssueTemplate, repo: DEVPOOL_REPO_NAME, owner: DEVPOOL_OWNER_NAME, state: "open" };
    const newClosedIssue = { ...githubDevpoolIssueTemplate, id: 2, repo: DEVPOOL_REPO_NAME, owner: DEVPOOL_OWNER_NAME, state: "closed" };
    db.issue.create(newOpenIssue);
    db.issue.create(newClosedIssue);
    await forceCloseMissingIssues([newOpenIssue, newClosedIssue], []);
    const issues = await getAllIssues(DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME);
    expect(issues).toMatchObject([{ ...newOpenIssue, state: "closed" }, newClosedIssue]);
  });
});
