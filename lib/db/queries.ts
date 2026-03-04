import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { ArtifactKind } from "@/components/artifact";
import type { CatalogProduct } from "@/lib/commerce/catalog";
import { IMAGE_EMBEDDING_DIMENSION } from "@/lib/commerce/image-search";
import type { VisibilityType } from "@/components/visibility-selector";
import { ChatbotError } from "../errors";
import { generateUUID } from "../utils";
import {
  type Chat,
  chat,
  type DBMessage,
  document,
  message,
  product,
  type Suggestion,
  stream,
  suggestion,
  type User,
  user,
  vote,
} from "./schema";
import { generateHashedPassword } from "./utils";

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

const tokenize = (input: string) =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);

const normalizeCompact = (input: string) =>
  input.toLowerCase().replace(/[^a-z0-9]/g, "");

const toVectorLiteral = (embedding: number[]) => `[${embedding.join(",")}]`;

export async function getUser(email: string): Promise<User[]> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get user by email"
    );
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await db.insert(user).values({ email, password: hashedPassword });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to create user");
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    return await db.insert(user).values({ email, password }).returning({
      id: user.id,
      email: user.email,
    });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create guest user"
    );
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
    });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save chat");
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));
    await db.delete(stream).where(eq(stream.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    const userChats = await db
      .select({ id: chat.id })
      .from(chat)
      .where(eq(chat.userId, userId));

    if (userChats.length === 0) {
      return { deletedCount: 0 };
    }

    const chatIds = userChats.map((c) => c.id);

    await db.delete(vote).where(inArray(vote.chatId, chatIds));
    await db.delete(message).where(inArray(message.chatId, chatIds));
    await db.delete(stream).where(inArray(stream.chatId, chatIds));

    const deletedChats = await db
      .delete(chat)
      .where(eq(chat.userId, userId))
      .returning();

    return { deletedCount: deletedChats.length };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<any>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id)
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Chat[] = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${startingAfter} not found`
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatbotError(
          "not_found:database",
          `Chat with id ${endingBefore} not found`
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to get chat by id");
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    return await db.insert(message).values(messages);
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save messages");
  }
}

export async function updateMessage({
  id,
  parts,
}: {
  id: string;
  parts: DBMessage["parts"];
}) {
  try {
    return await db.update(message).set({ parts }).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to update message");
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === "up" })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === "up",
    });
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        createdAt: new Date(),
      })
      .returning();
  } catch (_error) {
    throw new ChatbotError("bad_request:database", "Failed to save document");
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp)
        )
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(eq(suggestion.documentId, documentId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp))
      );

    const messageIds = messagesToDelete.map(
      (currentMessage) => currentMessage.id
    );

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds))
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds))
        );
    }
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  try {
    return await db.update(chat).set({ title }).where(eq(chat.id, chatId));
  } catch (error) {
    console.warn("Failed to update title for chat", chatId, error);
    return;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, twentyFourHoursAgo),
          eq(message.role, "user")
        )
      )
      .execute();

    return stats?.count ?? 0;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}

export async function upsertCatalogProducts({
  products,
}: {
  products: CatalogProduct[];
}) {
  try {
    if (products.length === 0) {
      return { inserted: 0 };
    }

    await db
      .insert(product)
      .values(
        products.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          description: item.description,
          priceCents: Math.round(item.price * 100),
          currency: item.currency,
          imageUrl: item.imageUrl,
          tags: item.tags,
          isActive: true,
          updatedAt: new Date(),
        }))
      )
      .onConflictDoUpdate({
        target: product.id,
        set: {
          name: sql`excluded."name"`,
          category: sql`excluded."category"`,
          description: sql`excluded."description"`,
          priceCents: sql`excluded."priceCents"`,
          currency: sql`excluded."currency"`,
          imageUrl: sql`excluded."imageUrl"`,
          tags: sql`excluded."tags"`,
          isActive: sql`excluded."isActive"`,
          updatedAt: sql`now()`,
        },
      });

    return { inserted: products.length };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to upsert catalog products"
    );
  }
}

export async function upsertProductImageEmbedding({
  productId,
  embedding,
  model,
}: {
  productId: string;
  embedding: number[];
  model: string;
}) {
  try {
    if (embedding.length !== IMAGE_EMBEDDING_DIMENSION) {
      throw new ChatbotError(
        "bad_request:database",
        `Expected embedding dimension ${IMAGE_EMBEDDING_DIMENSION}, received ${embedding.length}`
      );
    }

    const vectorLiteral = toVectorLiteral(embedding);

    await client`
      INSERT INTO product_image_embeddings (product_id, embedding, model, updated_at)
      VALUES (${productId}, ${vectorLiteral}::vector, ${model}, now())
      ON CONFLICT (product_id)
      DO UPDATE SET
        embedding = EXCLUDED.embedding,
        model = EXCLUDED.model,
        updated_at = now()
    `;

    return { productId };
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to upsert product image embedding"
    );
  }
}

export async function searchCatalogProductsByImageEmbedding({
  embedding,
  limit = 5,
}: {
  embedding: number[];
  limit?: number;
}) {
  try {
    if (embedding.length !== IMAGE_EMBEDDING_DIMENSION) {
      throw new ChatbotError(
        "bad_request:database",
        `Expected embedding dimension ${IMAGE_EMBEDDING_DIMENSION}, received ${embedding.length}`
      );
    }

    const vectorLiteral = toVectorLiteral(embedding);

    const rows = await client<
      {
        id: string;
        name: string;
        category: string;
        description: string;
        priceCents: number;
        currency: string;
        imageUrl: string;
        similarity: number;
      }[]
    >`
      SELECT
        p.id,
        p."name",
        p."category",
        p."description",
        p."priceCents",
        p."currency",
        p."imageUrl",
        (1 - (e.embedding <=> ${vectorLiteral}::vector))::float AS similarity
      FROM product_image_embeddings e
      INNER JOIN "Product" p ON p.id = e.product_id
      WHERE p."isActive" = true
      ORDER BY e.embedding <=> ${vectorLiteral}::vector
      LIMIT ${Math.max(1, Math.min(limit, 10))}
    `;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      description: row.description,
      price: row.priceCents / 100,
      currency: row.currency,
      imageUrl: row.imageUrl,
      similarity: Number(row.similarity),
    }));
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to search catalog products by image embedding"
    );
  }
}

export async function searchCatalogProducts({
  query,
  maxPrice,
  minPrice,
  category,
  limit = 5,
}: {
  query: string;
  maxPrice?: number;
  minPrice?: number;
  category?: string;
  limit?: number;
}) {
  try {
    const normalizedCategory = category?.trim().toLowerCase();
    const compactCategory = normalizedCategory
      ? normalizeCompact(normalizedCategory)
      : undefined;
    const queryTokens = Array.from(new Set(tokenize(query)));
    const compactQueryTokens = queryTokens
      .map((token) => normalizeCompact(token))
      .filter((token) => token.length > 0);

    const whereClauses: SQL<unknown>[] = [eq(product.isActive, true)];

    if (normalizedCategory) {
      const categoryClauses: SQL<unknown>[] = [
        ilike(product.category, `%${normalizedCategory}%`),
      ];

      if (compactCategory) {
        categoryClauses.push(
          sql`regexp_replace(lower(${product.category}), '[^a-z0-9]', '', 'g') LIKE ${`%${compactCategory}%`}`
        );
      }

      whereClauses.push(
        or(...categoryClauses) as SQL<unknown>
      );
    }

    if (minPrice !== undefined) {
      whereClauses.push(gte(product.priceCents, Math.round(minPrice * 100)));
    }

    if (maxPrice !== undefined) {
      whereClauses.push(lte(product.priceCents, Math.round(maxPrice * 100)));
    }

    if (queryTokens.length > 0) {
      whereClauses.push(
        or(
          ...queryTokens.flatMap((token, index) => {
            const compactToken = compactQueryTokens[index];

            return [
              ilike(product.name, `%${token}%`),
              ilike(product.description, `%${token}%`),
              ilike(product.category, `%${token}%`),
              compactToken
                ? sql`regexp_replace(lower(${product.name}), '[^a-z0-9]', '', 'g') LIKE ${`%${compactToken}%`}`
                : undefined,
              compactToken
                ? sql`regexp_replace(lower(${product.description}), '[^a-z0-9]', '', 'g') LIKE ${`%${compactToken}%`}`
                : undefined,
              compactToken
                ? sql`regexp_replace(lower(${product.category}), '[^a-z0-9]', '', 'g') LIKE ${`%${compactToken}%`}`
                : undefined,
            ].filter((clause): clause is SQL<unknown> => Boolean(clause));
          })
        ) as SQL<unknown>
      );
    }

    const rows = await db
      .select()
      .from(product)
      .where(and(...whereClauses))
      .limit(100);

    const scored = rows
      .map((item) => {
        const normalizedTags = (item.tags ?? []).map((tag) =>
          tag.toLowerCase()
        );
        const compactTags = normalizedTags.map((tag) => normalizeCompact(tag));
        const lowerName = item.name.toLowerCase();
        const lowerCategory = item.category.toLowerCase();
        const haystack = [
          item.name,
          item.category,
          item.description,
          ...(item.tags ?? []),
        ]
          .join(" ")
          .toLowerCase();
        const compactHaystack = normalizeCompact(haystack);
        const compactName = normalizeCompact(item.name);
        const compactProductCategory = normalizeCompact(item.category);

        let score = 0;
        for (const token of queryTokens) {
          const compactToken = normalizeCompact(token);

          if (
            normalizedTags.some((tag) => tag === token) ||
            compactTags.some((tag) => tag === compactToken)
          ) {
            score += 4;
            continue;
          }
          if (
            lowerName.includes(token) ||
            (compactToken.length > 0 && compactName.includes(compactToken))
          ) {
            score += 3;
            continue;
          }
          if (
            lowerCategory.includes(token) ||
            (compactToken.length > 0 &&
              compactProductCategory.includes(compactToken))
          ) {
            score += 2;
            continue;
          }
          if (
            haystack.includes(token) ||
            (compactToken.length > 0 && compactHaystack.includes(compactToken))
          ) {
            score += 1;
          }
        }

        return {
          ...item,
          score,
          price: item.priceCents / 100,
        };
      })
      .filter((item) => item.score > 0 || queryTokens.length === 0)
      .sort((a, b) => b.score - a.score || a.priceCents - b.priceCents)
      .slice(0, limit);

    return scored;
  } catch (_error) {
    throw new ChatbotError(
      "bad_request:database",
      "Failed to search catalog products"
    );
  }
}
