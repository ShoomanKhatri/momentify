import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>Page not found</h1>
      <Link href="/" className="text-link">
        Back to overview
      </Link>
    </div>
  );
}
