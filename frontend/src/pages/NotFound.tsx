import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="glass-card rounded-xl3 shadow-card p-10 text-center max-w-md animate-fade-in">
        <div className="text-6xl mb-4">🔍</div>
        <h1 className="text-2xl font-semibold text-healing-text mb-2">页面未找到</h1>
        <p className="text-healing-muted mb-6">你访问的页面不存在，或已被移走。</p>
        <Link
          to="/verify"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors shadow-sm"
        >
          返回验证工具
        </Link>
      </div>
    </div>
  );
}
