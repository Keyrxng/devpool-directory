import { calculateStatistics } from "./directory/calculate-statistics";
import { DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME, GitHubIssue, GitHubPullRequest, OrgNameAndAvatarUrl } from "./directory/directory";
import { getPartnerProfilePictures } from "./directory/get-partner-profile-pictures";
import { getPartnerUrls as getPartnerRepoUrls } from "./directory/get-partner-urls";
import { getRepoCredentials } from "./directory/get-repo-credentials";
import { getRepositoryIssues } from "./directory/get-repository-issues";
import { getRepositoryPullRequests } from "./directory/get-repository-pull-requests";
import { Statistics } from "./directory/statistics";
import { syncPartnerRepoIssues } from "./directory/sync-partner-repo-issues";
import { commitPartnerProfilePictures, commitPullRequests, commitStatistics, commitTasks } from "./git";
import { initializeTwitterMap, TwitterMap } from "./twitter/initialize-twitter-map";

export async function main() {
  const twitterMap: TwitterMap = await initializeTwitterMap();
  const directoryIssues: GitHubIssue[] = await getRepositoryIssues(DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME);
  const partnerRepoUrls = await getPartnerRepoUrls();
  const taskList: GitHubIssue[] = [];
  const pullRequestList: GitHubPullRequest[] = [];
  const partnerProfilePicturesList: OrgNameAndAvatarUrl[] = [];

  // for each project URL
  for (const partnerRepoUrl of partnerRepoUrls) {
    // get owner and repository names from project URL
    const result: GitHubIssue[] = await syncPartnerRepoIssues({ partnerRepoUrl, directoryIssues, twitterMap });
    taskList.push(...result);

    // get all pull requests (opened and closed)
    const [ownerName, repoName] = getRepoCredentials(partnerRepoUrl);
    const pullRequests: GitHubPullRequest[] = await getRepositoryPullRequests(ownerName, repoName);  
    pullRequestList.push(...pullRequests);

    // get partner profile picture
    const org: OrgNameAndAvatarUrl = await getPartnerProfilePictures(ownerName);
    partnerProfilePicturesList.push(org);
  }

  await commitTasks(taskList);
  await commitPullRequests(pullRequestList);
  await commitPartnerProfilePictures(partnerProfilePicturesList);

  // Calculate total rewards from devpool issues
  const { rewards, tasks } = await calculateStatistics(await getRepositoryIssues(DEVPOOL_OWNER_NAME, DEVPOOL_REPO_NAME));
  const statistics: Statistics = { rewards, tasks };

  await commitStatistics(statistics);
}
