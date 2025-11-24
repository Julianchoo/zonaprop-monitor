import { db } from "@/lib/db";
import { savedSearch } from "@/lib/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";

export async function DELETE(
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

        const deletedSearch = await db
            .delete(savedSearch)
            .where(
                and(
                    eq(savedSearch.id, id),
                    eq(savedSearch.userId, session.user.id)
                )
            )
            .returning();

        if (deletedSearch.length === 0) {
            return new NextResponse("Not found or unauthorized", { status: 404 });
        }

        return NextResponse.json(deletedSearch[0]);
    } catch (error) {
        console.error("Error deleting saved search:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
