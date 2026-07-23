---
name: add-idealista-listing
description: Procesa y añade automáticamente a la base de datos Firebase Firestore de pisos-madrid cualquier enlace/URL individual de Idealista o Fotocasa proporcionado por el usuario.
---

# Skill: Añadir inmueble por URL a pisos-madrid

Usa esta skill cuando el usuario proporcione un enlace/URL de un anuncio de **Idealista** (`https://www.idealista.com/inmueble/...`) o **Fotocasa** (`https://www.fotocasa.es/...`) y solicite añadirlo a la base de datos o a la aplicación.

## Instrucciones para el agente

1. **Extraer la URL del mensaje del usuario**:
   Identifica la URL del anuncio presente en la petición.

2. **Ejecutar el script de inserción**:
   Ejecuta el script `add-url.ts` mediante `run_command`:
   ```bash
   npx tsx scripts/scrape/add-url.ts "<URL_DEL_ANUNCIO>"
   ```

3. **Confirmar al usuario**:
   Una vez completado el comando, responde al usuario confirmando la adición del piso e incluyendo una ficha resumen con:
   - **ID de anuncio**
   - **Título / Dirección**
   - **Zona / Barrio**
   - **Precio** y **€/m²**
   - **Habitaciones y Superficie**
   - Confirmación de guardado en Firebase Firestore.
