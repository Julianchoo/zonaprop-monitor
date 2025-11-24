import { db } from "@/lib/db";
import { savedSearch, searchExecution } from "@/lib/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function GET() {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const searches = await db
            .select()
            .from(savedSearch)
            .where(eq(savedSearch.userId, session.user.id))
            .orderBy(desc(savedSearch.createdAt));

        return NextResponse.json(searches);
    } catch (error) {
        console.error("Error fetching saved searches:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const body = await req.json();
        const { name, url, initialResults } = body;

        if (!name || !url) {
            return new NextResponse("Missing required fields", { status: 400 });
        }

        const newSearchId = nanoid();

        // Use transaction to ensure both records are created
        const result = await db.transaction(async (tx) => {
            const [newSearch] = await tx
                .insert(savedSearch)
                .values({
                    id: newSearchId,
                    userId: session.user.id,
                    name,
                    url,
                })
                .returning();

            if (initialResults && Array.isArray(initialResults) && initialResults.length > 0) {
                await tx.insert(searchExecution).values({
                    id: nanoid(),
                    savedSearchId: newSearchId,
                    resultsCount: initialResults.length,
                    results: initialResults,
                });
            }

            return newSearch;
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error("Error creating saved search:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
