// Public by design: the web config only identifies the Firebase project.
export const FIREBASE_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyAqu7kGBB15ok04UUHjWHaXDopfun-c2ww',
  authDomain: 'daily-digest-feed.firebaseapp.com',
  projectId: 'daily-digest-feed',
  appId: '1:550301286159:web:03a3d0d773149d1481c87a',
};
export const SESSION_COOKIE = '__session';
