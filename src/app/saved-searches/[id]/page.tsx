"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, Calendar, ExternalLink, Download } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { redirect, useParams } from "next/navigation";
import Link from "next/link";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

interface SearchExecution {
    id: string;
    createdAt: string;
    resultsCount: number;
    results: any[]; // Using any for simplicity, but ideally should be typed
}

export default function SearchHistoryPage() {
    const { data: session, isPending } = useSession();
    const params = useParams();
    const id = params.id as string;

    const [executions, setExecutions] = useState<SearchExecution[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedExecution, setSelectedExecution] = useState<SearchExecution | null>(null);

    // Redirect if not authenticated
    if (!isPending && !session) {
        redirect("/");
    }

    useEffect(() => {
        if (session && id) {
            fetchExecutions();
        }
    }, [session, id]);

    const fetchExecutions = async () => {
        try {
            const response = await fetch(`/api/saved-searches/${id}/executions`);
            if (!response.ok) {
                throw new Error("Error al cargar el historial");
            }
            const data = await response.json();
            setExecutions(data);
            if (data.length > 0) {
                setSelectedExecution(data[0]);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error desconocido");
        } finally {
            setLoading(false);
        }
    };

    const handleExportCSV = () => {
        if (!selectedExecution || selectedExecution.results.length === 0) return;

        const headers = [
            "Nombre",
            "Dirección",
            "Barrio",
            "M2 Cubiertos",
            "M2 Totales",
            "Cochera",
            "Dormitorios",
            "Baño",
            "Precio",
            "Moneda",
            "Expensas",
            "$/m2",
            "URL",
        ];

        const rows = selectedExecution.results.map((prop: any) => [
            prop.nombre,
            prop.direccion,
            prop.barrio,
            prop.m2Cubiertos ?? "",
            prop.m2Totales ?? "",
            prop.cochera ?? "",
            prop.dormitorios ?? "",
            prop.bano ?? "",
            prop.precio ?? "",
            prop.moneda ?? "",
            prop.expensas ?? "",
            prop.precioM2 ?? "",
            prop.url,
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map((row) =>
                row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
            ),
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        const date = new Date(selectedExecution.createdAt).toLocaleDateString().replace(/\//g, '-');
        link.setAttribute("href", url);
        link.setAttribute("download", `zonaprop_historial_${date}.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (isPending || loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    return (
        <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl">
            <div className="mb-6">
                <Link href="/saved-searches">
                    <Button variant="ghost" className="pl-0 hover:pl-0 hover:bg-transparent">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Volver a Búsquedas
                    </Button>
                </Link>
                <h1 className="text-3xl font-bold mt-2">Historial de Búsqueda</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Sidebar: List of Executions */}
                <div className="md:col-span-1 space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Ejecuciones</CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="max-h-[600px] overflow-y-auto">
                                {executions.length === 0 ? (
                                    <div className="p-4 text-center text-muted-foreground text-sm">
                                        No hay ejecuciones registradas
                                    </div>
                                ) : (
                                    <div className="divide-y">
                                        {executions.map((exec) => (
                                            <button
                                                key={exec.id}
                                                onClick={() => setSelectedExecution(exec)}
                                                className={`w-full text-left p-4 hover:bg-muted/50 transition-colors ${selectedExecution?.id === exec.id ? "bg-muted" : ""
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Calendar className="h-3 w-3 text-muted-foreground" />
                                                    <span className="text-sm font-medium">
                                                        {new Date(exec.createdAt).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center text-xs text-muted-foreground">
                                                    <span>{new Date(exec.createdAt).toLocaleTimeString()}</span>
                                                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                                        {exec.resultsCount} props
                                                    </span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content: Results of Selected Execution */}
                <div className="md:col-span-3">
                    {selectedExecution ? (
                        <Card>
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle>
                                        Resultados del {new Date(selectedExecution.createdAt).toLocaleDateString()}
                                    </CardTitle>
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm text-muted-foreground">
                                            {selectedExecution.resultsCount} propiedades encontradas
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={handleExportCSV}
                                            className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/30"
                                        >
                                            <Download className="mr-2 h-4 w-4" />
                                            Exportar CSV
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-md border">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Foto</TableHead>
                                                <TableHead>Precio</TableHead>
                                                <TableHead>Dirección</TableHead>
                                                <TableHead>Características</TableHead>
                                                <TableHead></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {selectedExecution.results.map((prop: any, idx: number) => (
                                                <TableRow key={idx}>
                                                    <TableCell>
                                                        {prop.imageUrl && (
                                                            <img
                                                                src={prop.imageUrl}
                                                                alt={prop.nombre || "Propiedad"}
                                                                className="w-16 h-16 object-cover rounded-md"
                                                            />
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-medium">
                                                            {prop.moneda} {prop.precio?.toLocaleString()}
                                                        </div>
                                                        {prop.expensas && (
                                                            <div className="text-xs text-muted-foreground">
                                                                + {prop.expensas.toLocaleString()} exp
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-medium">{prop.direccion}</div>
                                                        <div className="text-xs text-muted-foreground">{prop.barrio}</div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="text-sm">
                                                            {prop.m2Totales}m² • {prop.dormitorios || 0} dorm • {prop.bano || 0} baños
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <a
                                                            href={prop.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:text-blue-800"
                                                        >
                                                            <ExternalLink className="h-4 w-4" />
                                                        </a>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="h-full flex items-center justify-center text-muted-foreground border rounded-lg p-12 border-dashed">
                            Seleccioná una ejecución para ver los detalles
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
