import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { getPathDebugInfo, createUrl, isInSubdirectory, refreshBasePath } from '@/lib/basePath';
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

  const pathInfo = getPathDebugInfo();

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
          <strong>Auto-detected Base Path:</strong>
          <code className="ml-2 text-xs bg-gray-100 px-1 rounded">
            {pathInfo?.detectedBasePath || '/'}
          </code>
        </div>
        
        <div>
          <strong>Env Base Path:</strong>
          <code className="ml-2 text-xs bg-gray-100 px-1 rounded">
            {pathInfo?.envBasePath || 'not set'}
          </code>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refreshBasePath();
            window.location.reload();
          }}
          className="mt-2"
        >
          Refresh Detection
        </Button>

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
          <strong>App URL:</strong>
          <p className="text-muted-foreground">
            {pathInfo?.appUrl || window.location.origin}
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
            // Debug functionality removed for cleaner console output
          }}
        >
          Debug Info
        </Button>
      </CardContent>
    </Card>
  );
}