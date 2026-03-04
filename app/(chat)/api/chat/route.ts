import { checkBotId } from "botid/server";
import { geolocation, ipAddress } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
} from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { auth, type UserType } from "@/app/(auth)/auth";
import { imageSearchLog } from "@/lib/ai/image-search-logger";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { resolveChatModel } from "@/lib/ai/models";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { searchCatalogByImageTool } from "@/lib/ai/tools/search-catalog-by-image";
import { searchCatalogTool } from "@/lib/ai/tools/search-catalog";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { checkIpRateLimit } from "@/lib/ratelimit";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { logChatRequestMetric } from "@/lib/observability/chat-metrics";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

function toProxyImageUrl({
  sourceUrl,
  requestUrl,
}: {
  sourceUrl: string;
  requestUrl: string;
}) {
  const proxyPath = `/api/files/blob?url=${encodeURIComponent(sourceUrl)}`;
  return new URL(proxyPath, requestUrl).toString();
}

function normalizeMessagesForModel(
  uiMessages: ChatMessage[],
  requestUrl: string
): ChatMessage[] {
  return uiMessages.map((message) => {
    if (message.role !== "user") {
      return message;
    }

    const normalizedParts: ChatMessage["parts"] = [];

    for (const part of message.parts) {
      if (part.type !== "file") {
        normalizedParts.push(part);
        continue;
      }

      const fileUrl = part.url;
      const modelReadableUrl = toProxyImageUrl({
        sourceUrl: fileUrl,
        requestUrl,
      });
      const filename = part.filename ?? "uploaded-image";
      const media = part.mediaType ?? "image";

      normalizedParts.push(
        {
          type: "text" as const,
          text: `User uploaded a file attachment.
filename: ${filename}
mediaType: ${media}
url: ${modelReadableUrl}
For shopping requests that reference this image, call searchCatalogByImage with the url above.`,
        },
      );
    }

    return {
      ...message,
      parts: normalizedParts,
    };
  });
}

function sanitizeModelMessagesForGateway(modelMessages: any[]) {
  return modelMessages.map((message) => {
    if (message?.role !== "user" || !Array.isArray(message?.content)) {
      return message;
    }

    const sanitizedContent: any[] = [];

    for (const part of message.content) {
      if (part?.type === "text") {
        sanitizedContent.push(part);
        continue;
      }

      const possibleUrl =
        part?.url ??
        part?.image ??
        part?.source?.url ??
        part?.source ??
        undefined;

      const attachmentUrl =
        typeof possibleUrl === "string"
          ? possibleUrl
          : possibleUrl instanceof URL
            ? possibleUrl.toString()
            : "unknown-url";

      sanitizedContent.push({
        type: "text",
        text: `User attached an image/file.
url: ${attachmentUrl}
For shopping requests using this attachment, call searchCatalogByImage with the url above.`,
      });
    }

    return {
      ...message,
      content:
        sanitizedContent.length > 0
          ? sanitizedContent
          : [
              {
                type: "text",
                text: "User sent an attachment. Use searchCatalogByImage when image-based shopping is requested.",
              },
            ],
    };
  });
}

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

export { getStreamContext };

export async function POST(request: Request) {
  const requestStart = Date.now();
  let metricRecorded = false;
  const recordMetric = ({
    ok,
    reason,
  }: {
    ok: boolean;
    reason?: string;
  }) => {
    if (metricRecorded) {
      return;
    }
    metricRecorded = true;
    logChatRequestMetric({
      route: "/api/chat",
      ok,
      reason,
      durationMs: Date.now() - requestStart,
    });
  };

  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    recordMetric({ ok: false, reason: "bad_request" });
    return new ChatbotError("bad_request:api").toResponse();
  }

  try {
    const {
      id,
      message,
      messages,
      selectedChatModel: rawSelectedChatModel,
      selectedVisibilityType,
    } =
      requestBody;
    const effectiveChatModel = resolveChatModel(rawSelectedChatModel);
    imageSearchLog("chat:post:start", {
      chatId: id,
      selectedChatModel: effectiveChatModel,
      hasMessage: Boolean(message),
      messageParts: message?.parts?.length ?? 0,
    });

    const [botResult, session] = await Promise.all([checkBotId(), auth()]);

    if (botResult.isBot) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    await checkIpRateLimit(ipAddress(request));

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatbotError("rate_limit:chat").toResponse();
    }

    const isToolApprovalFlow = Boolean(messages);

    const chat = await getChatById({ id });
    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string> | null = null;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatbotError("forbidden:chat").toResponse();
      }
      if (!isToolApprovalFlow) {
        messagesFromDb = await getMessagesByChatId({ id });
      }
    } else if (message?.role === "user") {
      await saveChat({
        id,
        userId: session.user.id,
        title: "New chat",
        visibility: selectedVisibilityType,
      });
      titlePromise = generateTitleFromUserMessage({ message });
    }

    const uiMessages = isToolApprovalFlow
      ? (messages as ChatMessage[])
      : [...convertToUIMessages(messagesFromDb), message as ChatMessage];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    if (message?.role === "user") {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: "user",
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    }

    const isReasoningModel =
      effectiveChatModel.includes("reasoning") ||
      effectiveChatModel.includes("thinking");

    const normalizedUiMessages = normalizeMessagesForModel(
      uiMessages,
      request.url
    );
    imageSearchLog("chat:normalized-ui-messages", {
      totalMessages: normalizedUiMessages.length,
    });
    const rawModelMessages = await convertToModelMessages(normalizedUiMessages);
    imageSearchLog("chat:raw-model-messages", {
      totalMessages: rawModelMessages.length,
    });
    const modelMessages = sanitizeModelMessagesForGateway(rawModelMessages);
    imageSearchLog("chat:sanitized-model-messages", {
      totalMessages: modelMessages.length,
    });

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        const result = streamText({
          model: getLanguageModel(effectiveChatModel),
          system: systemPrompt({
            selectedChatModel: effectiveChatModel,
            requestHints,
          }),
          messages: modelMessages,
          stopWhen: stepCountIs(5),
          experimental_activeTools: isReasoningModel
            ? []
            : [
                "searchCatalog",
                "searchCatalogByImage",
                "getWeather",
                "createDocument",
                "updateDocument",
                "requestSuggestions",
              ],
          providerOptions: isReasoningModel
            ? {
                anthropic: {
                  thinking: { type: "enabled", budgetTokens: 10_000 },
                },
              }
            : undefined,
          tools: {
            searchCatalog: searchCatalogTool,
            searchCatalogByImage: searchCatalogByImageTool,
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({ session, dataStream }),
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
        });

        dataStream.merge(result.toUIMessageStream({ sendReasoning: true }));

        if (titlePromise) {
          const title = await titlePromise;
          dataStream.write({ type: "data-chat-title", data: title });
          updateChatTitleById({ chatId: id, title });
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        if (isToolApprovalFlow) {
          for (const finishedMsg of finishedMessages) {
            const existingMsg = uiMessages.find((m) => m.id === finishedMsg.id);
            if (existingMsg) {
              await updateMessage({
                id: finishedMsg.id,
                parts: finishedMsg.parts,
              });
            } else {
              await saveMessages({
                messages: [
                  {
                    id: finishedMsg.id,
                    role: finishedMsg.role,
                    parts: finishedMsg.parts,
                    createdAt: new Date(),
                    attachments: [],
                    chatId: id,
                  },
                ],
              });
            }
          }
        } else if (finishedMessages.length > 0) {
          await saveMessages({
            messages: finishedMessages.map((currentMessage) => ({
              id: currentMessage.id,
              role: currentMessage.role,
              parts: currentMessage.parts,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            })),
          });
        }
        recordMetric({ ok: true });
      },
      onError: (error) => {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        recordMetric({ ok: false, reason: errorMessage.slice(0, 120) });
        if (
          error instanceof Error &&
          error.message?.includes(
            "AI Gateway requires a valid credit card on file to service requests",
          )
        ) {
          return "AI Gateway requires a valid credit card on file to service requests. Please visit https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card to add a card and unlock your free credits.";
        }
        if (
          error instanceof Error &&
          /timed out|timeout|ETIMEDOUT|DeadlineExceeded/i.test(error.message)
        ) {
          return "The request timed out. Please try again, or simplify your request.";
        }
        if (
          error instanceof Error &&
          /image|download|fetch/i.test(error.message)
        ) {
          return "I couldn't access the uploaded image reliably. Please re-upload it or add a short text description.";
        }
        return "Oops, an error occurred!";
      },
    });

    return createUIMessageStreamResponse({
      stream,
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) {
          return;
        }
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            const streamId = generateId();
            await createStreamId({ streamId, chatId: id });
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
          }
        } catch (_) {
          // ignore redis errors
        }
      },
    });
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatbotError) {
      recordMetric({ ok: false, reason: error.message });
      return error.toResponse();
    }

    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      recordMetric({ ok: false, reason: "gateway_credit_card_required" });
      return new ChatbotError("bad_request:activate_gateway").toResponse();
    }

    recordMetric({
      ok: false,
      reason: error instanceof Error ? error.message : "unknown_error",
    });
    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatbotError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
