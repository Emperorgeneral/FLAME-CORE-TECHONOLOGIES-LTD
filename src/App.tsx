import AdminPortal from './AdminPortal';
import BlogPage from './BlogPage';
import LegacyHome from './LegacyHome';

export default function App() {
  const pathname = typeof window === 'undefined' ? '/' : window.location.pathname;

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return <AdminPortal />;
  }

  if (pathname === '/blog' || pathname.startsWith('/blog/')) {
    return <BlogPage />;
  }

  return <LegacyHome />;
}
