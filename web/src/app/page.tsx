// Root page — delegates entirely to MuseumPortal (Client Component).
// Keep this file as a Server Component (no 'use client') for metadata SSR.

import MuseumPortal from '@/components/MuseumPortal';

export default function HomePage() {
  return <MuseumPortal />;
}
