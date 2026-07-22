# pisos-madrid

Buscador de vivienda en Madrid construido sobre un dataset estático extraído de idealista.
La aportación frente al buscador original es la **normalización de €/m² y la desviación de cada
anuncio respecto a la mediana de su barrio y operación**, que es la métrica que realmente permite
comparar un piso de Chamberí con uno de Puerta del Ángel.

- **Frontend**: Angular 22 (standalone, zoneless, signals) + CSS plano, sin librería de componentes.
- **Datos**: `public/data/districts/*.json`, un fichero por distrito (idealista + fotocasa), generados
  por el scraper y versionados en el repositorio.
- **Despliegue**: sitio estático en GitHub Pages.

## Criterios de búsqueda

- **Zonas**: Argüelles, Ciudad Universitaria, Casa de Campo, Puerta del Ángel, Embajadores, Tetuán, y
  los barrios de Chamberí (Gaztambide, Arapiles, Trafalgar, Almagro, Vallehermoso, Ríos Rosas).
- **Portales**: idealista.com y fotocasa.es.
- **Operación**: venta (≤ 550.000 €) y alquiler (≤ 1.800 €/mes).
- **Vivienda**: ≥ 2 habitaciones, ≥ 60 m².

Se cambian en un único sitio: `scripts/scrape/config.ts`.

## Puesta en marcha

```bash
npm ci
npm start            # http://localhost:4200
```

| Script                | Qué hace                                                  |
| --------------------- | --------------------------------------------------------- |
| `npm start`           | Servidor de desarrollo                                    |
| `npm run build`       | Build de producción en `dist/pisos-madrid/browser`        |
| `npm run build:pages` | Igual, con `--base-href /pisos-madrid/` para GitHub Pages |
| `npm test`            | Tests unitarios (Vitest)                                  |
| `npm run lint`        | ESLint sobre TypeScript y plantillas                      |
| `npm run format`      | Prettier en modo escritura                                |
| `npm run scrape`      | Regenera `public/data/districts/*.json`                   |

El scraper de fotocasa usa Playwright (navegador headless); antes del primer `npm run scrape` hace
falta `npx playwright install chromium`.

## Arquitectura

```
src/app/
├── core/
│   ├── models/listing.model.ts      Tipos de dominio y constantes de negocio
│   ├── services/listings.service.ts Carga del dataset y exposición como signals
│   └── utils/listing-stats.ts       Enriquecido, filtrado, orden y agregados
└── features/listings/               Componente de página (OnPush, signals)

scripts/scrape/
├── config.ts                        Zonas, operaciones y construcción de URLs por portal
├── parser.ts                        HTML de idealista -> modelo de dominio
├── fotocasa-parser.ts               Tarjetas ya renderizadas de fotocasa -> modelo de dominio
├── fotocasa.ts                      Driver Playwright que extrae las tarjetas de fotocasa
└── index.ts                         Orquestación de ambas fuentes y escritura de un JSON por distrito
```

Tres decisiones que conviene conocer antes de tocar el código:

**El dominio no depende de Angular.** `listing.model.ts` y `listing-stats.ts` son TypeScript puro,
sin `@angular/*`. El scraper de Node importa exactamente los mismos tipos que la aplicación web, así
que un cambio de contrato rompe la compilación en ambos lados en lugar de fallar en runtime. Como
efecto colateral, los tests de la lógica de negocio se ejecutan en Vitest sin `TestBed` ni jsdom, y
por eso el proyecto usa Vitest directamente en lugar del builder `@angular/build:unit-test`. Si en
algún momento se añaden tests de componentes con `TestBed`, hay que recuperar ese builder y el
`tsconfig.spec.json` correspondiente.

**Los datos crudos se persisten; las métricas se derivan.** Cada JSON de distrito guarda únicamente lo
que publican los portales. `pricePerM2`, `zoneMedian`, `deltaVsZone`, `hasLift` e `isExterior` se
calculan en cliente al cargar (`enrich()`), sobre el conjunto combinado de todos los distritos.
Cambiar el umbral de "chollo" o la fórmula de la mediana no obliga a re-scrapear nada.

**Las medianas se calculan por par (zona, operación).** Comparar €/m² de venta con los de alquiler no
significa nada, y comparar Chamberí con Puerta del Ángel tampoco: son mercados distintos. El
porcentaje que muestra la tabla siempre responde a "cómo de caro es esto _para su barrio_".

## Sobre el scraper

Extrae hasta 3 páginas de resultados (≈ 90 anuncios) por combinación de zona y operación, con una
pausa de 2,5 s entre peticiones. El dataset resultante es un recorte, no el inventario completo del
portal.

Riesgos conocidos, en orden de probabilidad:

1. **Bloqueo por anti-bot.** idealista (DataDome) y fotocasa bloquean con frecuencia las IPs de
   datacenter, incluidas las de GitHub Actions. El workflow `scrape.yml` está programado de lunes a
   viernes, pero si empieza a fallar de forma sistemática con HTTP 403/429 la solución realista es
   ejecutar `npm run scrape` en local y commitear el resultado. No merece la pena montar rotación de
   proxies para esto.
2. **Cambios de marcado.** En idealista, los selectores `article.item`, `.item-link`, `.item-price` e
   `.item-detail` (`scripts/scrape/parser.ts`) son un contrato frágil. En fotocasa, que renderiza el
   listado con JavaScript, `fotocasa.ts` evita depender de clases CSS (fotocasa las genera y las
   cambia) y en su lugar localiza los enlaces de detalle (`/vivienda/.../{id}/d`) y extrae el texto de
   su contenedor; `fotocasa-parser.ts` interpreta ese texto con expresiones regulares. Si el scraper
   devuelve 0 anuncios con páginas que sí cargan, ese es el sitio a mirar. `index.ts` no sobrescribe
   el fichero de un distrito cuando el resultado combinado de ambos portales está vacío, precisamente
   para no destruir un dataset bueno con uno vacío.
3. **Slugs de barrio.** No coinciden con la nomenclatura oficial ni son iguales entre portales: Casa
   de Campo cuelga de Moncloa y no de Latina, Embajadores aparece como `lavapies-embajadores` en
   idealista y como `embajadores-lavapies` en fotocasa. Un 404 (o una página cargada sin anuncios) en
   el log casi siempre es esto — revisar `ZONES` en `scripts/scrape/config.ts`.

Los datos se usan con fines personales de búsqueda de vivienda. Antes de darle otro uso, conviene
revisar los términos de uso de idealista.

## Despliegue

`deploy.yml` publica en GitHub Pages en cada push a `main`. Requiere dos cosas:

1. En **Settings → Pages**, seleccionar _GitHub Actions_ como origen.
2. Que el `--base-href` de `build:pages` coincida con el nombre del repositorio. Si el repo no se
   llama `pisos-madrid`, hay que ajustarlo o el sitio cargará sin estilos ni datos.

## Mejoras pendientes

- Persistir los filtros en la URL (query params) para poder compartir búsquedas.
- Guardar histórico de precios por anuncio y detectar bajadas, que es la señal más útil de todas.
- Geocodificar direcciones y añadir vista de mapa.
- Tiempo de trayecto a un punto de referencia vía API de transporte.

## Licencia

MIT.
