const POSTPONE_API_URL = "https://api.postpone.app/gql";

interface PostponePostInput {
  caption: string;
  mediaUrl?: string;
  mediaName?: string;
}

interface PostponeResponse {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string; code?: string }>;
}

interface MutationResult {
  success: boolean;
  errors?: Array<{ code: string; message: string; field?: string }>;
}

async function postponeGraphQL(query: string, variables: Record<string, unknown>): Promise<PostponeResponse> {
  const token = process.env.POSTPONE_API_TOKEN;
  if (!token) {
    throw new Error("POSTPONE_API_TOKEN is not configured");
  }

  const response = await fetch(POSTPONE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = await response.text();

  let result: PostponeResponse;
  try {
    result = JSON.parse(body) as PostponeResponse;
  } catch {
    throw new Error(`Postpone API returned ${response.status} with non-JSON body: ${body.substring(0, 200)}`);
  }

  if (result.errors && result.errors.length > 0) {
    throw new Error(`Postpone GraphQL error: ${result.errors.map(e => e.message).join(", ")}`);
  }

  return result;
}

function getMutationResult(data: Record<string, unknown>, mutationName: string): MutationResult {
  const result = data[mutationName] as MutationResult | undefined;
  if (!result) {
    throw new Error(`No result returned from ${mutationName}`);
  }
  if (!result.success) {
    const errMessages = (result.errors || []).map(e => `${e.field || "unknown"}: ${e.message}`).join("; ");
    throw new Error(`Postpone ${mutationName} failed: ${errMessages || "unknown error"}`);
  }
  return result;
}

function getFutureDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}

export async function scheduleInstagramPost(input: PostponePostInput): Promise<void> {
  const username = process.env.POSTPONE_INSTAGRAM_USERNAME;
  if (!username) {
    throw new Error("POSTPONE_INSTAGRAM_USERNAME is not configured");
  }

  if (!input.mediaUrl) {
    throw new Error("Instagram requires a media URL — skipping Instagram draft");
  }

  const mutation = `
    mutation ScheduleInstagramPost($input: ScheduleInstagramPostInput!) {
      scheduleInstagramPost(input: $input) {
        success
        errors { code message field }
      }
    }
  `;

  const inputData: Record<string, unknown> = {
    username,
    caption: input.caption,
    publishingStatus: "DRAFT",
    mediaUrl: input.mediaUrl,
    mediaName: input.mediaName || "artwork.jpg",
    submissions: {
      postAt: getFutureDate(),
      mediaType: "FEED_POST",
    },
  };

  const result = await postponeGraphQL(mutation, { input: inputData });
  getMutationResult(result.data!, "scheduleInstagramPost");
  console.log("[Postpone] Instagram draft created successfully");
}

export async function scheduleLinkedInPost(input: PostponePostInput): Promise<void> {
  const username = process.env.POSTPONE_LINKEDIN_USERNAME;
  if (!username) {
    throw new Error("POSTPONE_LINKEDIN_USERNAME is not configured");
  }

  const mutation = `
    mutation ScheduleLinkedInPost($input: ScheduleLinkedInPostInput!) {
      scheduleLinkedInPost(input: $input) {
        success
        errors { code message field }
      }
    }
  `;

  const inputData: Record<string, unknown> = {
    username,
    text: input.caption,
    visibility: "PUBLIC",
    publishingStatus: "DRAFT",
    submissions: {
      postAt: getFutureDate(),
    },
  };

  if (input.mediaUrl) {
    inputData.mediaUrl = input.mediaUrl;
    inputData.mediaName = input.mediaName || "artwork.jpg";
  }

  const result = await postponeGraphQL(mutation, { input: inputData });
  getMutationResult(result.data!, "scheduleLinkedInPost");
  console.log("[Postpone] LinkedIn draft created successfully");
}

export async function scheduleThreadsPost(input: PostponePostInput): Promise<void> {
  const username = process.env.POSTPONE_THREADS_USERNAME;
  if (!username) {
    throw new Error("POSTPONE_THREADS_USERNAME is not configured");
  }

  const mutation = `
    mutation ScheduleThreadsPost($input: ScheduleThreadsPostInput!) {
      scheduleThreadsPost(input: $input) {
        success
        errors { code message field }
      }
    }
  `;

  const threadInput: Record<string, unknown> = {
    text: input.caption,
    order: 0,
  };

  if (input.mediaUrl) {
    threadInput.mediaUrl = input.mediaUrl;
    threadInput.mediaName = input.mediaName || "artwork.jpg";
  }

  const inputData: Record<string, unknown> = {
    username,
    publishingStatus: "DRAFT",
    postAt: getFutureDate(),
    thread: threadInput,
  };

  const result = await postponeGraphQL(mutation, { input: inputData });
  getMutationResult(result.data!, "scheduleThreadsPost");
  console.log("[Postpone] Threads draft created successfully");
}

export async function createDraftPosts(
  captions: { instagram: string; linkedin: string; threads: string },
  mediaUrl?: string,
  mediaName?: string
): Promise<{ succeeded: string[]; failed: string[] }> {
  const platforms = ["Instagram", "LinkedIn", "Threads"] as const;
  const results = await Promise.allSettled([
    scheduleInstagramPost({ caption: captions.instagram, mediaUrl, mediaName }),
    scheduleLinkedInPost({ caption: captions.linkedin, mediaUrl, mediaName }),
    scheduleThreadsPost({ caption: captions.threads, mediaUrl, mediaName }),
  ]);

  const succeeded: string[] = [];
  const failed: string[] = [];

  for (const [i, result] of results.entries()) {
    if (result.status === "fulfilled") {
      succeeded.push(platforms[i]);
    } else {
      failed.push(platforms[i]);
      console.error(`[Postpone] Failed to create ${platforms[i]} draft:`, result.reason);
    }
  }

  if (succeeded.length > 0) {
    console.log(`[Postpone] Drafts created successfully: ${succeeded.join(", ")}`);
  }
  if (failed.length === platforms.length) {
    console.error("[Postpone] All platform drafts failed");
  }

  return { succeeded, failed };
}
