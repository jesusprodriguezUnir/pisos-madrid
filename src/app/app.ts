import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ListingsPage } from './features/listings/listings-page';

@Component({
  selector: 'app-root',
  imports: [ListingsPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <app-listings-page />
    </main>
    <footer>
      Datos agregados de idealista.com con fines personales. Precios y disponibilidad pueden variar;
      verifica siempre en el anuncio original.
    </footer>
  `,
  styles: `
    footer {
      color: var(--muted);
      font-size: 11px;
      padding: 20px 0;
      border-top: 1px solid var(--line);
      margin-top: 24px;
    }
  `,
})
export class App {}
