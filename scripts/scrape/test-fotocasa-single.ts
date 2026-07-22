import { ZONES } from './config.js';
import { scrapeFotocasaZone, withFotocasaBrowser } from './fotocasa.js';

async function testSingleZone() {
  const zone = ZONES[0]; // Argüelles
  console.log(`Probando Fotocasa para la zona: ${zone.name}...`);

  await withFotocasaBrowser(async (browser) => {
    const listings = await scrapeFotocasaZone(
      browser,
      zone,
      'venta',
      1, // 1 página para prueba rápida
      1000,
      (page, count) => console.log(`[Fotocasa] ${zone.name} - página ${page}: ${count} anuncios parseados`),
    );

    console.log(`\nResultado: ${listings.length} anuncios extraídos para ${zone.name}.`);
    if (listings.length > 0) {
      console.log('Muestra del primer anuncio extraído:');
      console.log(JSON.stringify(listings[0], null, 2));
    }
  });
}

testSingleZone().catch(console.error);
