import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Building2, TrendingUp, Search } from "lucide-react";

export default function Home() {
  return (
    <main className="flex-1">
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 md:py-32">
        <div className="max-w-3xl mx-auto text-center space-y-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10">
              <Building2 className="h-9 w-9 text-primary" />
            </div>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
            Monitor de Datos Zonaprop
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground">
            Te ayudamos a entender el mercado de propiedades en Argentina
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
            <Button asChild size="lg" className="text-lg">
              <Link href="/extract">
                <Search className="mr-2 h-5 w-5" />
                Extraer Datos
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-muted/50 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">
              ¿Qué puedes hacer?
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-background p-6 rounded-lg border">
                <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4">
                  <Search className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">
                  Extracción Rápida
                </h3>
                <p className="text-muted-foreground">
                  Pega URLs de Zonaprop y obtén todos los datos de las
                  propiedades en segundos
                </p>
              </div>

              <div className="bg-background p-6 rounded-lg border">
                <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Análisis de Precios</h3>
                <p className="text-muted-foreground">
                  Calcula automáticamente el precio por m² para comparar
                  propiedades
                </p>
              </div>

              <div className="bg-background p-6 rounded-lg border">
                <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Datos Completos</h3>
                <p className="text-muted-foreground">
                  Extrae ubicación, tamaño, dormitorios, baños, cochera y más
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h2 className="text-3xl font-bold">Comenzá ahora</h2>
          <p className="text-lg text-muted-foreground">
            Inicia sesión para empezar a extraer datos de propiedades
          </p>
          <Button asChild size="lg">
            <Link href="/extract">Ir a Extracción</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
