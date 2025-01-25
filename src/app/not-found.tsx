export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white">
      <h2 className="mb-4 text-xl">404 - Page Not Found</h2>
      <p className="mb-4">The page you&apos;re looking for doesn&apos;t exist.</p>
      <a
        className="rounded bg-white px-4 py-2 text-black transition-colors hover:bg-gray-200"
        href="/"
      >
        Go Home
      </a>
    </div>
  );
}
