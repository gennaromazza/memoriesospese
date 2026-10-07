# Local administrator passkey browser test

This test uses a disposable Firebase Auth and Firestore emulator, a route-only API process, and Chromium's virtual WebAuthn authenticator. It resets all Auth and Firestore data in the configured loopback emulators before running. Never point it at a production service.

Start these in separate terminals from the workspace root:

1. Firebase emulators:

   ```sh
   firebase emulators:start --config firebase.passkey-e2e.json --only auth,firestore --project wedding-gallery-397b6
   ```

2. Isolated API (do not use the normal API `dev` command, which starts maintenance workers):

   ```sh
   cd artifacts/api-server
   NODE_ENV=development PORT=5910 \
     DATABASE_URL=postgresql://isolated:isolated@127.0.0.1:5998/isolated \
     FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
     FIRESTORE_EMULATOR_HOST=127.0.0.1:8089 \
     ADMIN_PASSKEY_ALLOWED_ORIGINS=http://localhost:4179 \
     pnpm exec tsx passkey-e2e-server.ts
   ```

3. Web app:

   ```sh
   cd artifacts/image-studio-web
   NODE_ENV=development PORT=4179 BASE_PATH=/ \
     VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
     VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8089 \
     VITE_API_PROXY_TARGET=http://127.0.0.1:5910 \
     pnpm run dev
   ```

4. Run the test from the workspace root:

   ```sh
   pnpm test:admin-passkey
   ```

The browser visits `http://localhost:4179` because Chromium requires a DNS-style relying-party ID; emulator connections can continue to use `127.0.0.1`. The browser test blocks non-loopback page requests.

## Local administrator dashboard React smoke test

The dashboard smoke test uses the same disposable Auth and Firestore emulators,
creates a temporary admin account, and writes synthetic clients, jobs, galleries,
and bookings. Dashboard API responses needed by the test are local fixtures;
all non-loopback browser requests are blocked. It does not require the API
server or any production Firebase service.

Start the Firebase emulators using step 1 above. For this test, the API server
is not needed; start only the web app with both Firebase emulators enabled:

```sh
cd artifacts/image-studio-web
NODE_ENV=development PORT=4179 BASE_PATH=/ \
  VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8089 \
  pnpm run dev
```

Then, from the workspace root, run:

```sh
pnpm test:admin-react
```

This command resets the configured Auth and Firestore emulators before seeding
test data. Use only disposable local emulators, never production endpoints.
