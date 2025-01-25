import { GitHubOrganization, octokit } from "./directory";

export async function getPartnerAvatars(ownerName: string): Promise<{ownerName: string, avatar_url?: string}> {
  const orgResp: GitHubOrganization[] = await octokit.paginate({
    method: "GET",
    url: `/orgs/${ownerName}`
  });

  const org = orgResp.find((org) => org.login === ownerName);

  return {ownerName, avatar_url: org ? org.avatar_url : undefined};
}
