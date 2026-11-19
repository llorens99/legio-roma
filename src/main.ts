import '@fontsource/cinzel/latin-600.css';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/cinzel/latin-900.css';
import '@fontsource/eb-garamond/latin-400.css';
import '@fontsource/eb-garamond/latin-600.css';
import './styles.css';
import { App } from './app';

async function boot() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('600 12px Cinzel'),
        document.fonts.load('700 12px Cinzel'),
        document.fonts.load('900 12px Cinzel'),
        document.fonts.load('400 12px "EB Garamond"'),
      ]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* seguir sin esperar */
  }
  new App();
}
void boot();
