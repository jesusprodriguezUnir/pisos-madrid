import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withFetch } from '@angular/common/http';
import localeEs from '@angular/common/locales/es';
import type { ApplicationConfig } from '@angular/core';
import { LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';

registerLocaleData(localeEs, 'es-ES');

// Angular 22 es zoneless por defecto: no hay que registrar zone.js ni
// proveedores de detección de cambios. Todo el estado se modela con signals.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    { provide: LOCALE_ID, useValue: 'es-ES' },
  ],
};
