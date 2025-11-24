import { db } from "@/lib/db";
import { savedSearch } from "@/lib/schema";
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
        const { name, url } = body;

        if (!name || !url) {
            return new NextResponse("Missing required fields", { status: 400 });
        }

        const newSearch = await db
            .insert(savedSearch)
            .values({
                id: nanoid(),
                userId: session.user.id,
                name,
                url,
            })
            .returning();

        return NextResponse.json(newSearch[0]);
    } catch (error) {
        console.error("Error creating saved search:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
