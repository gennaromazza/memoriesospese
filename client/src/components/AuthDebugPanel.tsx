import { useAuth } from '@/hooks/useAuth';
import { auth } from '@/lib/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Shield, CheckCircle, XCircle } from 'lucide-react';

export default function AuthDebugPanel() {
  const { user, userProfile, isAuthenticated, isLoading } = useAuth();

  if (import.meta.env.MODE !== 'development') return null;

  return (
    <Card className="fixed bottom-20 right-4 w-80 z-50 opacity-90 hover:opacity-100 transition-opacity">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="h-4 w-4" />
          Auth Debug
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span>Status:</span>
          <Badge variant={isAuthenticated ? "default" : "destructive"}>
            {isLoading ? "Loading..." : (isAuthenticated ? "Authenticated" : "Not authenticated")}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <span>Firebase User:</span>
          {user ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
        </div>

        {user && (
          <>
            <div>
              <span className="font-medium">Email:</span>
              <p className="text-gray-600 break-all">{user.email}</p>
            </div>
            
            <div>
              <span className="font-medium">Display Name:</span>
              <p className="text-gray-600">{user.displayName || 'Non impostato'}</p>
            </div>
          </>
        )}

        <div className="flex items-center justify-between">
          <span>User Profile:</span>
          {userProfile ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
        </div>

        {userProfile && (
          <div>
            <span className="font-medium">Profile Name:</span>
            <p className="text-gray-600">{userProfile.displayName || 'Non impostato'}</p>
          </div>
        )}

        <div className="pt-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => {
              console.log('=== AUTH DEBUG ===');
              console.log('isAuthenticated:', isAuthenticated);
              console.log('isLoading:', isLoading);
              console.log('Firebase user:', user);
              console.log('User profile:', userProfile);
              console.log('Firebase auth currentUser:', auth.currentUser);
            }}
          >
            Log to Console
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}