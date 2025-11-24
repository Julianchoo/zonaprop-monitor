"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Trash2, Play, ExternalLink, Calendar } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { redirect, useRouter } from "next/navigation";
import Link from "next/link";

interface SavedSearch {
    id: string;
    name: string;
    url: string;
    createdAt: string;
    lastScrapedAt: string | null;
}

export default function SavedSearchesPage() {
    const { data: session, isPending } = useSession();
    const router = useRouter();
    const [searches, setSearches] = useState<SavedSearch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Redirect if not authenticated
    if (!isPending && !session) {
        redirect("/");
    }

    useEffect(() => {
        if (session) {
            fetchSearches();
        }
    }, [session]);

    const fetchSearches = async () => {
        try {
            const response = await fetch("/api/saved-searches");
            if (!response.ok) {
                throw new Error("Error al cargar búsquedas guardadas");
            }
            const data = await response.json();
            setSearches(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error desconocido");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("¿Estás seguro de que querés eliminar esta búsqueda?")) return;

        setDeletingId(id);
        try {
            const response = await fetch(`/api/saved-searches/${id}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                throw new Error("Error al eliminar la búsqueda");
            }

            setSearches(searches.filter((s) => s.id !== id));
        } catch (err) {
            alert("Error al eliminar la búsqueda");
            console.error(err);
        } finally {
            setDeletingId(null);
        }
    };

    const handleRunSearch = (url: string, id: string) => {
        router.push(`/extract-search?url=${encodeURIComponent(url)}&savedSearchId=${id}`);
    };

    if (isPending || loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">Búsquedas Guardadas</h1>
                        <p className="text-muted-foreground mt-2">
                            Gestioná tus búsquedas guardadas y volvé a ejecutarlas para ver nuevos resultados
                        </p>
                    </div>
                    <Link href="/extract-search">
                        <Button>Nueva Búsqueda</Button>
                    </Link>
                </div>

                {error && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {searches.length === 0 && !error ? (
                    <Card className="text-center py-12">
                        <CardContent>
                            <div className="flex flex-col items-center gap-4">
                                <div className="p-4 rounded-full bg-muted">
                                    <ExternalLink className="h-8 w-8 text-muted-foreground" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-semibold">No tenés búsquedas guardadas</h3>
                                    <p className="text-muted-foreground max-w-sm mx-auto">
                                        Guardá tus búsquedas frecuentes desde la página de extracción para acceder a ellas rápidamente.
                                    </p>
                                </div>
                                <Link href="/extract-search">
                                    <Button variant="outline" className="mt-4">
                                        Ir a Extraer Búsqueda
                                    </Button>
                                </Link>
                            </div>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4">
                        {searches.map((search) => (
                            <Card key={search.id} className="overflow-hidden">
                                <CardContent className="p-6">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="space-y-1">
                                            <h3 className="font-semibold text-lg">{search.name}</h3>
                                            <p className="text-sm text-muted-foreground truncate max-w-2xl" title={search.url}>
                                                {search.url}
                                            </p>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                                                <Calendar className="h-3 w-3" />
                                                <span>Creada el {new Date(search.createdAt).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Link href={`/saved-searches/${search.id}`}>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="text-muted-foreground hover:text-foreground"
                                                >
                                                    <Calendar className="mr-2 h-4 w-4" />
                                                    Historial
                                                </Button>
                                            </Link>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleRunSearch(search.url, search.id)}
                                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                                            >
                                                <Play className="mr-2 h-4 w-4" />
                                                Ejecutar
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDelete(search.id)}
                                                disabled={deletingId === search.id}
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                                            >
                                                {deletingId === search.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
