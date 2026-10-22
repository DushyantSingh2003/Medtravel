import { notFound } from 'next/navigation';

/** Any URL no route matches lands here, so it renders the localised 404 page inside the layout. */
export default function CatchAllPage() {
  notFound();
}
