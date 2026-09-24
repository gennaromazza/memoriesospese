import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link, useLocation } from 'wouter';
import { LogOut, Image, Settings, UploadCloud } from 'lucide-react';
import { auth } from '../lib/firebase';
import { useUploadQueue } from '../lib/uploadQueue';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();
  const { items: queueItems } = useUploadQueue();

  const pendingCount = queueItems.filter((i) => i.status === 'pending' || i.status === 'uploading').length;

  if (loading) {
    return <div className="h-screen w-full flex items-center justify-center bg-background"><span className="text-muted-foreground">Loading...</span></div>;
  }

  if (!user) {
    return <>{children}</>;
  }

  const handleLogout = async () => {
    await auth.signOut();
    setLocation('/login');
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside className="w-64 flex-shrink-0 border-r border-border bg-sidebar flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-serif font-semibold text-sidebar-foreground">Image Studio</h1>
          <p className="text-xs text-sidebar-foreground/60 mt-1">Gestione Desktop</p>
        </div>
        
        <nav className="flex-1 px-4 py-2 space-y-1">
          <Link href="/" className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${location === '/' || location.startsWith('/galleries') ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground hover:bg-sidebar-accent/50'}`}>
              <Image className="w-4 h-4" />
              Gallerie
          </Link>
          <Link href="/settings" className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${location === '/settings' ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground hover:bg-sidebar-accent/50'}`}>
              <Settings className="w-4 h-4" />
              Impostazioni
          </Link>
        </nav>

        <div className="p-4 mt-auto">
          {pendingCount > 0 && (
            <div className="mb-4 bg-primary/10 rounded-md p-3 border border-primary/20">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <UploadCloud className="w-4 h-4" />
                {pendingCount} file in coda
              </div>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="text-sm truncate text-sidebar-foreground/80 pr-2">
              {user.email}
            </div>
            <button onClick={handleLogout} className="p-2 text-sidebar-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors" title="Esci">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
      
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {children}
      </main>
    </div>
  );
}
