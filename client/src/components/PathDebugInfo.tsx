import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getPathInfo, createUrl, isSubdirectory } from '@/lib/config';
import { Info, Eye, EyeOff } from 'lucide-react';

export default function PathDebugInfo() {
  const [isVisible, setIsVisible] = useState(false);
  
  if (!isVisible) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 z-50 opacity-50 hover:opacity-100"
      >
        <Info className="h-4 w-4" />
      </Button>
    );
  }

  const pathInfo = getPathInfo();

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-80 max-h-96 overflow-auto">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          Debug Path Configuration
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsVisible(false)}
          >
            <EyeOff className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div>
          <strong>Environment:</strong>
          <Badge variant="outline" className="ml-2">
            {import.meta.env.MODE}
          </Badge>
        </div>

        <div>
          <strong>Current URL:</strong>
          <p className="break-all text-muted-foreground">
            {pathInfo?.pathname || 'N/A'}
          </p>
        </div>

        <div>
          <strong>Base Path:</strong>
          <Badge variant={pathInfo?.basePath ? "default" : "secondary"} className="ml-2">
            {pathInfo?.basePath || '/'}
          </Badge>
        </div>

        <div>
          <strong>Is Subdirectory:</strong>
          <Badge variant={isSubdirectory() ? "destructive" : "default"} className="ml-2">
            {isSubdirectory() ? 'Yes' : 'No'}
          </Badge>
        </div>

        <div>
          <strong>VITE_BASE_PATH:</strong>
          <p className="text-muted-foreground">
            {import.meta.env.VITE_BASE_PATH || 'Not set'}
          </p>
        </div>

        <div>
          <strong>Host:</strong>
          <p className="text-muted-foreground">
            {pathInfo?.host || 'N/A'}
          </p>
        </div>

        <div className="border-t pt-2">
          <strong>Test URLs:</strong>
          <div className="space-y-1 mt-1">
            <div>
              <span className="text-muted-foreground">API:</span>
              <p className="break-all font-mono text-xs">
                {createUrl('/api/test-email')}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Gallery:</span>
              <p className="break-all font-mono text-xs">
                {createUrl('/gallery/123')}
              </p>
            </div>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            console.log('Path Debug Info:', {
              pathInfo,
              isSubdirectory: isSubdirectory(),
              env: {
                MODE: import.meta.env.MODE,
                BASE_PATH: import.meta.env.VITE_BASE_PATH,
              },
              testUrls: {
                api: createUrl('/api/test-email'),
                gallery: createUrl('/gallery/123'),
              }
            });
          }}
        >
          Log to Console
        </Button>
      </CardContent>
    </Card>
  );
}