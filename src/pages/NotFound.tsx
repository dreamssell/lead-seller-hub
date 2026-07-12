import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { logRouteTelemetry } from "@/lib/routeTelemetry";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
    void logRouteTelemetry({
      type: "route_404",
      message: `404 em ${location.pathname}`,
      metadata: {
        path: location.pathname,
        search: location.search,
        hash: location.hash,
      },
    });
  }, [location.pathname, location.search, location.hash]);

  return (
    <main className="min-h-screen-safe flex items-center justify-center bg-background px-4 py-8 pt-safe pb-safe">
      <Card className="glass-card w-full max-w-md p-6 sm:p-10 text-center">
        <p className="text-sm font-medium text-muted-foreground tracking-widest">
          ERRO 404
        </p>
        <h1 className="mt-3 text-4xl sm:text-5xl font-bold text-foreground">
          Página não encontrada
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          O endereço{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs break-all">
            {location.pathname}
          </code>{" "}
          não existe ou foi movido.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild className="w-full sm:w-auto">
            <a href="/">Voltar para o início</a>
          </Button>
          <Button
            asChild
            variant="outline"
            className="w-full sm:w-auto"
          >
            <a href="javascript:history.back()">Voltar à página anterior</a>
          </Button>
        </div>
      </Card>
    </main>
  );
};

export default NotFound;
