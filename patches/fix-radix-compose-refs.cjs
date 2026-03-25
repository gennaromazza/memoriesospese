const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'node_modules', '@radix-ui', 'react-compose-refs', 'dist', 'index.mjs');

const patchedContent = `// packages/react/compose-refs/src/compose-refs.tsx - PATCHED-V2
import * as React from "react";

function setRef(ref, value) {
  if (typeof ref === "function") {
    return ref(value);
  } else if (ref !== null && ref !== void 0) {
    ref.current = value;
  }
}

function composeRefs(...refs) {
  return (node) => {
    let hasCleanup = false;
    const cleanups = refs.map((ref) => {
      const cleanup = setRef(ref, node);
      if (!hasCleanup && typeof cleanup == "function") {
        hasCleanup = true;
      }
      return cleanup;
    });
    if (hasCleanup) {
      return () => {
        for (let i = 0; i < cleanups.length; i++) {
          const cleanup = cleanups[i];
          if (typeof cleanup == "function") {
            cleanup();
          } else {
            setRef(refs[i], null);
          }
        }
      };
    }
  };
}

// PATCHED: Aggiorna il ref in modo sincrono durante il render (NON in useEffect)
// Questo evita il warning "useEffect without deps" e il conseguente loop di render.
// L'aggiornamento sincrono di un ref non causa re-render, è il pattern corretto.
function useComposedRefs(...refs) {
  const refsRef = React.useRef(refs);
  // Aggiornamento sincrono — sicuro perché aggiorna solo un ref, non lo stato
  refsRef.current = refs;
  
  return React.useCallback((node) => {
    return composeRefs(...refsRef.current)(node);
  }, []);
}

export {
  composeRefs,
  useComposedRefs
};
`;

try {
  if (fs.existsSync(filePath)) {
    const currentContent = fs.readFileSync(filePath, 'utf8');
    if (!currentContent.includes('PATCHED-V2')) {
      fs.writeFileSync(filePath, patchedContent);
      console.log('✅ Patched @radix-ui/react-compose-refs V2 (sync ref update, no useEffect loop)');
    } else {
      console.log('ℹ️ @radix-ui/react-compose-refs already at V2');
    }
  } else {
    console.log('⚠️ @radix-ui/react-compose-refs not found, skipping patch');
  }
} catch (error) {
  console.error('❌ Failed to patch @radix-ui/react-compose-refs:', error.message);
}
