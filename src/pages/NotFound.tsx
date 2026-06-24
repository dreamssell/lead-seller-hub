import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { logRouteTelemetry } from "@/lib/routeTelemetry";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
    void logRouteTelemetry({
      type: 'route_404',
      message: `404 em ${location.pathname}`,
      metadata: { path: location.pathname, search: location.search, hash: location.hash },
    });
  }, [location.pathname, location.search, location.hash]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
