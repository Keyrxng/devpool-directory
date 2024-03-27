/* eslint-disable @typescript-eslint/no-explicit-any */
import { setupServer } from "msw/node";
import { GitHubIssue, getProjectUrls } from "../helpers/github";
import { db } from "../mocks/db";
import { handlers } from "../mocks/handlers";
import { drop } from "@mswjs/data";
import issueDevpoolTemplate from "../mocks/issue-devpool-template.json";
import issueTemplate from "../mocks/issue-template.json";
import { handleDevPoolIssue, createDevPoolIssue } from "../helpers/github";

const DEVPOOL_OWNER_NAME = "ubiquity";
const DEVPOOL_REPO_NAME = "devpool-directory";
const UBIQUITY_TEST_REPO = "https://github.com/ubiquity/test-repo";

const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => {
  const openIssues = db.issue.findMany({
    where: {
      state: {
        equals: "open",
      },
    },
  });

  openIssues.forEach((issue) => {
    const unavailableLabel = issue.labels.find((label: string | unknown) => {
      if (label && typeof label === "object" && "name" in label) {
        return label.name === "Unavailable";
      } else if (typeof label === "string") {
        return label.includes("Unavailable");
      } else {
        return false;
      }
    });
    expect(unavailableLabel).toBeUndefined();
  });

  server.resetHandlers();
  drop(db);
});
afterAll(() => server.close());

function createIssues(devpoolIssue: GitHubIssue, projectIssue: GitHubIssue) {
  db.issue.create(devpoolIssue);
  db.issue.create(projectIssue);

  return db.issue.findFirst({
    where: {
      id: {
        equals: devpoolIssue.id,
      },
    },
  }) as GitHubIssue;
}

describe("handleDevPoolIssue", () => {
  const logSpy = jest.spyOn(console, "log").mockImplementation();

  beforeEach(() => {
    logSpy.mockClear();
  });

  describe("Devpool Directory", () => {
    beforeEach(() => {
      db.repo.create({
        id: 1,
        html_url: "https://github.com/ubiquity/devpool-directory",
        name: DEVPOOL_REPO_NAME,
        owner: DEVPOOL_OWNER_NAME,
      });
      db.repo.create({
        id: 2,
        owner: DEVPOOL_OWNER_NAME,
        name: "test-repo",
        html_url: `https://github.com/${DEVPOOL_OWNER_NAME}/test-repo`,
      });
    });
    test("updates issue title in devpool when project issue title changes", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        id: 1,
        title: "Original Title",
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        id: 2,
        title: "Updated Title",
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, UBIQUITY_TEST_REPO, issueInDb, false);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(logSpy).toHaveBeenCalledWith(`Updated metadata: ${updatedIssue.html_url} (${partnerIssue.html_url})`);
    });

    test("updates issue labels in devpool when project issue labels change", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        labels: [{ name: "Pricing: 200 USD" }, { name: "Partner: ubiquity/test-repo" }, { name: "id: 2" }, { name: "Time: 1h" }],
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        labels: issueTemplate.labels?.concat({ name: "enhancement" }),
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, UBIQUITY_TEST_REPO, issueInDb, false);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.labels).toEqual(expect.arrayContaining([{ name: "enhancement" }]));

      expect(logSpy).toHaveBeenCalledWith(`Updated metadata: ${updatedIssue.html_url} (${partnerIssue.html_url})`);
    });

    test("does not update issue when no metadata changes are detected", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        labels: [{ name: "Pricing: 200 USD" }, { name: "Partner: ubiquity/test-repo" }, { name: "id: 2" }, { name: "Time: 1h" }],
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, UBIQUITY_TEST_REPO, issueInDb, false);

      expect(logSpy).not.toHaveBeenCalled();
    });

    test("keeps devpool issue state unchanged when project issue state matches devpool issue state", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        labels: [{ name: "Pricing: 200 USD" }, { name: "Partner: ubiquity/test-repo" }, { name: "id: 2" }, { name: "Time: 1h" }],
        state: "open",
      } as GitHubIssue;
      const partnerIssue = {
        ...issueTemplate,
        state: "open",
      } as GitHubIssue;

      createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, UBIQUITY_TEST_REPO, devpoolIssue, false);

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Updated state"));
    });

    test("keeps devpool issue state unchanged when project issue state is closed and devpool issue state is closed", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        labels: [{ name: "Pricing: 200 USD" }, { name: "Partner: ubiquity/test-repo" }, { name: "id: 2" }, { name: "Time: 1h" }],
        state: "closed",
      } as GitHubIssue;
      const partnerIssue = {
        ...issueTemplate,
        state: "closed",
      } as GitHubIssue;

      createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, UBIQUITY_TEST_REPO, devpoolIssue, false);

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Updated state"));
    });

    test("keeps devpool issue state unchanged when project issue state is closed, assigned and devpool issue state is closed", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        labels: [{ name: "Pricing: 200 USD" }, { name: "Partner: ubiquity/test-repo" }, { name: "id: 2" }, { name: "Time: 1h" }],
        state: "closed",
      } as GitHubIssue;
      const partnerIssue = {
        ...issueTemplate,
        state: "closed",
        assignee: {
          login: "hunter",
        } as GitHubIssue["assignee"],
      } as GitHubIssue;

      createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, UBIQUITY_TEST_REPO, devpoolIssue, false);

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Updated state"));
    });

    test("keeps devpool issue state unchanged when project issue state is closed, merged, unassigned and devpool issue state is closed", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        labels: [{ name: "Pricing: 200 USD" }, { name: "Partner: ubiquity/test-repo" }, { name: "id: 2" }, { name: "Time: 1h" }],
        state: "closed",
      } as GitHubIssue;
      const partnerIssue = {
        ...issueTemplate,
        state: "closed",
        pull_request: {
          merged_at: new Date().toISOString(),
          diff_url: "https//github.com/ubiquity/test-repo/pull/1.diff",
          html_url: "https//github.com/ubiquity/test-repo/pull/1",
          patch_url: "https//github.com/ubiquity/test-repo/pull/1.patch",
          url: "https//github.com/ubiquity/test-repo/pull/1",
        },
      } as GitHubIssue;

      createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, UBIQUITY_TEST_REPO, devpoolIssue, false);

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Updated state"));
    });

    test("keeps devpool state unchanged when project issue state is open, assigned, merged and devpool issue state is closed", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        labels: [{ name: "Pricing: 200 USD" }, { name: "Partner: ubiquity/test-repo" }, { name: "id: 2" }, { name: "Time: 1h" }],
        state: "closed",
      } as GitHubIssue;
      const partnerIssue = {
        ...issueTemplate,
        state: "open",
        assignee: {
          login: "hunter",
        } as GitHubIssue["assignee"],
        pull_request: {
          merged_at: new Date().toISOString(),
          diff_url: "https//github.com/ubiquity/test-repo/pull/1.diff",
          html_url: "https//github.com/ubiquity/test-repo/pull/1",
          patch_url: "https//github.com/ubiquity/test-repo/pull/1.patch",
          url: "https//github.com/ubiquity/test-repo/pull/1",
        },
      } as GitHubIssue;

      createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, UBIQUITY_TEST_REPO, devpoolIssue, false);

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Updated"));
    });

    test("keeps devpool state unchanged when project issue state is open, unassigned and devpool issue state is open", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        labels: [{ name: "Pricing: 200 USD" }, { name: "Partner: ubiquity/test-repo" }, { name: "id: 2" }, { name: "Time: 1h" }],
        state: "open",
      } as GitHubIssue;
      const partnerIssue = {
        ...issueTemplate,
        state: "open",
      } as GitHubIssue;

      createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, UBIQUITY_TEST_REPO, devpoolIssue, false);

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Updated state"));
    });

    test("keeps devpool state unchanged when project issue state is open, unassigned, merged and devpool issue state is open", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        labels: [{ name: "Pricing: 200 USD" }, { name: "Partner: ubiquity/test-repo" }, { name: "id: 2" }, { name: "Time: 1h" }],
        state: "open",
      } as GitHubIssue;
      const partnerIssue = {
        ...issueTemplate,
        state: "open",
        pull_request: {
          merged_at: new Date().toISOString(),
          diff_url: "https//github.com/ubiquity/test-repo/pull/1.diff",
          html_url: "https//github.com/ubiquity/test-repo/pull/1",
          patch_url: "https//github.com/ubiquity/test-repo/pull/1.patch",
          url: "https//github.com/ubiquity/test-repo/pull/1",
        },
      } as GitHubIssue;

      createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, UBIQUITY_TEST_REPO, devpoolIssue, false);

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Updated state"));
    });

    // cause: !projectIssues.some((projectIssue) => projectIssue.node_id == getIssueLabelValue(devpoolIssue, "id:"))
    // comment: "Closed (missing in partners):"
    test("closes devpool issue when project issue is missing", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        node_id: "1234",
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, UBIQUITY_TEST_REPO, issueInDb, false);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.state).toEqual("closed");

      expect(logSpy).toHaveBeenCalledWith(`Updated state: (Closed (missing in partners))\n${updatedIssue.html_url} - (${partnerIssue.html_url})`);
    });

    // cause: hasNoPriceLabels && devpoolIssue.state == "open"
    // comment: "Closed (no price labels):"
    test("closes devpool issue when project issue has no price labels", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        labels: [],
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, UBIQUITY_TEST_REPO, issueInDb, false);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.state).toEqual("closed");

      expect(logSpy).toHaveBeenCalledWith(`Updated state: (Closed (no price labels))\n${updatedIssue.html_url} - (${partnerIssue.html_url})`);
    });

    // cause: projectIssue.state == "closed" && devpoolIssue.state == "open" && !!projectIssue.pull_request?.merged_at,
    // comment: "Closed (merged):"
    test("closes devpool issue when project issue is merged", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        state: "closed",
        pull_request: {
          merged_at: new Date().toISOString(),
          diff_url: "https//github.com/ubiquity/test-repo/pull/1.diff",
          html_url: "https//github.com/ubiquity/test-repo/pull/1",
          patch_url: "https//github.com/ubiquity/test-repo/pull/1.patch",
          url: "https//github.com/ubiquity/test-repo/pull/1",
        },
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, UBIQUITY_TEST_REPO, issueInDb, false);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.state).toEqual("closed");

      expect(logSpy).toHaveBeenCalledWith(`Updated state: (Closed (merged))\n${updatedIssue.html_url} - (${partnerIssue.html_url})`);
    });

    // cause: projectIssue.state == "closed" && devpoolIssue.state == "open"
    // comment: "Closed (not merged):"
    test("closes devpool issue when project issue is closed", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        state: "open",
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        state: "closed",
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, UBIQUITY_TEST_REPO, issueInDb, false);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.state).toEqual("closed");

      expect(logSpy).toHaveBeenCalledWith(`Updated state: (Closed (not merged))\n${updatedIssue.html_url} - (${partnerIssue.html_url})`);
    });

    // cause: projectIssue.state == "closed" && devpoolIssue.state == "open" && !!projectIssue.assignee?.login,
    // comment: "Closed (assigned-closed):",
    test("closes devpool issue when project issue is closed and assigned", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        state: "closed",
        assignee: {
          login: "hunter",
        } as GitHubIssue["assignee"],
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, UBIQUITY_TEST_REPO, issueInDb, false);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.state).toEqual("closed");

      expect(logSpy).toHaveBeenCalledWith(`Updated state: (Closed (assigned-closed))\n${updatedIssue.html_url} - (${partnerIssue.html_url})`);
    });

    // cause: projectIssue.state == "open" && devpoolIssue.state == "open" && !!projectIssue.assignee?.login,
    // comment: "Closed (assigned-open):"
    test("closes devpool issue when project issue is open and assigned", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        assignee: {
          login: "hunter",
        } as GitHubIssue["assignee"],
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, UBIQUITY_TEST_REPO, issueInDb, false);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.state).toEqual("closed");

      expect(logSpy).toHaveBeenCalledWith(`Updated state: (Closed (assigned-open))\n${updatedIssue.html_url} - (${partnerIssue.html_url})`);
    });

    // cause: projectIssue.state == "open" && devpoolIssue.state == "closed" && !projectIssue.assignee?.login && !hasNoPriceLabels
    // comment: "Reopened (unassigned):",
    test("reopens devpool issue when project issue is reopened", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        state: "closed",
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        state: "open",
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, UBIQUITY_TEST_REPO, issueInDb, false);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.state).toEqual("open");

      expect(logSpy).toHaveBeenCalledWith(`Updated state: (Reopened (unassigned))\n${updatedIssue.html_url} - (${partnerIssue.html_url})`);
    });

    // cause: projectIssue.state == "open" && devpoolIssue.state == "closed" && !!projectIssue.pull_request?.merged_at && !hasNoPriceLabels,
    // comment: "Reopened (merged):",
    test("reopens devpool issue when project issue is unassigned, reopened and merged", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        state: "closed",
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        state: "open",
        pull_request: {
          merged_at: new Date().toISOString(),
          diff_url: "https//github.com/ubiquity/test-repo/pull/1.diff",
          html_url: "https//github.com/ubiquity/test-repo/pull/1",
          patch_url: "https//github.com/ubiquity/test-repo/pull/1.patch",
          url: "https//github.com/ubiquity/test-repo/pull/1",
        },
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, UBIQUITY_TEST_REPO, issueInDb, false);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();

      expect(logSpy).toHaveBeenCalledWith(`Updated state: (Reopened (merged))\n${updatedIssue.html_url} - (${partnerIssue.html_url})`);
    });
  });

  const HTML_URL = "https://github.com/not-ubiquity/devpool-directory/issues/1";
  const REPO_URL = "https://github.com/not-ubiquity/devpool-directory";
  const PROJECT_URL = "https://github.com/ubiquity/test-repo";
  const BODY = "https://www.github.com/ubiquity/test-repo/issues/1";
  /**
   * ========================
   * DEVPOOL FORKED REPO
   * ========================
   */

  describe("Forked Devpool", () => {
    // need to mock DEVPOOL_OWNER_NAME
    jest.mock("../helpers/github", () => ({
      ...jest.requireActual("../helpers/github"),
      DEVPOOL_OWNER_NAME: "not-ubiquity",
    }));

    beforeEach(() => {
      db.repo.create({
        id: 1,
        owner: "not-ubiquity",
        name: DEVPOOL_REPO_NAME,
        html_url: REPO_URL,
      });
      db.repo.create({
        id: 2,
        owner: DEVPOOL_OWNER_NAME,
        name: "test-repo",
        html_url: `https://github.com/${DEVPOOL_OWNER_NAME}/test-repo`,
      });
      db.repo.create({
        id: 3,
        owner: DEVPOOL_OWNER_NAME,
        name: DEVPOOL_REPO_NAME,
        html_url: `https://github.com/${DEVPOOL_OWNER_NAME}/${DEVPOOL_REPO_NAME}`,
      });
    });

    afterAll(() => {
      jest.unmock("../helpers/github");
    });

    test("updates issue title in devpool when project issue title changes in forked repo", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        id: 1,
        title: "Original Title",
        html_url: HTML_URL,
        repository_url: REPO_URL,
        body: BODY,
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        id: 2,
        title: "Updated Title",
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, PROJECT_URL, issueInDb, true);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.title).toEqual("Updated Title");

      expect(logSpy).toHaveBeenCalledWith(`Updated metadata: ${updatedIssue.html_url} (${partnerIssue.html_url})`);
    });

    test("updates issue labels in devpool when project issue labels change in forked repo", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        id: 1,
        html_url: HTML_URL,
        repository_url: REPO_URL,
        body: BODY,
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        labels: issueTemplate.labels?.concat({ name: "enhancement" }),
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, PROJECT_URL, issueInDb, true);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();

      expect(logSpy).toHaveBeenCalledWith(`Updated metadata: ${updatedIssue.html_url} (${partnerIssue.html_url})`);
    });

    test("closes devpool issue when project issue is missing in forked repo", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        id: 1,
        html_url: HTML_URL,
        repository_url: REPO_URL,
        body: BODY,
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        id: 2,
        node_id: "1234",
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, PROJECT_URL, issueInDb, true);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.state).toEqual("closed");

      expect(logSpy).toHaveBeenCalledWith(`Updated state: (Closed (missing in partners))\n${updatedIssue.html_url} - (${partnerIssue.html_url})`);
    });

    test("closes devpool issue when project issue has no price labels in forked repo", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        id: 1,
        html_url: HTML_URL,
        repository_url: REPO_URL,
        body: BODY,
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        id: 2,
        labels: [],
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, PROJECT_URL, issueInDb, true);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.state).toEqual("closed");

      expect(logSpy).toHaveBeenCalledWith(`Updated state: (Closed (no price labels))\n${updatedIssue.html_url} - (${partnerIssue.html_url})`);
    });

    test("closes devpool issue when project issue is merged in forked repo", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        id: 1,
        html_url: HTML_URL,
        repository_url: REPO_URL,
        body: BODY,
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        id: 2,
        state: "closed",
        pull_request: {
          merged_at: new Date().toISOString(),
          diff_url: "https//github.com/ubiquity/test-repo/pull/1.diff",
          html_url: "https//github.com/ubiquity/test-repo/pull/1",
          patch_url: "https//github.com/ubiquity/test-repo/pull/1.patch",
          url: "https//github.com/ubiquity/test-repo/pull/1",
        },
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, PROJECT_URL, issueInDb, true);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.state).toEqual("closed");

      expect(logSpy).toHaveBeenCalledWith(`Updated state: (Closed (merged))\n${updatedIssue.html_url} - (${partnerIssue.html_url})`);
    });

    test("closes devpool issue when project issue is closed in forked repo", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        id: 1,
        html_url: HTML_URL,
        repository_url: REPO_URL,
        body: BODY,
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        id: 2,
        state: "closed",
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, PROJECT_URL, issueInDb, true);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.state).toEqual("closed");

      expect(logSpy).toHaveBeenCalledWith(`Updated state: (Closed (not merged))\n${updatedIssue.html_url} - (${partnerIssue.html_url})`);
    });

    test("closes devpool issue when project issue is closed and assigned in forked repo", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        id: 1,
        html_url: HTML_URL,
        repository_url: REPO_URL,
        body: BODY,
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        id: 2,
        state: "closed",
        assignee: {
          login: "hunter",
        } as GitHubIssue["assignee"],
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, PROJECT_URL, issueInDb, true);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.state).toEqual("closed");

      expect(logSpy).toHaveBeenCalledWith(`Updated state: (Closed (assigned-closed))\n${updatedIssue.html_url} - (${partnerIssue.html_url})`);
    });

    test("closes devpool issue when project issue is open and assigned in forked repo", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        id: 1,
        html_url: HTML_URL,
        repository_url: REPO_URL,
        body: BODY,
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        id: 2,
        assignee: {
          login: "hunter",
        } as GitHubIssue["assignee"],
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, PROJECT_URL, issueInDb, true);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.state).toEqual("closed");

      expect(logSpy).toHaveBeenCalledWith(`Updated state: (Closed (assigned-open))\n${updatedIssue.html_url} - (${partnerIssue.html_url})`);
    });

    test("reopens devpool issue when project issue is reopened and unassigned in forked repo", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        id: 1,
        html_url: HTML_URL,
        repository_url: REPO_URL,
        body: BODY,
        state: "closed",
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        id: 2,
        state: "open",
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, PROJECT_URL, issueInDb, true);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.state).toEqual("open");

      expect(logSpy).toHaveBeenCalledWith(`Updated state: (Reopened (unassigned))\n${updatedIssue.html_url} - (${partnerIssue.html_url})`);
    });

    test("should not reopen devpool issue when project issue is reopened, assigned and merged in forked repo", async () => {
      const devpoolIssue = {
        ...issueDevpoolTemplate,
        html_url: HTML_URL,
        repository_url: REPO_URL,
        body: BODY,
        state: "closed",
      } as GitHubIssue;

      const partnerIssue = {
        ...issueTemplate,
        id: 2,
        state: "open",
        assignee: {
          login: "hunter",
        } as GitHubIssue["assignee"],
        pull_request: {
          merged_at: new Date().toISOString(),
          diff_url: "https//github.com/ubiquity/test-repo/pull/1.diff",
          html_url: "https//github.com/ubiquity/test-repo/pull/1",
          patch_url: "https//github.com/ubiquity/test-repo/pull/1.patch",
          url: "https//github.com/ubiquity/test-repo/pull/1",
        },
      } as GitHubIssue;

      const issueInDb = createIssues(devpoolIssue, partnerIssue);

      await handleDevPoolIssue([partnerIssue], partnerIssue, PROJECT_URL, issueInDb, true);

      const updatedIssue = db.issue.findFirst({
        where: {
          id: {
            equals: 1,
          },
        },
      }) as GitHubIssue;

      expect(updatedIssue).not.toBeNull();
      expect(updatedIssue?.state).toEqual("closed");

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining(`Updated state`));
    });
  });
});

describe("createDevPoolIssue", () => {
  const logSpy = jest.spyOn(console, "log").mockImplementation();
  const twitterMap: { [key: string]: string } = {
    "ubiquity/test-repo": "ubiquity",
  };

  beforeEach(() => {
    logSpy.mockClear();
  });

  describe("Devpool Directory", () => {
    beforeEach(() => {
      db.repo.create({
        id: 1,
        html_url: "https://github.com/ubiquity/devpool-directory",
        name: DEVPOOL_REPO_NAME,
        owner: DEVPOOL_OWNER_NAME,
      });
      db.repo.create({
        id: 2,
        owner: DEVPOOL_OWNER_NAME,
        name: "test-repo",
        html_url: `https://github.com/${DEVPOOL_OWNER_NAME}/test-repo`,
      });
    });

    afterEach(() => {
      drop(db);
    });

    test("only creates a new devpool issue if price labels are set, it's unassigned, opened and not already a devpool issue", async () => {
      const partnerIssue = {
        ...issueTemplate,
        assignee: null,
      } as GitHubIssue;

      logSpy.mockClear();
      await createDevPoolIssue(partnerIssue, partnerIssue.html_url, UBIQUITY_TEST_REPO, twitterMap);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Created"));
    });

    test("does not create a new devpool issue if price labels are not set", async () => {
      const partnerIssue = {
        ...issueTemplate,
        labels: [],
      } as GitHubIssue;

      await createDevPoolIssue(partnerIssue, partnerIssue.html_url, UBIQUITY_TEST_REPO, twitterMap);

      const devpoolIssue = db.issue.findFirst({
        where: {
          title: {
            equals: partnerIssue.title,
          },
        },
      }) as GitHubIssue;

      expect(devpoolIssue).toBeNull();
      expect(logSpy).not.toHaveBeenCalled();
    });

    test("does not create a new devpool issue if it's already a devpool issue", async () => {
      const partnerIssue = {
        ...issueTemplate,
      } as GitHubIssue;

      db.issue.create({
        ...issueDevpoolTemplate,
        id: partnerIssue.id,
      });
      logSpy.mockClear();

      await createDevPoolIssue(partnerIssue, partnerIssue.html_url, UBIQUITY_TEST_REPO, twitterMap);

      const devpoolIssue = db.issue.findFirst({
        where: {
          id: {
            equals: partnerIssue.id,
          },
        },
      }) as GitHubIssue;

      expect(devpoolIssue).not.toBeNull();
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Created"));
    });

    test("does not create a new devpool issue if it's assigned", async () => {
      const partnerIssue = {
        ...issueTemplate,
        assignee: {
          login: "hunter",
        } as GitHubIssue["assignee"],
      } as GitHubIssue;

      db.issue.create({
        ...issueDevpoolTemplate,
        title: partnerIssue.title,
        body: partnerIssue.html_url,
        repository_url: UBIQUITY_TEST_REPO,
      });

      await createDevPoolIssue(partnerIssue, partnerIssue.html_url, UBIQUITY_TEST_REPO, twitterMap);

      const devpoolIssue = db.issue.findFirst({
        where: {
          title: {
            equals: partnerIssue.title,
          },
        },
      }) as GitHubIssue;

      expect(devpoolIssue).not.toBeNull();

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Created"));
    });

    test("does not create a new devpool issue if it's closed", async () => {
      const partnerIssue = {
        ...issueTemplate,
        state: "closed",
      } as GitHubIssue;

      await createDevPoolIssue(partnerIssue, partnerIssue.html_url, UBIQUITY_TEST_REPO, twitterMap);

      const devpoolIssue = db.issue.findFirst({
        where: {
          title: {
            equals: partnerIssue.title,
          },
        },
      }) as GitHubIssue;

      expect(devpoolIssue).toBeNull();

      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Created"));
    });
  });
});

describe("getProjectUrls", () => {
  const responseMap = {
    ubiquity: {
      "series-a": "https://github.com/ubiquity/series-a",
      hackbar: "https://github.com/ubiquity/hackbar",
      "devpool-directory": "https://github.com/ubiquity/devpool-directory",
      "card-issuance": "https://github.com/ubiquity/card-issuance",
      research: "https://github.com/ubiquity/research",
      recruiting: "https://github.com/ubiquity/recruiting",
      "business-development": "https://github.com/ubiquity/business-development",
      ubiquibot: "https://github.com/ubiquity/ubiquibot",
      ubiquibar: "https://github.com/ubiquity/ubiquibar",
      "ubiquibot-telegram": "https://github.com/ubiquity/ubiquibot-telegram",
      // ^ out

      "work.fi": "https://github.com/ubiquity/work.fi",
      "pay.fi": "https://github.com/ubiquity/pay.fi",
      "gas-faucet": "https://github.com/ubiquity/gas-faucet",
      "keygen.fi": "https://github.com/ubiquity/keygen.fi",
      "onboarding.fi": "https://github.com/ubiquity/onboarding.fi",
    },
    ubiquibot: {
      configuration: "https://github.com/ubiquibot/configuration",
      production: "https://github.com/ubiquibot/production",
      sandbox: "https://github.com/ubiquibot/sandbox",
      "e2e-tests": "https://github.com/ubiquibot/e2e-tests",
      staging: "https://github.com/ubiquibot/staging",
      // ^ out

      "test-repo": "https://github.com/ubiquibot/test-repo",
    },
    "pavlovcik/uad.ubq.fi": {
      "uad.ubq.fi": "https://github.com/pavlovcik/uad.ubq.fi",
      // ^ in
    },
    "private-test-org": {
      "secret-repo": "https://github.com/private-test-org/secret-repo",
      "secret-repo-2": "https://github.com/private-test-org/secret-repo-2",
      // ^ out

      "public-repo": "https://github.com/private-test-org/public-repo",
      // ^ in
    },
    "test-org": {
      "secret-repo": "https://github.com/test-org/secret-repo",
      "secret-repo-2": "https://github.com/test-org/secret-repo-2",
      // ^ out
    },
  };

  beforeAll(() => {
    jest.spyOn(console, "log").mockImplementation();
  });

  const opt = {
    in: ["ubiquity", "ubiquibot", "private-test-org", "private-test-org/public-repo", "pavlovcik/uad.ubq.fi"],
    out: [
      "private-test-org",
      "ubiquity/series-a",
      "ubiquity/hackbar",
      "ubiquity/devpool-directory",
      "ubiquity/card-issuance",
      "ubiquity/research",
      "ubiquity/recruiting",
      "ubiquity/business-development",
      "ubiquity/ubiquibar",
      "ubiquity/ubiquibot",
      "ubiquity/ubiquibot-telegram",
      "ubiquity/test-repo",
      "ubiquibot/configuration",
      "ubiquibot/production",
      "ubiquibot/sandbox",
      "ubiquibot/e2e-tests",
      "ubiquibot/staging",
    ],
  };

  beforeEach(() => {
    drop(db);

    let index = 1;
    Object.entries(responseMap).forEach(([owner, repos]) => {
      for (const [name, url] of Object.entries(repos)) {
        db.repo.create({
          id: index++,
          owner: owner.split("/")[0],
          name,
          html_url: url,
        });
      }
    });
  });

  test("returns projects not included in Opt.out", async () => {
    const urls = Array.from(await getProjectUrls(opt));

    opt.out.forEach((url) => {
      expect(urls).not.toContain("https://github.com/" + url);
    });

    expect(urls).not.toEqual("https://github.com/" + opt.out);

    expect(urls).toEqual(
      expect.arrayContaining([
        "https://github.com/ubiquity/work.fi",
        "https://github.com/ubiquity/pay.fi",
        "https://github.com/ubiquity/gas-faucet",
        "https://github.com/ubiquity/keygen.fi",
        "https://github.com/ubiquity/onboarding.fi",
        "https://github.com/pavlovcik/uad.ubq.fi",
        "https://github.com/private-test-org/public-repo",
      ])
    );
  });
});
