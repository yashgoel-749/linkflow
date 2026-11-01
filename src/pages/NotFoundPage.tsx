import { Link } from 'react-router-dom';
import { ArrowLeft, Link2 } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[65vh] flex-col items-center justify-center gap-5 text-center">
      <span className="rounded-2xl bg-accent/15 p-5 text-accent">
        <Link2 size={36} />
      </span>
      <p className="eyebrow">404 · Lost connection</p>
      <h1>This link leads nowhere.</h1>
      <p className="text-muted">The page you’re looking for doesn’t exist in this workspace.</p>
      <Link to="/dashboard" className="btn btn-primary">
        <ArrowLeft size={16} />
        Back to Dashboard
      </Link>
    </div>
  );
}
