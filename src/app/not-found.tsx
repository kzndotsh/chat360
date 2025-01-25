import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black text-white">
      <div className="flex flex-col items-center justify-center gap-2">
        <h2 className="text-xl font-semibold">Page not found</h2>
        <p className="text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist.</p>
        <Link className="font-medium text-primary underline underline-offset-4" href="/">
          Go back home
        </Link>
      </div>
    </div>
  );
}
