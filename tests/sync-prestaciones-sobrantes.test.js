// "Verificar que la nube tenga todo": las prestaciones "sobrantes" (están en la nube pero
// ya no local) se separan en VIEJAS-seguras-de-borrar (su código sigue existiendo local con
// otro id) y SOLO-EN-NUBE (código que no está local, no borrar sin revisar). Esto decide qué
// se puede limpiar de la nube sin perder datos. La lógica de decisión es pura y testeable.
import { describe, it, expect, beforeEach } from 'vitest';
import { loadApp, resetDatos } from './harness.js';

let app;
beforeEach(() => {
  const h = loadApp();
  app = h.app;
  resetDatos(app);
});

describe('_categorizarSobrantes (limpieza segura de prestaciones viejas en la nube)', () => {
  it('marca como VIEJA la sobrante cuyo (OS+código) sigue existiendo local con otro id', () => {
    const local = [{ id: 100, os: 'OSDE', codigo: '420162', desc: 'Consulta', valOS: 24000 }];
    const sobran = [{ id: 55, os: 'OSDE', codigo: '420162', desc: 'Consulta (vieja)', valOS: 21000 }]; // mismo código, id viejo
    const { staleDup, soloNube } = app._categorizarSobrantes(sobran, local);
    expect(staleDup).toHaveLength(1);
    expect(soloNube).toHaveLength(0);
  });

  it('marca como SOLO-EN-NUBE la sobrante cuyo código NO está en local (no borrar)', () => {
    const local = [{ id: 100, os: 'OSDE', codigo: '420162', desc: 'Consulta' }];
    const sobran = [{ id: 77, os: 'OSDE', codigo: '99999', desc: 'Código que solo está en la nube' }];
    const { staleDup, soloNube } = app._categorizarSobrantes(sobran, local);
    expect(staleDup).toHaveLength(0);
    expect(soloNube).toHaveLength(1);
    expect(soloNube[0].codigo).toBe('99999');
  });

  it('el mismo código en OTRA OS no cuenta como duplicado (la clave es OS+código)', () => {
    const local = [{ id: 100, os: 'OSDE', codigo: '420162', desc: 'Consulta' }];
    const sobran = [{ id: 88, os: 'IOMA', codigo: '420162', desc: 'Consulta IOMA' }]; // mismo código, otra OS
    const { staleDup, soloNube } = app._categorizarSobrantes(sobran, local);
    expect(staleDup).toHaveLength(0);
    expect(soloNube).toHaveLength(1);
  });

  it('separa correctamente un lote mixto', () => {
    const local = [
      { id: 1, os: 'OSDE', codigo: 'A1' },
      { id: 2, os: 'OSDE', codigo: 'A2' },
    ];
    const sobran = [
      { id: 10, os: 'OSDE', codigo: 'A1' },   // vieja de A1 → stale
      { id: 11, os: 'OSDE', codigo: 'A2' },   // vieja de A2 → stale
      { id: 12, os: 'OSDE', codigo: 'ZZ' },   // no está local → soloNube
    ];
    const { staleDup, soloNube } = app._categorizarSobrantes(sobran, local);
    expect(staleDup.map(p => p.codigo).sort()).toEqual(['A1', 'A2']);
    expect(soloNube.map(p => p.codigo)).toEqual(['ZZ']);
  });
});
