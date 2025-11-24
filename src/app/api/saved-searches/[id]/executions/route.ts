import { db } from "@/lib/db";
import { searchExecution, savedSearch } from "@/lib/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq, desc, and } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { id } = await params;

        // Verify ownership
        const search = await db.query.savedSearch.findFirst({
            where: and(eq(savedSearch.id, id), eq(savedSearch.userId, session.user.id)),
        });

        if (!search) {
            return new NextResponse("Not Found", { status: 404 });
        }

        const executions = await db
            .select()
            .from(searchExecution)
            .where(eq(searchExecution.savedSearchId, id))
            .orderBy(desc(searchExecution.createdAt));

        return NextResponse.json(executions);
    } catch (error) {
        console.error("Error fetching search executions:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });

        if (!session) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const { results } = body;

        if (!results || !Array.isArray(results)) {
            return new NextResponse("Invalid results data", { status: 400 });
        }

        // Verify ownership
        const search = await db.query.savedSearch.findFirst({
            where: and(eq(savedSearch.id, id), eq(savedSearch.userId, session.user.id)),
        });

        if (!search) {
            return new NextResponse("Not Found", { status: 404 });
        }

        const newExecution = await db
            .insert(searchExecution)
            .values({
                id: nanoid(),
                savedSearchId: id,
                resultsCount: results.length,
                results: results,
            })
            .returning();

        // Update lastScrapedAt on the saved search
        await db
            .update(savedSearch)
            .set({ lastScrapedAt: new Date() })
            .where(eq(savedSearch.id, id));

        return NextResponse.json(newExecution[0]);
    } catch (error) {
        console.error("Error creating search execution:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
