// Fallback route that mirrors the edge function redirect for /l/:slug.
// The canonical shareable URL uses the edge function directly (getPublicLinkUrl),
// but this page keeps the app-origin path working too.
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicLinkUrl } from '@/lib/publicLinks';

export default function PublicLinkRedirectPage() {
  const { slug } = useParams();
  useEffect(() => {
    if (!slug) return;
    window.location.replace(getPublicLinkUrl(slug));
  }, [slug]);
  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
      Abrindo WhatsApp…
    </div>
  );
}
