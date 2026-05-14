const GOOGLE_MAPS_PLACES_SCRIPT_ID = 'club-app-google-maps-places-script';
const GOOGLE_MAPS_PLACES_CALLBACK = '__clubAppGoogleMapsPlacesLoaded';

let loadPromise: Promise<void> | null = null;

type GoogleMapsPlacesWindow = Window &
  typeof globalThis & {
    google?: {
      maps?: {
        places?: unknown;
      };
    };
    __clubAppGoogleMapsPlacesLoaded?: () => void;
  };

function getGoogleMapsWindow() {
  return window as GoogleMapsPlacesWindow;
}

export function getGoogleMapsApiKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? '';
}

export function hasGoogleMapsPlaces() {
  if (typeof window === 'undefined') return false;
  const googleWindow = getGoogleMapsWindow();
  return Boolean(googleWindow.google?.maps?.places);
}

export function loadGoogleMapsPlaces(apiKey: string) {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  const normalizedApiKey = apiKey.trim();

  if (!normalizedApiKey) {
    return Promise.reject(new Error('Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.'));
  }

  if (hasGoogleMapsPlaces()) {
    return Promise.resolve();
  }

  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    const googleWindow = getGoogleMapsWindow();

    googleWindow.__clubAppGoogleMapsPlacesLoaded = () => {
      resolve();
    };

    const existingScript = document.getElementById(GOOGLE_MAPS_PLACES_SCRIPT_ID) as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener(
        'error',
        () => {
          loadPromise = null;
          reject(new Error('Could not load Google Maps Places.'));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_PLACES_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(normalizedApiKey)}&libraries=places&callback=${GOOGLE_MAPS_PLACES_CALLBACK}`;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Could not load Google Maps Places.'));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}
