---
name: get-listing-image
description: Obtiene la imagen de portada y los datos de un piso específico a partir de un enlace/URL de Idealista o Fotocasa y los guarda en la base de datos Firebase Firestore.
---

# Skill: Obtener imagen de portada de un piso

Usa esta skill cuando el usuario proporcione un enlace/URL de un anuncio de **Idealista** (`https://www.idealista.com/inmueble/...`) o **Fotocasa** (`https://www.fotocasa.es/...`) y pida obtener la imagen de portada o datos de ese piso.

## Instrucciones para el agente

1. **Extraer la URL del mensaje del usuario**:
   Identifica la URL del anuncio presente en la petición.

2. **Ejecutar el script de extracción y guardado**:
   Ejecuta el script `add-url.ts` mediante `run_command`:
   ```bash
   npx tsx scripts/scrape/add-url.ts "<URL_DEL_ANUNCIO>"
   ```

3. **Mostrar la imagen y confirmar el guardado**:
   Tras ejecutar el script, responde al usuario mostrando:
   - **Imagen de portada**: Muestra la imagen directamente con `![Imagen de portada](URL_IMAGEN)`.
   - **Datos del inmueble**: Dirección, zona, precio, m² y habitaciones.
   - **Estado**: Confirmación de actualización en la base de datos Firebase Firestore.
